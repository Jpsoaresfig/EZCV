'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const config = require('./config');
const { loadSession } = require('./middleware/session');
const { csrfProtection } = require('./middleware/csrf');
const { rateLimit } = require('./middleware/rateLimit');
const { STATUSES, AVAILABILITIES, DOC_TYPES, ESTABLISHMENT_TYPES, CONTRACT_TYPES, WORK_SCHEDULES, statusLabel, availabilityLabel, docTypeLabel, historyLabel } = require('./lib/statuses');
const { icon, initials } = require('./lib/icons');

/* O PostgREST devolve timestamptz como ISO 8601 com fuso ("…+00:00"), que o
 * Date do JS lê diretamente. O ramo que acrescenta 'Z' cobre valores sem
 * fuso, e o instanceof cobre um Date já construído. */
function parseDbDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const normalized = String(value).replace(' ', 'T');
  const d = new Date(/Z|[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : normalized + 'Z');
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtDate(value) {
  const d = parseDbDate(value);
  if (!d) return String(value || '');
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function fmtRelative(value) {
  const d = parseDbDate(value);
  if (!d) return '';
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((startToday - startDate) / 86400000);
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  return fmtDate(value);
}

function fmtSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/* Versão dos assets: hash do conteúdo de style.css e app.js.
 *
 * Os ficheiros estáticos são servidos com cache longa, o que é correto para
 * desempenho mas faz o browser manter o CSS antigo depois de um deploy — e
 * HTML novo com CSS antigo é uma página sem estilos. Juntar o hash ao URL
 * (`style.css?v=abc123`) resolve: o URL muda quando o conteúdo muda, e o
 * browser pede o ficheiro novo sem precisar de recarregamento forçado.
 */
function assetVersion() {
  const files = [
    path.join(__dirname, '..', 'public', 'css', 'style.css'),
    path.join(__dirname, '..', 'public', 'js', 'app.js'),
    path.join(__dirname, '..', 'public', 'img', 'logo.svg')
  ];

  const hash = crypto.createHash('sha1');
  for (const file of files) {
    try {
      hash.update(fs.readFileSync(file));
    } catch {
      /* Ficheiro em falta: o hash fica diferente, o que é o comportamento
       * desejado — não vale a pena falhar o arranque por isto. */
      hash.update(file);
    }
  }
  return hash.digest('hex').slice(0, 10);
}

function createApp() {
  const app = express();
  app.set('trust proxy', config.trustProxy);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.set('x-powered-by', false);

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; " +
      "font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    next();
  });

  /* Os ficheiros estáticos vêm antes da sessão de propósito: carregar a sessão
   * custa agora uma ida à rede até ao Supabase, e um CSS não precisa de
   * sessão nem de CSRF. Deixá-los depois multiplicaria essa latência por cada
   * asset da página.
   *
   * A cache é longa porque os URLs levam o hash do conteúdo (ver
   * assetVersion): quando o CSS muda, muda o URL. */
  app.use(express.static(path.join(__dirname, '..', 'public'), {
    maxAge: '30d',
    etag: true
  }));

  app.use(loadSession);
  app.use((req, res, next) => {
    res.locals.csrfToken = req.session ? req.session.csrfToken : '';
    res.locals.path = req.path || '';
    next();
  });
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(express.json({ limit: '50kb' }));
  app.use(csrfProtection);
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 3000,
    name: 'global',
    message: 'Demasiadas solicitudes. Espera unos minutos.'
  }));

  app.locals.STATUSES = STATUSES;
  app.locals.AVAILABILITIES = AVAILABILITIES;
  app.locals.DOC_TYPES = DOC_TYPES;
  app.locals.ESTABLISHMENT_TYPES = ESTABLISHMENT_TYPES;
  app.locals.CONTRACT_TYPES = CONTRACT_TYPES;
  app.locals.WORK_SCHEDULES = WORK_SCHEDULES;
  app.locals.statusLabel = statusLabel;
  app.locals.availabilityLabel = availabilityLabel;
  app.locals.docTypeLabel = docTypeLabel;
  app.locals.historyLabel = historyLabel;
  app.locals.fmtDate = fmtDate;
  app.locals.fmtRelative = fmtRelative;
  app.locals.fmtSize = fmtSize;
  app.locals.icon = icon;
  app.locals.initials = initials;
  app.locals.maxUploadMb = Math.round(config.maxUploadBytes / (1024 * 1024));
  app.locals.maxImgMb = Math.round(config.maxImageBytes / (1024 * 1024));
  app.locals.assetV = assetVersion();

  app.use('/', require('./routes/legal'));
  app.use('/', require('./routes/public'));
  app.use('/', require('./routes/auth'));
  app.use('/', require('./routes/panel'));
  app.use('/', require('./routes/admin'));

  app.use((req, res) => {
    res.status(404).render('error', {
      status: 404, title: 'Página no encontrada', message: 'La página que buscas no existe.'
    });
  });

  app.use((err, req, res, _next) => {
    console.error('[erro]', err);
    if (res.headersSent) return;
    res.status(500).render('error', {
      status: 500, title: 'Error interno', message: 'Algo salió mal. Inténtalo de nuevo.'
    });
  });

  return app;
}

module.exports = { createApp };
