'use strict';

/* Grava o vídeo de demonstração do Fíchame a partir da aplicação real.
 *
 * As ferramentas não são dependências do projeto. Instalar numa pasta à
 * parte e correr a partir dela (requer Google Chrome instalado):
 *
 *   mkdir %TEMP%ichame-video && cd %TEMP%ichame-video
 *   npm i puppeteer-core@24 ffmpeg-static@5
 *   node <projeto>/scripts/demo-video/record.js <projeto> es <projeto>/public/video/fichame-demo.mp4
 *   node <projeto>/scripts/demo-video/record.js <projeto> en <projeto>/public/video/fichame-demo-en.mp4
 *
 * Cada execução leva ~2 minutos e cria dados fictícios no Supabase do .env,
 * marcados com test_prefix e apagados no fim (mesmo se a gravação falhar).
 *
 * Sobe o servidor com EZCV_TEST_PREFIX (como o teste E2E), cria uma conta e
 * candidatos fictícios, grava o fluxo com o screencast do Chrome e apaga
 * todos os dados criados no fim (purge_test_data + Storage). */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');
/* Resolvidos a partir da pasta onde o comando corre (ver acima). */
const fromCwd = (m) => require(require.resolve(m, { paths: [process.cwd()] }));
const puppeteer = fromCwd('puppeteer-core');
const ffmpeg = fromCwd('ffmpeg-static');

const ROOT = process.argv[2];
const LANG = process.argv[3] || 'es';
const OUT = process.argv[4];
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 3460 + (LANG === 'en' ? 1 : 0);
const BASE = `http://localhost:${PORT}`;
const P = 'v' + crypto.randomBytes(4).toString('hex');
const WORK = path.join(process.cwd(), 'work-' + LANG);
const W = 1920, H = 1080;

require(path.join(ROOT, 'src', 'config')); // carrega o .env
const { createClient } = require(path.join(ROOT, 'node_modules', '@supabase', 'supabase-js'));

const T = {
  es: {
    c3c: '✓ Candidatura enviada',
    introTitle: 'Así funciona Fíchame',
    introSub: 'Organiza tus contrataciones en un solo lugar',
    c1: '1 · Entra en tu panel',
    c2: '2 · Crea una vacante',
    c3: '3 · El candidato abre tu enlace en el móvil',
    c3b: 'Rellena sus datos y adjunta su CV',
    c4: '4 · La candidatura llega a tu panel',
    c5: '5 · Ves su ficha, su CV y tomas notas',
    c6: '6 · Organiza el proceso por etapas',
    c7: 'Todos tus candidatos, ordenados',
    outroTitle: 'Pruébalo gratis',
    outroSub: 'Gratis durante la prueba de mercado · Sin tarjeta · Sin compromiso',
    note: 'Buena actitud. Llamar el jueves para la entrevista.'
  },
  en: {
    c3c: '✓ Application sent',
    introTitle: 'How Fíchame works',
    introSub: 'Organise your hiring in one place',
    c1: '1 · Log in to your dashboard',
    c2: '2 · Create a job opening',
    c3: '3 · The candidate opens your link on their phone',
    c3b: 'They fill in their details and attach their CV',
    c4: '4 · The application lands in your dashboard',
    c5: '5 · See their profile, CV and add notes',
    c6: '6 · Organise the process by stages',
    c7: 'All your candidates, organised',
    outroTitle: 'Try it for free',
    outroSub: 'Free during the market test · No card · No commitment',
    note: 'Buena actitud. Llamar el jueves para la entrevista.'
  }
}[LANG];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ *
 * Dados de demonstração via HTTP (como o E2E)
 * ------------------------------------------------------------------ */
class Jar {
  constructor() { this.c = {}; }
  store(res) {
    const list = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const raw of list) {
      const [pair] = raw.split(';');
      const i = pair.indexOf('=');
      this.c[pair.slice(0, i)] = pair.slice(i + 1);
    }
  }
  header() { return Object.entries(this.c).map(([k, v]) => `${k}=${v}`).join('; '); }
}

async function call(method, url, jar, body) {
  const headers = {};
  if (jar && jar.header()) headers.cookie = jar.header();
  const res = await fetch(BASE + url, { method, headers, body, redirect: 'manual' });
  if (jar) jar.store(res);
  return res;
}
const csrfOf = (html) => (String(html).match(/name="_csrf" value="([^"]+)"/) || [])[1] || '';
const form = (o) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(o)) p.append(k, v); return p; };

