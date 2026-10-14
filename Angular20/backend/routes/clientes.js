const express = require('express');
const pool = require('../db');
const { autenticar, soloRoles } = require('../middleware/auth');

const router = express.Router();
// El vendedor registra y consulta clientes en el mostrador; la baja es del administrador
router.use(autenticar, soloRoles('administrador', 'vendedor'));

const texto = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim());

// Valida los campos; devuelve un mensaje de error o null
function validar(b, { parcial }) {
    if (!parcial && !String(b.nombre || '').trim()) return 'El nombre es obligatorio';
    if (b.nombre !== undefined && !String(b.nombre).trim()) return 'El nombre no puede quedar vacío';
    if (b.documento && !/^(\d{8}|\d{11})$/.test(String(b.documento).trim())) {
        return 'El documento debe ser un DNI (8 dígitos) o RUC (11 dígitos)';
    }
    return null;
}

const COLUMNAS = 'id, nombre, documento, telefono, direccion, activo, creado_en';

// GET /api/clientes?q=&todos=1   (por defecto solo los activos; "todos" es solo del administrador)
router.get('/', async (req, res) => {
    const cond = [];
    const params = [];
    if (!(req.query.todos === '1' && req.usuario.rol === 'administrador')) cond.push('activo');
    if (req.query.q) {
        params.push(`%${String(req.query.q).trim()}%`);
        cond.push(`(nombre ILIKE $${params.length} OR documento ILIKE $${params.length} OR telefono ILIKE $${params.length})`);
    }
    const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
    try {
        const { rows } = await pool.query(
            `SELECT ${COLUMNAS} FROM clientes ${where} ORDER BY nombre LIMIT 200`, params
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// GET /api/clientes/:id  -> ficha + resumen + historial de compras (RF07)
router.get('/:id', async (req, res) => {
    const id = Number(req.params.id);
    try {
        const { rows } = await pool.query(`SELECT ${COLUMNAS} FROM clientes WHERE id = $1`, [id]);
        if (!rows[0]) return res.status(404).json({ error: 'Cliente no encontrado' });

        const { rows: resumen } = await pool.query(
            `SELECT COUNT(*)::int AS compras, COALESCE(SUM(total), 0) AS total, MAX(fecha) AS ultima
             FROM ventas WHERE cliente_id = $1`,
            [id]
        );
        const { rows: historial } = await pool.query(
            `SELECT v.id, v.numero, v.fecha, v.total, u.nombre AS vendedor
             FROM ventas v JOIN usuarios u ON u.id = v.usuario_id
             WHERE v.cliente_id = $1
             ORDER BY v.fecha DESC, v.id DESC
             LIMIT 50`,
            [id]
        );
        res.json({ ...rows[0], resumen: resumen[0], historial });
    } catch (err) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// POST /api/clientes  { nombre, documento?, telefono?, direccion? }
router.post('/', async (req, res) => {
    const error = validar(req.body, { parcial: false });
    if (error) return res.status(400).json({ error });
    const b = req.body;
    try {
        const { rows } = await pool.query(
            `INSERT INTO clientes (nombre, documento, telefono, direccion)
             VALUES ($1, $2, $3, $4) RETURNING ${COLUMNAS}`,
            [b.nombre.trim(), texto(b.documento), texto(b.telefono), texto(b.direccion)]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un cliente con ese documento' });
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// PATCH /api/clientes/:id  (editar; activo=false lo da de baja y solo lo puede el administrador)
router.patch('/:id', async (req, res) => {
    const error = validar(req.body, { parcial: true });
    if (error) return res.status(400).json({ error });
    const b = req.body;
    if (b.activo !== undefined && req.usuario.rol !== 'administrador') {
        return res.status(403).json({ error: 'Solo el administrador puede dar de baja o reactivar clientes' });
    }
    try {
        // Los datos opcionales se pueden vaciar enviando '' (de ahí el CASE y no COALESCE)
        const { rows } = await pool.query(
            `UPDATE clientes SET
                nombre = COALESCE($1, nombre),
                documento = CASE WHEN $2::boolean THEN $3 ELSE documento END,
                telefono = CASE WHEN $4::boolean THEN $5 ELSE telefono END,
                direccion = CASE WHEN $6::boolean THEN $7 ELSE direccion END,
                activo = COALESCE($8, activo)
             WHERE id = $9
             RETURNING ${COLUMNAS}`,
            [
                b.nombre?.trim() ?? null,
                b.documento !== undefined, texto(b.documento),
                b.telefono !== undefined, texto(b.telefono),
                b.direccion !== undefined, texto(b.direccion),
                b.activo ?? null,
                Number(req.params.id),
            ]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Cliente no encontrado' });
        res.json(rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un cliente con ese documento' });
        res.status(500).json({ error: 'Error del servidor' });
    }
});

module.exports = router;
