'use strict';

const express = require('express');

const config = require('../config');
const { sb, one, many, count, run, rpc, escapeLike, logSecurity } = require('../db');
const { requireOwner } = require('../middleware/auth');
const { verifyCsrf } = require('../middleware/csrf');
const { rateLimit } = require('../middleware/rateLimit');
const { hashPassword, verifyPassword } = require('../lib/crypto');
const { uploadRestaurantImages } = require('../middleware/uploads');
const storage = require('../lib/storage');
const {
  STATUSES, STATUS_KEYS, AVAILABILITIES, ESTABLISHMENT_TYPES,
  CONTRACT_TYPES, WORK_SCHEDULES, statusLabel
} = require('../lib/statuses');

const router = express.Router();

router.use('/panel', requireOwner);

/* Nome do estabelecimento e contador de notificações para o menu. */
router.use('/panel', async (req, res, next) => {
  res.locals.restaurantName = req.user.restaurant_name || '';
  try {
    res.locals.unreadCount = await count(
      sb().from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('restaurant_id', req.user.restaurant_id)
        .eq('channel', 'panel')
        .eq('status', 'unread'),
      'notificações não lidas'
    );
  } catch {
    res.locals.unreadCount = 0;
  }
  next();
});

function clean(value, max = 200) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function restaurantId(req) {
  return req.user.restaurant_id;
}

function notFound(res) {
  return res.status(404).render('error', {
    status: 404,
    title: 'No encontrado',
    message: 'Este elemento no existe o no pertenece a tu establecimiento.'
  });
}

function invalidSession(res) {
  return res.status(403).render('error', {
    status: 403, title: 'Sesión no válida', message: 'Recarga la página.'
  });
}

/* Candidatura do restaurante da sessão, ou null.
 *
 * O filtro por restaurant_id é a proteção contra IDOR (§8): trocar o id no
 * URL para uma candidatura de outro estabelecimento devolve 404, não os
 * dados. É esta função que todas as rotas de candidatura usam. */
async function ownApplication(req) {
  return one(
    sb().from('application_list')
      .select('*')
      .eq('id', Number(req.params.id))
      .eq('restaurant_id', restaurantId(req)),
    'candidatura'
  );
}

/* Contagem por estado para o pipeline visual (§13). */
async function statusCounts(rid) {
  const rows = await many(
    sb().from('application_status_counts').select('status, n').eq('restaurant_id', rid),
    'contagem por estado'
  );

  const counts = {};
  for (const key of STATUS_KEYS) counts[key] = 0;
  for (const row of rows) {
    if (counts[row.status] !== undefined) counts[row.status] = Number(row.n) || 0;
  }
  return counts;
}

/* ================================================================== *
 * Dashboard (§11)
 * ================================================================== */
