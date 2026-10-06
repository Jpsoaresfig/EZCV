'use strict';

/* Teste E2E: sobe o servidor e valida o fluxo completo contra o Supabase real.
 * Executar: npm test
 *
 * Isolamento: cada execução gera um prefixo único (EZCV_TEST_PREFIX) que fica
 * gravado em restaurants.test_prefix. No fim, purge_test_data apaga tudo o que
 * ficou marcado com esse prefixo, incluindo os objetos no Storage. Nada toca
 * em dados que não tenham sido criados por esta execução.
 *
 * Como os dados vivem num Supabase partilhado, os nomes dos estabelecimentos
 * levam o prefixo e o slug é lido do painel em vez de ser assumido: duas
 * execuções seguidas nunca colidem.
 */

const { spawn, spawnSync } = require('child_process');
const path = require('path');
const crypto = require('crypto');

const { createClient } = require('@supabase/supabase-js');

/* Importado pelo efeito secundário de carregar o .env para process.env, que
 * é o que o cliente de limpeza e o servidor filho precisam. */
require('../src/config');

const PORT = process.env.TEST_PORT || '3456';
const BASE = `http://127.0.0.1:${PORT}`;
const root = path.join(__dirname, '..');

/* Prefixo só com letras e dígitos: entra em slugs, que são validados por
 * constraint no Postgres. */
const P = 't' + crypto.randomBytes(4).toString('hex');

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, extra = '') {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    failures.push(name + (extra ? ` — ${extra}` : ''));
    console.log(`  ✗ ${name} ${extra}`);
  }
}

class Jar {
  constructor() { this.map = new Map(); }

  header() {
    return [...this.map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  absorb(res) {
    const cookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of cookies) {
      const pair = c.split(';')[0];
      const idx = pair.indexOf('=');
      if (idx > 0) {
        const name = pair.slice(0, idx).trim();
        const value = pair.slice(idx + 1).trim();
        if (value === '' || /expires=Thu, 01 Jan 1970/i.test(c)) this.map.delete(name);
        else this.map.set(name, value);
      }
    }
  }
}

async function call(method, url, { jar, body, headers = {}, redirect = 'manual' } = {}) {
  const opts = { method, redirect, headers: { ...headers } };
  if (jar) opts.headers.cookie = jar.header();
  if (body instanceof URLSearchParams || typeof body === 'string') {
    opts.headers['content-type'] = 'application/x-www-form-urlencoded';
    opts.body = String(body);
  } else if (body) {
    opts.body = body; // FormData: o undici define o content-type
  }
  const res = await fetch(BASE + url, opts);
  if (jar) jar.absorb(res);
  return res;
}

function csrfOf(html) {
  const m = String(html).match(/name="_csrf" value="([^"]+)"/);
  return m ? m[1] : '';
}

function form(data) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined && v !== null) p.append(k, String(v));
  }
  return p;
}

const PDF = Buffer.concat([
  Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n', 'latin1'),
  Buffer.from('trailer\n<< >>\n%%EOF\n', 'latin1')
]);

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

function applyBody(jar, csrf, overrides = {}) {
  const { __file, ...rest } = overrides;
  const fd = new FormData();
  const fields = Object.assign({
    nombre: 'Juan',
    apellidos: 'García',
    email: 'juan.garcia@example.com',
    telefono: '600111222',
    doc_tipo: 'nie',
    doc_numero: 'X1234567A',
    puesto: '',
    otro_puesto: '',
    disponibilidad: 'tarde',
    experiencia: '2 años como camarero',
    observaciones: 'Disponible por las tardes.',
    consentimiento_proceso: '1',
    sitio_web: '',
    _csrf: csrf
  }, rest);

  for (const [k, v] of Object.entries(fields)) if (v !== undefined) fd.append(k, v);

  const file = __file || { name: 'CV_Juan_Garcia.pdf', type: 'application/pdf', data: PDF };
  fd.append('cv', new Blob([file.data], { type: file.type }), file.name);
  return fd;
}

async function text(res) { return res.text(); }

