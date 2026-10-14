const express = require('express');
const pool = require('../db');
const { autenticar } = require('../middleware/auth');

const router = express.Router();
router.use(autenticar);

// Comprobante interno: cabecera de la venta + líneas de detalle
const SELECT_VENTA = `
    SELECT v.id, v.numero, v.fecha, v.total,
           v.usuario_id, u.nombre AS vendedor,
           v.cliente_id, c.nombre AS cliente, c.documento AS cliente_documento
    FROM ventas v
    JOIN usuarios u ON u.id = v.usuario_id
    LEFT JOIN clientes c ON c.id = v.cliente_id`;

const SELECT_DETALLE = `
    SELECT d.repuesto_id, r.codigo, r.nombre, d.cantidad, d.precio_unitario,
           (d.cantidad * d.precio_unitario) AS subtotal
    FROM detalle_venta d
    JOIN repuestos r ON r.id = d.repuesto_id
    WHERE d.venta_id = $1
    ORDER BY d.id`;

async function cargarComprobante(cliente, ventaId) {
    const { rows } = await cliente.query(`${SELECT_VENTA} WHERE v.id = $1`, [ventaId]);
    if (!rows[0]) return null;
    const detalle = await cliente.query(SELECT_DETALLE, [ventaId]);
    return { ...rows[0], items: detalle.rows };
}

// POST /api/ventas  { cliente_id?, items: [{ repuesto_id, cantidad }] }
// Valida stock, descuenta y emite el comprobante en una sola transacción (RF03, RF04, RF05)
router.post('/', async (req, res) => {
    const { cliente_id, items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'La venta debe tener al menos un repuesto' });
    }

    // Une líneas repetidas del mismo repuesto y valida las cantidades
    const pedido = new Map();
    for (const it of items) {
        const id = Number(it.repuesto_id);
        const cantidad = Number(it.cantidad);
        if (!Number.isInteger(id) || !Number.isInteger(cantidad) || cantidad <= 0) {
            return res.status(400).json({ error: 'Cada línea necesita repuesto_id y una cantidad entera mayor a 0' });
        }
        pedido.set(id, (pedido.get(id) || 0) + cantidad);
    }

    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN');

        // Bloquea los repuestos en orden de id: dos ventas simultáneas no pueden
        // dejar el stock en negativo ni bloquearse entre sí
        const ids = [...pedido.keys()].sort((a, b) => a - b);
        const { rows: repuestos } = await cliente.query(
            `SELECT id, codigo, nombre, precio, stock, activo
             FROM repuestos WHERE id = ANY($1) ORDER BY id FOR UPDATE`,
            [ids]
        );
        const porId = new Map(repuestos.map((r) => [r.id, r]));

        const problemas = [];
        for (const [id, cantidad] of pedido) {
            const r = porId.get(id);
            if (!r || !r.activo) {
                problemas.push({ repuesto_id: id, motivo: 'Repuesto no disponible' });
            } else if (r.stock < cantidad) {
                problemas.push({
                    repuesto_id: id, codigo: r.codigo, nombre: r.nombre,
                    motivo: 'Stock insuficiente', solicitado: cantidad, disponible: r.stock,
                });
            }
        }
        if (problemas.length) {
            await cliente.query('ROLLBACK');
            return res.status(409).json({ error: 'No se puede completar la venta', problemas });
        }

        // El precio sale siempre de la base de datos, nunca del cliente
        let totalCentimos = 0;
        for (const [id, cantidad] of pedido) {
            totalCentimos += Math.round(Number(porId.get(id).precio) * 100) * cantidad;
        }

        const { rows: venta } = await cliente.query(
            `INSERT INTO ventas (cliente_id, usuario_id, total)
             VALUES ($1, $2, $3) RETURNING id`,
            [cliente_id ?? null, req.usuario.id, totalCentimos / 100]
        );
        const ventaId = venta[0].id;
        await cliente.query(
            `UPDATE ventas SET numero = 'V-' || LPAD(id::text, 6, '0') WHERE id = $1`,
            [ventaId]
        );

        for (const [id, cantidad] of pedido) {
            await cliente.query(
                `INSERT INTO detalle_venta (venta_id, repuesto_id, cantidad, precio_unitario)
                 VALUES ($1, $2, $3, $4)`,
                [ventaId, id, cantidad, porId.get(id).precio]
            );
            await cliente.query('UPDATE repuestos SET stock = stock - $1 WHERE id = $2', [cantidad, id]);
        }

        await cliente.query('COMMIT');
        res.status(201).json(await cargarComprobante(pool, ventaId));
    } catch (err) {
        await cliente.query('ROLLBACK');
        if (err.code === '23503') return res.status(400).json({ error: 'Cliente inexistente' });
        res.status(500).json({ error: 'Error del servidor' });
    } finally {
        cliente.release();
    }
});

// GET /api/ventas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
// El administrador ve todas las ventas; el vendedor, solo las suyas
router.get('/', async (req, res) => {
    const { desde, hasta } = req.query;
    const cond = [];
    const params = [];
    if (req.usuario.rol !== 'administrador') {
        params.push(req.usuario.id);
        cond.push(`v.usuario_id = $${params.length}`);
    }
    if (desde) {
        params.push(desde);
        cond.push(`v.fecha >= $${params.length}::date`);
    }
    if (hasta) {
        params.push(hasta);
        cond.push(`v.fecha < ($${params.length}::date + 1)`);
    }
    const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
    try {
        const { rows } = await pool.query(`${SELECT_VENTA} ${where} ORDER BY v.fecha DESC, v.id DESC`, params);
        res.json(rows);
    } catch (err) {
        if (err.code === '22007' || err.code === '22008') {
            return res.status(400).json({ error: 'Fecha inválida, usa el formato YYYY-MM-DD' });
        }
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// GET /api/ventas/:id  -> comprobante interno completo
router.get('/:id', async (req, res) => {
    try {
        const comprobante = await cargarComprobante(pool, Number(req.params.id));
        if (!comprobante) return res.status(404).json({ error: 'Venta no encontrada' });
        if (req.usuario.rol !== 'administrador' && comprobante.usuario_id !== req.usuario.id) {
            return res.status(403).json({ error: 'No tienes permiso para ver esta venta' });
        }
        res.json(comprobante);
    } catch (err) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

module.exports = router;
