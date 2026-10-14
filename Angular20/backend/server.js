const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 3000; 

app.use(cors());
app.use(express.json()); 

app.get('/api/saludo', (req, res) => {
res.json({
mensaje: "¡Hola Mundo desde el Backend de Node.js + Express!"
});
}); 

app.listen(PORT, () => {
    console.log("Servidor backend corriendo en el puerto " + PORT);

});
