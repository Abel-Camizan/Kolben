// Carga el catálogo inicial de repuestos: node db/seed-repuestos.js
//
// Los códigos y nombres salen de los catálogos de partes de TVS (Deluxe y Duramax) y de Bajaj
// (Torito 4T Plus); las piezas de otras marcas llevan códigos internos (LUB-, ELE-, RUE-, ACC-).
// IMPORTANTE: los precios, el stock y el stock mínimo son valores de EJEMPLO razonables,
// no los de la tienda: hay que ajustarlos desde la pantalla Repuestos.
//
// Se puede ejecutar más de una vez: lo que ya existe (por código) no se toca ni se duplica.
const fs = require('fs');
const path = require('path');
const pool = require('../db');

async function idPorNombre(db, tabla, nombre) {
    // Crea la marca o categoría si no existe y devuelve su id
    const { rows } = await db.query(
        `INSERT INTO ${tabla} (nombre) VALUES ($1)
         ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre
         RETURNING id`,
        [nombre]
    );
    return rows[0].id;
}

async function main() {
    const datos = JSON.parse(
        fs.readFileSync(path.join(__dirname, 'datos', 'repuestos-ejemplo.json'), 'utf8')
    );

    const db = await pool.connect();
    try {
        await db.query('BEGIN');

        const { rows: modelos } = await db.query('SELECT id, nombre FROM modelos_moto');
        const modeloId = new Map(modelos.map((m) => [m.nombre, m.id]));

        const marcas = new Map();
        const categorias = new Map();
        let nuevos = 0;
        let existentes = 0;

        for (const r of datos) {
            if (!marcas.has(r.marca)) marcas.set(r.marca, await idPorNombre(db, 'marcas', r.marca));
            if (!categorias.has(r.categoria)) {
                categorias.set(r.categoria, await idPorNombre(db, 'categorias', r.categoria));
            }

            const { rows } = await db.query(
                `INSERT INTO repuestos (codigo, nombre, marca_id, categoria_id, precio, stock, stock_minimo)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 ON CONFLICT (codigo) DO NOTHING
                 RETURNING id`,
                [r.codigo, r.nombre, marcas.get(r.marca), categorias.get(r.categoria), r.precio, r.stock, r.stock_minimo]
            );
            if (!rows[0]) {
                existentes++;
                continue;
            }
            nuevos++;
            for (const nombre of r.modelos) {
                if (!modeloId.has(nombre)) throw new Error(`El modelo "${nombre}" no existe en la base de datos`);
                await db.query('INSERT INTO repuesto_modelo (repuesto_id, modelo_id) VALUES ($1, $2)', [
                    rows[0].id,
                    modeloId.get(nombre),
                ]);
            }
        }

        await db.query('COMMIT');
        console.log(`Repuestos nuevos: ${nuevos}. Ya existían (sin cambios): ${existentes}.`);
    } catch (err) {
        await db.query('ROLLBACK');
        throw err;
    } finally {
        db.release();
        await pool.end();
    }
}

main().catch((err) => {
    console.error('Error al cargar los repuestos:', err.message);
    process.exit(1);
});
