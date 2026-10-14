const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { autenticar } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login  { usuario, password }
router.post('/login', async (req, res) => {
    const { usuario, password } = req.body;
    if (!usuario || !password) {
        return res.status(400).json({ error: 'Usuario y contraseña son obligatorios' });
    }
    try {
        const { rows } = await pool.query(
            'SELECT id, nombre, usuario, password_hash, rol, activo FROM usuarios WHERE usuario = $1',
            [usuario]
        );
        const u = rows[0];
        // Mismo mensaje para usuario inexistente y contraseña errónea
        if (!u || !u.activo || !(await bcrypt.compare(password, u.password_hash))) {
            return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
        }
        const token = jwt.sign(
            { id: u.id, usuario: u.usuario, rol: u.rol },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRA || '8h' }
        );
        res.json({ token, usuario: { id: u.id, nombre: u.nombre, usuario: u.usuario, rol: u.rol } });
    } catch (err) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// GET /api/auth/me  (devuelve el usuario del token)
router.get('/me', autenticar, async (req, res) => {
    try {
        const { rows } = await pool.query(
            'SELECT id, nombre, usuario, rol FROM usuarios WHERE id = $1 AND activo',
            [req.usuario.id]
        );
        if (!rows[0]) return res.status(401).json({ error: 'Usuario no disponible' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

module.exports = router;