router.get('/panel', async (req, res) => {
  const rid = restaurantId(req);

  const [counts, metrics, recent] = await Promise.all([
    statusCounts(rid),
    one(sb().from('restaurant_metrics').select('*').eq('restaurant_id', rid), 'métricas'),
    many(
      sb().from('application_list')
        .select('id, status, applied_at, job_title, first_name, last_name')
        .eq('restaurant_id', rid)
        .order('applied_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(8),
      'candidaturas recentes'
    )
  ]);

  res.render('panel/dashboard', {
    counts,
    total: Number(metrics && metrics.total) || 0,
    weekCount: Number(metrics && metrics.week) || 0,
    monthCount: Number(metrics && metrics.month) || 0,
    openJobs: Number(metrics && metrics.open_jobs) || 0,
    recent,
    restaurant: {
      name: req.user.restaurant_name,
      slug: req.user.restaurant_slug,
      hiring: req.user.restaurant_hiring
    },
    query: req.query
  });
});

/* ================================================================== *
 * Lista de candidaturas com filtros (§12)
 * ================================================================== */
router.get('/panel/candidaturas', async (req, res) => {
  const rid = restaurantId(req);

  const q = clean(req.query.q, 80);
  const estado = STATUS_KEYS.includes(req.query.estado) ? req.query.estado : '';
  const puesto = /^\d+$/.test(String(req.query.puesto || '')) ? String(req.query.puesto) : '';
  const disp = Object.prototype.hasOwnProperty.call(AVAILABILITIES, req.query.disp) ? String(req.query.disp) : '';
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.desde || '')) ? req.query.desde : '';
  const hasta = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.hasta || '')) ? req.query.hasta : '';
  const favs = req.query.favs === '1';
  const ascending = req.query.orden === 'antiguas';

  let query = sb().from('application_list')
    .select('id, status, applied_at, job_title, availability, future_interest, favorite, experience, first_name, last_name, email, phone')
    .eq('restaurant_id', rid);

  /* A busca livre cobre nome, email, telefone, documento, vaga, experiência e
   * observações. A view concentra tudo em `search_text`, por isso é um único
   * ilike em vez de um OR sobre sete colunas de duas tabelas. */
  if (q) query = query.ilike('search_text', `%${escapeLike(q.toLowerCase())}%`);

  if (estado) query = query.eq('status', estado);
  if (puesto) query = query.eq('job_id', Number(puesto));
  if (disp) query = query.eq('availability', disp);
  if (desde) query = query.gte('applied_at', `${desde}T00:00:00`);
  if (hasta) query = query.lte('applied_at', `${hasta}T23:59:59.999`);
  if (favs) query = query.eq('favorite', true);

  query = query
    .order('applied_at', { ascending })
    .order('id', { ascending })
    .limit(200);

  const [rows, jobs, pipeline] = await Promise.all([
    many(query, 'lista de candidaturas'),
    many(
      sb().from('jobs').select('id, title').eq('restaurant_id', rid).order('title'),
      'vagas'
    ),
    statusCounts(rid)
  ]);

  res.render('panel/applications', {
    rows,
    jobs,
    filters: { q, estado, puesto, disp, desde, hasta, favs, orden: ascending ? 'antiguas' : 'recientes' },
    totalFiltered: rows.length,
    pipeline,
    STATUSES,
    AVAILABILITIES,
    query: req.query
  });
});

/* ================================================================== *
 * Perfil do candidato (§14)
 * ================================================================== */
router.get('/panel/candidaturas/:id', async (req, res) => {
  const application = await ownApplication(req);
  if (!application) return notFound(res);

  const rid = restaurantId(req);

  const [notes, cv, consent, history] = await Promise.all([
    many(
      sb().from('application_notes')
        .select('id, body, created_at, user_id, users(full_name)')
        .eq('application_id', application.id)
        .eq('restaurant_id', rid)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false }),
      'notas'
    ),
    one(
      sb().from('cvs').select('*').eq('application_id', application.id).eq('restaurant_id', rid),
      'cv'
    ),
    one(
      sb().from('consents').select('*').eq('application_id', application.id),
      'consentimentos'
    ),
    many(
      sb().from('application_history')
        .select('id, event, old_status, new_status, detail, created_at, user_id, users(full_name)')
        .eq('application_id', application.id)
        .eq('restaurant_id', rid)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false }),
      'histórico'
    )
  ]);

  /* As views do EJS esperam `author` como texto simples. */
  const withAuthor = (rows) => rows.map((r) => ({
    ...r,
    author: (r.users && r.users.full_name) || ''
  }));

  res.render('panel/application', {
    a: application,
    notes: withAuthor(notes),
    history: withAuthor(history),
    cv,
    consent,
    STATUSES,
    AVAILABILITIES,
    query: req.query
  });
});

/* ================================================================== *
 * Alterar estado (§13)
 * ================================================================== */
router.post('/panel/candidaturas/:id/estado', async (req, res) => {
  if (!verifyCsrf(req)) return invalidSession(res);

  const id = Number(req.params.id);
  const status = clean(req.body.status, 40);

  if (!STATUS_KEYS.includes(status)) {
    return res.redirect(`/panel/candidaturas/${id}?err=` + encodeURIComponent('Estado no válido.'));
  }

  /* A posse é verificada dentro da função: não há janela entre validar e
   * escrever, e o histórico fica no mesmo commit que a alteração.
   * O texto do histórico é composto na view a partir de old_status/new_status,
   * para não congelar aqui as etiquetas em espanhol. */
  const result = await rpc('set_application_status', {
    application_id: id,
    restaurant_id: restaurantId(req),
    user_id: req.user.id,
    status
  }, 'alterar estado');

  if (!result || !result.ok) return notFound(res);

  if (result.old_status !== result.new_status) {
    logSecurity('estado_cambiado', `app=${id} ${result.old_status} → ${status}`, req.ip, {
      userId: req.user.id, restaurantId: restaurantId(req)
    });
  }

  res.redirect(`/panel/candidaturas/${id}?ok=` +
    encodeURIComponent(`Estado actualizado: ${statusLabel(status)}`));
});

