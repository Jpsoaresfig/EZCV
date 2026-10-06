'use strict';

const express = require('express');

const config = require('../config');
const { sb, one, rpc, logSecurity } = require('../db');
const { createSession, destroySession, ensureSession } = require('../middleware/session');
const { verifyCsrf } = require('../middleware/csrf');
const { rateLimit } = require('../middleware/rateLimit');
const { hashPassword, verifyPassword } = require('../lib/crypto');
const { slugify } = require('../lib/slug');
const { ESTABLISHMENT_TYPES } = require('../lib/statuses');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* Landing page para quem ainda não tem conta; quem já entrou vai direto
 * para o painel, como antes. */
router.get('/', (req, res) => {
  if (req.user) return res.redirect(req.user.role === 'admin' ? '/admin' : '/panel');
  res.render('public/landing');
});

function clean(value, max = 200) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

/* ------------------------------------------------------------------ *
 * Registro de establecimiento (§9)
 * ------------------------------------------------------------------ */
router.get('/registro', ensureSession, (req, res) => {
  if (req.user) return res.redirect(req.user.role === 'admin' ? '/admin' : '/panel');
  res.render('auth/register', { form: {}, errors: null });
});

router.post('/registro', rateLimit({ windowMs: 15 * 60 * 1000, max: 10, name: 'register' }), async (req, res) => {
  if (!verifyCsrf(req)) {
    return res.status(403).render('error', {
      status: 403, title: 'Sesión no válida', message: 'Recarga la página e inténtalo de nuevo.'
    });
  }

  const form = {
    restaurant_name: clean(req.body.restaurant_name, 100),
    commercial_name: clean(req.body.commercial_name, 100),
    owner_name: clean(req.body.owner_name, 100),
    email: clean(req.body.email, 120),
    phone: clean(req.body.telefono, 30),
    address: clean(req.body.direccion, 200),
    postal_code: clean(req.body.cp, 10),
    city: clean(req.body.ciudad, 100),
    establishment_type: clean(req.body.establecimiento, 40),
    description: clean(req.body.descripcion, 1500),
    password: String(req.body.password || '').slice(0, 200),
    password2: String(req.body.password2 || '').slice(0, 200)
  };

  const errors = {};
  if (form.restaurant_name.length < 2) errors.restaurant_name = 'Indica el nombre del establecimiento.';
  if (form.owner_name.length < 2) errors.owner_name = 'Indica el responsable.';
  if (!EMAIL_RE.test(form.email)) errors.email = 'Indica un email válido.';
  if (!/^[\d\s()+-]{6,20}$/.test(form.phone)) errors.phone = 'Indica un teléfono válido.';
  if (form.city.length < 2) errors.city = 'Indica la ciudad.';
  if (form.postal_code && !/^\d{5}$/.test(form.postal_code)) errors.postal_code = 'El código postal debe tener 5 dígitos (ej.: 28013).';
  if (!Object.prototype.hasOwnProperty.call(ESTABLISHMENT_TYPES, form.establishment_type)) {
    errors.establishment_type = 'Selecciona el tipo de establecimiento.';
  }
  if (form.password.length < 8) errors.password = 'La contraseña debe tener al menos 8 caracteres.';
  if (form.password !== form.password2) errors.password2 = 'Las contraseñas no coinciden.';

  const rejectWith = (fieldErrors) => {
    delete form.password;
    delete form.password2;
    return res.status(422).render('auth/register', { form, errors: fieldErrors });
  };

  if (Object.keys(errors).length > 0) return rejectWith(errors);

  /* Restaurante + utilizador owner + slug único numa só transação.
   * O slug é gerado dentro da função para ser à prova de corrida. */
  const result = await rpc('register_restaurant', {
    slug_base: slugify(form.restaurant_name),
    name: form.restaurant_name,
    commercial_name: form.commercial_name,
    owner_name: form.owner_name,
    email: form.email,
    phone: form.phone,
    address: form.address,
    postal_code: form.postal_code,
    city: form.city,
    establishment_type: form.establishment_type,
    description: form.description,
    password_hash: hashPassword(form.password),
    test_prefix: config.testPrefix
  }, 'registar estabelecimento');

  if (!result || !result.ok) {
    if (result && result.reason === 'email_taken') {
      return rejectWith({ email: 'Ya existe una cuenta con este email. Inicia sesión.' });
    }
    return res.status(500).render('error', {
      status: 500, title: 'Error', message: 'No se pudo crear la cuenta. Inténtalo de nuevo.'
    });
  }

  logSecurity('registro_restaurante', `slug=${result.slug} email=${form.email}`, req.ip, {
    userId: result.user_id,
    restaurantId: result.restaurant_id,
    userAgent: req.headers['user-agent']
  });

  await destroySession(req, res);
  await createSession(req, res, result.user_id);
  res.redirect('/panel?ok=' + encodeURIComponent('Cuenta creada. ¡Bienvenido!'));
});

/* ------------------------------------------------------------------ *
 * Login
 * ------------------------------------------------------------------ */
router.get('/login', ensureSession, (req, res) => {
  if (req.user) return res.redirect(req.user.role === 'admin' ? '/admin' : '/panel');
  res.render('auth/login', { error: req.query.error || '', email: req.query.email || '' });
});

router.post('/login', rateLimit({
  windowMs: 15 * 60 * 1000, max: 10, name: 'login',
  key: (req) => `${req.ip}|${clean(req.body.email, 120).toLowerCase()}`,
  message: 'Demasiados intentos. Espera unos minutos.'
}), async (req, res) => {
  if (!verifyCsrf(req)) {
    return res.status(403).render('error', {
      status: 403, title: 'Sesión no válida', message: 'Recarga la página e inténtalo de nuevo.'
    });
  }

  const email = clean(req.body.email, 120);
  const password = String(req.body.password || '').slice(0, 200);

  /* `email` é citext: a comparação é insensível a maiúsculas no Postgres. */
  const user = await one(
    sb().from('users').select('id, email, password_hash, role, blocked').eq('email', email),
    'login'
  );

  const invalid = () => {
    logSecurity('login_fallido', `email=${email}`, req.ip, { userAgent: req.headers['user-agent'] });
    res.status(401).render('auth/login', { error: 'Email o contraseña incorrectos.', email });
  };

  if (!user) return invalid();

  if (user.blocked) {
    logSecurity('login_bloqueado', `email=${email}`, req.ip, {
      userId: user.id, userAgent: req.headers['user-agent']
    });
    return res.status(403).render('auth/login', { error: 'Tu cuenta ha sido bloqueada.', email });
  }

  if (!verifyPassword(password, user.password_hash)) return invalid();

  await destroySession(req, res);
  await createSession(req, res, user.id);

  logSecurity('login_ok', `email=${user.email} role=${user.role}`, req.ip, {
    userId: user.id, userAgent: req.headers['user-agent']
  });

  res.redirect(user.role === 'admin' ? '/admin' : '/panel');
});

/* ------------------------------------------------------------------ *
 * Logout
 * ------------------------------------------------------------------ */
router.post('/logout', async (req, res) => {
  if (req.session && !verifyCsrf(req)) {
    return res.status(403).render('error', {
      status: 403, title: 'Sesión no válida', message: 'Operación no válida.'
    });
  }
  await destroySession(req, res);
  res.redirect('/login');
});

module.exports = router;
