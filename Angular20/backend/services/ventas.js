// Lógica común para registrar una venta. La usan POST /api/ventas (mostrador)
// y la confirmación de pedidos en línea, así las dos descuentan el stock igual.

class StockError extends Error {
    constructor(problemas) {
        super('No se puede completar la venta');
        this.problemas = problemas;
    }
}

// Junta líneas repetidas del mismo repuesto y valida cantidades.
// Devuelve un Map(repuesto_id -> cantidad) o null si algo es inválido.
function agruparItems(items) {
    if (!Array.isArray(items) || items.length === 0) return null;
    const pedido = new Map();
    for (const it of items) {
        const id = Number(it.repuesto_id);
        const cantidad = Number(it.cantidad);
        if (!Number.isInteger(id) || !Number.isInteger(cantidad) || cantidad <= 0) return null;
        pedido.set(id, (pedido.get(id) || 0) + cantidad);
    }
    return pedido;
}

// Registra la venta dentro de una transacción ya abierta por quien llama (BEGIN/COMMIT).
//   db: cliente de pg con la transacción abierta
//   cantidades: Map(repuesto_id -> cantidad)
//   precios: Map(repuesto_id -> precio) opcional; si falta, se usa el precio actual
// Lanza StockError si algún repuesto no existe, está de baja o no tiene stock.
async function crearVenta(db, { usuarioId, clienteId = null, cantidades, precios = null }) {
    // Bloquea los repuestos en orden de id: dos ventas simultáneas no pueden
    // dejar el stock en negativo ni bloquearse entre sí
    const ids = [...cantidades.keys()].sort((a, b) => a - b);
    const { rows: repuestos } = await db.query(
        `SELECT id, codigo, nombre, precio, stock, activo
         FROM repuestos WHERE id = ANY($1) ORDER BY id FOR UPDATE`,
        [ids]
    );
    const porId = new Map(repuestos.map((r) => [r.id, r]));

    const problemas = [];
    for (const [id, cantidad] of cantidades) {
        const r = porId.get(id);
        if (!r || !r.activo) {
            problemas.push({ repuesto_id: id, motivo: 'Repuesto no disponible' });
        } else if (r.stock < cantidad) {
            problemas.push({
                repuesto_id: id, codigo: r.codigo, nombre: r.nombre,
                motivo: 'Stock insuficiente', solicitado: cantidad, disponible: r.stock,
            });
        }
    }
    if (problemas.length) throw new StockError(problemas);

    const precioDe = (id) => (precios && precios.get(id)) ?? porId.get(id).precio;

    let totalCentimos = 0;
    for (const [id, cantidad] of cantidades) {
        totalCentimos += Math.round(Number(precioDe(id)) * 100) * cantidad;
    }

    const { rows: venta } = await db.query(
        `INSERT INTO ventas (cliente_id, usuario_id, total)
         VALUES ($1, $2, $3) RETURNING id`,
        [clienteId, usuarioId, totalCentimos / 100]
    );
    const ventaId = venta[0].id;
    await db.query(
        `UPDATE ventas SET numero = 'V-' || LPAD(id::text, 6, '0') WHERE id = $1`,
        [ventaId]
    );

    for (const [id, cantidad] of cantidades) {
        await db.query(
            `INSERT INTO detalle_venta (venta_id, repuesto_id, cantidad, precio_unitario)
             VALUES ($1, $2, $3, $4)`,
            [ventaId, id, cantidad, precioDe(id)]
        );
        await db.query('UPDATE repuestos SET stock = stock - $1 WHERE id = $2', [cantidad, id]);
    }
    return ventaId;
}

module.exports = { StockError, agruparItems, crearVenta };
