'use strict';

const express = require('express');

const config = require('../config');
const { sb, one, many, rpc, logSecurity } = require('../db');
const { ensureSession } = require('../middleware/session');
const { verifyCsrf } = require('../middleware/csrf');
const { rateLimit } = require('../middleware/rateLimit');
const { uploadCvFile, isPdf } = require('../middleware/uploads');
const { notifyNewApplication } = require('../lib/mailer');
const { CONSENT_VERSION, consentSnapshot, SELECTION_TEXT, FUTURE_TEXT } = require('../lib/consent');
const storage = require('../lib/storage');
const { DOC_TYPES } = require('../lib/statuses');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[\d\s()+-]{6,20}$/;

function clean(value, max = 200) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */
async function getPublicRestaurant(slug) {
  return one(
    sb().from('restaurants').select('*').eq('slug', String(slug || '')).eq('active', true),
    'restaurante público'
  );
}

async function openJobs(restaurantId) {
  return many(
    sb().from('jobs').select('*').eq('restaurant_id', restaurantId).eq('active', true).order('title'),
    'vagas abertas'
  );
}

/* Já se candidatou a ESTE restaurante nas últimas 48h? (§26)
 * Verificado aqui para não fazer upload à toa, e outra vez dentro da função
 * submit_application, que é onde a garantia é à prova de corrida. */
async function recentlyApplied(restaurantId, email) {
  const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const row = await one(
    sb().from('application_list')
      .select('id')
      .eq('restaurant_id', restaurantId)
      .eq('email', email)
      .gt('applied_at', since)
      .limit(1),
    'candidatura duplicada'
  );
  return Boolean(row);
}

function pageMode(restaurant, jobs) {
  if (restaurant.hiring_status !== 'open') return 'paused';
  if (jobs.length === 0) return 'no_jobs';
  return 'form';
}

function renderPublic(req, res, { restaurant, jobs, mode, form = {}, errors = null, status = 200 }) {
  res.status(status).render('public/restaurant', {
    restaurant,
    jobs,
    mode,
    form,
    errors,
    consentSelectionText: SELECTION_TEXT,
    consentFutureText: FUTURE_TEXT,
    query: req.query
  });
}

function notFoundRestaurant(res, message) {
  return res.status(404).render('error', {
    status: 404,
    title: 'Establecimiento no encontrado',
    message: message || 'No encontramos este establecimiento. Comprueba el enlace de la etiqueta NFC.'
  });
}

/* ------------------------------------------------------------------ *
 * GET /r/:slug — página pública (NFC)
 * ------------------------------------------------------------------ */
router.get('/r/:slug', ensureSession, async (req, res) => {
  const restaurant = await getPublicRestaurant(req.params.slug);
  if (!restaurant) return notFoundRestaurant(res);

  const jobs = await openJobs(restaurant.id);
  renderPublic(req, res, { restaurant, jobs, mode: pageMode(restaurant, jobs) });
});

/* ------------------------------------------------------------------ *
 * POST /r/:slug/apply — candidatura com CV
 * ------------------------------------------------------------------ */
const applyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  name: 'apply',
  key: (req) => `${req.ip}|${req.params.slug}`,
  message: 'Has enviado demasiadas candidaturas desde este dispositivo. Inténtalo más tarde.'
});

