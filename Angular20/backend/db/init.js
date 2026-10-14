// Crea las tablas de Kolben: node db/init.js
const fs = require('fs');
const path = require('path');
const pool = require('../db');

async function main() {
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(sql);
    const { rows } = await pool.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
    );
    console.log('Tablas creadas:', rows.map((r) => r.table_name).join(', '));
    await pool.end();
}

main().catch((err) => {
    console.error('Error al crear el esquema:', err.message);
    process.exit(1);
});
