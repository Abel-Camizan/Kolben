const { describe, before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const { iniciar } = require('./helpers');

describe('Pedidos en línea', () => {
    let t, admin, vend, ana, beto, A, B;

    const stockDe = async (id) => (await t.pool.query('SELECT stock FROM repuestos WHERE id = $1', [id])).rows[0].stock;
    const fijarStock = (id, n) => t.pool.query('UPDATE repuestos SET stock = $1 WHERE id = $2', [n, id]);
    const pedir = (token, items, nota) => t.api('POST', '/pedidos', token, { items, nota });
    const nVentas = async () => (await t.pool.query('SELECT COUNT(*)::int n FROM ventas')).rows[0].n;

    before(async () => {
        t = await iniciar();
        await t.crearUsuario('Admin', 'admin', 'clave-admin', 'administrador');
        await t.crearUsuario('Vend', 'vend', 'clave-vend', 'vendedor');
        admin = await t.login('admin', 'clave-admin');
        vend = await t.login('vend', 'clave-vend');
        ana = (await t.api('POST', '/auth/registro', null, { nombre: 'Ana', usuario: 'ana', password: 'clave-ana', documento: '10000001' })).datos.token;
        beto = (await t.api('POST', '/auth/registro', null, { nombre: 'Beto', usuario: 'beto', password: 'clave-beto' })).datos.token;
        A = (await t.api('POST', '/repuestos', admin, { codigo: 'A', nombre: 'Filtro', precio: 10, stock: 10 })).datos.id;
        B = (await t.api('POST', '/repuestos', admin, { codigo: 'B', nombre: 'Bujía', precio: 5.5, stock: 3 })).datos.id;
    });
    after(() => t.cerrar());

    test('el cliente crea un pedido pendiente con precios congelados y SIN descontar stock', async () => {
        const r = await pedir(ana, [{ repuesto_id: A, cantidad: 2 }, { repuesto_id: B, cantidad: 1 }], 'recojo mañana');
        assert.equal(r.status, 201);
        assert.equal(r.datos.numero, 'P-000001');
        assert.equal(r.datos.estado, 'pendiente');
        assert.equal(r.datos.total, '25.50');
        assert.equal(r.datos.nota, 'recojo mañana');
        assert.equal(r.datos.items.length, 2);
        assert.equal(await stockDe(A), 10, 'el pedido no reserva ni descuenta stock');
        assert.equal(await stockDe(B), 3);
    });

    test('validaciones: sin items, cantidades inválidas, repuesto inexistente o de baja', async () => {
        assert.equal((await pedir(ana, [])).status, 400);
        assert.equal((await pedir(ana, [{ repuesto_id: A, cantidad: 0 }])).status, 400);
        assert.equal((await pedir(ana, [{ repuesto_id: A, cantidad: 1.5 }])).status, 400);
        assert.equal((await pedir(ana, [{ repuesto_id: 99999, cantidad: 1 }])).status, 409);
        const baja = (await t.api('POST', '/repuestos', admin, { codigo: 'Z', nombre: 'Baja', precio: 1, stock: 5 })).datos.id;
        await t.api('DELETE', `/repuestos/${baja}`, admin);
        assert.equal((await pedir(ana, [{ repuesto_id: baja, cantidad: 1 }])).status, 409);
    });

    test('no deja pedir más de lo que hay en stock (409 con el detalle)', async () => {
        const antes = (await t.pool.query('SELECT COUNT(*)::int n FROM pedidos')).rows[0].n;
        const r = await pedir(ana, [{ repuesto_id: B, cantidad: 99 }]);
        assert.equal(r.status, 409);
        assert.equal(r.datos.problemas[0].disponible, 3);
        assert.equal((await t.pool.query('SELECT COUNT(*)::int n FROM pedidos')).rows[0].n, antes);
    });

    test('la nota se recorta a 200 caracteres', async () => {
        const r = await pedir(ana, [{ repuesto_id: A, cantidad: 1 }], 'x'.repeat(500));
        assert.equal(r.status, 201);
        assert.equal(r.datos.nota.length, 200);
    });

    test('privacidad: cada cliente ve solo sus pedidos y el de otro responde 404', async () => {
        const rb = await pedir(beto, [{ repuesto_id: A, cantidad: 1 }]);
        const idBeto = rb.datos.id;
        const mios = (await t.api('GET', '/pedidos', beto)).datos;
        assert.deepEqual(mios.map((p) => p.id), [idBeto]);
        assert.equal((await t.api('GET', `/pedidos/${idBeto}`, ana)).status, 404);
        assert.equal((await t.api('POST', `/pedidos/${idBeto}/cancelar`, ana)).status, 404);
        assert.equal((await t.api('GET', `/pedidos/${idBeto}`, beto)).status, 200);
        assert.equal((await t.api('GET', `/pedidos/${idBeto}`, vend)).status, 200, 'el personal ve todos');
        assert.equal((await t.api('GET', '/pedidos', admin)).datos.length, 3, 'el personal ve los de todos los clientes');
    });

    test('el cliente no puede confirmar ni entregar', async () => {
        assert.equal((await t.api('POST', '/pedidos/1/confirmar', ana)).status, 403);
        assert.equal((await t.api('POST', '/pedidos/1/entregar', ana)).status, 403);
    });

    test('confirmar: genera la venta con el cliente, descuenta stock y pasa a confirmado', async () => {
        const ventasAntes = await nVentas();
        const r = await t.api('POST', '/pedidos/1/confirmar', vend);
        assert.equal(r.status, 200);
        assert.equal(r.datos.estado, 'confirmado');
        assert.ok(r.datos.venta_id);
        assert.equal(await stockDe(A), 8);
        assert.equal(await stockDe(B), 2);
        assert.equal(await nVentas(), ventasAntes + 1);
        const venta = (await t.api('GET', `/ventas/${r.datos.venta_id}`, vend)).datos;
        assert.equal(venta.total, '25.50');
        assert.equal(venta.cliente, 'Ana');
        assert.equal(venta.vendedor, 'Vend', 'la venta queda a nombre de quien confirmó');
    });

    test('no se puede confirmar dos veces ni cancelar un pedido ya confirmado', async () => {
        assert.equal((await t.api('POST', '/pedidos/1/confirmar', vend)).status, 409);
        assert.equal((await t.api('POST', '/pedidos/1/cancelar', ana)).status, 409);
        assert.equal(await stockDe(A), 8, 'segunda confirmación no descuenta de nuevo');
    });

    test('entregar: solo pedidos confirmados', async () => {
        const nuevo = (await pedir(ana, [{ repuesto_id: A, cantidad: 1 }])).datos.id;
        assert.equal((await t.api('POST', `/pedidos/${nuevo}/entregar`, vend)).status, 409, 'pendiente no se entrega');
        const r = await t.api('POST', '/pedidos/1/entregar', vend);
        assert.equal(r.status, 200);
        assert.equal(r.datos.estado, 'entregado');
        assert.equal((await t.api('POST', '/pedidos/1/entregar', vend)).status, 409);
    });

    test('cancelar: el dueño cancela un pendiente y no toca el stock', async () => {
        const id = (await pedir(ana, [{ repuesto_id: A, cantidad: 1 }])).datos.id;
        const stock = await stockDe(A);
        const r = await t.api('POST', `/pedidos/${id}/cancelar`, ana);
        assert.equal(r.status, 200);
        assert.equal(r.datos.estado, 'cancelado');
        assert.equal(await stockDe(A), stock);
        assert.equal((await t.api('POST', `/pedidos/${id}/confirmar`, vend)).status, 409, 'un cancelado no se confirma');
    });

    test('se respeta el precio del pedido aunque el precio del repuesto cambie después', async () => {
        const id = (await pedir(ana, [{ repuesto_id: A, cantidad: 2 }])).datos.id;
        await t.api('PATCH', `/repuestos/${A}`, admin, { precio: 99 });
        const r = await t.api('POST', `/pedidos/${id}/confirmar`, admin);
        assert.equal(r.status, 200);
        const venta = (await t.api('GET', `/ventas/${r.datos.venta_id}`, admin)).datos;
        assert.equal(venta.total, '20.00', 'el cliente paga lo que vio al pedir (2 × 10)');
        await t.api('PATCH', `/repuestos/${A}`, admin, { precio: 10 });
    });

    test('confirmar sin stock suficiente: 409, el pedido sigue pendiente y no se descuenta nada', async () => {
        await fijarStock(A, 10);
        await fijarStock(B, 5);
        const id = (await pedir(ana, [{ repuesto_id: A, cantidad: 3 }, { repuesto_id: B, cantidad: 4 }])).datos.id;
        await fijarStock(B, 1); // se vendió en el mostrador mientras tanto
        const ventasAntes = await nVentas();
        const r = await t.api('POST', `/pedidos/${id}/confirmar`, vend);
        assert.equal(r.status, 409);
        assert.equal(r.datos.problemas[0].nombre, 'Bujía');
        assert.equal(r.datos.problemas[0].disponible, 1);
        assert.equal((await t.api('GET', `/pedidos/${id}`, vend)).datos.estado, 'pendiente');
        assert.equal(await stockDe(A), 10, 'el repuesto con stock tampoco se descuenta');
        assert.equal(await stockDe(B), 1);
        assert.equal(await nVentas(), ventasAntes);
    });

    test('concurrencia: dos confirmaciones simultáneas del mismo pedido → una sola venta', async () => {
        await fijarStock(A, 10);
        const id = (await pedir(ana, [{ repuesto_id: A, cantidad: 4 }])).datos.id;
        const ventasAntes = await nVentas();
        const [r1, r2] = await Promise.all([
            t.api('POST', `/pedidos/${id}/confirmar`, vend),
            t.api('POST', `/pedidos/${id}/confirmar`, admin),
        ]);
        assert.deepEqual([r1.status, r2.status].sort(), [200, 409]);
        assert.equal(await stockDe(A), 6, 'el stock se descuenta una sola vez');
        assert.equal(await nVentas(), ventasAntes + 1);
    });

    test('concurrencia: confirmar un pedido mientras se vende lo mismo en el mostrador no deja stock negativo', async () => {
        await fijarStock(B, 1);
        const id = (await pedir(ana, [{ repuesto_id: B, cantidad: 1 }])).datos.id;
        const [c, v] = await Promise.all([
            t.api('POST', `/pedidos/${id}/confirmar`, vend),
            t.api('POST', '/ventas', admin, { items: [{ repuesto_id: B, cantidad: 1 }] }),
        ]);
        assert.equal([c.status, v.status].filter((s) => s === 409).length, 1, 'solo uno se queda con la última unidad');
        assert.equal(await stockDe(B), 0);
    });

    test('muchos pedidos simultáneos no bloquean el servidor', async () => {
        await fijarStock(A, 100);
        const resp = await Promise.all(
            Array.from({ length: 25 }, (_, i) => pedir(i % 2 ? ana : beto, [{ repuesto_id: A, cantidad: 1 }]))
        );
        assert.ok(resp.every((r) => r.status === 201));
        const confirmaciones = await Promise.all(
            resp.slice(0, 12).map((r) => t.api('POST', `/pedidos/${r.datos.id}/confirmar`, vend))
        );
        assert.ok(confirmaciones.every((r) => r.status === 200), 'ninguna confirmación debe fallar ni colgarse');
        assert.equal(await stockDe(A), 88);
    });

    test('filtro por estado y listado del personal', async () => {
        const pendientes = (await t.api('GET', '/pedidos?estado=pendiente', vend)).datos;
        assert.ok(pendientes.length > 0);
        assert.ok(pendientes.every((p) => p.estado === 'pendiente'));
        const entregados = (await t.api('GET', '/pedidos?estado=entregado', vend)).datos;
        assert.ok(entregados.every((p) => p.estado === 'entregado'));
        assert.ok(pendientes[0].cliente && 'cliente_telefono' in pendientes[0]);
    });

    test('integridad: ningún stock negativo y cada pedido confirmado tiene su venta', async () => {
        assert.equal((await t.pool.query('SELECT COUNT(*)::int n FROM repuestos WHERE stock < 0')).rows[0].n, 0);
        const huerfanos = await t.pool.query(
            "SELECT COUNT(*)::int n FROM pedidos WHERE estado IN ('confirmado','entregado') AND venta_id IS NULL"
        );
        assert.equal(huerfanos.rows[0].n, 0);
        const conVentaPendiente = await t.pool.query(
            "SELECT COUNT(*)::int n FROM pedidos WHERE estado IN ('pendiente','cancelado') AND venta_id IS NOT NULL"
        );
        assert.equal(conVentaPendiente.rows[0].n, 0);
    });
});