router.post('/r/:slug/apply', applyLimiter, uploadCvFile, async (req, res) => {
  const restaurant = await getPublicRestaurant(req.params.slug);
  if (!restaurant) return notFoundRestaurant(res, 'Enlace no válido.');

  const jobs = await openJobs(restaurant.id);

  const form = {
    nombre: clean(req.body.nombre, 100),
    apellidos: clean(req.body.apellidos, 100),
    email: clean(req.body.email, 120),
    telefono: clean(req.body.telefono, 30),
    doc_tipo: clean(req.body.doc_tipo, 20),
    doc_numero: clean(req.body.doc_numero, 30),
    puesto: clean(req.body.puesto, 60),
    otro_puesto: clean(req.body.otro_puesto, 80),
    disponibilidad: clean(req.body.disponibilidad, 30),
    experiencia: clean(req.body.experiencia, 3000),
    observaciones: clean(req.body.observaciones, 3000),
    consent_proceso: Boolean(req.body.consentimiento_proceso),
    consent_futuro: Boolean(req.body.consentimiento_futuro)
  };

  const fail = (errors) => renderPublic(req, res, {
    restaurant, jobs, mode: pageMode(restaurant, jobs), form, errors, status: 422
  });

  /* CSRF: em multipart é validado aqui, depois de o multer ter lido o corpo. */
  if (!verifyCsrf(req)) {
    return res.status(403).render('error', {
      status: 403,
      title: 'Sesión no válida',
      message: 'La sesión ha caducado. Vuelve a abrir la página e inténtalo de nuevo.'
    });
  }

  /* Honeypot: confirma sem gravar nada (§26). */
  if (clean(req.body.sitio_web, 200)) {
    logSecurity('spam_honeypot', `slug=${restaurant.slug}`, req.ip, {
      restaurantId: restaurant.id, userAgent: req.headers['user-agent']
    });
    return res.redirect(`/r/${restaurant.slug}/enviado`);
  }

  /* Pausado ou sem vagas: a candidatura normal não é aceite. A página mostra
   * em vez disso o formulário de futuras oportunidades (§20). */
  if (restaurant.hiring_status !== 'open' || jobs.length === 0) {
    return res.redirect(`/r/${restaurant.slug}`);
  }

  const errors = {};
  if (form.nombre.length < 2) errors.nombre = 'Indica tu nombre.';
  if (!EMAIL_RE.test(form.email)) errors.email = 'Indica un email válido.';
  if (!PHONE_RE.test(form.telefono)) errors.telefono = 'Indica un teléfono válido.';

  /* Documento: opcional por minimização de dados (§5, §29). O número não é
   * necessário para avaliar um candidato — só para o contratar. Se for
   * indicado, o tipo tem de ser válido. */
  if (form.doc_numero && !Object.prototype.hasOwnProperty.call(DOC_TYPES, form.doc_tipo)) {
    errors.doc_tipo = 'Selecciona el tipo de documento.';
  }
  if (!form.doc_numero) form.doc_tipo = '';

  const jobIds = jobs.map((j) => String(j.id));
  let job = null;
  let jobTitle = form.otro_puesto;

  if (form.puesto === 'otro') {
    if (form.otro_puesto.length < 2) errors.puesto = 'Indica el puesto al que aspiras.';
  } else if (form.puesto) {
    if (!jobIds.includes(form.puesto)) {
      errors.puesto = 'Puesto no disponible.';
    } else {
      job = jobs.find((j) => String(j.id) === form.puesto);
      jobTitle = job ? job.title : '';
    }
  } else {
    jobTitle = '';
  }

  if (!req.file) {
    if (req.uploadError === 'TAMAÑO') {
      errors.cv = `El archivo supera el límite de ${Math.round(config.maxUploadBytes / (1024 * 1024))} MB.`;
    } else if (req.uploadError === 'TIPO') {
      errors.cv = 'Solo se aceptan archivos PDF.';
    } else {
      errors.cv = 'Adjunta tu currículum en PDF.';
    }
  } else if (!isPdf(req.file.buffer)) {
    /* Extensão e MIME vêm do cliente; isto olha para o conteúdo real. */
    errors.cv = 'El archivo no es un PDF válido.';
  }

  if (!req.body.consentimiento_proceso) {
    errors.consentimiento_proceso = 'Debes aceptar el tratamiento de tus datos para participar en el proceso.';
  }

  if (Object.keys(errors).length > 0) return fail(errors);

  if (await recentlyApplied(restaurant.id, form.email)) {
    return fail({ email: 'Ya nos enviaste tu candidatura recientemente. Gracias.' });
  }

  /* Ordem: primeiro o ficheiro, depois a BD.
   *
   * O caminho do objeto é preciso para gravar a linha em `cvs`, por isso o
   * upload vem antes. Se a função falhar, o objeto é removido — fica tudo
   * como estava, sem candidatura sem CV nem CV sem candidatura. */
  let storagePath;
  try {
    storagePath = await storage.uploadCv(req.file.buffer, restaurant.id);
  } catch (err) {
    console.error('[apply] upload falhou:', err.message);
    return fail({ cv: 'No se pudo guardar el archivo. Inténtalo de nuevo.' });
  }

  let result;
  try {
    result = await rpc('submit_application', {
      restaurant_id: restaurant.id,
      first_name: form.nombre,
      last_name: form.apellidos,
      email: form.email,
      phone: form.telefono,
      doc_type: form.doc_tipo,
      doc_number: form.doc_numero,
      job_id: job ? String(job.id) : '',
      job_title: jobTitle || '',
      availability: form.disponibilidad,
      experience: form.experiencia,
      observations: form.observaciones,
      future_consent: form.consent_futuro,
      consent_version: CONSENT_VERSION,
      consent_text: consentSnapshot(form.consent_futuro),
      storage_path: storagePath,
      original_filename: String(req.file.originalname || 'cv.pdf').slice(0, 150),
      mime_type: 'application/pdf',
      size_bytes: req.file.size
    }, 'enviar candidatura');
  } catch (err) {
    await storage.removeCv(storagePath);
    console.error('[apply] erro:', err.message);
    return res.status(500).render('error', {
      status: 500, title: 'Error', message: 'No se pudo enviar la candidatura. Inténtalo de nuevo.'
    });
  }

  if (!result || !result.ok) {
    await storage.removeCv(storagePath);
    if (result && result.reason === 'duplicate') {
      return fail({ email: 'Ya nos enviaste tu candidatura recientemente. Gracias.' });
    }
    return res.status(500).render('error', {
      status: 500, title: 'Error', message: 'No se pudo enviar la candidatura. Inténtalo de nuevo.'
    });
  }

  /* Email ao restaurante: nunca com o CV em anexo, só um link para o painel
   * (§21). Não bloqueia a resposta ao candidato. */
  notifyNewApplication({
    restaurant,
    applicationId: result.application_id,
    candidate: {
      first_name: form.nombre,
      last_name: form.apellidos,
      email: form.email,
      phone: form.telefono
    },
    jobTitle
  }).catch((err) => console.error('[mailer]', err.message));

  logSecurity('candidatura_enviada', `restaurant=${restaurant.slug} app=${result.application_id}`, req.ip, {
    restaurantId: restaurant.id, userAgent: req.headers['user-agent']
  });

  /* POST-Redirect-GET: evita reenvio ao recarregar (§7). */
  res.redirect(`/r/${restaurant.slug}/enviado`);
});

