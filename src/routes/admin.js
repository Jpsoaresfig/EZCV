'use strict';

const express = require('express');
const QRCode = require('qrcode');

const config = require('../config');
const { QR_OPTIONS } = require('../lib/qr');
const { sb, one, many, count, rpc, logSecurity } = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { verifyCsrf } = require('../middleware/csrf');

const router = express.Router();
router.use('/admin', requireAdmin);

/* Ids sempre inteiros positivos: /admin/usuarios/abc/bloquear dava 500. */
router.param('id', (req, res, next, value) => {
  if (!/^\d{1,18}$/.test(String(value))) {
    return res.status(404).render('error', { status: 404, title: 'No encontrado', message: 'Página no disponible.' });
  }
  next();
});

function clean(value, max = 200) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function num(v) {
  return Number(v || 0);
}

function invalidSession(res) {
  return res.status(403).render('error', {
    status: 403, title: 'Sesión no válida', message: 'Recarga la página.'
  });
}

/* O administrador da plataforma vê números agregados e metadados de
 * estabelecimentos — nunca candidaturas, CVs ou dados de candidatos (§22).
 * Não existe aqui nenhuma rota que leia `candidates`, `applications` ou o
 * bucket `cvs`. Os acessos a listas que contêm dados pessoais de
 * utilizadores ficam registados nos logs de segurança. */

router.get('/admin', async (req, res) => {
  const [metrics, restaurants, failed] = await Promise.all([
    one(sb().from('platform_metrics').select('*'), 'métricas da plataforma'),
    many(
      sb().from('admin_restaurant_list')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100),
      'restaurantes'
    ),
    many(
      sb().from('notifications')
        .select('*')
        .eq('status', 'failed')
        .order('id', { ascending: false })
        .limit(10),
      'notificações falhadas'
    )
  ]);

  res.render('admin/dashboard', {
    metrics: {
      restaurants: num(metrics && metrics.restaurants),
      restaurantsActive: num(metrics && metrics.restaurants_active),
      applications: num(metrics && metrics.applications),
      applications7d: num(metrics && metrics.applications_7d),
      users: num(metrics && metrics.users),
      usersBlocked: num(metrics && metrics.users_blocked),
      jobs: num(metrics && metrics.jobs),
      notificationsFailed: num(metrics && metrics.notifications_failed)
    },
    restaurants,
    failed,
    query: req.query
  });
});

router.get('/admin/usuarios', async (req, res) => {
  const users = await many(
    sb().from('admin_user_list').select('*').order('created_at', { ascending: false }),
    'utilizadores'
  );

  /* Esta lista contém emails e nomes de pessoas: o acesso é auditoria, não
   * telemetria — por isso é esperado com await antes de a página ser
   * servida, em vez de ficar ao critério do agendador (§22). */
  await logSecurity('admin_lista_usuarios', `n=${users.length}`, req.ip, {
    userId: req.user.id, userAgent: req.headers['user-agent']
  });

  res.render('admin/users', { users, query: req.query });
});

router.get('/admin/logs', async (req, res) => {
  const event = clean(req.query.event, 40);

  let query = sb().from('security_logs')
    .select('*')
    .order('id', { ascending: false })
    .limit(200);

  if (event) query = query.eq('event', event);

  const [logs, all] = await Promise.all([
    many(query, 'logs de segurança'),
    many(sb().from('security_logs').select('event').limit(2000), 'eventos distintos')
  ]);

  const events = [...new Set(all.map((r) => r.event))].sort();

  res.render('admin/logs', { logs, events, filters: { event }, query: req.query });
});

router.post('/admin/restaurantes/:id/toggle', async (req, res) => {
  if (!verifyCsrf(req)) return invalidSession(res);

  const id = Number(req.params.id);
  const result = await rpc('toggle_restaurant_active', { restaurant_id: id }, 'ativar restaurante');

  if (!result || !result.ok) {
    return res.redirect('/admin?err=' + encodeURIComponent('Establecimiento no encontrado.'));
  }

  logSecurity('restaurante_toggle', `${result.name} → active=${result.active}`, req.ip, {
    userId: req.user.id, restaurantId: id, userAgent: req.headers['user-agent']
  });

  res.redirect('/admin?ok=' +
    encodeURIComponent(`${result.name}: ${result.active ? 'activado' : 'desactivado'}`));
});

