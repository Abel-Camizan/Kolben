const express = require('express');
const pool = require('../db');
const { autenticar, soloRoles } = require('../middleware/auth');

const router = express.Router();

// Estas listas son del personal. Se aplica el control en cada ruta (no con router.use)
// porque este router cuelga de /api y no debe interceptar rutas ajenas.
const personal = [autenticar, soloRoles('administrador', 'vendedor')];
const soloAdmin = [autenticar, soloRoles('administrador')];

// Listas simples para llenar los combos del formulario de repuestos
function listaYAlta(ruta, tabla) {
    router.get(ruta, personal, async (req, res) => {
        try {
            const { rows } = await pool.query(`SELECT id, nombre FROM ${tabla} ORDER BY nombre`);
            res.json(rows);
        } catch (err) {
            res.status(500).json({ error: 'Error del servidor' });
        }
    });

    router.post(ruta, soloAdmin, async (req, res) => {
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

listaYAlta('/marcas', 'marcas');
listaYAlta('/categorias', 'categorias');
// Los modelos de moto (TVS King Deluxe, TVS Duramax, Bajaj Torito) vienen del esquema;
// se pueden ampliar después (RNF07: escalabilidad)
listaYAlta('/modelos', 'modelos_moto');

module.exports = router;