/* ------------------------------------------------------------------ *
 * POST /r/:slug/interes — deixar dados quando pausado / sem vagas (§20)
 * ------------------------------------------------------------------ */
const interestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  name: 'interest',
  key: (req) => `${req.ip}|${req.params.slug}`,
  message: 'Demasiadas solicitudes. Inténtalo más tarde.'
});

router.post('/r/:slug/interes', interestLimiter, async (req, res) => {
  const restaurant = await getPublicRestaurant(req.params.slug);
  if (!restaurant) return notFoundRestaurant(res, 'Enlace no válido.');

  if (!verifyCsrf(req)) {
    return res.status(403).render('error', {
      status: 403, title: 'Sesión no válida', message: 'Vuelve a abrir la página e inténtalo de nuevo.'
    });
  }

  const form = {
    nombre: clean(req.body.nombre, 100),
    email: clean(req.body.email, 120),
    telefono: clean(req.body.telefono, 30),
    experiencia: clean(req.body.experiencia, 1000),
    consent_futuro: Boolean(req.body.consentimiento_futuro)
  };

  const errors = [];
  if (form.nombre.length < 2) errors.push('Indica tu nombre.');
  if (!EMAIL_RE.test(form.email)) errors.push('Indica un email válido.');
  if (!PHONE_RE.test(form.telefono)) errors.push('Indica un teléfono válido.');
  if (!req.body.consentimiento_futuro) {
    errors.push('Debes aceptar que conservemos tus datos para futuras oportunidades.');
  }

  if (errors.length > 0) {
    const jobs = await openJobs(restaurant.id);
    return renderPublic(req, res, {
      restaurant,
      jobs,
      mode: restaurant.hiring_status === 'open' ? 'no_jobs' : 'paused',
      form,
      errors: { general: errors },
      status: 422
    });
  }

  if (clean(req.body.sitio_web, 200)) {
    logSecurity('spam_honeypot', `slug=${restaurant.slug}`, req.ip, {
      restaurantId: restaurant.id, userAgent: req.headers['user-agent']
    });
    return res.redirect(`/r/${restaurant.slug}/enviado?tipo=futuro`);
  }

  const result = await rpc('submit_interest', {
    restaurant_id: restaurant.id,
    first_name: form.nombre,
    email: form.email,
    phone: form.telefono,
    experience: form.experiencia,
    consent_version: CONSENT_VERSION,
    consent_text: consentSnapshot(true)
  }, 'registar interesse');

  if (!result || !result.ok) {
    if (result && result.reason === 'duplicate') {
      /* Já deixou os dados há pouco: para o candidato o resultado é o mesmo. */
      return res.redirect(`/r/${restaurant.slug}/enviado?tipo=futuro`);
    }
    return res.status(500).render('error', {
      status: 500, title: 'Error', message: 'No se pudo guardar. Inténtalo de nuevo.'
    });
  }

  notifyNewApplication({
    restaurant,
    applicationId: result.application_id,
    candidate: {
      first_name: form.nombre,
      last_name: '',
      email: form.email,
      phone: form.telefono
    },
    jobTitle: 'Oportunidades futuras'
  }).catch(() => {});

  res.redirect(`/r/${restaurant.slug}/enviado?tipo=futuro`);
});