router.post('/admin/usuarios/:id/bloquear', async (req, res) => {
  if (!verifyCsrf(req)) return invalidSession(res);

  const id = Number(req.params.id);

  if (id === req.user.id) {
    return res.redirect('/admin/usuarios?err=' + encodeURIComponent('No puedes bloquearte a ti mismo.'));
  }

  /* A função não bloqueia administradores e, ao bloquear, termina as sessões
   * do utilizador no mesmo commit. */
  const result = await rpc('toggle_user_blocked', { user_id: id }, 'bloquear utilizador');

  if (!result || !result.ok) {
    return res.redirect('/admin/usuarios?err=' + encodeURIComponent('Usuario no encontrado.'));
  }

  logSecurity('usuario_bloqueo', `${result.email} → blocked=${result.blocked}`, req.ip, {
    userId: req.user.id, userAgent: req.headers['user-agent']
  });

  res.redirect('/admin/usuarios?ok=' +
    encodeURIComponent(`${result.email}: ${result.blocked ? 'bloqueado' : 'desbloqueado'}`));
});

/* Reportes dos negócios e erros do servidor (0009).
 *
 * Os reportes são texto livre escrito pelo dono do negócio: apesar do aviso
 * no formulário, podem trazer dados pessoais. Por isso o acesso fica
 * registado, como a lista de utilizadores (§22). Os erros guardam só dados
 * técnicos, já redigidos em src/lib/errors.js. */
const REPORT_STATUSES = ['nuevo', 'revisando', 'resuelto'];

router.get('/admin/reportes', async (req, res) => {
  const estado = REPORT_STATUSES.includes(req.query.estado) ? req.query.estado : '';

  let reportsQuery = sb().from('problem_reports')
    .select('id, kind, message, page, error_ref, user_agent, status, created_at, restaurants(name, commercial_name), users(email)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (estado) reportsQuery = reportsQuery.eq('status', estado);

  const [reports, errors, openCount] = await Promise.all([
    many(reportsQuery, 'reportes'),
    many(
      sb().from('error_events')
        .select('id, ref, method, path, message, stack, created_at, restaurants(name, commercial_name)')
        .order('created_at', { ascending: false })
        .limit(100),
      'erros do servidor'
    ),
    count(sb().from('problem_reports').select('id', { count: 'exact', head: true }).neq('status', 'resuelto'), 'reportes abertos')
  ]);

  await logSecurity('admin_lista_reportes', `n=${reports.length}`, req.ip, {
    userId: req.user.id, userAgent: req.headers['user-agent']
  });

  const reportedRefs = new Set(reports.map((r) => r.error_ref).filter(Boolean));
  res.render('admin/reports', { reports, errors, openCount, estado, reportedRefs, query: req.query });
});

router.post('/admin/reportes/:id/estado', async (req, res) => {
  if (!verifyCsrf(req)) return invalidSession(res);

  const status = REPORT_STATUSES.includes(req.body.status) ? req.body.status : null;
  if (!status) return res.redirect('/admin/reportes?err=' + encodeURIComponent('Estado no válido.'));

  const updated = await many(
    sb().from('problem_reports').update({ status }).eq('id', Number(req.params.id)).select('id'),
    'estado do reporte'
  );
  if (!updated.length) return res.redirect('/admin/reportes?err=' + encodeURIComponent('Reporte no encontrado.'));

  res.redirect('/admin/reportes?ok=' + encodeURIComponent(`Reporte #${req.params.id}: ${status}`) + '#r-' + req.params.id);
});

/* Divulgação: o QR único dos cartões que o admin entrega aos negócios.
 *
 * Aponta para a página pública /conoce, que é estável — o conteúdo pode
 * mudar sem invalidar os cartões já impressos. O QR em si deixa de ser
 * secreto quando é impresso; o que fica protegido (requireAdmin, acima, em
 * todo o /admin) é a ferramenta de ver, descarregar e imprimir. Não há
 * nenhuma rota pública que gere QR a partir de um URL arbitrário: o
 * conteúdo é sempre o mesmo, montado aqui a partir de APP_URL. */
function promoUrl() {
  return `${config.appUrl}/conoce`;
}

router.get('/admin/divulgacion', async (req, res) => {
  const url = promoUrl();
  const qrSvg = await QRCode.toString(url, { ...QR_OPTIONS, type: 'svg' });
  /* Em localhost os cartões levariam um URL que não abre no telemóvel de
   * ninguém: avisar antes de imprimir. */
  const localUrl = /^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(url) || !url.startsWith('https://');
  res.render('admin/promo', { url, qrSvg, localUrl });
});

router.get('/admin/divulgacion/qr.png', async (req, res) => {
  /* 2048 px: nítido num cartão ou num cartaz A5 a 300 dpi. */
  const png = await QRCode.toBuffer(promoUrl(), { ...QR_OPTIONS, type: 'png', width: 2048 });
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Disposition', 'attachment; filename="fichame-qr-conoce.png"');
  res.send(png);
});

router.get('/admin/divulgacion/qr.svg', async (req, res) => {
  /* Vetorial, para gráficas: escala sem perder qualidade. */
  const svg = await QRCode.toString(promoUrl(), { ...QR_OPTIONS, type: 'svg' });
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="fichame-qr-conoce.svg"');
  res.send(svg);
});

module.exports = router;
