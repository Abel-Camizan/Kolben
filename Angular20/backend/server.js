require('dotenv').config({ quiet: true });
const express = require('express');
const cors = require('cors');
const pool = require('./db');
const authRoutes = require('./routes/auth');
const usuariosRoutes = require('./routes/usuarios');
const catalogosRoutes = require('./routes/catalogos');
const repuestosRoutes = require('./routes/repuestos');
const ventasRoutes = require('./routes/ventas');
const catalogoRoutes = require('./routes/catalogo');
const pedidosRoutes = require('./routes/pedidos');
const proveedoresRoutes = require('./routes/proveedores');
const ingresosRoutes = require('./routes/ingresos');
const reportesRoutes = require('./routes/reportes');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/api/saludo', (req, res) => {
    res.json({
        mensaje: "¡Hola Mundo desde el Backend de Node.js + Express!"
    });
});

// Comprueba la conexión con PostgreSQL
app.get('/api/db', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT NOW() AS hora');
        res.json({ conectado: true, hora: rows[0].hora });
    } catch (err) {
        // No se devuelve el mensaje del error: esta ruta es pública
        res.status(500).json({ conectado: false });
    }
});

app.use('/api/auth', authRoutes);
app.use('/api/catalogo', catalogoRoutes); // público
app.use('/api/pedidos', pedidosRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/repuestos', repuestosRoutes);
app.use('/api/ventas', ventasRoutes);
app.use('/api/proveedores', proveedoresRoutes);
app.use('/api/ingresos', ingresosRoutes);
app.use('/api/reportes', reportesRoutes);
app.use('/api', catalogosRoutes); // marcas, categorías y modelos (personal)

app.listen(PORT, () => {
    console.log("Servidor backend corriendo en el puerto " + PORT);
});
