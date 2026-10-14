const jwt = require('jsonwebtoken');

// Exige un token válido en la cabecera: Authorization: Bearer <token>
function autenticar(req, res, next) {
    const cabecera = req.headers.authorization || '';
    const [tipo, token] = cabecera.split(' ');
    if (tipo !== 'Bearer' || !token) {
        return res.status(401).json({ error: 'Falta el token de acceso' });
    }
    try {
        req.usuario = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ error: 'Token inválido o vencido' });
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
