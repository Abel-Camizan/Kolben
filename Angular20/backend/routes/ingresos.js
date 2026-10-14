const express = require('express');
const pool = require('../db');
const { autenticar, soloRoles } = require('../middleware/auth');

const router = express.Router();
// Subir stock es una operación sensible: solo el administrador
router.use(autenticar, soloRoles('administrador'));

const SELECT_INGRESO = `
    SELECT i.id, i.fecha, i.observacion,
           i.proveedor_id, p.nombre AS proveedor,
           i.usuario_id, u.nombre AS registrado_por,
           COALESCE(SUM(d.cantidad * d.costo_unit), 0) AS total
    FROM ingresos i
    JOIN proveedores p ON p.id = i.proveedor_id
    JOIN usuarios u ON u.id = i.usuario_id
    LEFT JOIN detalle_ingreso d ON d.ingreso_id = i.id`;

const GROUP_BY = 'GROUP BY i.id, p.nombre, u.nombre';

const SELECT_DETALLE = `
    SELECT d.repuesto_id, r.codigo, r.nombre, d.cantidad, d.costo_unit,
           (d.cantidad * d.costo_unit) AS subtotal
    FROM detalle_ingreso d
    JOIN repuestos r ON r.id = d.repuesto_id
    WHERE d.ingreso_id = $1
    ORDER BY d.id`;

async function cargarIngreso(db, id) {
    const { rows } = await db.query(`${SELECT_INGRESO} WHERE i.id = $1 ${GROUP_BY}`, [id]);
    if (!rows[0]) return null;
    const detalle = await db.query(SELECT_DETALLE, [id]);
    return { ...rows[0], items: detalle.rows };
}

// POST /api/ingresos  { proveedor_id, observacion?, items: [{ repuesto_id, cantidad, costo_unit }] }
// Registra la mercadería recibida y SUMA las cantidades al stock, todo en una transacción (RF06)
router.post('/', async (req, res) => {
    const proveedorId = Number(req.body.proveedor_id);
    const { items } = req.body;
    if (!Number.isInteger(proveedorId)) return res.status(400).json({ error: 'Elige un proveedor' });
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'El ingreso necesita al menos un repuesto' });
    }

    // Junta líneas repetidas del mismo repuesto (suma cantidades; el costo es el de la última línea)
    const lineas = new Map();
    for (const it of items) {
        const id = Number(it.repuesto_id);
        const cantidad = Number(it.cantidad);
        const costo = Number(it.costo_unit);
        if (!Number.isInteger(id) || !Number.isInteger(cantidad) || cantidad <= 0 || !(costo >= 0)) {
            return res.status(400).json({
                error: 'Cada línea necesita repuesto_id, cantidad entera mayor a 0 y costo unitario válido',
            });
        }
        const previa = lineas.get(id);
        lineas.set(id, { cantidad: (previa?.cantidad || 0) + cantidad, costo });
    }
    const observacion = req.body.observacion ? String(req.body.observacion).trim().slice(0, 200) : null;

    const db = await pool.connect();
    try {
        await db.query('BEGIN');

        const { rows: prov } = await db.query('SELECT activo FROM proveedores WHERE id = $1', [proveedorId]);
        if (!prov[0] || !prov[0].activo) {
            await db.query('ROLLBACK');
            return res.status(400).json({ error: 'Proveedor inexistente o dado de baja' });
        }

        // Bloquea los repuestos en orden de id para no cruzarse con ventas simultáneas
        const ids = [...lineas.keys()].sort((a, b) => a - b);
        const { rows: repuestos } = await db.query(
            'SELECT id FROM repuestos WHERE id = ANY($1) ORDER BY id FOR UPDATE', [ids]
        );
        if (repuestos.length !== ids.length) {
            await db.query('ROLLBACK');
            return res.status(400).json({ error: 'Algún repuesto no existe' });
        }

        const { rows } = await db.query(
            `INSERT INTO ingresos (proveedor_id, usuario_id, observacion) VALUES ($1, $2, $3) RETURNING id`,
            [proveedorId, req.usuario.id, observacion]
        );
        const ingresoId = rows[0].id;
        for (const [id, { cantidad, costo }] of lineas) {
            await db.query(
                `INSERT INTO detalle_ingreso (ingreso_id, repuesto_id, cantidad, costo_unit)
                 VALUES ($1, $2, $3, $4)`,
                [ingresoId, id, cantidad, costo]
            );
            await db.query('UPDATE repuestos SET stock = stock + $1 WHERE id = $2', [cantidad, id]);
        }
        await db.query('COMMIT');
        res.status(201).json(await cargarIngreso(db, ingresoId)); // misma conexión: pedir otra al grupo puede bloquear
    } catch (err) {
        await db.query('ROLLBACK');
        res.status(500).json({ error: 'Error del servidor' });
    } finally {
        db.release();
    }
});

// GET /api/ingresos?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&proveedor_id=
router.get('/', async (req, res) => {
    const { desde, hasta, proveedor_id } = req.query;
    const cond = [];
    const params = [];
    if (desde) {
        params.push(desde);
        cond.push(`i.fecha >= $${params.length}::date`);
    }
    if (hasta) {
        params.push(hasta);
        cond.push(`i.fecha < ($${params.length}::date + 1)`);
    }
    if (proveedor_id) {
        params.push(Number(proveedor_id));
        cond.push(`i.proveedor_id = $${params.length}`);
    }
    const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
    try {
        const { rows } = await pool.query(
            `${SELECT_INGRESO} ${where} ${GROUP_BY} ORDER BY i.fecha DESC, i.id DESC`, params
        );
        res.json(rows);
    } catch (err) {
        if (err.code === '22007' || err.code === '22008') {
            return res.status(400).json({ error: 'Fecha inválida, usa el formato YYYY-MM-DD' });
        }
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// GET /api/ingresos/:id  -> con el detalle de repuestos recibidos
router.get('/:id', async (req, res) => {
    try {
        const ingreso = await cargarIngreso(pool, Number(req.params.id));
        if (!ingreso) return res.status(404).json({ error: 'Ingreso no encontrado' });
        res.json(ingreso);
    } catch (err) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

module.exports = router;
