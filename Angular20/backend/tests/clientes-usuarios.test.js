const { describe, before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const { iniciar } = require('./helpers');

describe('Clientes y gestión de usuarios', () => {
    let t, admin, vend, adminId;

    before(async () => {
        t = await iniciar();
        adminId = await t.crearUsuario('Admin', 'admin', 'clave-admin', 'administrador');
        await t.crearUsuario('Vend', 'vend', 'clave-vend', 'vendedor');
        admin = await t.login('admin', 'clave-admin');
        vend = await t.login('vend', 'clave-vend');
    });
    after(() => t.cerrar());

    describe('clientes', () => {
        let id;

        test('el vendedor registra un cliente', async () => {
            const r = await t.api('POST', '/clientes', vend, { nombre: 'Luis Quispe', documento: '44556677', telefono: '951000111' });
            assert.equal(r.status, 201);
            assert.equal(r.datos.activo, true);
            id = r.datos.id;
        });

        test('validaciones: sin nombre, documento mal formado y duplicado', async () => {
            assert.equal((await t.api('POST', '/clientes', vend, {})).status, 400);
            assert.equal((await t.api('POST', '/clientes', vend, { nombre: 'X', documento: '12' })).status, 400);
            assert.equal((await t.api('POST', '/clientes', vend, { nombre: 'Copia', documento: '44556677' })).status, 409);
        });

        test('clientes sin documento pueden ser varios', async () => {
            assert.equal((await t.api('POST', '/clientes', vend, { nombre: 'Anónimo 1' })).status, 201);
            assert.equal((await t.api('POST', '/clientes', vend, { nombre: 'Anónimo 2' })).status, 201);
        });

        test('búsqueda por nombre, documento y teléfono', async () => {
            const q = async (s) => (await t.api('GET', `/clientes?q=${s}`, vend)).datos.map((c) => c.nombre);
            assert.deepEqual(await q('quispe'), ['Luis Quispe']);
            assert.deepEqual(await q('4455'), ['Luis Quispe']);
            assert.deepEqual(await q('951000'), ['Luis Quispe']);
            assert.deepEqual(await q('nadie'), []);
        });

        test('editar: cambia lo enviado y permite vaciar un dato opcional', async () => {
            const r = await t.api('PATCH', `/clientes/${id}`, vend, { telefono: '', direccion: 'Calle 1' });
            assert.equal(r.status, 200);
            assert.equal(r.datos.telefono, null);
            assert.equal(r.datos.direccion, 'Calle 1');
            assert.equal(r.datos.nombre, 'Luis Quispe');
            assert.equal((await t.api('PATCH', '/clientes/99999', vend, { nombre: 'X' })).status, 404);
        });

        test('la baja es solo del administrador y el cliente de baja no sale en la búsqueda del vendedor', async () => {
            assert.equal((await t.api('PATCH', `/clientes/${id}`, vend, { activo: false })).status, 403);
            assert.equal((await t.api('PATCH', `/clientes/${id}`, admin, { activo: false })).status, 200);
            assert.equal((await t.api('GET', '/clientes?q=quispe', vend)).datos.length, 0);
            assert.equal((await t.api('GET', '/clientes?q=quispe&todos=1', admin)).datos.length, 1);
            assert.equal((await t.api('GET', '/clientes?q=quispe&todos=1', vend)).datos.length, 0, 'todos=1 es solo del administrador');
        });

        test('no se puede vender a un cliente dado de baja', async () => {
            const rep = (await t.api('POST', '/repuestos', admin, { codigo: 'A', nombre: 'Filtro', precio: 10, stock: 5 })).datos.id;
            const r = await t.api('POST', '/ventas', vend, { cliente_id: id, items: [{ repuesto_id: rep, cantidad: 1 }] });
            assert.equal(r.status, 400);
            await t.api('PATCH', `/clientes/${id}`, admin, { activo: true });
            const ok = await t.api('POST', '/ventas', vend, { cliente_id: id, items: [{ repuesto_id: rep, cantidad: 2 }] });
            assert.equal(ok.status, 201);
        });

        test('ficha con resumen e historial de compras', async () => {
            const r = await t.api('GET', `/clientes/${id}`, vend);
            assert.equal(r.datos.resumen.compras, 1);
            assert.equal(r.datos.resumen.total, '20.00');
            assert.equal(r.datos.historial.length, 1);
            assert.equal(r.datos.historial[0].vendedor, 'Vend');
            const vacio = (await t.api('GET', '/clientes?q=Anónimo 1', vend)).datos[0].id;
            const f = await t.api('GET', `/clientes/${vacio}`, vend);
            assert.equal(f.datos.resumen.compras, 0);
            assert.equal(f.datos.resumen.total, '0');
            assert.deepEqual(f.datos.historial, []);
            assert.equal((await t.api('GET', '/clientes/99999', vend)).status, 404);
        });
    });

    describe('usuarios (administrador)', () => {
        let vId;

        test('crear vendedor y administrador; el nuevo usuario puede iniciar sesión', async () => {
            const r = await t.api('POST', '/usuarios', admin, { nombre: 'Nuevo Vendedor', usuario: 'nv', password: 'clave-nv', rol: 'vendedor' });
            assert.equal(r.status, 201);
            vId = r.datos.id;
            assert.equal(r.datos.password_hash, undefined);
            assert.ok(await t.login('nv', 'clave-nv'));
            assert.equal((await t.api('POST', '/usuarios', admin, { nombre: 'Otro Admin', usuario: 'oa', password: 'clave-oa', rol: 'administrador' })).status, 201);
        });

        test('validaciones: duplicado 409, rol inválido (incluido "cliente"), contraseña corta, datos incompletos', async () => {
            const base = { nombre: 'X', usuario: 'xx', password: 'clave-x', rol: 'vendedor' };
            assert.equal((await t.api('POST', '/usuarios', admin, { ...base, usuario: 'nv' })).status, 409);
            assert.equal((await t.api('POST', '/usuarios', admin, { ...base, rol: 'superadmin' })).status, 400);
            assert.equal((await t.api('POST', '/usuarios', admin, { ...base, rol: 'cliente' })).status, 400);
            assert.equal((await t.api('POST', '/usuarios', admin, { ...base, password: '123' })).status, 400);
            assert.equal((await t.api('POST', '/usuarios', admin, { nombre: 'X' })).status, 400);
        });

        test('restablecer contraseña: la vieja deja de servir y la nueva sí', async () => {
            assert.equal((await t.api('PATCH', `/usuarios/${vId}`, admin, { password: 'clave-nueva' })).status, 200);
            const vieja = await t.api('POST', '/auth/login', null, { usuario: 'nv', password: 'clave-nv' });
            assert.equal(vieja.status, 401);
            assert.ok(await t.login('nv', 'clave-nueva'));
            assert.equal((await t.api('PATCH', `/usuarios/${vId}`, admin, { password: '123' })).status, 400);
        });

        test('desactivar impide entrar y reactivar lo devuelve', async () => {
            await t.api('PATCH', `/usuarios/${vId}`, admin, { activo: false });
            assert.equal((await t.api('POST', '/auth/login', null, { usuario: 'nv', password: 'clave-nueva' })).status, 401);
            await t.api('PATCH', `/usuarios/${vId}`, admin, { activo: true });
            assert.ok(await t.login('nv', 'clave-nueva'));
        });

        test('cambiar rol y nombre; rol inválido y usuario inexistente', async () => {
            const r = await t.api('PATCH', `/usuarios/${vId}`, admin, { rol: 'administrador', nombre: 'Renombrado' });
            assert.equal(r.datos.rol, 'administrador');
            assert.equal(r.datos.nombre, 'Renombrado');
            assert.equal((await t.api('PATCH', `/usuarios/${vId}`, admin, { rol: 'dios' })).status, 400);
            assert.equal((await t.api('PATCH', '/usuarios/99999', admin, { nombre: 'X' })).status, 404);
        });

        test('el administrador no puede desactivarse ni quitarse el rol a sí mismo', async () => {
            assert.equal((await t.api('PATCH', `/usuarios/${adminId}`, admin, { activo: false })).status, 400);
            assert.equal((await t.api('PATCH', `/usuarios/${adminId}`, admin, { rol: 'vendedor' })).status, 400);
            assert.equal((await t.api('PATCH', `/usuarios/${adminId}`, admin, { nombre: 'Admin Renombrado' })).status, 200, 'sí puede cambiarse el nombre');
        });

        test('el listado no expone hashes de contraseña', async () => {
            const r = await t.api('GET', '/usuarios', admin);
            assert.ok(r.datos.length >= 3);
            assert.ok(r.datos.every((u) => u.password_hash === undefined));
        });
    });
});
