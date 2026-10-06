'use strict';

function requireOwner(req, res, next) {
  if (req.blockedSession) {
    return res.redirect('/login?error=' + encodeURIComponent('Tu cuenta ha sido bloqueada.'));
  }
  if (!req.user) {
    return res.redirect('/login');
  }
  if (req.user.role !== 'owner') {
    return res.status(403).render('error', {
      status: 403, title: 'Sin permiso', message: 'No tienes acceso a esta sección.'
    });
  }
  /* `restaurant_active` é booleano no Postgres: basta testar a falsidade. */
  if (!req.user.restaurant_active || req.user.restaurant_id == null) {
    return res.status(403).render('error', {
      status: 403,
      title: 'Establecimiento desactivado',
      message: 'Tu establecimiento está desactivado. Contacta con el soporte de la plataforma.'
    });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (req.blockedSession) {
    return res.redirect('/login?error=' + encodeURIComponent('Tu cuenta ha sido bloqueada.'));
  }
  if (!req.user || req.user.role !== 'admin') {
    return res.status(404).render('error', {
      status: 404, title: 'No encontrado', message: 'Página no disponible.'
    });
  }
  next();
}

module.exports = { requireOwner, requireAdmin };
