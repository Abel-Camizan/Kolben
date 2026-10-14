const { describe, before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const { iniciar } = require('./helpers');

describe('Proveedores e ingresos de mercadería', () => {
    let t, admin, vend, A, B, prov;

    const stockDe = async (id) => (await t.pool.query('SELECT stock FROM repuestos WHERE id = $1', [id])).rows[0].stock;
    const nIngresos = async () => (await t.pool.query('SELECT COUNT(*)::int n FROM ingresos')).rows[0].n;

    before(async () => {
        t = await iniciar();
        await t.crearUsuario('Admin', 'admin', 'clave-admin', 'administrador');
        await t.crearUsuario('Vend', 'vend', 'clave-vend', 'vendedor');
        admin = await t.login('admin', 'clave-admin');
        vend = await t.login('vend', 'clave-vend');
        A = (await t.api('POST', '/repuestos', admin, { codigo: 'A', nombre: 'Filtro', precio: 10, stock: 5 })).datos.id;
        B = (await t.api('POST', '/repuestos', admin, { codigo: 'B', nombre: 'Bujía', precio: 5, stock: 0 })).datos.id;
    });
    after(() => t.cerrar());

    describe('proveedores', () => {
        test('crear con todos los datos y solo con el nombre', async () => {
            const r = await t.api('POST', '/proveedores', admin, {
                nombre: 'Motopartes SAC', ruc: '20123456789', telefono: '054-123456', direccion: 'Av. Principal 123',
            });
            assert.equal(r.status, 201);
            prov = r.datos.id;
            const s = await t.api('POST', '/proveedores', admin, { nombre: 'Solo nombre' });
            assert.equal(s.status, 201);
            assert.equal(s.datos.ruc, null);
        });

        test('validaciones: sin nombre, RUC mal formado, RUC duplicado', async () => {
            assert.equal((await t.api('POST', '/proveedores', admin, { nombre: '  ' })).status, 400);
            assert.equal((await t.api('POST', '/proveedores', admin, { nombre: 'X', ruc: '123' })).status, 400);
            assert.equal((await t.api('POST', '/proveedores', admin, { nombre: 'X', ruc: 'abcdefghijk' })).status, 400);
            assert.equal((await t.api('POST', '/proveedores', admin, { nombre: 'Copia', ruc: '20123456789' })).status, 409);
        });

        test('varios proveedores sin RUC no chocan entre sí', async () => {
            assert.equal((await t.api('POST', '/proveedores', admin, { nombre: 'Sin RUC 1' })).status, 201);
            assert.equal((await t.api('POST', '/proveedores', admin, { nombre: 'Sin RUC 2' })).status, 201);
        });

        test('editar: cambia solo lo enviado y permite vaciar datos opcionales', async () => {
            const r = await t.api('PATCH', `/proveedores/${prov}`, admin, { telefono: '' });
            assert.equal(r.status, 200);
            assert.equal(r.datos.telefono, null, 'se vacía con cadena vacía');
            assert.equal(r.datos.nombre, 'Motopartes SAC', 'lo demás no cambia');
            assert.equal(r.datos.ruc, '20123456789');
            assert.equal((await t.api('PATCH', `/proveedores/${prov}`, admin, { nombre: '' })).status, 400);
            assert.equal((await t.api('PATCH', '/proveedores/99999', admin, { nombre: 'X' })).status, 404);
        });

        test('baja: no aparece en la lista normal pero sí con todos=1; se puede reactivar', async () => {
            const id = (await t.api('POST', '/proveedores', admin, { nombre: 'Para baja' })).datos.id;
            await t.api('PATCH', `/proveedores/${id}`, admin, { activo: false });
            assert.ok(!(await t.api('GET', '/proveedores', admin)).datos.some((p) => p.id === id));
            assert.ok((await t.api('GET', '/proveedores?todos=1', admin)).datos.some((p) => p.id === id));
            const r = await t.api('PATCH', `/proveedores/${id}`, admin, { activo: true });
            assert.equal(r.datos.activo, true);
        });
    });

    describe('ingresos de mercadería', () => {
        test('registrar un ingreso SUMA al stock existente', async () => {
            const r = await t.api('POST', '/ingresos', admin, {
                proveedor_id: prov, observacion: 'Factura 001',
                items: [{ repuesto_id: A, cantidad: 10, costo_unit: 6.5 }, { repuesto_id: B, cantidad: 20, costo_unit: 2.25 }],
            });
            assert.equal(r.status, 201);
            assert.equal(r.datos.total, '110.00'); // 10 × 6.50 + 20 × 2.25
            assert.equal(r.datos.proveedor, 'Motopartes SAC');
            assert.equal(r.datos.registrado_por, 'Admin');
            assert.equal(await stockDe(A), 15, '5 + 10');
            assert.equal(await stockDe(B), 20);
        });

        test('líneas repetidas del mismo repuesto se juntan', async () => {
            const r = await t.api('POST', '/ingresos', admin, {
                proveedor_id: prov, items: [{ repuesto_id: A, cantidad: 3, costo_unit: 6 }, { repuesto_id: A, cantidad: 2, costo_unit: 7 }],
            });
            assert.equal(r.status, 201);
            assert.equal(r.datos.items.length, 1);
            assert.equal(r.datos.items[0].cantidad, 5);
            assert.equal(await stockDe(A), 20);
        });

        test('validaciones: sin proveedor, sin items, cantidad 0, negativa, decimal, costo negativo', async () => {
            const linea = { repuesto_id: A, cantidad: 1, costo_unit: 1 };
            const stock = await stockDe(A);
            const antes = await nIngresos();
            const casos = [
                [{ items: [linea] }, 400],
                [{ proveedor_id: prov, items: [] }, 400],
                [{ proveedor_id: prov }, 400],
                [{ proveedor_id: prov, items: [{ ...linea, cantidad: 0 }] }, 400],
                [{ proveedor_id: prov, items: [{ ...linea, cantidad: -5 }] }, 400],
                [{ proveedor_id: prov, items: [{ ...linea, cantidad: 1.5 }] }, 400],
                [{ proveedor_id: prov, items: [{ ...linea, costo_unit: -1 }] }, 400],
                [{ proveedor_id: prov, items: [{ ...linea, costo_unit: 'gratis' }] }, 400],
            ];
            for (const [cuerpo, esperado] of casos) {
                assert.equal((await t.api('POST', '/ingresos', admin, cuerpo)).status, esperado, JSON.stringify(cuerpo));
            }
            assert.equal(await stockDe(A), stock);
            assert.equal(await nIngresos(), antes);
        });

        test('proveedor inexistente o dado de baja: 400 y el stock no cambia', async () => {
            const baja = (await t.api('POST', '/proveedores', admin, { nombre: 'Cerrado' })).datos.id;
            await t.api('PATCH', `/proveedores/${baja}`, admin, { activo: false });
            const stock = await stockDe(A);
            const linea = { repuesto_id: A, cantidad: 5, costo_unit: 1 };
            assert.equal((await t.api('POST', '/ingresos', admin, { proveedor_id: baja, items: [linea] })).status, 400);
            assert.equal((await t.api('POST', '/ingresos', admin, { proveedor_id: 99999, items: [linea] })).status, 400);
            assert.equal(await stockDe(A), stock);
        });

        test('un repuesto inexistente deshace TODO el ingreso (nada a medias)', async () => {
            const stock = await stockDe(A);
            const antes = await nIngresos();
            const r = await t.api('POST', '/ingresos', admin, {
                proveedor_id: prov,
                items: [{ repuesto_id: A, cantidad: 7, costo_unit: 1 }, { repuesto_id: 99999, cantidad: 1, costo_unit: 1 }],
            });
            assert.equal(r.status, 400);
            assert.equal(await stockDe(A), stock, 'la línea válida tampoco suma');
            assert.equal(await nIngresos(), antes);
        });

        test('historial: lista con totales, filtra por proveedor y muestra el detalle', async () => {
            const todos = (await t.api('GET', '/ingresos', admin)).datos;
            assert.equal(todos.length, 2);
            const otro = (await t.api('POST', '/proveedores', admin, { nombre: 'Otro' })).datos.id;
            assert.equal((await t.api('GET', `/ingresos?proveedor_id=${otro}`, admin)).datos.length, 0);
            assert.equal((await t.api('GET', `/ingresos?proveedor_id=${prov}`, admin)).datos.length, 2);
            const det = await t.api('GET', `/ingresos/${todos[todos.length - 1].id}`, admin);
            assert.equal(det.datos.items.length, 2);
            assert.equal(det.datos.observacion, 'Factura 001');
            assert.equal((await t.api('GET', '/ingresos/99999', admin)).status, 404);
            assert.equal((await t.api('GET', '/ingresos?desde=hoy', admin)).status, 400);
        });

        test('concurrencia: ventas e ingresos a la vez dan el stock exacto', async () => {
            await t.pool.query('UPDATE repuestos SET stock = 10 WHERE id = $1', [A]);
            const ventas = Array.from({ length: 5 }, () =>
                t.api('POST', '/ventas', vend, { items: [{ repuesto_id: A, cantidad: 1 }] })
            );
            const ingresos = Array.from({ length: 5 }, () =>
                t.api('POST', '/ingresos', admin, { proveedor_id: prov, items: [{ repuesto_id: A, cantidad: 2, costo_unit: 1 }] })
            );
            const resp = await Promise.all([...ventas, ...ingresos]);
            assert.ok(resp.every((r) => [200, 201].includes(r.status)), JSON.stringify(resp.map((r) => r.status)));
            assert.equal(await stockDe(A), 10 - 5 + 10, 'no se pierde ninguna actualización');
        });
    });
});
