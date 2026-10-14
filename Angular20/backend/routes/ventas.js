const express = require('express');
const pool = require('../db');
const { autenticar, soloRoles } = require('../middleware/auth');
const { StockError, agruparItems, crearVenta } = require('../services/ventas');

const router = express.Router();
// Las ventas de mostrador son solo del personal (los clientes usan pedidos)
router.use(autenticar, soloRoles('administrador', 'vendedor'));

// Comprobante interno: cabecera de la venta + líneas de detalle
const SELECT_VENTA = `
    SELECT v.id, v.numero, v.fecha, v.total,
           v.usuario_id, u.nombre AS vendedor,
           v.cliente_id, c.nombre AS cliente, c.documento AS cliente_documento
    FROM ventas v
    JOIN usuarios u ON u.id = v.usuario_id
    LEFT JOIN clientes c ON c.id = v.cliente_id`;

const SELECT_DETALLE = `
    SELECT d.repuesto_id, r.codigo, r.nombre, d.cantidad, d.precio_unitario,
           (d.cantidad * d.precio_unitario) AS subtotal
    FROM detalle_venta d
    JOIN repuestos r ON r.id = d.repuesto_id
    WHERE d.venta_id = $1
    ORDER BY d.id`;

async function cargarComprobante(db, ventaId) {
    const { rows } = await db.query(`${SELECT_VENTA} WHERE v.id = $1`, [ventaId]);
    if (!rows[0]) return null;
    const detalle = await db.query(SELECT_DETALLE, [ventaId]);
    return { ...rows[0], items: detalle.rows };
}

// POST /api/ventas  { cliente_id?, items: [{ repuesto_id, cantidad }] }
// Valida stock, descuenta y emite el comprobante en una sola transacción (RF03, RF04, RF05)
router.post('/', async (req, res) => {
    const cantidades = agruparItems(req.body.items);
    if (!cantidades) {
        return res.status(400).json({
            error: 'La venta necesita al menos un repuesto, con repuesto_id y una cantidad entera mayor a 0',
        });
    }

    // Se valida el cliente ANTES de abrir la venta: un insert fallido gastaría un número de comprobante
    const clienteId = req.body.cliente_id ?? null;
    if (clienteId !== null) {
        const { rowCount } = await pool.query('SELECT 1 FROM clientes WHERE id = $1 AND activo', [Number(clienteId) || 0]);
        if (!rowCount) return res.status(400).json({ error: 'Cliente inexistente o dado de baja' });
    }

    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN');
        const ventaId = await crearVenta(cliente, {
            usuarioId: req.usuario.id,
            clienteId,
            cantidades,
        });
        await cliente.query('COMMIT');
        res.status(201).json(await cargarComprobante(cliente, ventaId)); // misma conexión: pedir otra al grupo puede bloquear
    } catch (err) {
        await cliente.query('ROLLBACK');
        if (err instanceof StockError) {
            return res.status(409).json({ error: err.message, problemas: err.problemas });
        }
        if (err.code === '23503') return res.status(400).json({ error: 'Cliente inexistente' });
        res.status(500).json({ error: 'Error del servidor' });
    } finally {
        cliente.release();
    }
});

// GET /api/ventas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
// El administrador ve todas las ventas; el vendedor, solo las suyas
router.get('/', async (req, res) => {
    const { desde, hasta } = req.query;
    const cond = [];
    const params = [];
    if (req.usuario.rol !== 'administrador') {
        params.push(req.usuario.id);
        cond.push(`v.usuario_id = $${params.length}`);
    }
    if (desde) {
        params.push(desde);
        cond.push(`v.fecha >= $${params.length}::date`);
    }
    if (hasta) {
        params.push(hasta);
        cond.push(`v.fecha < ($${params.length}::date + 1)`);
    }
    const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
    try {
        const { rows } = await pool.query(`${SELECT_VENTA} ${where} ORDER BY v.fecha DESC, v.id DESC`, params);
        res.json(rows);
    } catch (err) {
        if (err.code === '22007' || err.code === '22008') {
            return res.status(400).json({ error: 'Fecha inválida, usa el formato YYYY-MM-DD' });
        }
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// GET /api/ventas/:id  -> comprobante interno completo
router.get('/:id', async (req, res) => {
    try {
        const comprobante = await cargarComprobante(pool, Number(req.params.id));
        if (!comprobante) return res.status(404).json({ error: 'Venta no encontrada' });
        if (req.usuario.rol !== 'administrador' && comprobante.usuario_id !== req.usuario.id) {
            return res.status(403).json({ error: 'No tienes permiso para ver esta venta' });
        }
        res.json(comprobante);
    } catch (err) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

module.exports = router;
