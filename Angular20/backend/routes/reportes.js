const express = require('express');
const pool = require('../db');
const { autenticar, soloRoles } = require('../middleware/auth');

const router = express.Router();
// Los reportes los consulta el administrador (el propietario supervisa a través de él)
router.use(autenticar, soloRoles('administrador'));

// Las fechas de los reportes se interpretan en hora de Lima, no en la del servidor:
// una venta de las 8 p. m. no debe contarse en el día siguiente por la zona horaria.
const FECHA_VENTA = `(v.fecha AT TIME ZONE 'America/Lima')::date`;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Lee desde/hasta (YYYY-MM-DD). Si faltan, usa del primer día del mes en curso hasta hoy.
async function leerRango(req, res) {
    let { desde, hasta } = req.query;
    if ((desde && !FECHA.test(desde)) || (hasta && !FECHA.test(hasta))) {
        res.status(400).json({ error: 'Fecha inválida, usa el formato YYYY-MM-DD' });
        return null;
    }
    if (!desde || !hasta) {
        const { rows } = await pool.query(
            `SELECT date_trunc('month', NOW() AT TIME ZONE 'America/Lima')::date::text AS inicio,
                    (NOW() AT TIME ZONE 'America/Lima')::date::text AS hoy`
        );
        desde = desde || rows[0].inicio;
        hasta = hasta || rows[0].hoy;
    }
    if (desde > hasta) {
        res.status(400).json({ error: 'La fecha inicial no puede ser posterior a la final' });
        return null;
    }
    return { desde, hasta };
}

// GET /api/reportes/ventas?desde=&hasta=&agrupar=dia|semana|mes   (RF09, UAT 8)
router.get('/ventas', async (req, res) => {
    const agrupar = req.query.agrupar || 'dia';
    if (!['dia', 'semana', 'mes'].includes(agrupar)) {
        return res.status(400).json({ error: 'agrupar debe ser dia, semana o mes' });
    }
    try {
        const rango = await leerRango(req, res);
        if (!rango) return;
        const unidad = { dia: 'day', semana: 'week', mes: 'month' }[agrupar];
        const { rows } = await pool.query(
            `SELECT date_trunc('${unidad}', ${FECHA_VENTA})::date::text AS periodo,
                    COUNT(*)::int AS ventas,
                    SUM(v.total) AS total
             FROM ventas v
             WHERE ${FECHA_VENTA} BETWEEN $1::date AND $2::date
             GROUP BY 1
             ORDER BY 1`,
            [rango.desde, rango.hasta]
        );
        const resumen = rows.reduce(
            (acc, r) => ({ ventas: acc.ventas + r.ventas, total: acc.total + Math.round(Number(r.total) * 100) }),
            { ventas: 0, total: 0 }
        );
        res.json({
            desde: rango.desde,
            hasta: rango.hasta,
            agrupar,
            filas: rows.map((r) => ({
                periodo: r.periodo,
                ventas: r.ventas,
                total: r.total,
            })),
            resumen: { ventas: resumen.ventas, total: (resumen.total / 100).toFixed(2) },
        });
    } catch (err) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// GET /api/reportes/stock?modelo_id=   (UAT 9: stock actual por modelo de moto)
// Un repuesto compatible con varios modelos aparece en cada uno de ellos.
router.get('/stock', async (req, res) => {
    const params = [];
    let filtro = '';
    if (req.query.modelo_id) {
        params.push(Number(req.query.modelo_id));
        filtro = `AND mm.id = $${params.length}`;
    }
    try {
        const { rows } = await pool.query(
            `SELECT mm.id AS modelo_id, mm.nombre AS modelo,
                    r.id AS repuesto_id, r.codigo, r.nombre,
                    r.stock, r.stock_minimo, r.precio,
                    (r.stock <= r.stock_minimo) AS bajo_minimo
             FROM modelos_moto mm
             JOIN repuesto_modelo rm ON rm.modelo_id = mm.id
             JOIN repuestos r ON r.id = rm.repuesto_id AND r.activo
             WHERE TRUE ${filtro}
             ORDER BY mm.nombre, r.nombre`,
            params
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// GET /api/reportes/mas-vendidos?desde=&hasta=&modelo_id=&limite=10
router.get('/mas-vendidos', async (req, res) => {
    const limite = Math.min(Math.max(parseInt(req.query.limite, 10) || 10, 1), 100);
    try {
        const rango = await leerRango(req, res);
        if (!rango) return;
        const params = [rango.desde, rango.hasta, limite];
        let filtro = '';
        if (req.query.modelo_id) {
            params.push(Number(req.query.modelo_id));
            filtro = `AND EXISTS (SELECT 1 FROM repuesto_modelo x
                                  WHERE x.repuesto_id = r.id AND x.modelo_id = $${params.length})`;
        }
        const { rows } = await pool.query(
            `SELECT r.id AS repuesto_id, r.codigo, r.nombre,
                    SUM(d.cantidad)::int AS unidades,
                    SUM(d.cantidad * d.precio_unitario) AS ingresos
             FROM detalle_venta d
             JOIN ventas v ON v.id = d.venta_id
             JOIN repuestos r ON r.id = d.repuesto_id
             WHERE ${FECHA_VENTA} BETWEEN $1::date AND $2::date ${filtro}
             GROUP BY r.id
             ORDER BY unidades DESC, ingresos DESC, r.nombre
             LIMIT $3`,
            params
        );
        res.json({ desde: rango.desde, hasta: rango.hasta, filas: rows });
    } catch (err) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

module.exports = router;
