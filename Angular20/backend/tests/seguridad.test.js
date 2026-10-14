const { describe, before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const { iniciar } = require('./helpers');

describe('Autenticación, registro y permisos por rol', () => {
    let t, admin, vendedor, cliente;

    before(async () => {
        t = await iniciar();
        await t.crearUsuario('Admin', 'admin', 'clave-admin', 'administrador');
        await t.crearUsuario('Vend', 'vend', 'clave-vend', 'vendedor');
        admin = await t.login('admin', 'clave-admin');
        vendedor = await t.login('vend', 'clave-vend');
        const r = await t.api('POST', '/auth/registro', null, {
            nombre: 'Cliente Uno', usuario: 'cli1', password: 'clave-cli',
        });
        assert.equal(r.status, 201);
        cliente = r.datos.token;
    });
    after(() => t.cerrar());

    test('login: credenciales correctas devuelven token y usuario', async () => {
        const r = await t.api('POST', '/auth/login', null, { usuario: 'admin', password: 'clave-admin' });
        assert.equal(r.status, 200);
        assert.ok(r.datos.token);
        assert.deepEqual(
            { usuario: r.datos.usuario.usuario, rol: r.datos.usuario.rol },
            { usuario: 'admin', rol: 'administrador' }
        );
        assert.equal(r.datos.usuario.password_hash, undefined, 'no debe filtrar el hash');
    });

    test('login: contraseña mala y usuario inexistente dan el mismo error 401', async () => {
        const a = await t.api('POST', '/auth/login', null, { usuario: 'admin', password: 'mala' });
        const b = await t.api('POST', '/auth/login', null, { usuario: 'noexiste', password: 'mala' });
        assert.equal(a.status, 401);
        assert.equal(b.status, 401);
        assert.equal(a.datos.error, b.datos.error);
    });

    test('login: datos vacíos dan 400', async () => {
        assert.equal((await t.api('POST', '/auth/login', null, {})).status, 400);
        assert.equal((await t.api('POST', '/auth/login', null, { usuario: 'admin' })).status, 400);
    });

    test('login: una cuenta desactivada no puede entrar', async () => {
        await t.crearUsuario('Baja', 'baja', 'clave-baja', 'vendedor');
        await t.pool.query("UPDATE usuarios SET activo = FALSE WHERE usuario = 'baja'");
        const r = await t.api('POST', '/auth/login', null, { usuario: 'baja', password: 'clave-baja' });
        assert.equal(r.status, 401);
    });

    test('contraseñas: se guardan cifradas, nunca en texto plano', async () => {
        const { rows } = await t.pool.query("SELECT password_hash FROM usuarios WHERE usuario = 'admin'");
        assert.notEqual(rows[0].password_hash, 'clave-admin');
        assert.match(rows[0].password_hash, /^\$2[aby]\$/);
    });

    test('/auth/me: con token válido devuelve el usuario; sin token o con basura, 401', async () => {
        const ok = await t.api('GET', '/auth/me', admin);
        assert.equal(ok.status, 200);
        assert.equal(ok.datos.usuario, 'admin');
        assert.equal((await t.api('GET', '/auth/me')).status, 401);
        assert.equal((await t.api('GET', '/auth/me', 'token.falso.aqui')).status, 401);
    });

    test('un token manipulado (rol cambiado sin la clave) es rechazado', async () => {
        const [cab, , firma] = vendedor.split('.');
        const carga = Buffer.from(JSON.stringify({ id: 2, usuario: 'vend', rol: 'administrador' })).toString('base64url');
        const falso = `${cab}.${carga}.${firma}`;
        assert.equal((await t.api('GET', '/usuarios', falso)).status, 401);
    });

    test('una cuenta desactivada pierde el acceso AL INSTANTE, con el token aún vigente', async () => {
        await t.crearUsuario('Temp', 'temp', 'clave-temp', 'vendedor');
        const tk = await t.login('temp', 'clave-temp');
        assert.equal((await t.api('GET', '/ventas', tk)).status, 200, 'antes de desactivarla entra');
        await t.pool.query("UPDATE usuarios SET activo = FALSE WHERE usuario = 'temp'");
        assert.equal((await t.api('GET', '/auth/me', tk)).status, 401);
        assert.equal((await t.api('GET', '/ventas', tk)).status, 401, 'tampoco en las demás rutas');
        assert.equal((await t.api('GET', '/repuestos', tk)).status, 401);
    });

    test('un cambio de rol rige de inmediato: un vendedor ascendido o degradado no usa el rol viejo del token', async () => {
        await t.crearUsuario('Cambia', 'cambia', 'clave-c', 'administrador');
        const tk = await t.login('cambia', 'clave-c');
        assert.equal((await t.api('GET', '/usuarios', tk)).status, 200, 'como administrador entra');
        await t.pool.query("UPDATE usuarios SET rol = 'vendedor' WHERE usuario = 'cambia'");
        assert.equal((await t.api('GET', '/usuarios', tk)).status, 403, 'degradado: ya no entra, aunque su token diga administrador');
    });

    test('un token válido de un usuario que fue eliminado no sirve', async () => {
        const id = await t.crearUsuario('Borrado', 'borrado', 'clave-b', 'vendedor');
        const tk = await t.login('borrado', 'clave-b');
        await t.pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
        assert.equal((await t.api('GET', '/ventas', tk)).status, 401);
    });

    describe('registro de clientes', () => {
        test('crea cuenta con rol cliente, ficha en clientes y devuelve token', async () => {
            const r = await t.api('POST', '/auth/registro', null, {
                nombre: 'Ana Pérez', usuario: 'ana', password: 'clave-ana', documento: '12345678', telefono: '999888777',
            });
            assert.equal(r.status, 201);
            assert.equal(r.datos.usuario.rol, 'cliente');
            const { rows } = await t.pool.query(
                `SELECT c.documento, c.telefono FROM usuarios u JOIN clientes c ON c.id = u.cliente_id WHERE u.usuario = 'ana'`
            );
            assert.deepEqual(rows[0], { documento: '12345678', telefono: '999888777' });
        });

        test('no deja elegir el rol: siempre es cliente aunque lo envíen', async () => {
            const r = await t.api('POST', '/auth/registro', null, {
                nombre: 'Hacker', usuario: 'hacker', password: 'clave-hack', rol: 'administrador',
            });
            assert.equal(r.status, 201);
            assert.equal(r.datos.usuario.rol, 'cliente');
        });

        test('usuario duplicado: 409 y no deja una ficha huérfana', async () => {
            const antes = (await t.pool.query('SELECT COUNT(*)::int n FROM clientes')).rows[0].n;
            const r = await t.api('POST', '/auth/registro', null, { nombre: 'Otra Ana', usuario: 'ana', password: 'clave-ana2' });
            assert.equal(r.status, 409);
            const despues = (await t.pool.query('SELECT COUNT(*)::int n FROM clientes')).rows[0].n;
            assert.equal(despues, antes, 'la transacción debe deshacer la ficha de cliente');
        });

        test('documento duplicado: 409', async () => {
            const r = await t.api('POST', '/auth/registro', null, {
                nombre: 'Copia', usuario: 'copia', password: 'clave-copia', documento: '12345678',
            });
            assert.equal(r.status, 409);
        });

        test('validaciones: documento mal formado, contraseña corta, usuario corto, sin nombre', async () => {
            const base = { nombre: 'X', usuario: 'xxx', password: 'clave-x' };
            assert.equal((await t.api('POST', '/auth/registro', null, { ...base, documento: '123' })).status, 400);
            assert.equal((await t.api('POST', '/auth/registro', null, { ...base, password: '123' })).status, 400);
            assert.equal((await t.api('POST', '/auth/registro', null, { ...base, usuario: 'ab' })).status, 400);
            assert.equal((await t.api('POST', '/auth/registro', null, { ...base, nombre: '  ' })).status, 400);
        });

        test('límite de intentos: tras 10 registros por hora responde 429', async () => {
            let ultimo;
            for (let i = 0; i < 12; i++) {
                ultimo = await t.api('POST', '/auth/registro', null, { nombre: 'Bot', usuario: `bot${i}`, password: 'clave-bot' });
                if (ultimo.status === 429) break;
            }
            assert.equal(ultimo.status, 429);
        });
    });

    describe('matriz de permisos', () => {
        // [método, ruta, cuerpo]: rutas que SOLO debe usar el personal o el administrador
        const SOLO_ADMIN = [
            ['GET', '/usuarios'], ['POST', '/usuarios', {}], ['GET', '/reportes/ventas'], ['GET', '/reportes/stock'],
            ['GET', '/reportes/mas-vendidos'], ['GET', '/proveedores'], ['POST', '/proveedores', {}],
            ['GET', '/ingresos'], ['POST', '/ingresos', {}], ['POST', '/repuestos', {}], ['POST', '/marcas', {}],
            ['POST', '/categorias', {}], ['POST', '/modelos', {}],
        ];
        const PERSONAL = [
            ['GET', '/repuestos'], ['GET', '/repuestos/alertas/stock-minimo'], ['GET', '/ventas'], ['POST', '/ventas', {}],
            ['GET', '/clientes'], ['GET', '/marcas'], ['GET', '/categorias'], ['GET', '/modelos'],
            ['POST', '/pedidos/1/confirmar'], ['POST', '/pedidos/1/entregar'],
        ];

        for (const [m, ruta, cuerpo] of [...SOLO_ADMIN, ...PERSONAL]) {
            test(`sin token: ${m} ${ruta} → 401`, async () => {
                assert.equal((await t.api(m, ruta, null, cuerpo)).status, 401);
            });
        }
        for (const [m, ruta, cuerpo] of SOLO_ADMIN) {
            test(`vendedor no puede ${m} ${ruta} → 403`, async () => {
                assert.equal((await t.api(m, ruta, vendedor, cuerpo)).status, 403);
            });
            test(`cliente no puede ${m} ${ruta} → 403`, async () => {
                assert.equal((await t.api(m, ruta, cliente, cuerpo)).status, 403);
            });
        }
        for (const [m, ruta, cuerpo] of PERSONAL) {
            test(`cliente no puede ${m} ${ruta} → 403`, async () => {
                assert.equal((await t.api(m, ruta, cliente, cuerpo)).status, 403);
            });
        }
        test('el cliente tampoco puede crear pedidos como vendedor ni al revés', async () => {
            assert.equal((await t.api('POST', '/pedidos', vendedor, { items: [{ repuesto_id: 1, cantidad: 1 }] })).status, 403);
            assert.equal((await t.api('POST', '/pedidos', admin, { items: [{ repuesto_id: 1, cantidad: 1 }] })).status, 403);
        });
    });

    describe('rutas públicas y utilidades', () => {
        test('catálogo público y modelos se ven sin sesión', async () => {
            assert.equal((await t.api('GET', '/catalogo')).status, 200);
            const m = await t.api('GET', '/catalogo/modelos');
            assert.deepEqual(m.datos.map((x) => x.nombre).sort(), ['Bajaj Torito', 'TVS Duramax', 'TVS King Deluxe']);
        });

        test('/api/db responde sin filtrar detalles internos', async () => {
            const r = await t.api('GET', '/db');
            assert.equal(r.status, 200);
            assert.equal(r.datos.conectado, true);
        });

        test('una ruta inexistente no revela información', async () => {
            const r = await t.api('GET', '/no-existe');
            assert.ok([401, 404].includes(r.status));
        });
    });
});
