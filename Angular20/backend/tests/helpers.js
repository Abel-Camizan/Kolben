// Utilidades de las pruebas. Las pruebas usan una base de datos APARTE (kolben_test)
// que se vacía en cada corrida: nunca tocan los datos reales de `kolben`.
process.env.DB_NAME = 'kolben_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-solo-para-pruebas';

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ quiet: true }); // usuario y contraseña de PostgreSQL; no pisa DB_NAME
const bcrypt = require('bcryptjs');

const TABLAS = [
    'detalle_pedido', 'pedidos', 'detalle_venta', 'ventas', 'detalle_ingreso', 'ingresos',
    'repuesto_modelo', 'repuestos', 'marcas', 'categorias', 'modelos_moto',
    'proveedores', 'usuarios', 'clientes',
];

async function asegurarBaseDePrueba() {
    const admin = new Pool({
        host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER,
        password: process.env.DB_PASSWORD, database: 'postgres',
    });
    try {
        const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = 'kolben_test'");
        if (!rowCount) await admin.query('CREATE DATABASE kolben_test');
    } finally {
        await admin.end();
    }
}

// Deja la base de pruebas vacía y con el esquema y los 3 modelos de moto
async function reiniciarBD() {
    await asegurarBaseDePrueba();
    const pool = require('../db');
    if (pool.options.database !== 'kolben_test') throw new Error('Las pruebas solo pueden usar kolben_test');
    const esquema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
    await pool.query(esquema);
    await pool.query(`TRUNCATE ${TABLAS.join(', ')} RESTART IDENTITY CASCADE`);
    await pool.query(esquema); // vuelve a sembrar los modelos
    return pool;
}

async function crearUsuario(pool, nombre, usuario, password, rol) {
    const hash = await bcrypt.hash(password, 4);
    const { rows } = await pool.query(
        'INSERT INTO usuarios (nombre, usuario, password_hash, rol) VALUES ($1,$2,$3,$4) RETURNING id',
        [nombre, usuario, hash, rol]
    );
    return rows[0].id;
}

// Arranca la API en un puerto libre y devuelve helpers para llamarla
async function iniciar() {
    const pool = await reiniciarBD();
    const app = require('../server');
    const servidor = await new Promise((ok) => {
        const s = app.listen(0, () => ok(s));
    });
    const base = `http://localhost:${servidor.address().port}/api`;

    async function api(metodo, ruta, token, cuerpo) {
        const r = await fetch(base + ruta, {
            method: metodo,
            headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
            body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        });
        const texto = await r.text();
        let datos = null;
        try { datos = texto ? JSON.parse(texto) : null; } catch { datos = texto; }
        return { status: r.status, datos };
    }

    async function login(usuario, password) {
        const r = await api('POST', '/auth/login', null, { usuario, password });
        if (r.status !== 200) throw new Error(`login de ${usuario} falló: ${r.status}`);
        return r.datos.token;
    }

    async function cerrar() {
        await new Promise((ok) => servidor.close(ok));
        await pool.end();
    }

    return { pool, api, login, cerrar, crearUsuario: (...a) => crearUsuario(pool, ...a) };
}

module.exports = { iniciar, reiniciarBD, crearUsuario };
