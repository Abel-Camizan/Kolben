# Kolben
Sistema web para automatizar la gestión de ventas, inventario, clientes, proveedores y reportes de una tienda de repuestos para motos TVS King Deluxe, TVS Duramax y Bajaj Torito (todos los modelos), reemplazando el registro manual.

## Cómo ejecutar

Requisitos: Node 24, PostgreSQL y un archivo `Angular20/backend/.env` (copia `.env.example`).

```bash
# Backend (puerto 3000)
cd Angular20/backend && npm install && node db/init.js && node server.js

# Frontend (puerto 4200)
cd Angular20/frontend && npm install && npm start
```

## Pruebas

```bash
# Backend: usa una base aparte (kolben_test) que se crea y se vacía sola; nunca toca los datos reales
cd Angular20/backend && npm test

# Frontend
cd Angular20/frontend && npm test
```
