const express = require('express');
const pool = require('../db');

// Catálogo PÚBLICO: se puede ver sin iniciar sesión (RF04).
// Solo expone lo necesario para el cliente: nada de stock mínimo ni repuestos de baja.
const router = express.Router();

// GET /api/catalogo/modelos  -> para el filtro por modelo de moto
router.get('/modelos', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT id, nombre FROM modelos_moto ORDER BY nombre');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// GET /api/catalogo?q=&modelo_id=
router.get('/', async (req, res) => {
    const { q, modelo_id } = req.query;
    const cond = ['r.activo'];
    const params = [];
    if (q) {
        params.push(`%${String(q).trim()}%`);
        cond.push(`(r.nombre ILIKE $${params.length} OR r.codigo ILIKE $${params.length})`);
    }
    if (modelo_id) {
        params.push(Number(modelo_id));
        cond.push(`EXISTS (SELECT 1 FROM repuesto_modelo x
                           WHERE x.repuesto_id = r.id AND x.modelo_id = $${params.length})`);
    }
    try {
        const { rows } = await pool.query(
            `SELECT r.id, r.codigo, r.nombre, r.precio, r.stock,
                    m.nombre AS marca, c.nombre AS categoria,
                    COALESCE(
                        json_agg(json_build_object('id', mm.id, 'nombre', mm.nombre) ORDER BY mm.nombre)
                        FILTER (WHERE mm.id IS NOT NULL), '[]'
                    ) AS modelos
             FROM repuestos r
             LEFT JOIN marcas m ON m.id = r.marca_id
             LEFT JOIN categorias c ON c.id = r.categoria_id
             LEFT JOIN repuesto_modelo rm ON rm.repuesto_id = r.id
             LEFT JOIN modelos_moto mm ON mm.id = rm.modelo_id
             WHERE ${cond.join(' AND ')}
             GROUP BY r.id, m.nombre, c.nombre
             ORDER BY r.nombre`,
            params
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

module.exports = router;
