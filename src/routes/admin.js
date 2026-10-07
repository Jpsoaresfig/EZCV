'use strict';

const express = require('express');

const { sb, one, many, rpc, logSecurity } = require('../db');
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

module.exports = router;
