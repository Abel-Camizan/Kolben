// Crea (o actualiza) el administrador inicial: node db/seed-admin.js
// Lee ADMIN_USER, ADMIN_PASSWORD y ADMIN_NOMBRE del archivo .env
const bcrypt = require('bcryptjs');
const pool = require('../db');

async function main() {
    const usuario = process.env.ADMIN_USER;
    const password = process.env.ADMIN_PASSWORD;
    const nombre = process.env.ADMIN_NOMBRE || 'Administrador';
    if (!usuario || !password) {
        throw new Error('Define ADMIN_USER y ADMIN_PASSWORD en el archivo .env');
    }
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
        `INSERT INTO usuarios (nombre, usuario, password_hash, rol)
         VALUES ($1, $2, $3, 'administrador')
         ON CONFLICT (usuario) DO UPDATE
            SET password_hash = EXCLUDED.password_hash, rol = 'administrador', activo = TRUE`,
        [nombre, usuario, hash]
    );
    console.log(`Administrador "${usuario}" listo.`);
    await pool.end();
}

main().catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
});