/* PDF mínimo mas válido, com uma linha de texto. */
function cvPdf(name) {
  const content = `BT /F1 18 Tf 72 760 Td (${name} - Curriculum) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let out = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

async function seed() {
  const owner = new Jar();
  let email = 'carmen@laplaza.example';
  const password = 'Demo-' + crypto.randomBytes(6).toString('hex');
  let res = await call('GET', '/registro', owner);
  const csrf = csrfOf(await res.text());
  const regBody = () => form({
    restaurant_name: 'Restaurante La Plaza', owner_name: 'Carmen Ruiz',
    legal_name: 'La Plaza Hostelería SL', acepto: '1',
    email, telefono: '912345678', direccion: 'Plaza Mayor 3', cp: '28012', ciudad: 'Madrid',
    establecimiento: 'restaurante', commercial_name: 'La Plaza',
    descripcion: 'Cocina de mercado en el centro de Madrid.',
    password, password2: password, _csrf: csrf
  });
  res = await call('POST', '/registro', owner, regBody());
  if (res.status !== 302) {
    email = `carmen.${P}@laplaza.example`;
    res = await call('POST', '/registro', owner, regBody());
  }
  if (res.status !== 302) throw new Error('registo falhou: ' + res.status);

  res = await call('GET', '/panel/vagas', owner);
  let c = csrfOf(await res.text());
  res = await call('POST', '/panel/vagas/crear', owner, form({
    titulo: 'Cocinero/a', descripcion: 'Cocina de mercado, turno de mañana.', requisitos: 'Experiencia en cocina.', _csrf: c
  }));
  if (res.status !== 302) throw new Error('vaga falhou');

  res = await call('GET', '/panel/restaurante', owner);
  const slug = (String(await res.text()).match(/\/r\/([a-z0-9][a-z0-9-]*)/) || [])[1];
  if (!slug) throw new Error('slug não encontrado');

  const people = [
    ['Javier', 'Moreno', 'entrevista', '4 años como cocinero en restaurante de menú.'],
    ['Ana', 'Ruiz', 'contactar', '2 años de ayudante de cocina.'],
    ['Marta', 'Gil', 'revisado', 'Formación en cocina y prácticas en hotel.']
  ];
  for (const [nombre, apellidos, , exp] of people) {
    const pub = new Jar();
    res = await call('GET', `/r/${slug}`, pub);
    const html = await res.text();
    const job = (html.match(/<option value="(\d+)"[^>]*>\s*Cocinero\/a/) || [])[1] || '';
    const fd = new FormData();
    const f = {
      nombre, apellidos, email: `${nombre.toLowerCase()}.${apellidos.toLowerCase()}@example.com`,
      telefono: '6' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0'),
      puesto: job, otro_puesto: '', disponibilidad: 'manana', experiencia: exp, observaciones: '', sitio_web: '', _csrf: csrfOf(html)
    };
    for (const [k, v] of Object.entries(f)) fd.append(k, v);
    fd.append('cv', new Blob([cvPdf(`${nombre} ${apellidos}`)], { type: 'application/pdf' }), `CV_${nombre}_${apellidos}.pdf`);
    res = await call('POST', `/r/${slug}/apply`, pub, fd);
    if (res.status !== 302) throw new Error('candidatura falhou: ' + res.status);
    await sleep(1100); // ordem estável por data
  }

  res = await call('GET', '/panel/candidaturas', owner);
  const list = await res.text();
  for (const [nombre, apellidos, status] of people) {
    const re = new RegExp(`/panel/candidaturas/(\\d+)"[\\s\\S]{0,600}?${nombre} ${apellidos}`);
    const id = (list.match(re) || [])[1];
    if (!id) continue;
    res = await call('GET', `/panel/candidaturas/${id}`, owner);
    c = csrfOf(await res.text());
    await call('POST', `/panel/candidaturas/${id}/estado`, owner, form({ status, _csrf: c }));
  }
  return { email, password, slug };
}

async function cleanup() {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.rpc('purge_test_data', { p: { test_prefix: P } });
  if (error) { console.log('  ! limpeza falhou:', error.message); return; }
  const paths = (data && data.paths) || [];
  const media = (data && data.media) || [];
  if (paths.length) await sb.storage.from('cvs').remove(paths);
  if (media.length) await sb.storage.from('media').remove(media);
  console.log(`  limpeza: ${(data && data.restaurants) || 0} estabelecimento(s), ${paths.length} CV(s)`);
}

