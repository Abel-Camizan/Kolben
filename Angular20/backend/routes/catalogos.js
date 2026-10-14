const express = require('express');
const pool = require('../db');
const { autenticar, soloRoles } = require('../middleware/auth');

const router = express.Router();
router.use(autenticar);

// Listas simples para llenar los combos del formulario de repuestos
function listaYAlta(ruta, tabla, { editable }) {
    router.get(ruta, async (req, res) => {
        try {
            const { rows } = await pool.query(`SELECT id, nombre FROM ${tabla} ORDER BY nombre`);
            res.json(rows);
        } catch (err) {
            res.status(500).json({ error: 'Error del servidor' });
        }
    });

    if (!editable) return;

    router.post(ruta, soloRoles('administrador'), async (req, res) => {
        const nombre = (req.body.nombre || '').trim();
        if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });
        try {
            const { rows } = await pool.query(
                `INSERT INTO ${tabla} (nombre) VALUES ($1) RETURNING id, nombre`,
                [nombre]
            );
            res.status(201).json(rows[0]);
        } catch (err) {
            if (err.code === '23505') return res.status(409).json({ error: 'Ya existe' });
            res.status(500).json({ error: 'Error del servidor' });
        }
    });
}

listaYAlta('/marcas', 'marcas', { editable: true });
listaYAlta('/categorias', 'categorias', { editable: true });
// Los modelos de moto (TVS King Deluxe, TVS Duramax, Bajaj Torito) vienen del esquema;
// se pueden ampliar después (RNF04: escalabilidad)
listaYAlta('/modelos', 'modelos_moto', { editable: true });

module.exports = router;
