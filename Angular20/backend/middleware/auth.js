const jwt = require('jsonwebtoken');
const pool = require('../db');

// Exige un token válido en la cabecera: Authorization: Bearer <token>.
// Además consulta la cuenta en cada petición: si el administrador la desactiva o le cambia
// el rol, el efecto es inmediato y no al vencer el token (hasta 8 horas después).
async function autenticar(req, res, next) {
    const cabecera = req.headers.authorization || '';
    const [tipo, token] = cabecera.split(' ');
    if (tipo !== 'Bearer' || !token) {
        return res.status(401).json({ error: 'Falta el token de acceso' });
    }
    let datos;
    try {
        datos = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        return res.status(401).json({ error: 'Token inválido o vencido' });
    }
    try {
        const { rows } = await pool.query('SELECT rol, activo FROM usuarios WHERE id = $1', [datos.id]);
        if (!rows[0] || !rows[0].activo) {
            return res.status(401).json({ error: 'La cuenta está desactivada o ya no existe' });
        }
        // El rol vigente es el de la base de datos, no el que quedó escrito en el token
        req.usuario = { ...datos, rol: rows[0].rol };
        next();
    } catch (err) {
        res.status(500).json({ error: 'Error del servidor' });
    }
}

// Permite el paso solo a los roles indicados: soloRoles('administrador')
function soloRoles(...roles) {
    return (req, res, next) => {
        if (!roles.includes(req.usuario.rol)) {
            return res.status(403).json({ error: 'No tienes permiso para esta acción' });
        }
        next();
    };
}

module.exports = { autenticar, soloRoles };
