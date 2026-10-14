const { describe, before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const { iniciar } = require('./helpers');

describe('Repuestos, marcas, categorías y catálogo público', () => {
    let t, admin, vendedor, marcaId, categoriaId, modelos;

    before(async () => {
        t = await iniciar();
        await t.crearUsuario('Admin', 'admin', 'clave-admin', 'administrador');
        await t.crearUsuario('Vend', 'vend', 'clave-vend', 'vendedor');
        admin = await t.login('admin', 'clave-admin');
        vendedor = await t.login('vend', 'clave-vend');
        modelos = (await t.api('GET', '/modelos', admin)).datos;
    });
    after(() => t.cerrar());

    const idModelo = (nombre) => modelos.find((m) => m.nombre === nombre).id;

    test('marcas y categorías: crear, listar y rechazar duplicados y vacíos', async () => {
        const m = await t.api('POST', '/marcas', admin, { nombre: 'TVS' });
        assert.equal(m.status, 201);
        marcaId = m.datos.id;
        const c = await t.api('POST', '/categorias', admin, { nombre: 'Frenos' });
        assert.equal(c.status, 201);
        categoriaId = c.datos.id;
        assert.equal((await t.api('POST', '/marcas', admin, { nombre: 'TVS' })).status, 409);
        assert.equal((await t.api('POST', '/marcas', admin, { nombre: '   ' })).status, 400);
        assert.equal((await t.api('GET', '/marcas', vendedor)).datos.length, 1, 'el vendedor puede listarlas');
    });

    test('crear repuesto con modelos compatibles', async () => {
        const r = await t.api('POST', '/repuestos', admin, {
            codigo: 'F-001', nombre: 'Pastilla de freno', marca_id: marcaId, categoria_id: categoriaId,
            precio: 25.5, stock: 10, stock_minimo: 3,
            modelos: [idModelo('TVS King Deluxe'), idModelo('TVS Duramax')],
        });
        assert.equal(r.status, 201);
        assert.equal(r.datos.precio, '25.50');
        assert.equal(r.datos.stock, 10);
        assert.deepEqual(r.datos.modelos.map((m) => m.nombre).sort(), ['TVS Duramax', 'TVS King Deluxe']);
    });

    test('validaciones al crear: código duplicado, precio negativo, stock negativo o decimal, sin datos', async () => {
        const ok = { codigo: 'X', nombre: 'X', precio: 1 };
        assert.equal((await t.api('POST', '/repuestos', admin, { ...ok, codigo: 'F-001' })).status, 409);
        assert.equal((await t.api('POST', '/repuestos', admin, { ...ok, precio: -1 })).status, 400);
        assert.equal((await t.api('POST', '/repuestos', admin, { ...ok, stock: -5 })).status, 400);
        assert.equal((await t.api('POST', '/repuestos', admin, { ...ok, stock: 2.5 })).status, 400);
        assert.equal((await t.api('POST', '/repuestos', admin, { codigo: 'Y' })).status, 400);
        assert.equal((await t.api('POST', '/repuestos', admin, { ...ok, marca_id: 9999 })).status, 400, 'marca inexistente');
        assert.equal((await t.api('POST', '/repuestos', admin, { ...ok, modelos: [9999] })).status, 400, 'modelo inexistente');
        const n = (await t.pool.query('SELECT COUNT(*)::int n FROM repuestos')).rows[0].n;
        assert.equal(n, 1, 'los intentos fallidos no deben dejar repuestos a medias');
    });

    test('búsqueda por texto, código, modelo, marca y categoría', async () => {
        await t.api('POST', '/repuestos', admin, {
            codigo: 'B-002', nombre: 'Bujía', precio: 8, stock: 4, modelos: [idModelo('Bajaj Torito')],
        });
        const q = async (qs) => (await t.api('GET', `/repuestos${qs}`, vendedor)).datos.map((r) => r.codigo).sort();
        assert.deepEqual(await q(''), ['B-002', 'F-001']);
        assert.deepEqual(await q('?q=pastilla'), ['F-001']);
        assert.deepEqual(await q('?q=PASTILLA'), ['F-001'], 'sin distinguir mayúsculas');
        assert.deepEqual(await q('?q=b-00'), ['B-002'], 'por código parcial');
        assert.deepEqual(await q(`?modelo_id=${idModelo('Bajaj Torito')}`), ['B-002']);
        assert.deepEqual(await q(`?modelo_id=${idModelo('TVS Duramax')}`), ['F-001']);
        assert.deepEqual(await q(`?marca_id=${marcaId}`), ['F-001']);
        assert.deepEqual(await q(`?categoria_id=${categoriaId}`), ['F-001']);
        assert.deepEqual(await q('?q=zzz'), []);
    });

    test('la búsqueda por modelo no recorta la lista de modelos compatibles del repuesto', async () => {
        const r = await t.api('GET', `/repuestos?modelo_id=${idModelo('TVS Duramax')}`, vendedor);
        assert.equal(r.datos[0].modelos.length, 2);
    });

    test('inyección SQL en la búsqueda no hace daño', async () => {
        const mal = encodeURIComponent("'; DROP TABLE repuestos; --");
        const r = await t.api('GET', `/repuestos?q=${mal}`, vendedor);
        assert.equal(r.status, 200);
        assert.deepEqual(r.datos, []);
        const c = await t.api('GET', `/catalogo?q=${mal}`);
        assert.equal(c.status, 200);
        assert.equal((await t.pool.query('SELECT COUNT(*)::int n FROM repuestos')).rows[0].n, 2);
    });

    test('editar: precio, nombre y modelos; los datos que no se envían no cambian', async () => {
        const id = (await t.api('GET', '/repuestos?q=F-001', admin)).datos[0].id;
        const r = await t.api('PATCH', `/repuestos/${id}`, admin, { precio: 30, modelos: [idModelo('Bajaj Torito')] });
        assert.equal(r.status, 200);
        assert.equal(r.datos.precio, '30.00');
        assert.equal(r.datos.nombre, 'Pastilla de freno');
        assert.equal(r.datos.stock, 10);
        assert.deepEqual(r.datos.modelos.map((m) => m.nombre), ['Bajaj Torito']);
        assert.equal((await t.api('PATCH', `/repuestos/${id}`, admin, { precio: -3 })).status, 400);
        assert.equal((await t.api('PATCH', '/repuestos/99999', admin, { precio: 3 })).status, 404);
        assert.equal((await t.api('PATCH', `/repuestos/${id}`, vendedor, { precio: 3 })).status, 403);
    });

    test('alerta de stock mínimo lista solo los que están en el mínimo o por debajo', async () => {
        await t.api('POST', '/repuestos', admin, { codigo: 'L-003', nombre: 'Llanta', precio: 90, stock: 2, stock_minimo: 2 });
        const r = await t.api('GET', '/repuestos/alertas/stock-minimo', vendedor);
        assert.deepEqual(r.datos.map((x) => x.codigo), ['L-003']);
    });

    test('baja lógica: desaparece para vendedor y catálogo público; el administrador la ve y la reactiva', async () => {
        const id = (await t.api('GET', '/repuestos?q=L-003', admin)).datos[0].id;
        assert.equal((await t.api('DELETE', `/repuestos/${id}`, vendedor)).status, 403);
        assert.equal((await t.api('DELETE', `/repuestos/${id}`, admin)).status, 204);
        assert.equal((await t.api('DELETE', '/repuestos/99999', admin)).status, 404);

        assert.equal((await t.api('GET', '/repuestos?q=L-003', vendedor)).datos.length, 0);
        assert.equal((await t.api('GET', '/catalogo?q=L-003')).datos.length, 0);
        assert.equal((await t.api('GET', '/repuestos?q=L-003&todos=1', admin)).datos.length, 1);
        assert.equal((await t.api('GET', '/repuestos?q=L-003&todos=1', vendedor)).datos.length, 0, 'todos=1 es solo del administrador');
        assert.equal((await t.api('GET', '/repuestos/alertas/stock-minimo', vendedor)).datos.length, 0, 'de baja no genera alerta');

        const r = await t.api('PATCH', `/repuestos/${id}`, admin, { activo: true });
        assert.equal(r.datos.activo, true);
        assert.equal((await t.api('GET', '/catalogo?q=L-003')).datos.length, 1);
    });

    test('catálogo público: no expone stock mínimo ni datos internos', async () => {
        const r = await t.api('GET', '/catalogo');
        assert.ok(r.datos.length >= 2);
        for (const item of r.datos) {
            assert.equal(item.stock_minimo, undefined);
            assert.equal(item.activo, undefined);
            assert.ok(item.precio && item.nombre && 'stock' in item);
        }
        const torito = await t.api('GET', `/catalogo?modelo_id=${idModelo('Bajaj Torito')}`);
        assert.ok(torito.datos.every((x) => x.modelos.some((m) => m.nombre === 'Bajaj Torito')));
    });

    test('el detalle de un repuesto inexistente da 404', async () => {
        assert.equal((await t.api('GET', '/repuestos/99999', vendedor)).status, 404);
    });
});
