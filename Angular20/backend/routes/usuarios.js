const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { autenticar, soloRoles } = require('../middleware/auth');

const router = express.Router();
const ROLES = ['administrador', 'vendedor'];

// Todo este módulo es solo para administradores
router.use(autenticar, soloRoles('administrador'));

// GET /api/usuarios
router.get('/', async (req, res) => {
    try {
        const { rows } = await pool.query(
            'SELECT id, nombre, usuario, rol, activo, creado_en FROM usuarios ORDER BY id'
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// POST /api/usuarios  { nombre, usuario, password, rol }
router.post('/', async (req, res) => {
    const { nombre, usuario, password, rol } = req.body;
    if (!nombre || !usuario || !password || !ROLES.includes(rol)) {
        return res.status(400).json({ error: 'Datos incompletos o rol inválido' });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }
    try {
        const hash = await bcrypt.hash(password, 10);
        const { rows } = await pool.query(
            `INSERT INTO usuarios (nombre, usuario, password_hash, rol)
             VALUES ($1, $2, $3, $4)
             RETURNING id, nombre, usuario, rol, activo`,
            [nombre, usuario, hash, rol]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'Ese usuario ya existe' });
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// PATCH /api/usuarios/:id  { nombre?, rol?, activo?, password? }
router.patch('/:id', async (req, res) => {
    const id = Number(req.params.id);
    const { nombre, rol, activo, password } = req.body;
    if (rol !== undefined && !ROLES.includes(rol)) {
        return res.status(400).json({ error: 'Rol inválido' });
    }
    if (password !== undefined && password.length < 6) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }
    // Evita que el administrador se bloquee a sí mismo
    if (id === req.usuario.id && (activo === false || (rol && rol !== 'administrador'))) {
        return res.status(400).json({ error: 'No puedes desactivarte ni quitarte el rol de administrador' });
    }
    try {
        const hash = password !== undefined ? await bcrypt.hash(password, 10) : null;
        const { rows } = await pool.query(
            `UPDATE usuarios SET
                nombre = COALESCE($1, nombre),
                rol = COALESCE($2, rol),
                activo = COALESCE($3, activo),
                password_hash = COALESCE($4, password_hash)
             WHERE id = $5
             RETURNING id, nombre, usuario, rol, activo`,
            [nombre ?? null, rol ?? null, activo ?? null, hash, id]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

module.exports = router;
