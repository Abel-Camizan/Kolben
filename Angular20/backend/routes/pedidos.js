const express = require('express');
const pool = require('../db');
const { autenticar, soloRoles } = require('../middleware/auth');
const { StockError, agruparItems, crearVenta } = require('../services/ventas');

const router = express.Router();
router.use(autenticar);

const PERSONAL = ['administrador', 'vendedor'];
const esPersonal = (req) => PERSONAL.includes(req.usuario.rol);

const SELECT_PEDIDO = `
    SELECT p.id, p.numero, p.estado, p.total, p.nota, p.venta_id, p.creado_en, p.actualizado_en,
           p.usuario_id, u.nombre AS cliente, c.telefono AS cliente_telefono,
           c.documento AS cliente_documento
    FROM pedidos p
    JOIN usuarios u ON u.id = p.usuario_id
    LEFT JOIN clientes c ON c.id = u.cliente_id`;

const SELECT_DETALLE = `
    SELECT d.repuesto_id, r.codigo, r.nombre, d.cantidad, d.precio_unitario,
           (d.cantidad * d.precio_unitario) AS subtotal
    FROM detalle_pedido d
    JOIN repuestos r ON r.id = d.repuesto_id
    WHERE d.pedido_id = $1
    ORDER BY d.id`;

async function cargarPedido(db, id) {
    const { rows } = await db.query(`${SELECT_PEDIDO} WHERE p.id = $1`, [id]);
    if (!rows[0]) return null;
    const detalle = await db.query(SELECT_DETALLE, [id]);
    return { ...rows[0], items: detalle.rows };
}

// Devuelve el pedido solo si el usuario puede verlo: el personal ve todos,
// el cliente solo los suyos. Si no, responde el error y devuelve null.
async function pedidoVisible(req, res) {
    const pedido = await cargarPedido(pool, Number(req.params.id));
    if (!pedido) {
        res.status(404).json({ error: 'Pedido no encontrado' });
        return null;
    }
    if (!esPersonal(req) && pedido.usuario_id !== req.usuario.id) {
        // Mismo mensaje que si no existiera: no se revela que el pedido es de otro
        res.status(404).json({ error: 'Pedido no encontrado' });
        return null;
    }
    return pedido;
}

// POST /api/pedidos  { items: [{ repuesto_id, cantidad }], nota? }   (solo clientes)
// Guarda los precios del momento. El stock se revisa ahora, pero se descuenta al confirmar.
router.post('/', soloRoles('cliente'), async (req, res) => {
    const cantidades = agruparItems(req.body.items);
    if (!cantidades) {
        return res.status(400).json({
            error: 'El pedido necesita al menos un repuesto, con repuesto_id y una cantidad entera mayor a 0',
        });
    }
    const nota = req.body.nota ? String(req.body.nota).trim().slice(0, 200) : null;

    const db = await pool.connect();
    try {
        await db.query('BEGIN');
        const { rows: repuestos } = await db.query(
            'SELECT id, codigo, nombre, precio, stock, activo FROM repuestos WHERE id = ANY($1)',
            [[...cantidades.keys()]]
        );
        const porId = new Map(repuestos.map((r) => [r.id, r]));

        const problemas = [];
        for (const [id, cantidad] of cantidades) {
            const r = porId.get(id);
            if (!r || !r.activo) {
                problemas.push({ repuesto_id: id, motivo: 'Repuesto no disponible' });
            } else if (r.stock < cantidad) {
                problemas.push({
                    repuesto_id: id, nombre: r.nombre, motivo: 'Stock insuficiente',
                    solicitado: cantidad, disponible: r.stock,
                });
            }
        }
        if (problemas.length) {
            await db.query('ROLLBACK');
            return res.status(409).json({ error: 'No se puede generar el pedido', problemas });
        }

        let totalCentimos = 0;
        for (const [id, cantidad] of cantidades) {
            totalCentimos += Math.round(Number(porId.get(id).precio) * 100) * cantidad;
        }
        const { rows } = await db.query(
            `INSERT INTO pedidos (usuario_id, total, nota) VALUES ($1, $2, $3) RETURNING id`,
            [req.usuario.id, totalCentimos / 100, nota]
        );
        const pedidoId = rows[0].id;
        await db.query(`UPDATE pedidos SET numero = 'P-' || LPAD(id::text, 6, '0') WHERE id = $1`, [pedidoId]);
        for (const [id, cantidad] of cantidades) {
            await db.query(
                `INSERT INTO detalle_pedido (pedido_id, repuesto_id, cantidad, precio_unitario)
                 VALUES ($1, $2, $3, $4)`,
                [pedidoId, id, cantidad, porId.get(id).precio]
            );
        }
        await db.query('COMMIT');
        res.status(201).json(await cargarPedido(db, pedidoId)); // misma conexión: pedir otra al grupo puede bloquear
    } catch (err) {
        await db.query('ROLLBACK');
        res.status(500).json({ error: 'Error del servidor' });
    } finally {
        db.release();
    }
});

