'use strict';

function rateLimit({ windowMs, max, key, message, name = 'global' }) {
  const store = new Map();

  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [k, e] of store) {
      if (e.resetAt <= now) store.delete(k);
    }
  }, 60 * 1000);
  if (sweeper.unref) sweeper.unref();

  return function limiter(req, res, next) {
    const k = `${name}:${key ? key(req) : (req.ip || 'unknown')}`;
    const now = Date.now();
    let entry = store.get(k);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(k, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      const retry = Math.ceil((entry.resetAt - now) / 1000);
      res.set('Retry-After', String(retry));
      if (req.is('multipart/form-data') || req.xhr || req.is('application/json')) {
        return res.status(429).send('Demasiadas solicitudes. Inténtalo más tarde.');
      }
      return res.status(429).render('error', {
        status: 429,
        title: 'Demasiadas solicitudes',
        message: message || 'Has hecho demasiadas peticiones. Espera unos minutos y vuelve a intentarlo.'
      });
    }
    next();
  };
}

module.exports = { rateLimit };
