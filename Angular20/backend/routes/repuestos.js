const express = require('express');
const pool = require('../db');
const { autenticar, soloRoles } = require('../middleware/auth');

const router = express.Router();
router.use(autenticar);

// Un repuesto con su marca, categoría y la lista de modelos compatibles
const SELECT_REPUESTO = `
    SELECT r.id, r.codigo, r.nombre, r.precio, r.stock, r.stock_minimo, r.activo,
           r.marca_id, m.nombre AS marca,
           r.categoria_id, c.nombre AS categoria,
           COALESCE(
               json_agg(json_build_object('id', mm.id, 'nombre', mm.nombre) ORDER BY mm.nombre)
               FILTER (WHERE mm.id IS NOT NULL), '[]'
           ) AS modelos
    FROM repuestos r
    LEFT JOIN marcas m ON m.id = r.marca_id
    LEFT JOIN categorias c ON c.id = r.categoria_id
    LEFT JOIN repuesto_modelo rm ON rm.repuesto_id = r.id
    LEFT JOIN modelos_moto mm ON mm.id = rm.modelo_id`;

const GROUP_BY = 'GROUP BY r.id, m.nombre, c.nombre';

// GET /api/repuestos?q=&modelo_id=&marca_id=&categoria_id=&todos=1
// Búsqueda por nombre/código, modelo, marca o categoría (RF02)
router.get('/', async (req, res) => {
    const { q, modelo_id, marca_id, categoria_id, todos } = req.query;
    const cond = [];
    const params = [];

    if (!(todos === '1' && req.usuario.rol === 'administrador')) cond.push('r.activo');
    if (q) {
        params.push(`%${q.trim()}%`);
        cond.push(`(r.nombre ILIKE $${params.length} OR r.codigo ILIKE $${params.length})`);
    }
    if (marca_id) {
        params.push(Number(marca_id));
        cond.push(`r.marca_id = $${params.length}`);
    }
    if (categoria_id) {
        params.push(Number(categoria_id));
        cond.push(`r.categoria_id = $${params.length}`);
    }
    if (modelo_id) {
        // Filtra por modelo sin recortar la lista de modelos compatibles que se devuelve
        params.push(Number(modelo_id));
        cond.push(`EXISTS (SELECT 1 FROM repuesto_modelo x
                           WHERE x.repuesto_id = r.id AND x.modelo_id = $${params.length})`);
    }

    const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
    try {
        const { rows } = await pool.query(
            `${SELECT_REPUESTO} ${where} ${GROUP_BY} ORDER BY r.nombre`,
            params
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// GET /api/repuestos/alertas/stock-minimo  (RF05: alerta de stock mínimo)
router.get('/alertas/stock-minimo', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `${SELECT_REPUESTO} WHERE r.activo AND r.stock <= r.stock_minimo
             ${GROUP_BY} ORDER BY r.stock, r.nombre`
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// GET /api/repuestos/:id
router.get('/:id', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `${SELECT_REPUESTO} WHERE r.id = $1 ${GROUP_BY}`,
            [Number(req.params.id)]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Repuesto no encontrado' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Valida los campos numéricos; devuelve un mensaje de error o null
function validar(b, { parcial }) {
    if (!parcial) {
        if (!b.codigo || !b.nombre) return 'Código y nombre son obligatorios';
        if (b.precio === undefined) return 'El precio es obligatorio';
    }
    if (b.precio !== undefined && !(Number(b.precio) >= 0)) return 'Precio inválido';
    for (const campo of ['stock', 'stock_minimo']) {
        if (b[campo] !== undefined && !(Number.isInteger(Number(b[campo])) && Number(b[campo]) >= 0)) {
            return `${campo} debe ser un entero mayor o igual a 0`;
        }
    }
    if (b.modelos !== undefined && !Array.isArray(b.modelos)) return 'modelos debe ser una lista de ids';
    return null;
}

async function guardarModelos(cliente, repuestoId, modelos) {
    await cliente.query('DELETE FROM repuesto_modelo WHERE repuesto_id = $1', [repuestoId]);
    for (const modeloId of [...new Set(modelos.map(Number))]) {
        await cliente.query(
            'INSERT INTO repuesto_modelo (repuesto_id, modelo_id) VALUES ($1, $2)',
            [repuestoId, modeloId]
        );
    }
}

function errorBD(err, res) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un repuesto con ese código' });
    if (err.code === '23503') return res.status(400).json({ error: 'Marca, categoría o modelo inexistente' });
    return res.status(500).json({ error: 'Error del servidor' });
}

// POST /api/repuestos  (RF01, solo administrador)
router.post('/', soloRoles('administrador'), async (req, res) => {
    const b = req.body;
    const error = validar(b, { parcial: false });
    if (error) return res.status(400).json({ error });

    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN');
        const { rows } = await cliente.query(
            `INSERT INTO repuestos (codigo, nombre, marca_id, categoria_id, precio, stock, stock_minimo)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
            [b.codigo.trim(), b.nombre.trim(), b.marca_id ?? null, b.categoria_id ?? null,
             b.precio, b.stock ?? 0, b.stock_minimo ?? 0]
        );
        await guardarModelos(cliente, rows[0].id, b.modelos || []);
        await cliente.query('COMMIT');
        const { rows: completo } = await pool.query(
            `${SELECT_REPUESTO} WHERE r.id = $1 ${GROUP_BY}`, [rows[0].id]
        );
        res.status(201).json(completo[0]);
    } catch (err) {
        await cliente.query('ROLLBACK');
        errorBD(err, res);
    } finally {
        cliente.release();
    }
});

// PATCH /api/repuestos/:id  (edición parcial, solo administrador)
// El stock se mueve con ventas e ingresos; aquí solo se permite corregirlo a mano.
router.patch('/:id', soloRoles('administrador'), async (req, res) => {
    const id = Number(req.params.id);
    const b = req.body;
    const error = validar(b, { parcial: true });
    if (error) return res.status(400).json({ error });

    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN');
        const { rowCount } = await cliente.query(
            `UPDATE repuestos SET
                codigo = COALESCE($1, codigo),
                nombre = COALESCE($2, nombre),
                marca_id = COALESCE($3, marca_id),
                categoria_id = COALESCE($4, categoria_id),
                precio = COALESCE($5, precio),
                stock = COALESCE($6, stock),
                stock_minimo = COALESCE($7, stock_minimo),
                activo = COALESCE($8, activo)
             WHERE id = $9`,
            [b.codigo?.trim() ?? null, b.nombre?.trim() ?? null, b.marca_id ?? null,
             b.categoria_id ?? null, b.precio ?? null, b.stock ?? null,
             b.stock_minimo ?? null, b.activo ?? null, id]
        );
        if (!rowCount) {
            await cliente.query('ROLLBACK');
            return res.status(404).json({ error: 'Repuesto no encontrado' });
        }
        if (b.modelos !== undefined) await guardarModelos(cliente, id, b.modelos);
        await cliente.query('COMMIT');
        const { rows } = await pool.query(`${SELECT_REPUESTO} WHERE r.id = $1 ${GROUP_BY}`, [id]);
        res.json(rows[0]);
    } catch (err) {
        await cliente.query('ROLLBACK');
        errorBD(err, res);
    } finally {
        cliente.release();
    }
});

// DELETE /api/repuestos/:id  -> baja lógica: se conserva para el historial de ventas
router.delete('/:id', soloRoles('administrador'), async (req, res) => {
    try {
        const { rowCount } = await pool.query(
            'UPDATE repuestos SET activo = FALSE WHERE id = $1', [Number(req.params.id)]
        );
        if (!rowCount) return res.status(404).json({ error: 'Repuesto no encontrado' });
        res.status(204).end();
    } catch (err) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

module.exports = router;
