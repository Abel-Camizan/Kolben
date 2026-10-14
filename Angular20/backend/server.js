require('dotenv').config({ quiet: true });
const express = require('express');
const cors = require('cors');
const pool = require('./db');
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
        res.status(500).json({ conectado: false, error: err.message });
    }
});

app.listen(PORT, () => {
    console.log("Servidor backend corriendo en el puerto " + PORT);
});