// GET /api/pedidos?estado=pendiente
// El personal ve todos los pedidos; el cliente, solo los suyos
router.get('/', async (req, res) => {
    const cond = [];
    const params = [];
    if (!esPersonal(req)) {
        params.push(req.usuario.id);
        cond.push(`p.usuario_id = $${params.length}`);
    }
    if (req.query.estado) {
        params.push(req.query.estado);
        cond.push(`p.estado = $${params.length}`);
    }
    const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
    try {
        const { rows } = await pool.query(`${SELECT_PEDIDO} ${where} ORDER BY p.creado_en DESC, p.id DESC`, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// GET /api/pedidos/:id
router.get('/:id', async (req, res) => {
    try {
        const pedido = await pedidoVisible(req, res);
        if (pedido) res.json(pedido);
    } catch (err) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// POST /api/pedidos/:id/cancelar  (el cliente dueño o el personal; solo si sigue pendiente)
router.post('/:id/cancelar', async (req, res) => {
    try {
        const pedido = await pedidoVisible(req, res);
        if (!pedido) return;
        const { rowCount } = await pool.query(
            `UPDATE pedidos SET estado = 'cancelado', actualizado_en = NOW()
             WHERE id = $1 AND estado = 'pendiente'`,
            [pedido.id]
        );
        if (!rowCount) return res.status(409).json({ error: 'Solo se pueden cancelar pedidos pendientes' });
        res.json(await cargarPedido(pool, pedido.id));
    } catch (err) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// POST /api/pedidos/:id/confirmar  (solo personal)
// Genera la venta con los precios del pedido y descuenta el stock. Si falta stock,
// el pedido sigue pendiente y se informa qué repuesto falla.
router.post('/:id/confirmar', soloRoles(...PERSONAL), async (req, res) => {
    const id = Number(req.params.id);
    const db = await pool.connect();
    try {
        await db.query('BEGIN');
        // Bloquea el pedido: dos personas no pueden confirmarlo a la vez
        const { rows } = await db.query(
            `SELECT p.id, p.estado, u.cliente_id
             FROM pedidos p JOIN usuarios u ON u.id = p.usuario_id
             WHERE p.id = $1 FOR UPDATE OF p`,
            [id]
        );
        if (!rows[0]) {
            await db.query('ROLLBACK');
            return res.status(404).json({ error: 'Pedido no encontrado' });
        }
        if (rows[0].estado !== 'pendiente') {
            await db.query('ROLLBACK');
            return res.status(409).json({ error: 'Solo se pueden confirmar pedidos pendientes' });
        }

        const { rows: items } = await db.query(
            'SELECT repuesto_id, cantidad, precio_unitario FROM detalle_pedido WHERE pedido_id = $1',
            [id]
        );
        const cantidades = new Map(items.map((i) => [i.repuesto_id, i.cantidad]));
        const precios = new Map(items.map((i) => [i.repuesto_id, i.precio_unitario]));

        const ventaId = await crearVenta(db, {
            usuarioId: req.usuario.id,
            clienteId: rows[0].cliente_id,
            cantidades,
            precios,
        });
        await db.query(
            `UPDATE pedidos SET estado = 'confirmado', venta_id = $1, actualizado_en = NOW() WHERE id = $2`,
            [ventaId, id]
        );
        await db.query('COMMIT');
        res.json(await cargarPedido(db, id)); // misma conexión: pedir otra al grupo puede bloquear
    } catch (err) {
        await db.query('ROLLBACK');
        if (err instanceof StockError) {
            return res.status(409).json({ error: err.message, problemas: err.problemas });
        }
        res.status(500).json({ error: 'Error del servidor' });
    } finally {
        db.release();
    }
});

// POST /api/pedidos/:id/entregar  (solo personal; solo pedidos confirmados)
router.post('/:id/entregar', soloRoles(...PERSONAL), async (req, res) => {
    try {
        const { rowCount } = await pool.query(
            `UPDATE pedidos SET estado = 'entregado', actualizado_en = NOW()
             WHERE id = $1 AND estado = 'confirmado'`,
            [Number(req.params.id)]
        );
        if (!rowCount) return res.status(409).json({ error: 'Solo se pueden entregar pedidos confirmados' });
        res.json(await cargarPedido(pool, Number(req.params.id)));
    } catch (err) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

module.exports = router;
