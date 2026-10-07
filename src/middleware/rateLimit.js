'use strict';

const { sha256 } = require('../lib/crypto');

function tooMany(req, res, retry, message) {
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

/* Limite em memória, por instância. Barato e sem rede: serve de primeira
 * barreira e de recurso quando a BD falha. Na Vercel cada instância tem o seu
 * contador, por isso as rotas sensíveis usam também dbRateLimit. */
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
      return tooMany(req, res, Math.ceil((entry.resetAt - now) / 1000), message);
    }
    next();
  };
}

/* Limite partilhado entre instâncias (tabela rate_limit_hits, função atómica
 * rate_limit_hit). A chave guardada é um sha256 — o IP não fica em claro.
 *
 * Se a BD falhar, não bloqueia o pedido (fail-open): o limite em memória
 * continua ativo nessa instância. Um candidato não deve ficar sem poder
 * candidatar-se por causa de uma falha do contador. */
function dbRateLimit({ windowMs, max, key, message, name }) {
  const windowSeconds = Math.max(1, Math.round(windowMs / 1000));
  return async function dbLimiter(req, res, next) {
    const { rpc } = require('../db');
    const config = require('../config');
    /* O prefixo de teste isola cada execução do E2E: os contadores ficam na
     * BD partilhada e duas execuções seguidas não se podem bloquear. */
    const raw = `${config.testPrefix}|${name}|${key ? key(req) : (req.ip || 'unknown')}`;
    try {
      const r = await rpc('rate_limit_hit', { key: sha256(raw), window_seconds: windowSeconds, max }, 'rate limit');
      if (r && r.allowed === false) return tooMany(req, res, r.retry_after || windowSeconds, message);
    } catch (err) {
      console.error('[rate-limit] contador partilhado indisponível:', err.message);
    }
    next();
  };
}

module.exports = { rateLimit, dbRateLimit };
