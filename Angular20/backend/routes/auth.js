const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const pool = require('../db');
const { autenticar } = require('../middleware/auth');

const router = express.Router();

// Límites contra abuso: el registro es público y el login admite fuerza bruta
const limitar = (max, minutos) =>
    rateLimit({
        windowMs: minutos * 60 * 1000,
        limit: max,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' },
    });

function emitirToken(u) {
    return jwt.sign(
        { id: u.id, usuario: u.usuario, rol: u.rol },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRA || '8h' }
    );
}

// POST /api/auth/registro  { nombre, usuario, password, documento?, telefono? }
// Registro público de CLIENTES (RF01). Crea la ficha en `clientes` y el usuario vinculado.
router.post('/registro', limitar(10, 60), async (req, res) => {
    const nombre = String(req.body.nombre || '').trim();
    const usuario = String(req.body.usuario || '').trim();
    const password = String(req.body.password || '');
    const documento = req.body.documento ? String(req.body.documento).trim() : null;
    const telefono = req.body.telefono ? String(req.body.telefono).trim() : null;

    if (!nombre || usuario.length < 3 || password.length < 6) {
        return res.status(400).json({
            error: 'Nombre obligatorio, usuario de al menos 3 caracteres y contraseña de al menos 6',
        });
    }
    if (documento && !/^(\d{8}|\d{11})$/.test(documento)) {
        return res.status(400).json({ error: 'El documento debe ser un DNI (8 dígitos) o RUC (11 dígitos)' });
    }

    const db = await pool.connect();
    try {
        await db.query('BEGIN');
        const { rows: ficha } = await db.query(
            'INSERT INTO clientes (nombre, documento, telefono) VALUES ($1, $2, $3) RETURNING id',
            [nombre, documento, telefono]
        );
        const hash = await bcrypt.hash(password, 10);
        const { rows } = await db.query(
            `INSERT INTO usuarios (nombre, usuario, password_hash, rol, cliente_id)
             VALUES ($1, $2, $3, 'cliente', $4)
             RETURNING id, nombre, usuario, rol`,
            [nombre, usuario, hash, ficha[0].id]
        );
        await db.query('COMMIT');
        res.status(201).json({ token: emitirToken(rows[0]), usuario: rows[0] });
    } catch (err) {
        await db.query('ROLLBACK');
        if (err.code === '23505') {
            const campo = String(err.constraint).includes('documento') ? 'documento' : 'usuario';
            return res.status(409).json({ error: `Ese ${campo} ya está registrado` });
        }
        res.status(500).json({ error: 'Error del servidor' });
    } finally {
        db.release();
    }
});

// POST /api/auth/login  { usuario, password }
router.post('/login', limitar(30, 15), async (req, res) => {
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
        const token = emitirToken(u);
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
