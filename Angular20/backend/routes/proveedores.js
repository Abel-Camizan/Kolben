const express = require('express');
const pool = require('../db');
const { autenticar, soloRoles } = require('../middleware/auth');

const router = express.Router();
// Los proveedores y el abastecimiento los maneja el administrador
router.use(autenticar, soloRoles('administrador'));

// Valida los campos opcionales; devuelve un mensaje de error o null
function validar(b, { parcial }) {
    if (!parcial && !String(b.nombre || '').trim()) return 'El nombre es obligatorio';
    if (b.nombre !== undefined && !String(b.nombre).trim()) return 'El nombre no puede quedar vacío';
    if (b.ruc && !/^\d{11}$/.test(String(b.ruc).trim())) return 'El RUC debe tener 11 dígitos';
    return null;
}

const texto = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim());

// GET /api/proveedores?todos=1  (por defecto solo los activos)
router.get('/', async (req, res) => {
    try {
        const where = req.query.todos === '1' ? '' : 'WHERE activo';
        const { rows } = await pool.query(
            `SELECT id, nombre, ruc, telefono, direccion, activo FROM proveedores ${where} ORDER BY nombre`
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// POST /api/proveedores  { nombre, ruc?, telefono?, direccion? }
router.post('/', async (req, res) => {
    const error = validar(req.body, { parcial: false });
    if (error) return res.status(400).json({ error });
    const b = req.body;
    try {
        const { rows } = await pool.query(
            `INSERT INTO proveedores (nombre, ruc, telefono, direccion)
             VALUES ($1, $2, $3, $4)
             RETURNING id, nombre, ruc, telefono, direccion, activo`,
            [b.nombre.trim(), texto(b.ruc), texto(b.telefono), texto(b.direccion)]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un proveedor con ese RUC' });
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// PATCH /api/proveedores/:id  (edición parcial; activo=false lo da de baja)
router.patch('/:id', async (req, res) => {
    const error = validar(req.body, { parcial: true });
    if (error) return res.status(400).json({ error });
    const b = req.body;
    try {
        // Los datos opcionales se pueden vaciar enviando '' (de ahí el CASE y no COALESCE)
        const { rows } = await pool.query(
            `UPDATE proveedores SET
                nombre = COALESCE($1, nombre),
                ruc = CASE WHEN $2::boolean THEN $3 ELSE ruc END,
                telefono = CASE WHEN $4::boolean THEN $5 ELSE telefono END,
                direccion = CASE WHEN $6::boolean THEN $7 ELSE direccion END,
                activo = COALESCE($8, activo)
             WHERE id = $9
             RETURNING id, nombre, ruc, telefono, direccion, activo`,
            [
                b.nombre?.trim() ?? null,
                b.ruc !== undefined, texto(b.ruc),
                b.telefono !== undefined, texto(b.telefono),
                b.direccion !== undefined, texto(b.direccion),
                b.activo ?? null,
                Number(req.params.id),
            ]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Proveedor no encontrado' });
        res.json(rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un proveedor con ese RUC' });
        res.status(500).json({ error: 'Error del servidor' });
    }
});

module.exports = router;