/* ================================================================== *
 * Favorito (§16)
 * ================================================================== */
router.post('/panel/candidaturas/:id/favorito', async (req, res) => {
  if (!verifyCsrf(req)) return invalidSession(res);

  const id = Number(req.params.id);

  const result = await rpc('toggle_favorite', {
    application_id: id,
    restaurant_id: restaurantId(req),
    user_id: req.user.id
  }, 'favorito');

  if (!result || !result.ok) return notFound(res);

  res.redirect(`/panel/candidaturas/${id}?ok=` + encodeURIComponent(
    result.favorite ? 'Candidato marcado como favorito.' : 'Favorito retirado.'
  ));
});

/* ================================================================== *
 * Notas internas (§17)
 * ================================================================== */
router.post('/panel/candidaturas/:id/notas', rateLimit({
  windowMs: 10 * 60 * 1000, max: 30, name: 'notes', key: (req) => String(req.user && req.user.id)
}), async (req, res) => {
  if (!verifyCsrf(req)) return invalidSession(res);

  const application = await ownApplication(req);
  if (!application) return notFound(res);

  const body = clean(req.body.nota, 2000);
  if (body.length < 2) {
    return res.redirect(`/panel/candidaturas/${application.id}?err=` + encodeURIComponent('La nota está vacía.'));
  }

  await run(
    sb().from('application_notes').insert({
      application_id: application.id,
      restaurant_id: restaurantId(req),
      user_id: req.user.id,
      body
    }),
    'guardar nota'
  );

  res.redirect(`/panel/candidaturas/${application.id}?ok=` + encodeURIComponent('Nota guardada.'));
});

router.post('/panel/candidaturas/:id/notas/:noteId/eliminar', async (req, res) => {
  if (!verifyCsrf(req)) return invalidSession(res);

  const application = await ownApplication(req);
  if (!application) return notFound(res);

  await run(
    sb().from('application_notes')
      .delete()
      .eq('id', Number(req.params.noteId))
      .eq('application_id', application.id)
      .eq('restaurant_id', restaurantId(req)),
    'eliminar nota'
  );

  res.redirect(`/panel/candidaturas/${application.id}?ok=` + encodeURIComponent('Nota eliminada.'));
});

/* ================================================================== *
 * Eliminar candidatura, com o CV
 * ================================================================== */
router.post('/panel/candidaturas/:id/eliminar', async (req, res) => {
  if (!verifyCsrf(req)) return invalidSession(res);

  const id = Number(req.params.id);
  const rid = restaurantId(req);

  const result = await rpc('delete_application', {
    application_id: id,
    restaurant_id: rid
  }, 'eliminar candidatura');

  if (!result || !result.ok) return notFound(res);

  /* A função devolve o caminho do objeto porque não tem acesso ao Storage.
   * O ficheiro é apagado aqui, depois de a candidatura já não existir. */
  if (result.storage_path) await storage.removeCv(result.storage_path);

  logSecurity('candidatura_eliminada', `app=${id} rid=${rid}`, req.ip, {
    userId: req.user.id, restaurantId: rid
  });

  res.redirect('/panel/candidaturas?ok=' + encodeURIComponent('Candidatura eliminada junto con su CV.'));
});

/* ================================================================== *
 * CV: visualização e download (§14, §24)
 * ================================================================== */
/* O bucket é privado e não existe URL pública. O ficheiro só sai daqui depois
 * de confirmado que: a sessão é válida (requireOwner), o CV existe, e
 * pertence ao restaurante da sessão. */
router.get('/panel/cv/:id', async (req, res) => {
  const cv = await one(
    sb().from('cvs')
      .select('*')
      .eq('id', Number(req.params.id))
      .eq('restaurant_id', restaurantId(req)),
    'cv'
  );

  if (!cv) return notFound(res);

  const buffer = await storage.downloadCv(cv.storage_path);
  if (!buffer) {
    return res.status(404).render('error', {
      status: 404, title: 'CV no disponible', message: 'El archivo ya no existe.'
    });
  }

  const asciiName = String(cv.original_filename)
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["\\]/g, '_') || 'cv.pdf';
  const download = req.query.descargar === '1';

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition',
    `${download ? 'attachment' : 'inline'}; filename="${asciiName}"; ` +
    `filename*=UTF-8''${encodeURIComponent(cv.original_filename)}`);

  res.end(buffer);
});

