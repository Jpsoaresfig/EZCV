'use strict';

const config = require('../config');
const { sb, one, rpc } = require('../db');
const { randomToken, sha256 } = require('../lib/crypto');

const COOKIE_NAME = 'ezcv_sid';

function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    path: '/',
    maxAge: config.sessionTtlMs
  });
}

async function createSession(req, res, userId = null) {
  const token = randomToken(32);
  const csrf = randomToken(24);
  const now = Date.now();

  const { error } = await sb().from('sessions').insert({
    token_hash: sha256(token),
    user_id: userId,
    csrf_token: csrf,
    ip: String(req.ip || '').slice(0, 60),
    user_agent: String(req.headers['user-agent'] || '').slice(0, 200),
    expires_at: now + config.sessionTtlMs,
    created_at: now
  });

  if (error) throw new Error(`Supabase: criar sessão — ${error.message}`);

  setSessionCookie(res, token);
  req.session = { csrfToken: csrf, userId };
  if (res.locals) res.locals.csrfToken = csrf;
  return req.session;
}

async function destroySession(req, res) {
  const token = req.cookies && req.cookies[COOKIE_NAME];

  if (token) {
    try {
      await sb().from('sessions').delete().eq('token_hash', sha256(token));
    } catch (err) {
      console.error('[session] falha a apagar sessão:', err.message);
    }
  }

  res.clearCookie(COOKIE_NAME, { path: '/' });
  req.session = null;
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;

  for (const part of String(header).split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) {
      try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
    }
  }
  return out;
}

/* O candidato não faz login, mas precisa de uma sessão para ter um token
 * CSRF no formulário (§26). */
async function ensureSession(req, res, next) {
  if (!req.session) await createSession(req, res, null);
  next();
}

/* Carrega sessão, utilizador e restaurante num único pedido ao Supabase.
 *
 * Corre em todos os pedidos, por isso usa a view `session_context`: separar
 * isto em duas queries duplicaria a latência de rede de cada página.
 */
async function loadSession(req, res, next) {
  req.session = null;
  req.user = null;
  req.cookies = parseCookies(req.headers.cookie);

  const token = req.cookies[COOKIE_NAME];
  if (!token) return next();

  const hash = sha256(token);
  const row = await one(
    sb().from('session_context').select('*').eq('token_hash', hash),
    'carregar sessão'
  );

  const now = Date.now();

  if (!row || Number(row.expires_at) <= now) {
    if (row) {
      try {
        await sb().from('sessions').delete().eq('token_hash', hash);
      } catch { /* sessão expirada que não se conseguiu apagar: ignora */ }
    }
    res.clearCookie(COOKIE_NAME, { path: '/' });
    return next();
  }

  /* Renova a validade quando passou metade do tempo. Não é esperado com
   * await: é manutenção, não deve atrasar a resposta. */
  if (Number(row.expires_at) - now < config.sessionTtlMs / 2) {
    rpc('touch_session', {
      token_hash: hash,
      expires_at: now + config.sessionTtlMs,
      now
    }).catch((err) => console.error('[session] touch falhou:', err.message));
  }

  req.session = { csrfToken: row.csrf_token, userId: row.user_id };

  if (row.user_id) {
    /* role a null significa que o utilizador da sessão já não existe. */
    if (!row.role || row.blocked) {
      await destroySession(req, res);
      req.blockedSession = true;
      return next();
    }

    req.user = {
      id: row.user_id,
      email: row.email,
      password_hash: row.password_hash,
      full_name: row.full_name,
      role: row.role,
      blocked: row.blocked,
      restaurant_id: row.restaurant_id,
      restaurant_slug: row.restaurant_slug,
      restaurant_name: row.restaurant_name,
      restaurant_active: row.restaurant_active,
      restaurant_hiring: row.restaurant_hiring
    };
  }

  next();
}

module.exports = { COOKIE_NAME, createSession, destroySession, loadSession, ensureSession };