/* ------------------------------------------------------------------ *
 * Legendas e cursor (injetados em cada página)
 * ------------------------------------------------------------------ */
function overlayScript() {
  const ensure = () => {
    if (!document.body) return;
    let cap = document.getElementById('__cap');
    if (!cap) {
      cap = document.createElement('div');
      cap.id = '__cap';
      Object.assign(cap.style, {
        position: 'fixed', left: '50%', bottom: '28px', transform: 'translateX(-50%)', zIndex: 2147483646,
        background: 'rgba(28,25,23,.92)', color: '#fff', padding: '14px 26px', borderRadius: '999px',
        font: '700 22px/1.25 system-ui,-apple-system,"Segoe UI",sans-serif', boxShadow: '0 10px 30px rgba(0,0,0,.35)',
        maxWidth: '90vw', textAlign: 'center', transition: 'opacity .3s', pointerEvents: 'none',
        border: '2px solid #c9402a'
      });
      if (innerWidth < 600) Object.assign(cap.style, { fontSize: '15px', padding: '10px 16px', bottom: '18px', borderRadius: '16px', width: '86vw' });
      document.body.appendChild(cap);
    }
    const t = sessionStorage.getItem('__cap') || '';
    cap.textContent = t;
    cap.style.opacity = t ? '1' : '0';

    let cur = document.getElementById('__cur');
    if (!cur) {
      cur = document.createElement('div');
      cur.id = '__cur';
      Object.assign(cur.style, {
        position: 'fixed', width: '26px', height: '26px', marginLeft: '-13px', marginTop: '-13px', borderRadius: '50%',
        background: 'rgba(201,64,42,.35)', border: '3px solid #c9402a', zIndex: 2147483647, pointerEvents: 'none',
        transition: 'left .6s cubic-bezier(.4,0,.2,1), top .6s cubic-bezier(.4,0,.2,1), transform .15s'
      });
      const pos = JSON.parse(sessionStorage.getItem('__cur') || 'null') || [innerWidth * 0.6, innerHeight * 0.5];
      cur.style.left = pos[0] + 'px';
      cur.style.top = pos[1] + 'px';
      document.body.appendChild(cur);
    }
  };
  window.__ensureOverlay = ensure;
  document.addEventListener('DOMContentLoaded', ensure);
}

async function caption(page, text) {
  await page.evaluate((t) => { sessionStorage.setItem('__cap', t); window.__ensureOverlay && window.__ensureOverlay(); }, text);
}

async function moveTo(page, selector) {
  const el = await page.waitForSelector(selector, { visible: true, timeout: 15000 });
  await el.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  await sleep(700);
  const box = await el.boundingBox();
  const x = box.x + Math.min(box.width / 2, 120), y = box.y + box.height / 2;
  await page.evaluate((x, y) => {
    window.__ensureOverlay && window.__ensureOverlay();
    const c = document.getElementById('__cur');
    c.style.left = x + 'px'; c.style.top = y + 'px';
    sessionStorage.setItem('__cur', JSON.stringify([x, y]));
  }, x, y);
  await sleep(700);
  return { el, x, y };
}

async function pulse(page) {
  await page.evaluate(() => {
    const c = document.getElementById('__cur');
    if (!c) return;
    c.style.transform = 'scale(.7)';
    setTimeout(() => { c.style.transform = 'scale(1)'; }, 160);
  });
  await sleep(200);
}

async function click(page, selector, { nav = false } = {}) {
  const { x, y } = await moveTo(page, selector);
  await pulse(page);
  if (nav) {
    await Promise.all([page.waitForNavigation({ waitUntil: 'load', timeout: 20000 }), page.mouse.click(x, y)]);
    await page.evaluate(() => window.__ensureOverlay && window.__ensureOverlay());
  } else {
    await page.mouse.click(x, y);
  }
}

async function type(page, selector, text) {
  await click(page, selector);
  await page.keyboard.type(text, { delay: 38 });
  await sleep(250);
}

async function selectText(page, selector, label) {
  await moveTo(page, selector);
  await pulse(page);
  const value = await page.$eval(selector, (s, label) => {
    const o = [...s.options].find((o) => o.textContent.trim().includes(label));
    return o ? o.value : null;
  }, label);
  if (value !== null) await page.select(selector, value);
  await sleep(500);
}

async function scrollBy(page, dy, ms = 900) {
  await page.evaluate((dy) => window.scrollBy({ top: dy, behavior: 'smooth' }), dy);
  await sleep(ms);
}