/* ================================================================== *
 * Vagas (§19)
 * ================================================================== */
router.get('/panel/vagas', async (req, res) => {
  const jobs = await many(
    sb().from('job_list')
      .select('*')
      .eq('restaurant_id', restaurantId(req))
      .order('active', { ascending: false })
      .order('title'),
    'vagas'
  );

  res.render('panel/jobs', { jobs, query: req.query });
});

function jobForm(body) {
  const pick = (table, value) =>
    Object.prototype.hasOwnProperty.call(table, value) ? String(value) : '';

  return {
    title: clean(body.titulo, 80),
    description: clean(body.descripcion, 2000),
    requirements: clean(body.requisitos, 2000),
    availability: pick(AVAILABILITIES, body.disponibilidad),
    contract_type: pick(CONTRACT_TYPES, body.contrato),
    work_schedule: pick(WORK_SCHEDULES, body.jornada)
  };
}

router.post('/panel/vagas/crear', rateLimit({
  windowMs: 10 * 60 * 1000, max: 20, name: 'jobs-new', key: (req) => String(req.user && req.user.id)
}), async (req, res) => {
  if (!verifyCsrf(req)) return invalidSession(res);

  const f = jobForm(req.body);
  if (f.title.length < 2) {
    return res.redirect('/panel/vagas?err=' + encodeURIComponent('Indica el título de la vacante.'));
  }

  await run(
    sb().from('jobs').insert({ restaurant_id: restaurantId(req), ...f }),
    'criar vaga'
  );

  res.redirect('/panel/vagas?ok=' + encodeURIComponent('Vacante creada.'));
});

router.post('/panel/vagas/:id/toggle', async (req, res) => {
  if (!verifyCsrf(req)) return invalidSession(res);

  await rpc('toggle_job_active', {
    job_id: Number(req.params.id),
    restaurant_id: restaurantId(req)
  }, 'ativar/desativar vaga');

  res.redirect('/panel/vagas?ok=' + encodeURIComponent('Vacante actualizada.'));
});

router.post('/panel/vagas/:id/editar', async (req, res) => {
  if (!verifyCsrf(req)) return invalidSession(res);

  const f = jobForm(req.body);
  if (f.title.length < 2) {
    return res.redirect('/panel/vagas?err=' + encodeURIComponent('Indica el título de la vacante.'));
  }

  await run(
    sb().from('jobs')
      .update(f)
      .eq('id', Number(req.params.id))
      .eq('restaurant_id', restaurantId(req)),
    'editar vaga'
  );

  res.redirect('/panel/vagas?ok=' + encodeURIComponent('Vacante actualizada.'));
});

/* Eliminar a vaga não apaga candidaturas: job_id fica null e o título
 * continua guardado em applications.job_title. */
router.post('/panel/vagas/:id/eliminar', async (req, res) => {
  if (!verifyCsrf(req)) return invalidSession(res);

  const id = Number(req.params.id);
  const result = await rpc('delete_job', {
    job_id: id,
    restaurant_id: restaurantId(req)
  }, 'eliminar vaga');

  if (!result || !result.ok) {
    return res.redirect('/panel/vagas?err=' + encodeURIComponent('Vacante no encontrada.'));
  }

  logSecurity('vacante_eliminada', `job=${id} ${result.title}`, req.ip, {
    userId: req.user.id, restaurantId: restaurantId(req)
  });

  res.redirect('/panel/vagas?ok=' +
    encodeURIComponent('Vacante eliminada. Las candidaturas asociadas se conservan.'));
});

/* ================================================================== *
 * Pausar / ativar candidaturas (§20)
 * ================================================================== */
/* A etiqueta NFC não muda: a URL continua a funcionar e é o backend que
 * decide o que mostrar. */