/* ------------------------------------------------------------------ *
 * GET /r/:slug/enviado — confirmação (§7)
 * ------------------------------------------------------------------ */
router.get('/r/:slug/enviado', ensureSession, async (req, res) => {
  const restaurant = await getPublicRestaurant(req.params.slug);
  if (!restaurant) return notFoundRestaurant(res, 'Enlace no válido.');
  res.render('public/sent', { restaurant, future: req.query.tipo === 'futuro' });
});

/* ------------------------------------------------------------------ *
 * GET /r/:slug/imagen/:tipo — logo ou foto do estabelecimento
 * ------------------------------------------------------------------ *
 * As imagens são públicas por destino (aparecem na página NFC) mas vivem num
 * bucket privado e são servidas por aqui. Assim o CSP continua a ser
 * `img-src 'self'` e o domínio do Supabase não precisa de ser autorizado no
 * browser.
 */
router.get('/r/:slug/imagen/:tipo', async (req, res) => {
  const field = req.params.tipo === 'foto' ? 'photo_path' : 'logo_path';

  const restaurant = await one(
    sb().from('restaurants').select(`id, ${field}`).eq('slug', String(req.params.slug || '')).eq('active', true),
    'imagem do restaurante'
  );

  if (!restaurant || !restaurant[field]) return res.status(404).end();

  const buffer = await storage.downloadImage(restaurant[field]);
  if (!buffer) return res.status(404).end();

  /* O tipo é derivado da extensão que o upload atribuiu a partir dos magic
   * bytes do conteúdo, não de nada enviado pelo cliente. */
  const ext = String(restaurant[field]).split('.').pop().toLowerCase();
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(buffer);
});

module.exports = router;