/* ------------------------------------------------------------------ *
 * Gravação: screencast do Chrome → JPEGs com tempo → MP4
 * ------------------------------------------------------------------ */
async function record(page, name, fn) {
  const dir = path.join(WORK, name);
  fs.mkdirSync(dir, { recursive: true });
  const cdp = await page.target().createCDPSession();
  const frames = [];
  cdp.on('Page.screencastFrame', async (f) => {
    frames.push({ ts: f.metadata.timestamp, data: f.data });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  await sleep(300);
  try { await fn(); } catch (e) { await page.screenshot({ path: path.join(WORK, 'error-' + name + '.png') }).catch(() => {}); throw e; }
  await sleep(400);
  await cdp.send('Page.stopScreencast');
  await cdp.detach();

  const list = [];
  frames.forEach((f, i) => {
    const file = path.join(dir, `f${String(i).padStart(5, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    const next = frames[i + 1] ? frames[i + 1].ts : f.ts + 0.5;
    list.push(`file '${file.replace(/\\/g, '/')}'`, `duration ${Math.max(0.001, next - f.ts).toFixed(4)}`);
  });
  list.push(list[list.length - 2]); // o último ficheiro repete-se (regra do concat)
  fs.writeFileSync(path.join(dir, 'list.txt'), list.join('\n'));

  const mp4 = path.join(WORK, `${name}.mp4`);
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'),
    '-vf', `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0x2b2420,fps=30,format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-r', '30', mp4]);
  console.log(`  cena ${name}: ${frames.length} frames`);
  return mp4;
}

function card(title, sub, logoSvg, cta) {
  return `<!doctype html><html><head><meta charset="utf-8"></head>
  <body style="margin:0;height:100vh;display:grid;place-items:center;background:linear-gradient(140deg,#c9402a,#8e2b1c);font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#fff;text-align:center">
  <div>
    <div style="width:110px;height:110px;margin:0 auto 26px;background:rgba(255,255,255,.14);border-radius:30px;display:grid;place-items:center">
      <div style="width:76px;height:76px">${logoSvg}</div>
    </div>
    <div style="font-size:30px;font-weight:800;letter-spacing:-.02em;opacity:.9">Fíchame</div>
    <h1 style="font-size:64px;margin:10px 0 14px;letter-spacing:-.035em">${title}</h1>
    <p style="font-size:26px;margin:0;opacity:.9">${sub}</p>
    ${cta ? `<div style="display:inline-block;margin-top:34px;background:#fff;color:#8e2b1c;font-weight:800;font-size:24px;padding:16px 34px;border-radius:14px">${cta}</div>` : ''}
  </div></body></html>`;
}

/* ------------------------------------------------------------------ */
async function main() {
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(WORK, { recursive: true });

  const server = spawn(process.execPath, ['src/server.js'], {
    cwd: ROOT,
    env: { ...process.env, EZCV_TEST_PREFIX: P, PORT: String(PORT), APP_URL: BASE },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stderr.on('data', (d) => process.stderr.write(d));

  let browser;
  try {
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(BASE + '/login')).ok) break; } catch { /* a arrancar */ }
      await sleep(500);
    }
    console.log(`  prefixo ${P} — a criar dados de demonstração`);
    const demo = await seed();

    const logoSvg = fs.readFileSync(path.join(ROOT, 'public', 'img', 'logo.svg'), 'utf8')
      .replace('<svg', '<svg width="100%" height="100%"');
    const cvFile = path.join(WORK, 'CV_Lucia_Fernandez.pdf');
    fs.writeFileSync(cvFile, cvPdf('Lucia Fernandez'));

    browser = await puppeteer.launch({
      executablePath: CHROME, headless: true,
      args: ['--hide-scrollbars', '--force-color-profile=srgb', '--lang=es-ES']
    });

    const desk = await browser.newPage();
    await desk.setBypassCSP(true);
    await desk.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
    await desk.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1.5 });
    await desk.evaluateOnNewDocument(overlayScript);

    const scenes = [];

    /* Abertura + login + vaga */
    scenes.push(await record(desk, 'a-desk', async () => {
      await desk.setContent(card(T.introTitle, T.introSub, logoSvg));
      await sleep(3200);

      await desk.goto(BASE + '/login', { waitUntil: 'networkidle0' });
      await caption(desk, T.c1);
      await sleep(900);
      await type(desk, '#email', demo.email);
      await type(desk, '#password', demo.password);
      await click(desk, 'form[action="/login"] button[type=submit]', { nav: true });
      await sleep(2600);

      await caption(desk, T.c2);
      await click(desk, 'a[href="/panel/vagas"]', { nav: true });
      await sleep(900);
      await click(desk, '.create-job-summary');
      await sleep(600);
      await type(desk, '#titulo', 'Camarero/a');
      await type(desk, '#descripcion', 'Buscamos camarero/a para sala, fines de semana.');
      await type(desk, '#requisitos', 'Experiencia en sala (valorada).');
      await selectText(desk, '#contrato', 'Eventual');
      await selectText(desk, '#jornada', 'parcial');
      await click(desk, 'form[action="/panel/vagas/crear"] button[type=submit]', { nav: true });
      await sleep(2400);
    }));

    /* O candidato, no telemóvel */
    const mob = await browser.newPage();
    await mob.setBypassCSP(true);
    await mob.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
    await mob.setViewport({ width: 390, height: 720, deviceScaleFactor: 1.5, isMobile: true, hasTouch: false });
    await mob.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
    await mob.evaluateOnNewDocument(overlayScript);
    await mob.goto(BASE + `/r/${demo.slug}`, { waitUntil: 'networkidle0' });

    scenes.push(await record(mob, 'b-mobile', async () => {
      await caption(mob, T.c3);
      await sleep(2600);
      await caption(mob, T.c3b);
      await selectText(mob, '#puesto', 'Camarero');
      await type(mob, '#nombre', 'Lucía');
      await type(mob, '#apellidos', 'Fernández');
      await type(mob, '#email', 'lucia.fernandez@example.com');
      await type(mob, '#telefono', '612345678');
      await selectText(mob, '#disponibilidad', 'Fines');
      await type(mob, '#experiencia', '3 años de camarera en terraza.');
      await moveTo(mob, '.file-pick');
      await pulse(mob);
      const input = await mob.$('#cv');
      await input.uploadFile(cvFile);
      await input.evaluate((e) => e.dispatchEvent(new Event('change', { bubbles: true })));
      await sleep(1200);
      await click(mob, 'form[action$="/apply"] button[type=submit]', { nav: true });
      await caption(mob, T.c3c);
      await sleep(2800);
    }));
    await mob.close();

    /* De volta ao painel */
    scenes.push(await record(desk, 'c-desk', async () => {
      await desk.goto(BASE + '/panel', { waitUntil: 'networkidle0' });
      await caption(desk, T.c4);
      await sleep(2400);
      await click(desk, 'a[href="/panel/candidaturas"]', { nav: true });
      await sleep(2200);

      await caption(desk, T.c5);
      const link = await desk.evaluateHandle(() => [...document.querySelectorAll('a[href^="/panel/candidaturas/"]')]
        .find((a) => a.textContent.includes('Lucía')));
      const href = await link.evaluate((a) => a.getAttribute('href'));
      await click(desk, `a[href="${href}"]`, { nav: true });
      await sleep(1800);
      await scrollBy(desk, 260, 1500);
      await type(desk, '#nota', T.note);
      await click(desk, 'form[action$="/notas"] button[type=submit]', { nav: true });
      await sleep(600);
      await desk.evaluate(() => {
        const f = document.querySelector('form[action$="/notas"]');
        const card = f && (f.closest('.card') || f);
        card.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
      await sleep(2600);
      await desk.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
      await sleep(900);

      await caption(desk, T.c6);
      await selectText(desk, 'select[name="status"]', 'Entrevista');
      await click(desk, 'form[action$="/estado"] button[type=submit]', { nav: true });
      await sleep(2000);

      await caption(desk, T.c7);
      await click(desk, 'a[href="/panel/candidaturas"]', { nav: true });
      await sleep(3200);

      await desk.setContent(card(T.outroTitle, T.outroSub, logoSvg, LANG === 'en' ? 'Try it free' : 'Probar gratis'));
      await sleep(3600);
    }));

    /* Junta as cenas */
    const concat = path.join(WORK, 'scenes.txt');
    fs.writeFileSync(concat, scenes.map((s) => `file '${s.replace(/\\/g, '/')}'`).join('\n'));
    execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', concat,
      '-c', 'copy', '-movflags', '+faststart', OUT]);
    console.log('  vídeo:', OUT, (fs.statSync(OUT).size / 1048576).toFixed(1) + ' MB');
  } finally {
    if (browser) await browser.close().catch(() => {});
    await cleanup().catch((e) => console.log('  ! limpeza:', e.message));
    server.kill();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