router.post('/panel/contratacion', async (req, res) => {
  if (!verifyCsrf(req)) return invalidSession(res);

  const action = clean(req.body.accion, 20);
  if (!['pausar', 'activar'].includes(action)) {
    return res.redirect('/panel?err=' + encodeURIComponent('Acción no válida.'));
  }

  const status = action === 'pausar' ? 'paused' : 'open';

  await run(
    sb().from('restaurants').update({ hiring_status: status }).eq('id', restaurantId(req)),
    'pausar/ativar contratação'
  );

  logSecurity(action === 'pausar' ? 'candidaturas_pausadas' : 'candidaturas_activadas',
    `rid=${restaurantId(req)}`, req.ip, {
      userId: req.user.id, restaurantId: restaurantId(req)
    });

  const msg = status === 'paused'
    ? 'Candidaturas pausadas. La página NFC seguirá funcionando.'
    : 'Candidaturas activadas.';

  res.redirect(`/panel?ok=${encodeURIComponent(msg)}&estado=${status}`);
});

/* ================================================================== *
 * Dados do restaurante + URL NFC (§33)
 * ================================================================== */
router.get('/panel/restaurante', async (req, res) => {
  const restaurant = await one(
    sb().from('restaurants').select('*').eq('id', restaurantId(req)),
    'restaurante'
  );

  if (!restaurant) return notFound(res);

  res.render('panel/restaurant', {
    restaurant,
    nfcUrl: `${config.appUrl}/r/${restaurant.slug}`,
    query: req.query
  });
});

router.post('/panel/restaurante', uploadRestaurantImages, async (req, res) => {
  if (!verifyCsrf(req)) return invalidSession(res);

  const errParam = (msg) => '/panel/restaurante?err=' + encodeURIComponent(msg);

  if (req.uploadError) {
    const msg = req.uploadError === 'TAMAÑO_IMAGEN'
      ? `La imagen supera el límite de ${Math.round(config.maxImageBytes / (1024 * 1024))} MB.`
      : req.uploadError === 'IMAGEN_INVALIDA'
        ? 'El archivo no es una imagen válida (solo PNG, JPG o WEBP).'
        : 'Solo se aceptan imágenes PNG, JPG o WEBP.';
    return res.redirect(errParam(msg));
  }

  const form = {
    name: clean(req.body.name, 100),
    commercial_name: clean(req.body.commercial_name, 100),
    owner_name: clean(req.body.owner_name, 100),
    email: clean(req.body.email, 120),
    phone: clean(req.body.telefono, 30),
    address: clean(req.body.direccion, 200),
    postal_code: clean(req.body.cp, 10),
    city: clean(req.body.ciudad, 100),
    establishment_type: clean(req.body.establecimiento, 40),
    description: clean(req.body.descripcion, 1500)
  };

  const errors = {};
  if (form.name.length < 2) errors.name = 'Indica el nombre del establecimiento.';
  if (form.owner_name.length < 2) errors.owner_name = 'Indica el responsable.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email)) errors.email = 'Indica un email válido.';
  if (!/^[\d\s()+-]{6,20}$/.test(form.phone)) errors.phone = 'Indica un teléfono válido.';
  if (form.city.length < 2) errors.city = 'Indica la ciudad.';
  if (form.postal_code && !/^\d{5}$/.test(form.postal_code)) errors.postal_code = 'El código postal debe tener 5 dígitos.';
  if (!Object.prototype.hasOwnProperty.call(ESTABLISHMENT_TYPES, form.establishment_type)) {
    errors.establishment_type = 'Selecciona el tipo de establecimiento.';
  }

  if (Object.keys(errors).length > 0) {
    return res.redirect(errParam(Object.values(errors)[0]));
  }

  const rid = restaurantId(req);
  const current = await one(
    sb().from('restaurants').select('logo_path, photo_path').eq('id', rid),
    'restaurante atual'
  );

  if (!current) return res.redirect(errParam('Establecimiento no encontrado.'));

  /* Imagens novas primeiro: se o upload falhar, nada é alterado na BD. */
  const files = req.imageFiles || {};
  let newLogo = '';
  let newPhoto = '';

  try {
    if (files.logo) newLogo = await storage.uploadImage(files.logo.buffer, rid, 'logo', files.logo.mime);
    if (files.foto) newPhoto = await storage.uploadImage(files.foto.buffer, rid, 'foto', files.foto.mime);
  } catch (err) {
    await storage.removeImage([newLogo, newPhoto]);
    console.error('[restaurante] upload de imagem falhou:', err.message);
    return res.redirect(errParam('No se pudo guardar la imagen. Inténtalo de nuevo.'));
  }

  const clearLogo = req.body.borrar_logo === '1';
  const clearPhoto = req.body.borrar_foto === '1';

  const updates = {
    ...form,
    logo_path: newLogo || (clearLogo ? '' : current.logo_path),
    photo_path: newPhoto || (clearPhoto ? '' : current.photo_path)
  };

  try {
    await run(sb().from('restaurants').update(updates).eq('id', rid), 'guardar restaurante');
  } catch (err) {
    await storage.removeImage([newLogo, newPhoto]);
    throw err;
  }

  /* Só agora se apagam as imagens que deixaram de ser referenciadas. */
  const orphans = [
    current.logo_path && current.logo_path !== updates.logo_path ? current.logo_path : '',
    current.photo_path && current.photo_path !== updates.photo_path ? current.photo_path : ''
  ];
  await storage.removeImage(orphans);

  res.redirect('/panel/restaurante?ok=' + encodeURIComponent('Datos guardados.'));
});

