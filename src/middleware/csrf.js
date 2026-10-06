'use strict';

const { safeEqual } = require('../lib/crypto');

function extractToken(req) {
  if (req.body && typeof req.body._csrf === 'string') return req.body._csrf;
  const header = req.get('x-csrf-token');
  return header || '';
}

function verifyCsrf(req) {
  if (!req.session || !req.session.csrfToken) return false;
  const token = extractToken(req);
  return Boolean(token) && safeEqual(token, req.session.csrfToken);
}

function csrfProtection(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  // Multipart é validado depois do multer (o campo vem no corpo do formulário).
  if (req.is('multipart/form-data')) return next();

  if (!verifyCsrf(req)) {
    return res.status(403).render('error', {
      status: 403,
      title: 'Sesión no válida',
      message: 'La solicitud no es válida. Vuelve atrás y reintenta.'
    });
  }
  next();
}

module.exports = { csrfProtection, verifyCsrf };