async function waitForServer() {
  for (let i = 0; i < 75; i++) {
    try {
      const res = await fetch(BASE + '/login');
      if (res.ok) return true;
    } catch { /* ainda a arrancar */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

/* Extrai o slug real do estabelecimento a partir da página «Mi restaurante».
 * Não se assume o slug a partir do nome: num Supabase partilhado o gerador
 * pode ter acrescentado um sufixo para evitar colisão. */
function slugOf(html) {
  const m = String(html).match(/\/r\/([a-z0-9][a-z0-9-]*)/);
  return m ? m[1] : '';
}

/* Cliente com service_role, só para preparar e limpar o terreno do teste. */
function admin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function cleanup(sb) {
  if (!sb) return;
  try {
    const { data, error } = await sb.rpc('purge_test_data', { p: { test_prefix: P } });
    if (error) {
      console.log(`  ! limpeza falhou: ${error.message}`);
      return;
    }
    const paths = (data && data.paths) || [];
    const media = (data && data.media) || [];
    if (paths.length > 0) await sb.storage.from('cvs').remove(paths);
    if (media.length > 0) await sb.storage.from('media').remove(media);
    console.log(`\n  limpeza: ${(data && data.restaurants) || 0} estabelecimento(s), ` +
      `${paths.length} CV(s), ${media.length} imagem(ns)`);
  } catch (err) {
    console.log(`  ! limpeza falhou: ${err.message}`);
  }
}

async function main() {
  const sb = admin();

  if (!sb) {
    console.error('');
    console.error('  SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY têm de estar definidos para correr os testes.');
    console.error('  Copia .env.example para .env e preenche-os.');
    console.error('');
    process.exit(1);
  }

  const server = spawn(process.execPath, ['src/server.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT,
      APP_URL: BASE,
      NODE_ENV: 'test',
      EZCV_TEST_PREFIX: P
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  server.stdout.on('data', (d) => process.env.VERBOSE && process.stdout.write(d));
  server.stderr.on('data', (d) => process.stdout.write(d));

  let slugA = '';
  let slugB = '';

  try {
    const up = await waitForServer();
    if (!up) throw new Error('Servidor não arrancou (vê as mensagens acima: migrations ou .env)');

    console.log(`\n  prefixo desta execução: ${P}`);

    console.log('\n— Registro e sessão —');
    const ownerJar = new Jar();
    let res = await call('GET', '/registro', { jar: ownerJar });
    let html = await text(res);
    const csrf = csrfOf(html);
    check('GET /registro renderiza', res.status === 200 && Boolean(csrf));

    res = await call('POST', '/registro', {
      jar: ownerJar,
      body: form({
        restaurant_name: `Restaurante Granada ${P}`, owner_name: 'Ana López',
        email: `ana-${P}@granada.es`, telefono: '912345678',
        direccion: 'Calle Mayor 1', cp: '28013', ciudad: 'Madrid',
        establecimiento: 'restaurante', commercial_name: 'Granada Restaurante',
        descripcion: 'Cocina mediterránea en el centro.',
        password: 'Secreta123', password2: 'Secreta123', _csrf: csrf
      })
    });
    check('POST /registro cria conta e sessão',
      res.status === 302 && res.headers.get('location') === '/panel?ok=' + encodeURIComponent('Cuenta creada. ¡Bienvenido!'));

    res = await call('GET', '/panel', { jar: ownerJar });
    html = await text(res);
    check('GET /panel mostra dashboard', res.status === 200 && html.includes('Aceptando candidaturas'));

    res = await call('GET', '/panel/restaurante', { jar: ownerJar });
    html = await text(res);
    slugA = slugOf(html);
    check('slug do estabelecimento gerado', Boolean(slugA), slugA);

    console.log('\n— Vagas —');
    res = await call('GET', '/panel/vagas', { jar: ownerJar });
    const jobCsrf = csrfOf(await text(res));
    res = await call('POST', '/panel/vagas/crear', {
      jar: ownerJar,
      body: form({ titulo: 'Camarero/a', descripcion: 'Jornada parcial, fines de semana.', _csrf: jobCsrf })
    });
    check('criar vaga', res.status === 302);
    res = await call('GET', '/panel/vagas', { jar: ownerJar });
    const jobId = (await text(res)).match(/\/panel\/vagas\/(\d+)\/toggle/);
    check('vaga aparece no painel', Boolean(jobId));

    console.log('\n— Página pública NFC —');
    const pubJar = new Jar();
    res = await call('GET', `/r/${slugA}`, { jar: pubJar });
    html = await text(res);
    check('página NFC renderiza formulário',
      res.status === 200 && html.includes('Estamos contratando') && html.includes('Vacantes abiertas'));
    const publicCsrf = csrfOf(html);

    console.log('\n— Candidatura com CV —');
    res = await call('POST', `/r/${slugA}/apply`, { jar: pubJar, body: applyBody(null, publicCsrf) });
    check('POST apply redireciona para confirmação',
      res.status === 302 && (res.headers.get('location') || '').includes('/enviado'));
    res = await call('GET', `/r/${slugA}/enviado`);
    html = await text(res);
    check('página de confirmação', res.status === 200 && html.includes('Candidatura enviada correctamente'));

    res = await call('GET', '/panel/candidaturas', { jar: ownerJar });
    html = await text(res);
    check('candidatura aparece no painel', html.includes('Juan García') && html.includes('(1)'));
    const appId = (html.match(/\/panel\/candidaturas\/(\d+)/) || [])[1];
    check('id da candidatura extraído', Boolean(appId));

    console.log('\n— Perfil, CV, estado e notas —');
    res = await call('GET', `/panel/candidaturas/${appId}`, { jar: ownerJar });
    html = await text(res);
    check('perfil mostra dados',
      res.status === 200 && html.includes('X1234567A') && html.includes('juan.garcia@example.com'));
    const cvId = (html.match(/\/panel\/cv\/(\d+)/) || [])[1];
    check('link do CV presente', Boolean(cvId));

    res = await call('GET', `/panel/cv/${cvId}`, { jar: ownerJar });
    const buf = Buffer.from(await res.arrayBuffer());
    check('GET CV devolve PDF do Storage',
      res.status === 200 &&
      res.headers.get('content-type') === 'application/pdf' &&
      buf.subarray(0, 5).toString('latin1') === '%PDF-');
    check('CV sem cache público', (res.headers.get('cache-control') || '').includes('no-store'));
    res = await call('GET', `/panel/cv/${cvId}?descargar=1`, { jar: ownerJar });
    check('download CV em attachment', (res.headers.get('content-disposition') || '').startsWith('attachment'));

    res = await call('GET', `/panel/candidaturas/${appId}`, { jar: ownerJar });
    const detailCsrf = csrfOf(await text(res));
    res = await call('POST', `/panel/candidaturas/${appId}/estado`, {
      jar: ownerJar, body: form({ status: 'contactar', _csrf: detailCsrf })
    });
    check('alterar estado', res.status === 302);
    res = await call('GET', `/panel/candidaturas/${appId}`, { jar: ownerJar });
    html = await text(res);
    check('estado "Contactar" refletido', html.includes('Contactar'));

    res = await call('POST', `/panel/candidaturas/${appId}/notas`, {
      jar: ownerJar, body: form({ nota: 'Llamar el viernes.', _csrf: detailCsrf })
    });
    check('adicionar nota interna', res.status === 302);
    res = await call('GET', `/panel/candidaturas/${appId}`, { jar: ownerJar });
    check('nota visível no perfil', (await text(res)).includes('Llamar el viernes.'));

    console.log('\n— Validação de upload —');
    res = await call('GET', `/r/${slugA}`, { jar: pubJar });
    const csrf2 = csrfOf(await text(res));
    res = await call('POST', `/r/${slugA}/apply`, {
      jar: pubJar,
      body: applyBody(null, csrf2, {
        nombre: 'María', apellidos: 'López', email: 'maria@example.com',
        telefono: '600999888', doc_tipo: 'dni', doc_numero: '12345678Z',
        __file: { name: 'fake.pdf', type: 'application/pdf', data: Buffer.from('Isto non é un PDF') }
      })
    });
    html = await text(res);
    check('PDF falso rejeitado (magic bytes)', res.status === 422 && html.includes('no es un PDF válido'));

    res = await call('GET', `/r/${slugA}`, { jar: pubJar });
    const csrf3 = csrfOf(await text(res));
    res = await call('POST', `/r/${slugA}/apply`, {
      jar: pubJar,
      body: applyBody(null, csrf3, {
        nombre: 'Pedro', email: 'pedro@example.com', telefono: '600333444',
        __file: { name: 'notas.txt', type: 'text/plain', data: Buffer.from('ola') }
      })
    });
    html = await text(res);
    check('arquivo não-PDF rejeitado', res.status === 422 && html.includes('Solo se aceptan archivos PDF'));

    console.log('\n— Minimização de dados: documento opcional —');
    res = await call('GET', `/r/${slugA}`, { jar: pubJar });
    html = await text(res);
    check('formulário não exige documento',
      !/id="doc_numero"[^>]*\srequired/.test(html) && html.includes('Opcional'));
    /* O envio sem documento é testado mais abaixo, no restaurante B: o limite
     * de 5 candidaturas/hora é por IP+slug e o orçamento de A é todo gasto
     * pelos testes de validação de upload acima. */

    console.log('\n— CSRF —');
    res = await call('POST', `/panel/candidaturas/${appId}/estado`, {
      jar: ownerJar, body: form({ status: 'revisado' })
    });
    check('POST sem CSRF → 403', res.status === 403);

    res = await call('GET', '/', { jar: ownerJar });
    check('/ com sessão vai para o painel', res.status === 302 && res.headers.get('location') === '/panel');
    res = await call('GET', '/');
    html = await text(res);
    check('/ sem sessão mostra a landing page',
      res.status === 200 && html.includes('lp-hero') && html.includes('href="/registro"'));
    check('páginas ligam o logo e os favicons',
      html.includes('/img/logo.svg') && html.includes('rel="icon"') && html.includes('apple-touch-icon'));
    for (const asset of ['/favicon.ico', '/favicon.svg', '/apple-touch-icon.png', '/img/logo.svg']) {
      res = await call('GET', asset);
      check(`${asset} é servido`, res.status === 200);
    }

    console.log('\n— Filtros e páginas do painel —');
    res = await call('GET', '/panel/restaurante', { jar: ownerJar });
    html = await text(res);
    check('Mi restaurante mostra URL NFC',
      res.status === 200 && html.includes(`/r/${slugA}`) && html.includes('Copiar URL'));
    res = await call('GET', '/panel/qr', { jar: ownerJar });
    html = await text(res);
    check('página do QR renderiza SVG com a URL NFC',
      res.status === 200 && html.includes('<svg') && html.includes(`/r/${slugA}`) && html.includes('data-print'));
    res = await call('GET', '/panel/qr.png', { jar: ownerJar });
    const qrPng = Buffer.from(await res.arrayBuffer());
    check('QR em PNG para descarregar',
      res.status === 200 && res.headers.get('content-type') === 'image/png' &&
      qrPng.subarray(1, 4).toString() === 'PNG' &&
      (res.headers.get('content-disposition') || '').includes('attachment'));
    res = await call('GET', '/panel/qr');
    check('QR exige sessão', res.status !== 200 || !(await text(res)).includes('<svg'));
    res = await call('GET', '/panel/configuracion', { jar: ownerJar });
    check('Configuración renderiza', res.status === 200 && (await text(res)).includes('Contraseña actual'));
    res = await call('GET', '/panel/candidaturas?q=camarero', { jar: ownerJar });
    check('busca por texto "camarero"', (await text(res)).includes('Juan García'));
    res = await call('GET', '/panel/candidaturas?q=inexistente999', { jar: ownerJar });
    check('busca sem resultados', (await text(res)).includes('No hay candidaturas'));
    res = await call('GET', '/panel/candidaturas?q=100%25', { jar: ownerJar });
    check('curinga % na busca é escapado', (await text(res)).includes('No hay candidaturas'));
    res = await call('GET', '/panel/candidaturas?estado=contactar', { jar: ownerJar });
    check('filtro por estado (contactar)', (await text(res)).includes('Juan García'));
    res = await call('GET', '/panel/candidaturas?estado=contratado', { jar: ownerJar });
    check('filtro por estado vazio', (await text(res)).includes('No hay candidaturas'));

    console.log('\n— Pipeline, ordenação e publicidade dos dados —');
    res = await call('GET', '/panel/candidaturas', { jar: ownerJar });
    html = await text(res);
    check('pipeline visual de estados',
      res.status === 200 && html.includes('class="pipeline"') && html.includes('/panel/candidaturas?estado=nuevo"'));
    check('card mostra telefone e email',
      html.includes('600111222') && html.includes('juan.garcia@example.com'));
    check('card mostra disponibilidade', html.includes('Tarde'));
    res = await call('GET', '/panel/candidaturas?orden=antiguas', { jar: ownerJar });
    check('ordenação por mais antigas aceite', res.status === 200 && (await text(res)).includes('Más antiguas'));
    res = await call('GET', '/panel/candidaturas?favs=1', { jar: ownerJar });
    check('filtro favoritos (vazio)', (await text(res)).includes('No hay candidaturas'));
    res = await call('GET', `/r/${slugA}`);
    html = await text(res);
    check('página pública mostra descrição e tipo',
      html.includes('Cocina mediterránea en el centro.') && html.includes('Restaurante'));

    console.log('\n— Imágenes del establecimiento (Storage) —');
    res = await call('GET', '/panel/restaurante', { jar: ownerJar });
    const restCsrf = csrfOf(await text(res));
    const imgFields = {
      name: `Restaurante Granada ${P}`, commercial_name: 'Granada Restaurante', owner_name: 'Ana López',
      email: `ana-${P}@granada.es`, telefono: '912345678', direccion: 'Calle Mayor 1', cp: '28013',
      ciudad: 'Madrid', establecimiento: 'restaurante', descripcion: 'Cocina mediterránea en el centro.',
      _csrf: restCsrf
    };

    const fdImg = new FormData();
    for (const [k, v] of Object.entries(imgFields)) fdImg.append(k, v);
    fdImg.append('logo', new Blob([PNG], { type: 'image/png' }), 'logo.png');
    res = await call('POST', '/panel/restaurante', { jar: ownerJar, body: fdImg });
    check('upload de logo aceite', res.status === 302);

    res = await call('GET', `/r/${slugA}`, { jar: pubJar });
    check('logo aparece na página pública', (await text(res)).includes('imagen/logo'));
    res = await call('GET', `/r/${slugA}/imagen/logo`, { jar: pubJar });
    const logoBytes = Buffer.from(await res.arrayBuffer());
    check('rota de logo devolve PNG do Storage',
      res.status === 200 &&
      res.headers.get('content-type') === 'image/png' &&
      logoBytes[0] === 0x89 && logoBytes[1] === 0x50);

    const fdBad = new FormData();
    for (const [k, v] of Object.entries(imgFields)) fdBad.append(k, v);
    fdBad.append('logo', new Blob([Buffer.from('not an image')], { type: 'text/plain' }), 'logo.txt');
    res = await call('POST', '/panel/restaurante', { jar: ownerJar, body: fdBad });
    check('imagem inválida rejeitada',
      res.status === 302 && decodeURIComponent(res.headers.get('location') || '').includes('Solo se aceptan imágenes'));

    console.log('\n— Favorito, historial y consentimiento —');
    res = await call('GET', `/panel/candidaturas/${appId}`, { jar: ownerJar });
    const favCsrf = csrfOf(await text(res));
    res = await call('POST', `/panel/candidaturas/${appId}/favorito`, { jar: ownerJar, body: form({ _csrf: favCsrf }) });
    check('marcar favorito', res.status === 302);
    res = await call('GET', `/panel/candidaturas/${appId}`, { jar: ownerJar });
    html = await text(res);
    check('perfil mostra favorito e versão de consentimento',
      html.includes('★ Favorito') && html.includes('v2-2026-10'));
    check('histórico regista recepção e mudança de estado',
      html.includes('Candidatura recibida') && html.includes('Nuevo → Contactar'));
    check('nota com autor', html.includes('Ana López'));
    res = await call('GET', '/panel/candidaturas?favs=1', { jar: ownerJar });
    check('filtro de favoritos encontra favorito', (await text(res)).includes('Juan García'));
    check('experiencia e observações visíveis no perfil',
      html.includes('2 años como camarero') && html.includes('Disponible por las tardes.'));

    console.log('\n— Notificaciones del panel —');
    res = await call('GET', '/panel', { jar: ownerJar });
    html = await text(res);
    check('dashboard avisa de candidaturas nuevas', html.includes('Tienes'));
    res = await call('GET', '/panel/notificaciones', { jar: ownerJar });
    html = await text(res);
    check('página de avisos lista notificações',
      res.status === 200 && html.includes('Nueva candidatura') && html.includes('Juan García'));
    const notifCsrf = csrfOf(html);
    res = await call('POST', '/panel/notificaciones/marcar-leidas', {
      jar: ownerJar, body: form({ _csrf: notifCsrf, volver: '/panel/notificaciones' })
    });
    check('marcar notificações como lidas', res.status === 302);
    res = await call('GET', '/panel', { jar: ownerJar });
    check('aviso desaparece após marcar lidas', !(await text(res)).includes('Tienes'));

    console.log('\n— Privacidad (§6, §29) —');
    res = await call('GET', '/privacidad');
    html = await text(res);
    check('página de privacidade renderiza',
      res.status === 200 && html.includes('Tus derechos') && html.includes('v2-2026-10'));
    check('privacidade explica documento opcional e sem decisões automatizadas',
      html.includes('opcional') && html.includes('decisiones automatizadas'));

    console.log('\n— Vacantes avanzadas y exclusión —');
    res = await call('GET', '/panel/vagas', { jar: ownerJar });
    const jobsCsrf = csrfOf(await text(res));
    res = await call('POST', '/panel/vagas/crear', {
      jar: ownerJar,
      body: form({
        titulo: 'Cocinero/a', descripcion: 'Cocina regional',
        requisitos: 'Experiencia y carné de manipulación',
        contrato: 'indefinido', jornada: 'completa', disponibilidad: 'jornada_comp', _csrf: jobsCsrf
      })
    });
    check('criar vaga com contrato e jornada', res.status === 302);
    res = await call('GET', '/panel/vagas', { jar: ownerJar });
    html = await text(res);
    check('vaga mostra contrato Indefinido e jornada completa',
      html.includes('Indefinido') && html.includes('Jornada completa'));
    const cocineroDel = html.match(/Cocinero\/a[\s\S]*?\/panel\/vagas\/(\d+)\/eliminar/);
    check('link de eliminar vaga presente', Boolean(cocineroDel));
    res = await call('GET', '/panel/vagas', { jar: ownerJar });
    const jobsCsrf2 = csrfOf(await text(res));
    res = await call('POST', `/panel/vagas/${cocineroDel[1]}/eliminar`, { jar: ownerJar, body: form({ _csrf: jobsCsrf2 }) });
    check('eliminar vaga', res.status === 302);
    res = await call('GET', '/panel/vagas', { jar: ownerJar });
    check('vaga eliminada some da lista', !(await text(res)).includes('Cocinero/a'));
    res = await call('GET', '/panel/candidaturas', { jar: ownerJar });
    check('candidaturas antigas preservadas após eliminar vaga', (await text(res)).includes('Juan García'));

    res = await call('GET', '/panel/vagas', { jar: ownerJar });
    const jobCsrf2 = csrfOf(await text(res));
    res = await call('POST', `/panel/vagas/${jobId[1]}/toggle`, { jar: ownerJar, body: form({ _csrf: jobCsrf2 }) });
    check('desativar vaga', res.status === 302);
    res = await call('GET', `/r/${slugA}`, { jar: pubJar });
    check('sem vagas ativas → mensagem de futuras oportunidades',
      (await text(res)).includes('no tenemos vacantes disponibles'));
    res = await call('GET', '/panel/vagas', { jar: ownerJar });
    const jobCsrf3 = csrfOf(await text(res));
    res = await call('POST', `/panel/vagas/${jobId[1]}/toggle`, { jar: ownerJar, body: form({ _csrf: jobCsrf3 }) });
    check('reativar vaga', res.status === 302);
    res = await call('GET', `/r/${slugA}`, { jar: pubJar });
    check('vaga reativada → formulário visível', (await text(res)).includes('Vacantes abiertas'));

    console.log('\n— Honeypot (spam) —');
    res = await call('GET', `/r/${slugA}`, { jar: pubJar });
    const csrfHoneypot = csrfOf(await text(res));
    res = await call('POST', `/r/${slugA}/apply`, {
      jar: pubJar,
      body: applyBody(null, csrfHoneypot, {
        nombre: 'Bot', email: 'bot@spam.com', sitio_web: 'http://spam.example'
      })
    });
    check('honeypot redireciona sem gravar',
      res.status === 302 && (res.headers.get('location') || '').includes('/enviado'));
    res = await call('GET', '/panel/candidaturas?q=Bot', { jar: ownerJar });
    check('honeypot não criou candidatura', (await text(res)).includes('No hay candidaturas'));

    console.log('\n— Pausa de candidaturas —');
    res = await call('GET', '/panel', { jar: ownerJar });
    const dashCsrf = csrfOf(await text(res));
    res = await call('POST', '/panel/contratacion', { jar: ownerJar, body: form({ accion: 'pausar', _csrf: dashCsrf }) });
    check('pausar candidaturas', res.status === 302);
    res = await call('GET', `/r/${slugA}`);
    html = await text(res);
    check('página mostra "No estamos contratando"',
      res.status === 200 && html.includes('No estamos contratando'));

    res = await call('GET', `/r/${slugA}`, { jar: pubJar });
    const csrfPause = csrfOf(await text(res));
    res = await call('POST', `/r/${slugA}/apply`, { jar: pubJar, body: applyBody(null, csrfPause) });
    const locPaused = res.headers.get('location') || '';
    check('apply bloqueado quando pausado', res.status === 302 && !locPaused.includes('/enviado'));

    res = await call('POST', `/r/${slugA}/interes`, {
      jar: pubJar,
      body: form({
        nombre: 'Lucía', email: 'lucia@example.com', telefono: '655444333',
        consentimiento_futuro: '1', _csrf: csrfPause
      })
    });
    check('formulário de interesse funciona pausado',
      res.status === 302 && (res.headers.get('location') || '').includes('tipo=futuro'));

    res = await call('GET', '/panel/candidaturas', { jar: ownerJar });
    html = await text(res);
    check('interesse guardado como Reserva',
      html.includes('Lucía') && html.includes('Reserva / Futuras oportunidades'));

    res = await call('GET', '/panel', { jar: ownerJar });
    const dashCsrf2 = csrfOf(await text(res));
    res = await call('POST', '/panel/contratacion', { jar: ownerJar, body: form({ accion: 'activar', _csrf: dashCsrf2 }) });
    res = await call('GET', `/r/${slugA}`, { jar: pubJar });
    check('reativar candidaturas', (await text(res)).includes('Estamos contratando'));

    console.log('\n— Isolamento entre restaurantes —');
    const bJar = new Jar();
    res = await call('GET', '/registro', { jar: bJar });
    const csrfB = csrfOf(await text(res));
    res = await call('POST', '/registro', {
      jar: bJar,
      body: form({
        restaurant_name: `Bar Sol ${P}`, owner_name: 'Berto Ruiz',
        email: `berto-${P}@barsol.es`, telefono: '934567890',
        ciudad: 'Barcelona', establecimiento: 'bar',
        password: 'Secreta123', password2: 'Secreta123', _csrf: csrfB
      })
    });
    check('segundo restaurante criado', res.status === 302);

    res = await call('GET', '/panel/restaurante', { jar: bJar });
    slugB = slugOf(await text(res));
    check('slug do segundo restaurante', Boolean(slugB) && slugB !== slugA, slugB);

    res = await call('GET', `/panel/candidaturas/${appId}`, { jar: bJar });
    check('restaurante B não vê candidatura de A → 404', res.status === 404);
    res = await call('GET', `/panel/cv/${cvId}`, { jar: bJar });
    check('restaurante B não vê CV de A → 404', res.status === 404);
    res = await call('GET', '/panel/candidaturas', { jar: bJar });
    const htmlB = await text(res);
    check('lista de B vazia', htmlB.includes('(0)') && !htmlB.includes('Juan García'));
    res = await call('GET', `/panel/candidaturas/${appId}`);
    check('sem sessão → redirect login',
      res.status === 302 && (res.headers.get('location') || '').includes('/login'));

    console.log('\n— Isolamento do Storage —');
    const { data: restRows } = await sb.from('restaurants').select('id, slug').eq('test_prefix', P);
    const ridA = (restRows || []).find((r) => r.slug === slugA);
    const ridB = (restRows || []).find((r) => r.slug === slugB);
    check('restaurantes marcados com o prefixo do teste', Boolean(ridA) && Boolean(ridB));

    const { data: objA } = await sb.storage.from('cvs').list(`r/${ridA.id}`);
    const { data: objB } = await sb.storage.from('cvs').list(`r/${ridB.id}`);
    check('CVs de A estão no bucket privado, separados por restaurante',
      (objA || []).length >= 1 && (objB || []).length === 0,
      `A=${(objA || []).length} B=${(objB || []).length}`);

    const { data: bucketList } = await sb.storage.listBuckets();
    const cvBucket = (bucketList || []).find((b) => b.id === 'cvs');
    check('bucket cvs é privado', Boolean(cvBucket) && cvBucket.public === false);

    if (process.env.SUPABASE_ANON_KEY) {
      const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
      });
      const { data: leak, error: leakErr } = await anon.from('applications').select('id').limit(1);
      check('chave anon não lê candidaturas (RLS deny-all)',
        Boolean(leakErr) || (leak || []).length === 0);

      /* `list` devolve só o nome do ficheiro: o caminho do objeto é
       * r/<restaurant_id>/<nome>. */
      const victim = (objA || [])[0];
      const victimPath = victim ? `r/${ridA.id}/${victim.name}` : 'r/0/inexistente.pdf';
      const { data: dl, error: dlErr } = await anon.storage.from('cvs').download(victimPath);
      check('chave anon não descarrega CVs', Boolean(dlErr) || !dl);
    } else {
      console.log('  — SUPABASE_ANON_KEY não definida: testes de RLS com chave anon saltados');
    }

    console.log('\n— Candidatura sem documento (minimização, §5/§29) —');
    res = await call('GET', '/panel/vagas', { jar: bJar });
    const jobCsrfB = csrfOf(await text(res));
    res = await call('POST', '/panel/vagas/crear', {
      jar: bJar,
      body: form({ titulo: 'Ayudante de cocina', _csrf: jobCsrfB })
    });
    check('vaga criada no restaurante B', res.status === 302);

    const noDocJar = new Jar();
    res = await call('GET', `/r/${slugB}`, { jar: noDocJar });
    const csrfNoDoc = csrfOf(await text(res));
    res = await call('POST', `/r/${slugB}/apply`, {
      jar: noDocJar,
      body: applyBody(null, csrfNoDoc, {
        nombre: 'Sofía', apellidos: 'Ramos', email: 'sofia@example.com',
        telefono: '600777666', doc_tipo: '', doc_numero: ''
      })
    });
    check('candidatura sem documento aceite',
      res.status === 302 && (res.headers.get('location') || '').includes('/enviado'));

    res = await call('GET', '/panel/candidaturas?q=Sofía', { jar: bJar });
    html = await text(res);
    check('candidatura sem documento no painel de B', html.includes('Sofía'));
    const appIdB = (html.match(/\/panel\/candidaturas\/(\d+)/) || [])[1];
    res = await call('GET', `/panel/candidaturas/${appIdB}`, { jar: bJar });
    check('documento em falta aparece como «No facilitado»',
      (await text(res)).includes('No facilitado'));

    console.log('\n— Rate limiting de candidaturas —');
    const spamJar = new Jar();
    let limited = false;
    for (let i = 0; i < 6; i++) {
      res = await call('GET', `/r/${slugB}`, { jar: spamJar });
      const c = csrfOf(await text(res));
      res = await call('POST', `/r/${slugB}/apply`, {
        jar: spamJar,
        body: applyBody(null, c, { nombre: 'Test', email: `spam${i}@example.com`, telefono: '600000000' })
      });
      if (res.status === 429) { limited = true; break; }
    }
    check('limite de candidaturas por IP → 429', limited);

    console.log('\n— Área admin —');
    const adminEmail = `admin-${P}@test.local`;
    const seed = spawnSync(process.execPath, ['src/db/seed.js'], {
      cwd: root,
      env: { ...process.env, ADMIN_EMAIL: adminEmail, ADMIN_PASSWORD: 'Admin1234!' },
      encoding: 'utf8'
    });
    check('seed do admin', seed.status === 0, (seed.stderr || '').trim());

    const adminJar = new Jar();
    res = await call('GET', '/login', { jar: adminJar });
    const adminCsrf = csrfOf(await text(res));
    res = await call('POST', '/login', {
      jar: adminJar, body: form({ email: adminEmail, password: 'Admin1234!', _csrf: adminCsrf })
    });
    check('login admin', res.status === 302 && res.headers.get('location') === '/admin');
    res = await call('GET', '/admin', { jar: adminJar });
    html = await text(res);
    check('admin vê métricas',
      res.status === 200 && html.includes('Establecimiento') && html.includes(`Restaurante Granada ${P}`));
    res = await call('GET', '/admin/usuarios', { jar: adminJar });
    check('admin vê usuários', res.status === 200 && (await text(res)).includes(`ana-${P}@granada.es`));
    res = await call('GET', '/admin/logs', { jar: adminJar });
    html = await text(res);
    check('admin vê logs de segurança',
      res.status === 200 && html.includes('Logs de seguridad') && html.includes('registro_restaurante'));
    check('acesso admin a dados pessoais fica registado', html.includes('admin_lista_usuarios'));
    res = await call('GET', '/admin', { jar: ownerJar });
    check('owner sem acesso a /admin → 404', res.status === 404);

    console.log('\n— Contratação (§37, passo 17) —');
    res = await call('GET', `/panel/candidaturas/${appId}`, { jar: ownerJar });
    const hireCsrf = csrfOf(await text(res));
    res = await call('POST', `/panel/candidaturas/${appId}/estado`, {
      jar: ownerJar, body: form({ status: 'contratado', _csrf: hireCsrf })
    });
    check('marcar como contratado', res.status === 302);

    res = await call('GET', '/panel/candidaturas?estado=contratado', { jar: ownerJar });
    check('filtro por contratado encontra o candidato', (await text(res)).includes('Juan García'));

    res = await call('GET', `/panel/candidaturas/${appId}`, { jar: ownerJar });
    check('histórico regista Contactar → Contratado',
      (await text(res)).includes('Contactar → Contratado'));

    console.log('\n— Exclusão segura —');
    res = await call('GET', `/panel/candidaturas/${appId}`, { jar: ownerJar });
    const delCsrf = csrfOf(await text(res));
    res = await call('POST', `/panel/candidaturas/${appId}/eliminar`, { jar: ownerJar, body: form({ _csrf: delCsrf }) });
    check('eliminar candidatura', res.status === 302);
    res = await call('GET', `/panel/candidaturas/${appId}`, { jar: ownerJar });
    check('candidatura eliminada → 404', res.status === 404);
    res = await call('GET', `/panel/cv/${cvId}`, { jar: ownerJar });
    check('CV da candidatura eliminada → 404', res.status === 404);

    const { data: objAfter } = await sb.storage.from('cvs').list(`r/${ridA.id}`);
    const before = (objA || []).length;
    const after = (objAfter || []).length;
    check('ficheiro CV removido do Storage', after === before - 1, `antes=${before} depois=${after}`);
  } catch (err) {
    failed += 1;
    failures.push(`ERRO FATAL: ${err.message}`);
    console.error('\nERRO FATAL:', err);
  } finally {
    server.kill();
    await cleanup(sb);
  }

  console.log(`\nResultado: ${passed} ok, ${failed} falharam`);
  if (failures.length) {
    console.log('Falhas:');
    failures.forEach((f) => console.log(`  - ${f}`));
  }
  process.exit(failed === 0 ? 0 : 1);
}

main();