/* ================================================================== *
 * Configurações: email de acesso e senha
 * ================================================================== */
router.get('/panel/configuracion', (req, res) => {
  res.render('panel/settings', { userEmail: req.user.email, query: req.query });
});

router.post('/panel/configuracion', rateLimit({
  windowMs: 15 * 60 * 1000, max: 10, name: 'settings', key: (req) => String(req.user && req.user.id)
}), async (req, res) => {
  if (!verifyCsrf(req)) return invalidSession(res);

  const err = (msg) => res.redirect('/panel/configuracion?err=' + encodeURIComponent(msg));

  const newEmail = clean(req.body.email, 120);
  const currentPassword = String(req.body.password_actual || '');
  const newPassword = String(req.body.password_nuevo || '').slice(0, 200);
  const confirmPassword = String(req.body.password_repetir || '').slice(0, 200);

  if (!verifyPassword(currentPassword, req.user.password_hash)) {
    return err('La contraseña actual es incorrecta.');
  }

  const doEmail = newEmail && newEmail.toLowerCase() !== String(req.user.email).toLowerCase();
  const doPassword = newPassword.length > 0;

  if (doEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(newEmail)) {
    return err('Email no válido.');
  }

  if (doEmail) {
    const taken = await one(
      sb().from('users').select('id').eq('email', newEmail).neq('id', req.user.id),
      'email em uso'
    );
    if (taken) return err('Ya existe una cuenta con ese email.');
  }

  if (doPassword) {
    if (newPassword.length < 8) return err('La nueva contraseña debe tener al menos 8 caracteres.');
    if (newPassword !== confirmPassword) return err('Las contraseñas nuevas no coinciden.');
  }

  const updates = {};
  if (doEmail) updates.email = newEmail;
  if (doPassword) updates.password_hash = hashPassword(newPassword);

  if (Object.keys(updates).length > 0) {
    await run(sb().from('users').update(updates).eq('id', req.user.id), 'atualizar conta');
  }

  logSecurity('configuracion_actualizada', `user=${req.user.id}`, req.ip, {
    userId: req.user.id, restaurantId: restaurantId(req)
  });

  res.redirect('/panel/configuracion?ok=' + encodeURIComponent('Configuración actualizada.'));
});

/* ================================================================== *
 * Notificações (§21)
 * ================================================================== */
router.get('/panel/notificaciones', async (req, res) => {
  const rows = await many(
    sb().from('notifications')
      .select('id, type, channel, status, detail, read_at, created_at, application_id, applications(job_title, candidates(first_name, last_name))')
      .eq('restaurant_id', restaurantId(req))
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(100),
    'notificações'
  );

  const notifications = rows.map((n) => {
    const app = n.applications || null;
    const cand = (app && app.candidates) || null;
    return {
      ...n,
      candidateName: cand ? `${cand.first_name} ${cand.last_name || ''}`.trim() : '',
      jobTitle: (app && app.job_title) || ''
    };
  });

  res.render('panel/notifications', { notifications, query: req.query });
});

router.post('/panel/notificaciones/marcar-leidas', async (req, res) => {
  if (!verifyCsrf(req)) return invalidSession(res);

  await rpc('mark_notifications_read', { restaurant_id: restaurantId(req) }, 'marcar lidas');

  const back = typeof req.body.volver === 'string' && req.body.volver.startsWith('/')
    ? req.body.volver
    : '/panel';

  res.redirect(back);
});

module.exports = router;
