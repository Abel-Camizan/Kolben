const { describe, before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const { iniciar } = require('./helpers');

describe('Reportes', () => {
    let t, admin, vend, A, B, m1, m2;

    // Inserta una venta con fecha exacta (en UTC) y sus líneas: [[repuesto_id, cantidad, precio]]
    async function venta(numero, fechaUtc, lineas) {
        const total = lineas.reduce((s, [, c, p]) => s + c * p, 0);
        const { rows } = await t.pool.query(
            'INSERT INTO ventas (numero, usuario_id, fecha, total) VALUES ($1, 1, $2, $3) RETURNING id',
            [numero, fechaUtc, total]
        );
        for (const [rep, cant, precio] of lineas) {
            await t.pool.query(
                'INSERT INTO detalle_venta (venta_id, repuesto_id, cantidad, precio_unitario) VALUES ($1,$2,$3,$4)',
                [rows[0].id, rep, cant, precio]
            );
        }
    }

    before(async () => {
        t = await iniciar();
        await t.crearUsuario('Admin', 'admin', 'clave-admin', 'administrador');
        await t.crearUsuario('Vend', 'vend', 'clave-vend', 'vendedor');
        admin = await t.login('admin', 'clave-admin');
        vend = await t.login('vend', 'clave-vend');
        const modelos = (await t.api('GET', '/modelos', admin)).datos;
        m1 = modelos.find((m) => m.nombre === 'TVS King Deluxe').id;
        m2 = modelos.find((m) => m.nombre === 'Bajaj Torito').id;
        A = (await t.api('POST', '/repuestos', admin, { codigo: 'A', nombre: 'Filtro', precio: 12.5, stock: 10, stock_minimo: 10, modelos: [m1] })).datos.id;
        B = (await t.api('POST', '/repuestos', admin, { codigo: 'B', nombre: 'Bujía', precio: 8, stock: 50, stock_minimo: 5, modelos: [m2] })).datos.id;

        // 10-mar 02:00 UTC = 9-mar 21:00 en Lima (otro día que en UTC)
        await venta('V-1', '2026-03-10T02:00:00Z', [[A, 2, 12.5]]); // 25.00
        await venta('V-2', '2026-03-10T15:00:00Z', [[B, 1, 8]]); //  8.00
        await venta('V-3', '2026-03-12T15:00:00Z', [[A, 3, 12.5]]); // 37.50
        await venta('V-4', '2026-04-02T15:00:00Z', [[B, 2, 8]]); // 16.00
    });
    after(() => t.cerrar());

    const ventas = (qs) => t.api('GET', `/reportes/ventas?${qs}`, admin);

    describe('ventas por periodo', () => {
        test('por día: cada venta en su día de Lima, con totales exactos', async () => {
            const r = await ventas('desde=2026-03-01&hasta=2026-03-31&agrupar=dia');
            assert.equal(r.status, 200);
            assert.deepEqual(
                r.datos.filas.map((f) => [f.periodo, f.ventas, Number(f.total)]),
                [['2026-03-09', 1, 25], ['2026-03-10', 1, 8], ['2026-03-12', 1, 37.5]]
            );
            assert.deepEqual(r.datos.resumen, { ventas: 3, total: '70.50' });
        });

        test('hora de Lima: la venta de las 9 p. m. cuenta en SU día, no en el siguiente', async () => {
            const r = await ventas('desde=2026-03-10&hasta=2026-03-10&agrupar=dia');
            assert.equal(r.datos.resumen.ventas, 1, 'solo la venta de las 10 a. m. del día 10');
            assert.equal(r.datos.resumen.total, '8.00');
            const nueve = await ventas('desde=2026-03-09&hasta=2026-03-09&agrupar=dia');
            assert.equal(nueve.datos.resumen.total, '25.00');
        });

        test('por semana (lunes a domingo) y por mes', async () => {
            const sem = await ventas('desde=2026-03-01&hasta=2026-04-30&agrupar=semana');
            assert.deepEqual(sem.datos.filas.map((f) => [f.periodo, f.ventas]), [['2026-03-09', 3], ['2026-03-30', 1]]);
            const mes = await ventas('desde=2026-03-01&hasta=2026-04-30&agrupar=mes');
            assert.deepEqual(
                mes.datos.filas.map((f) => [f.periodo, f.ventas, Number(f.total)]),
                [['2026-03-01', 3, 70.5], ['2026-04-01', 1, 16]]
            );
            assert.equal(mes.datos.resumen.total, '86.50');
        });

        test('el rango incluye los dos extremos', async () => {
            const r = await ventas('desde=2026-03-09&hasta=2026-03-12&agrupar=dia');
            assert.equal(r.datos.resumen.ventas, 3);
        });

        test('rango sin ventas: filas vacías y resumen en cero', async () => {
            const r = await ventas('desde=2025-01-01&hasta=2025-01-31');
            assert.deepEqual(r.datos.filas, []);
            assert.deepEqual(r.datos.resumen, { ventas: 0, total: '0.00' });
        });

        test('sin fechas usa el mes en curso (no falla)', async () => {
            const r = await t.api('GET', '/reportes/ventas', admin);
            assert.equal(r.status, 200);
            assert.match(r.datos.desde, /^\d{4}-\d{2}-01$/);
            assert.match(r.datos.hasta, /^\d{4}-\d{2}-\d{2}$/);
        });

        test('validaciones: fecha mal escrita, rango invertido, agrupación inválida, intento de inyección', async () => {
            assert.equal((await ventas('desde=ayer&hasta=hoy')).status, 400);
            assert.equal((await ventas('desde=2026-03-31&hasta=2026-03-01')).status, 400);
            assert.equal((await ventas('desde=2026-03-01&hasta=2026-03-31&agrupar=siglo')).status, 400);
            assert.equal((await ventas("desde=2026-03-01&hasta=2026-03-31&agrupar=day'); DROP TABLE ventas;--")).status, 400);
            assert.equal((await t.pool.query('SELECT COUNT(*)::int n FROM ventas')).rows[0].n, 4);
        });
    });

    describe('stock por modelo de moto', () => {
        test('agrupa por modelo e indica los que están en el mínimo', async () => {
            const r = await t.api('GET', '/reportes/stock', admin);
            assert.equal(r.status, 200);
            const a = r.datos.find((f) => f.codigo === 'A');
            const b = r.datos.find((f) => f.codigo === 'B');
            assert.equal(a.modelo, 'TVS King Deluxe');
            assert.equal(a.bajo_minimo, true, 'stock 10 con mínimo 10');
            assert.equal(b.modelo, 'Bajaj Torito');
            assert.equal(b.bajo_minimo, false);
        });

        test('filtra por modelo', async () => {
            const r = await t.api('GET', `/reportes/stock?modelo_id=${m2}`, admin);
            assert.deepEqual(r.datos.map((f) => f.codigo), ['B']);
        });

        test('un repuesto de varios modelos aparece en cada uno; los de baja no aparecen', async () => {
            await t.api('PATCH', `/repuestos/${A}`, admin, { modelos: [m1, m2] });
            const r = await t.api('GET', '/reportes/stock', admin);
            assert.equal(r.datos.filter((f) => f.codigo === 'A').length, 2);
            await t.api('DELETE', `/repuestos/${B}`, admin);
            const sin = await t.api('GET', '/reportes/stock', admin);
            assert.ok(!sin.datos.some((f) => f.codigo === 'B'));
            await t.api('PATCH', `/repuestos/${B}`, admin, { activo: true });
            await t.api('PATCH', `/repuestos/${A}`, admin, { modelos: [m1] });
        });
    });

    describe('más vendidos', () => {
        const mv = (qs) => t.api('GET', `/reportes/mas-vendidos?${qs}`, admin);

        test('ordena por unidades e incluye ingresos', async () => {
            const r = await mv('desde=2026-03-01&hasta=2026-04-30');
            assert.deepEqual(
                r.datos.filas.map((f) => [f.codigo, f.unidades, Number(f.ingresos)]),
                [['A', 5, 62.5], ['B', 3, 24]]
            );
        });

        test('respeta el rango de fechas', async () => {
            const marzo = await mv('desde=2026-03-01&hasta=2026-03-31');
            assert.deepEqual(marzo.datos.filas.map((f) => [f.codigo, f.unidades]), [['A', 5], ['B', 1]]);
        });

        test('filtra por modelo y limita la cantidad de filas', async () => {
            const m = await mv(`desde=2026-03-01&hasta=2026-04-30&modelo_id=${m2}`);
            assert.deepEqual(m.datos.filas.map((f) => f.codigo), ['B']);
            const l = await mv('desde=2026-03-01&hasta=2026-04-30&limite=1');
            assert.equal(l.datos.filas.length, 1);
            assert.equal(l.datos.filas[0].codigo, 'A');
        });

        test('un límite absurdo no rompe nada y las fechas inválidas dan 400', async () => {
            assert.equal((await mv('desde=2026-03-01&hasta=2026-04-30&limite=-5')).status, 200);
            assert.equal((await mv('desde=2026-03-01&hasta=2026-04-30&limite=abc')).status, 200);
            assert.equal((await mv('desde=xx&hasta=yy')).status, 400);
        });
    });

    test('el vendedor no puede ver ningún reporte', async () => {
        assert.equal((await t.api('GET', '/reportes/ventas', vend)).status, 403);
        assert.equal((await t.api('GET', '/reportes/stock', vend)).status, 403);
        assert.equal((await t.api('GET', '/reportes/mas-vendidos', vend)).status, 403);
    });
});
