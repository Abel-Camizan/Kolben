const { describe, before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const { iniciar } = require('./helpers');

describe('Ventas de mostrador', () => {
    let t, admin, v1, v2, A, B, clienteId;

    const stockDe = async (id) => (await t.pool.query('SELECT stock FROM repuestos WHERE id = $1', [id])).rows[0].stock;
    const ventas = async () => (await t.pool.query('SELECT COUNT(*)::int n FROM ventas')).rows[0].n;
    const reponer = (id, n) => t.pool.query('UPDATE repuestos SET stock = $1 WHERE id = $2', [n, id]);

    before(async () => {
        t = await iniciar();
        await t.crearUsuario('Admin', 'admin', 'clave-admin', 'administrador');
        await t.crearUsuario('Vend Uno', 'v1', 'clave-v1', 'vendedor');
        await t.crearUsuario('Vend Dos', 'v2', 'clave-v2', 'vendedor');
        admin = await t.login('admin', 'clave-admin');
        v1 = await t.login('v1', 'clave-v1');
        v2 = await t.login('v2', 'clave-v2');
        A = (await t.api('POST', '/repuestos', admin, { codigo: 'A', nombre: 'Filtro', precio: 12.3, stock: 20 })).datos.id;
        B = (await t.api('POST', '/repuestos', admin, { codigo: 'B', nombre: 'Bujía', precio: 8.75, stock: 1 })).datos.id;
        clienteId = (await t.api('POST', '/clientes', admin, { nombre: 'Cliente Frecuente', documento: '11112222' })).datos.id;
    });
    after(() => t.cerrar());

    test('venta correcta: total exacto, stock descontado y comprobante V-000001', async () => {
        const r = await t.api('POST', '/ventas', v1, { items: [{ repuesto_id: A, cantidad: 3 }, { repuesto_id: B, cantidad: 1 }] });
        assert.equal(r.status, 201);
        assert.equal(r.datos.numero, 'V-000001');
        assert.equal(r.datos.total, '45.65'); // 3 × 12.30 + 8.75
        assert.equal(r.datos.vendedor, 'Vend Uno');
        assert.equal(r.datos.items.length, 2);
        assert.equal(await stockDe(A), 17);
        assert.equal(await stockDe(B), 0);
    });

    test('el total no sufre errores de decimales (0.1 + 0.2)', async () => {
        const id = (await t.api('POST', '/repuestos', admin, { codigo: 'C', nombre: 'Tornillo', precio: 0.1, stock: 10 })).datos.id;
        const id2 = (await t.api('POST', '/repuestos', admin, { codigo: 'D', nombre: 'Tuerca', precio: 0.2, stock: 10 })).datos.id;
        const r = await t.api('POST', '/ventas', v1, { items: [{ repuesto_id: id, cantidad: 3 }, { repuesto_id: id2, cantidad: 3 }] });
        assert.equal(r.datos.total, '0.90');
    });

    test('líneas repetidas del mismo repuesto se suman en una sola', async () => {
        const antes = await stockDe(A);
        const r = await t.api('POST', '/ventas', v1, { items: [{ repuesto_id: A, cantidad: 2 }, { repuesto_id: A, cantidad: 1 }] });
        assert.equal(r.status, 201);
        assert.equal(r.datos.items.length, 1);
        assert.equal(r.datos.items[0].cantidad, 3);
        assert.equal(await stockDe(A), antes - 3);
    });

    test('el precio lo pone el servidor: un precio enviado por el cliente se ignora', async () => {
        const r = await t.api('POST', '/ventas', v1, { items: [{ repuesto_id: A, cantidad: 1, precio_unitario: 0.01, precio: 0.01 }] });
        assert.equal(r.datos.items[0].precio_unitario, '12.30');
        assert.equal(r.datos.total, '12.30');
    });

    test('sin stock suficiente: 409 con detalle y NO se descuenta ni se registra nada', async () => {
        const stockA = await stockDe(A);
        const antes = await ventas();
        const r = await t.api('POST', '/ventas', v1, { items: [{ repuesto_id: A, cantidad: 1 }, { repuesto_id: B, cantidad: 1 }] });
        assert.equal(r.status, 409);
        assert.equal(r.datos.problemas[0].disponible, 0);
        assert.equal(r.datos.problemas[0].solicitado, 1);
        assert.equal(await stockDe(A), stockA, 'la línea válida tampoco se descuenta');
        assert.equal(await ventas(), antes);
    });

    test('validaciones: cantidad 0, negativa, decimal, texto, sin items, items vacío, repuesto inexistente', async () => {
        const casos = [
            [{ items: [{ repuesto_id: A, cantidad: 0 }] }, 400],
            [{ items: [{ repuesto_id: A, cantidad: -2 }] }, 400],
            [{ items: [{ repuesto_id: A, cantidad: 1.5 }] }, 400],
            [{ items: [{ repuesto_id: A, cantidad: 'mucho' }] }, 400],
            [{ items: [{ cantidad: 1 }] }, 400],
            [{ items: [] }, 400],
            [{}, 400],
            [{ items: [{ repuesto_id: 99999, cantidad: 1 }] }, 409],
        ];
        const stock = await stockDe(A);
        for (const [cuerpo, esperado] of casos) {
            assert.equal((await t.api('POST', '/ventas', v1, cuerpo)).status, esperado, JSON.stringify(cuerpo));
        }
        assert.equal(await stockDe(A), stock);
    });

    test('un repuesto dado de baja no se puede vender', async () => {
        const id = (await t.api('POST', '/repuestos', admin, { codigo: 'E', nombre: 'Baja', precio: 5, stock: 5 })).datos.id;
        await t.api('DELETE', `/repuestos/${id}`, admin);
        const r = await t.api('POST', '/ventas', v1, { items: [{ repuesto_id: id, cantidad: 1 }] });
        assert.equal(r.status, 409);
        assert.equal(await stockDe(id), 5);
    });

    test('cliente inexistente: 400, sin venta y con el stock intacto', async () => {
        const stock = await stockDe(A);
        const antes = await ventas();
        const r = await t.api('POST', '/ventas', v1, { cliente_id: 99999, items: [{ repuesto_id: A, cantidad: 1 }] });
        assert.equal(r.status, 400);
        assert.equal(await stockDe(A), stock);
        assert.equal(await ventas(), antes);
    });

    test('venta asociada a un cliente: aparece en el comprobante y en su historial', async () => {
        const r = await t.api('POST', '/ventas', v1, { cliente_id: clienteId, items: [{ repuesto_id: A, cantidad: 2 }] });
        assert.equal(r.status, 201);
        assert.equal(r.datos.cliente, 'Cliente Frecuente');
        assert.equal(r.datos.cliente_documento, '11112222');
        const h = await t.api('GET', `/clientes/${clienteId}`, v1);
        assert.equal(h.datos.resumen.compras, 1);
        assert.equal(h.datos.resumen.total, '24.60');
    });

    test('concurrencia: 2 vendedores piden la última unidad al mismo tiempo, solo uno la consigue', async () => {
        await reponer(B, 1);
        const [r1, r2] = await Promise.all([
            t.api('POST', '/ventas', v1, { items: [{ repuesto_id: B, cantidad: 1 }] }),
            t.api('POST', '/ventas', v2, { items: [{ repuesto_id: B, cantidad: 1 }] }),
        ]);
        assert.deepEqual([r1.status, r2.status].sort(), [201, 409]);
        assert.equal(await stockDe(B), 0);
    });

    test('concurrencia: 15 ventas simultáneas con stock 6 → exactamente 6 se concretan y el stock queda en 0', async () => {
        await reponer(A, 6);
        const resp = await Promise.all(
            Array.from({ length: 15 }, (_, i) =>
                t.api('POST', '/ventas', i % 2 ? v1 : v2, { items: [{ repuesto_id: A, cantidad: 1 }] })
            )
        );
        assert.equal(resp.filter((r) => r.status === 201).length, 6);
        assert.equal(resp.filter((r) => r.status === 409).length, 9);
        assert.equal(await stockDe(A), 0);
    });

    test('concurrencia sin interbloqueo: ventas cruzadas con los mismos repuestos en distinto orden', async () => {
        await reponer(A, 50);
        await reponer(B, 50);
        const resp = await Promise.all(
            Array.from({ length: 10 }, (_, i) =>
                t.api('POST', '/ventas', v1, {
                    items: i % 2
                        ? [{ repuesto_id: A, cantidad: 1 }, { repuesto_id: B, cantidad: 1 }]
                        : [{ repuesto_id: B, cantidad: 1 }, { repuesto_id: A, cantidad: 1 }],
                })
            )
        );
        assert.ok(resp.every((r) => r.status === 201), 'ninguna debe fallar por interbloqueo');
        assert.equal(await stockDe(A), 40);
        assert.equal(await stockDe(B), 40);
    });

    test('los números de comprobante son consecutivos y únicos', async () => {
        const { rows } = await t.pool.query('SELECT numero FROM ventas ORDER BY id');
        assert.equal(new Set(rows.map((r) => r.numero)).size, rows.length);
        rows.forEach((r, i) => assert.equal(r.numero, 'V-' + String(i + 1).padStart(6, '0')));
    });

    test('listado: el vendedor ve solo sus ventas; el administrador, todas', async () => {
        const todas = (await t.api('GET', '/ventas', admin)).datos;
        const de1 = (await t.api('GET', '/ventas', v1)).datos;
        const de2 = (await t.api('GET', '/ventas', v2)).datos;
        assert.equal(de1.length + de2.length, todas.length);
        assert.ok(de1.every((v) => v.vendedor === 'Vend Uno'));
        assert.ok(de2.every((v) => v.vendedor === 'Vend Dos'));
    });

    test('comprobante: dueño y administrador lo ven; otro vendedor, 403; inexistente, 404', async () => {
        const id = (await t.api('GET', '/ventas', v1)).datos[0].id;
        assert.equal((await t.api('GET', `/ventas/${id}`, v1)).status, 200);
        assert.equal((await t.api('GET', `/ventas/${id}`, admin)).status, 200);
        assert.equal((await t.api('GET', `/ventas/${id}`, v2)).status, 403);
        assert.equal((await t.api('GET', '/ventas/999999', admin)).status, 404);
    });

    test('filtros por fecha: hoy incluye, un rango pasado no; fecha inválida da 400', async () => {
        const hoy = new Date().toISOString().slice(0, 10);
        assert.ok((await t.api('GET', `/ventas?desde=${hoy}&hasta=${hoy}`, admin)).datos.length > 0);
        assert.equal((await t.api('GET', '/ventas?desde=2000-01-01&hasta=2000-01-02', admin)).datos.length, 0);
        assert.equal((await t.api('GET', '/ventas?desde=abc', admin)).status, 400);
    });

    test('integridad: la suma de detalles coincide con el total y el stock no baja de 0', async () => {
        const { rows } = await t.pool.query(
            `SELECT v.id FROM ventas v
             WHERE v.total <> (SELECT COALESCE(SUM(cantidad * precio_unitario), 0) FROM detalle_venta WHERE venta_id = v.id)`
        );
        assert.equal(rows.length, 0);
        const neg = await t.pool.query('SELECT COUNT(*)::int n FROM repuestos WHERE stock < 0');
        assert.equal(neg.rows[0].n, 0);
    });
});
