'use strict';

/* Cria (ou recria) o negócio fictício do modo demonstração — ver src/lib/demo.js.
 * Executar: npm run demo:seed
 *
 * Tudo o que cria é inventado: nomes gerados a partir de listas de nomes
 * comuns, emails em example.com (domínio reservado, RFC 2606), telefones
 * começados por 000 (não marcáveis) e CVs em PDF gerados aqui, com a marca
 * «CV ficticio». O restaurante leva test_prefix = 'demo' e a interface
 * identifica-o sempre como demonstração.
 *
 * Correr de novo apaga a demo anterior e cria uma nova com as datas
 * relativas a hoje (as candidaturas «de ontem» continuam a ser de ontem).
 */

const crypto = require('crypto');

const config = require('../config');
const { sb, rpc } = require('./index');
const { hashPassword, randomToken } = require('../lib/crypto');
const { TERMS_VERSION, DPA_VERSION } = require('../lib/legal');
const { PRIVACY_NOTICE_VERSION, CONSENT_VERSION, futureText } = require('../lib/consent');
const { DEMO_PREFIX, DEMO_EMAIL } = require('../lib/demo');

const TOTAL = 124;
const NAME = 'La Taberna del Albaicín (demo)';

/* Semente fixa: a mesma demo a cada execução, só as datas mudam. */
let seed = 20261010;
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
const pick = (list) => list[Math.floor(rand() * list.length)];
const chance = (p) => rand() < p;

/* ------------------------------------------------------------------ *
 * Nomes por origem (pesos: Granada primeiro, depois a Europa)
 * ------------------------------------------------------------------ */
const ORIGINS = [
  { w: 34, langs: 'español', first: ['Lucía', 'Pablo', 'María', 'Javier', 'Carmen', 'Alejandro', 'Paula', 'Daniel', 'Laura', 'Sergio', 'Marta', 'Álvaro', 'Elena', 'Antonio', 'Irene', 'Manuel', 'Rocío', 'Adrián', 'Nerea', 'Raúl', 'Inés', 'Francisco', 'Alba', 'Rubén'],
    last: ['García', 'Fernández', 'López', 'Martínez', 'Sánchez', 'Romero', 'Moreno', 'Jiménez', 'Ruiz', 'Navarro', 'Torres', 'Domínguez', 'Morales', 'Ortega', 'Delgado', 'Castillo', 'Molina', 'Rubio', 'Medina', 'Serrano'] },
  { w: 12, langs: 'portugués, español e inglés', first: ['João', 'Beatriz', 'Tiago', 'Inês', 'Rui', 'Mariana', 'Diogo', 'Catarina', 'Gonçalo', 'Leonor', 'Miguel', 'Sofia'],
    last: ['Silva', 'Santos', 'Ferreira', 'Pereira', 'Oliveira', 'Costa', 'Rodrigues', 'Martins', 'Sousa', 'Gonçalves', 'Almeida', 'Carvalho'] },
  { w: 10, langs: 'francés, español e inglés', first: ['Camille', 'Lucas', 'Chloé', 'Hugo', 'Manon', 'Théo', 'Léa', 'Antoine', 'Juliette', 'Mathis', 'Élodie', 'Nicolas'],
    last: ['Martin', 'Bernard', 'Dubois', 'Durand', 'Lefèvre', 'Moreau', 'Laurent', 'Girard', 'Roux', 'Fournier', 'Mercier', 'Blanc'] },
  { w: 9, langs: 'alemán, inglés y español', first: ['Lukas', 'Anna', 'Jonas', 'Lena', 'Felix', 'Hannah', 'Paul', 'Lea', 'Maximilian', 'Laura', 'Tobias', 'Sophie'],
    last: ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Wagner', 'Becker', 'Hoffmann', 'Koch', 'Richter', 'Wolf', 'Neumann'] },
  { w: 8, langs: 'italiano, español e inglés', first: ['Giulia', 'Marco', 'Francesca', 'Luca', 'Chiara', 'Matteo', 'Sara', 'Lorenzo', 'Alessia', 'Davide'],
    last: ['Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco'] },
  { w: 6, langs: 'inglés y español', first: ['Emily', 'James', 'Olivia', 'Thomas', 'Charlotte', 'Oliver', 'Grace', 'Harry', 'Amelia', 'Jack'],
    last: ['Smith', 'Jones', 'Taylor', 'Brown', 'Williams', 'Wilson', 'Evans', 'Walker', 'Hughes', 'Clarke'] },
  { w: 7, langs: 'árabe, francés y español', first: ['Youssef', 'Fatima', 'Mohamed', 'Salma', 'Hamza', 'Nadia', 'Amine', 'Imane', 'Karim', 'Yasmina'],
    last: ['El Amrani', 'Benali', 'Bennani', 'El Idrissi', 'Ouahbi', 'Tazi', 'Alaoui', 'Chraibi', 'Haddad', 'Berrada'] },
  { w: 5, langs: 'rumano, español e inglés', first: ['Andrei', 'Ioana', 'Mihai', 'Elena', 'Alexandru', 'Andreea', 'Cristian', 'Bianca'],
    last: ['Popescu', 'Ionescu', 'Popa', 'Stan', 'Dumitru', 'Constantin', 'Marin', 'Tudor'] },
  { w: 5, langs: 'español e inglés', first: ['Valentina', 'Santiago', 'Camila', 'Mateo', 'Daniela', 'Sebastián', 'Gabriela', 'Nicolás'],
    last: ['González', 'Rodríguez', 'Pérez', 'Gómez', 'Díaz', 'Vargas', 'Castro', 'Rojas'] },
  { w: 4, langs: 'polaco, inglés y español', first: ['Jakub', 'Zuzanna', 'Kacper', 'Natalia', 'Michał', 'Julia'],
    last: ['Nowak', 'Kowalski', 'Wiśniewski', 'Wójcik', 'Kamiński', 'Lewandowski'] }
];
const WEIGHT = ORIGINS.reduce((s, o) => s + o.w, 0);

function origin() {
  let r = rand() * WEIGHT;
  for (const o of ORIGINS) { r -= o.w; if (r <= 0) return o; }
  return ORIGINS[0];
}

function ascii(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').toLowerCase().replace(/[^a-z]+/g, '');
}

/* ------------------------------------------------------------------ *
 * Vagas e textos
 * ------------------------------------------------------------------ */
const JOBS = [
  { title: 'Camarero/a de sala', contract_type: 'indefinido', work_schedule: 'turnos', w: 34,
    description: 'Atención en sala y terraza, toma de comandas y servicio de mesas.',
    requirements: 'Experiencia mínima de 6 meses. Valorable inglés.',
    exp: ['Dos temporadas de camarero en terraza en el centro.', 'Un año en sala en un restaurante de tapas, servicio de hasta 40 mesas.', 'Camarera en hotel de 4 estrellas, desayunos y cenas.', 'Experiencia en chiringuito de playa en verano.', 'Sin experiencia en hostelería, pero dos años de atención al cliente en tienda.'] },
  { title: 'Cocinero/a', contract_type: 'indefinido', work_schedule: 'completa', w: 18,
    description: 'Elaboración de la carta y de las tapas del día.',
    requirements: 'Experiencia en cocina andaluza o mediterránea.',
    exp: ['Cocinero de partida en restaurante de cocina mediterránea, 3 años.', 'Formación profesional en cocina y prácticas en un hotel.', 'Jefa de cocina en un bar de tapas durante 2 años.', 'Cocina de producción para catering, 18 meses.'] },
  { title: 'Ayudante de cocina', contract_type: 'eventual', work_schedule: 'turnos', w: 22,
    description: 'Preparación de ingredientes, limpieza y apoyo en el servicio.',
    requirements: 'Ganas de aprender. Carné de manipulador de alimentos.',
    exp: ['Ayudante de cocina en un restaurante italiano, 8 meses.', 'Friegaplatos y apoyo en cocina en temporada de verano.', 'Curso de manipulador de alimentos. Primer empleo.', 'Seis meses en una cocina central de comida rápida.'] },
  { title: 'Barista', contract_type: 'eventual', work_schedule: 'parcial', w: 14,
    description: 'Café de especialidad y desayunos por la mañana.',
    requirements: 'Manejo de máquina de espresso.',
    exp: ['Barista en una cafetería de especialidad, latte art.', 'Un año en cafetería con desayunos y zumos.', 'Trabajé en una cadena de cafeterías, turno de mañana.'] },
  { title: 'Responsable de sala', contract_type: 'indefinido', work_schedule: 'completa', w: 6,
    description: 'Coordinación del equipo de sala, reservas y cuadrantes.',
    requirements: 'Experiencia coordinando equipos. Inglés.',
    exp: ['Encargado de sala en restaurante de 120 cubiertos, 4 años.', 'Maître en hotel y gestión de reservas.', 'Segunda de sala, responsable de los cuadrantes del equipo.'] },
  { title: 'Extra fin de semana', contract_type: 'eventual', work_schedule: 'fines', w: 6, active: false,
    description: 'Refuerzo para sábados y domingos.',
    requirements: 'Disponibilidad fines de semana.',
    exp: ['Estudiante, he trabajado de extra en bodas y eventos.', 'Extra en eventos los fines de semana durante un año.'] }
];

const OBS = [
  'Vivo cerca, en el Albaicín.', 'Puedo empezar la semana que viene.', 'Busco estabilidad a largo plazo.',
  'Estudio en la Universidad de Granada por las mañanas.', 'Tengo coche propio.', '',
  '', 'Disponible también en Navidad y Semana Santa.', 'Me encanta el trato con turistas.', ''
];

const NOTES = [
  'Buena actitud por teléfono. Llamar el jueves.', 'Muy buen inglés, encaja para la terraza.',
  'Tiene experiencia en temporada alta.', 'Pidió turno de mañana.', 'Entrevista bien, referencias por confirmar.',
  'No contesta al teléfono; probar por WhatsApp.', 'Disponible a partir del día 15.', 'Perfil interesante para el verano.'
];

/* Estado final por idade da candidatura: as recentes ainda estão por ver,
 * as antigas já percorreram o processo. */
function statusFor(daysAgo, hasFuture) {
  if (daysAgo <= 2) return pick(['nuevo', 'nuevo', 'nuevo', 'revisado']);
  if (daysAgo <= 7) return pick(['nuevo', 'revisado', 'contactar', 'contactado', 'entrevista']);
  if (daysAgo <= 20) return pick(['revisado', 'contactado', 'entrevista', 'entrevista', 'rechazado', 'contratado']);
  const s = pick(['rechazado', 'rechazado', 'contratado', 'reserva', 'contactado', 'rechazado']);
  return s === 'reserva' && !hasFuture ? 'rechazado' : s;
}

/* Caminho percorrido até ao estado final (cada passo fica no histórico). */
const PATH = {
  nuevo: [], revisado: ['revisado'], contactar: ['revisado', 'contactar'],
  contactado: ['revisado', 'contactado'], entrevista: ['revisado', 'contactado', 'entrevista'],
  contratado: ['revisado', 'contactado', 'entrevista', 'contratado'],
  rechazado: ['revisado', 'rechazado'], reserva: ['revisado', 'reserva']
};

/* ------------------------------------------------------------------ *
 * CV em PDF (uma página, Helvetica, texto Latin-1)
 * ------------------------------------------------------------------ */
function latin1(s) {
  return s.replace(/[^\x00-\xff]/g, (c) => c.normalize('NFD').replace(/[̀-ͯ]/g, '').replace('ł', 'l') || '?');
}

function pdfText(s) {
  return latin1(s).replace(/[\\()]/g, (c) => '\\' + c);
}

function makeCv(c) {
  const lines = [
    ['F2', 20, `${c.first} ${c.last}`],
    ['F1', 11, c.email + '  |  ' + c.phone],
    ['F1', 9, 'CV FICTICIO - datos inventados para la demostracion de Fichame'],
    ['F2', 13, 'Puesto'],
    ['F1', 11, c.job],
    ['F2', 13, 'Experiencia'],
    ['F1', 11, c.experience],
    ['F2', 13, 'Idiomas'],
    ['F1', 11, c.langs],
    ['F2', 13, 'Disponibilidad'],
    ['F1', 11, c.availabilityLabel]
  ];
  let y = 780;
  let body = 'BT\n';
  for (const [font, size, text] of lines) {
    y -= size + (size >= 13 ? 16 : 8);
    body += `/${font} ${size} Tf 1 0 0 1 60 ${y} Tm (${pdfText(text)}) Tj\n`;
  }
  body += 'ET\n';

  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(body, 'latin1')} >>\nstream\n${body}endstream`
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

/* ------------------------------------------------------------------ */

async function check(promise, context) {
  const { data, error } = await promise;
  if (error) throw new Error(`${context}: ${error.message}`);
  return data;
}

async function purgeOld() {
  const r = await rpc('purge_test_data', { test_prefix: DEMO_PREFIX }, 'apagar demo anterior');
  const paths = (r && r.paths) || [];
  for (let i = 0; i < paths.length; i += 100) {
    await sb().storage.from(config.supabase.bucketCvs).remove(paths.slice(i, i + 100));
  }
  /* Conta demo sem restaurante (se o restaurante tiver sido apagado à mão). */
  await check(sb().from('users').delete().eq('email', DEMO_EMAIL), 'apagar conta demo');
  return r ? r.restaurants : 0;
}

async function inBatches(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...await Promise.all(items.slice(i, i + size).map(fn)));
  }
  return out;
}

async function main() {
  config.assertConfig();
  const now = Date.now();
  const day = 86400000;
  const iso = (ms) => new Date(ms).toISOString();

  const removed = await purgeOld();
  if (removed) console.log(`Demo anterior apagada (${removed} negocio).`);

  const reg = await rpc('register_restaurant', {
    slug_base: 'demo',
    name: NAME,
    commercial_name: NAME,
    owner_name: 'Demo',
    email: DEMO_EMAIL,
    /* Senha aleatória descartada: só se entra pela rota /demo. */
    password_hash: hashPassword(randomToken(32)),
    city: 'Granada',
    address: 'Calle ficticia, 1',
    postal_code: '18010',
    establishment_type: 'restaurante',
    description: 'Negocio ficticio para la demostración de Fíchame. Ninguna persona ni candidatura de esta cuenta es real.',
    test_prefix: DEMO_PREFIX
  }, 'criar negócio demo');
  if (!reg || !reg.ok) throw new Error('Não foi possível criar o negócio demo: ' + JSON.stringify(reg));
  const rid = reg.restaurant_id;
  const uid = reg.user_id;

  const created = iso(now - 75 * day);
  await check(sb().from('restaurants').update({
    legal_name: 'Demostración Fíchame (ficticio)',
    terms_version: TERMS_VERSION,
    dpa_version: DPA_VERSION,
    terms_accepted_at: created,
    page_viewed_at: created,
    qr_viewed_at: created,
    retention_closed_days: 365,
    retention_inactive_days: 365,
    created_at: created
  }).eq('id', rid), 'configurar negócio demo');

  const jobs = await check(sb().from('jobs').insert(JOBS.map((j) => ({
    restaurant_id: rid, title: j.title, description: j.description, requirements: j.requirements,
    contract_type: j.contract_type, work_schedule: j.work_schedule, active: j.active !== false,
    created_at: created
  }))).select('id, title'), 'criar vagas');
  const jobId = Object.fromEntries(jobs.map((j) => [j.title, j.id]));
  const jobWeight = JOBS.reduce((s, j) => s + j.w, 0);
  const pickJob = () => {
    let r = rand() * jobWeight;
    for (const j of JOBS) { r -= j.w; if (r <= 0) return j; }
    return JOBS[0];
  };

  const { AVAILABILITIES } = require('../lib/statuses');
  const availKeys = Object.keys(AVAILABILITIES).filter(Boolean);

  /* Candidatos únicos (o email é único por negócio). */
  const seen = new Set();
  const people = [];
  while (people.length < TOTAL) {
    const o = origin();
    const first = pick(o.first);
    const last = pick(o.last) + (chance(0.25) && o.langs === 'español' ? ' ' + pick(o.last) : '');
    const key = first + last;
    if (seen.has(key)) continue;
    seen.add(key);
    const job = pickJob();
    const availability = pick(availKeys);
    /* Mais candidaturas recentes do que antigas (fila de entrada realista). */
    const daysAgo = Math.floor(Math.pow(rand(), 1.6) * 70);
    const n = String(people.length + 1).padStart(3, '0');
    people.push({
      first, last, langs: o.langs, job: job.title, daysAgo,
      email: `${ascii(first)}.${ascii(last)}${n}@example.com`,
      phone: `000 00 0${n.slice(0, 1)} ${n.slice(1)}`,
      experience: pick(job.exp),
      observations: [pick(OBS), chance(0.6) ? `Idiomas: ${o.langs}.` : ''].filter(Boolean).join(' '),
      availability,
      availabilityLabel: AVAILABILITIES[availability],
      future: chance(0.35),
      jobActive: job.active !== false
    });
  }

  console.log(`A criar ${people.length} candidaturas fictícias…`);

  const bucket = config.supabase.bucketCvs;
  const apps = await inBatches(people, 8, async (p) => {
    const cv = makeCv(p);
    const path = `r/${rid}/${crypto.randomBytes(24).toString('hex')}.pdf`;
    await check(sb().storage.from(bucket).upload(path, cv, {
      contentType: 'application/pdf', cacheControl: 'no-store', upsert: false
    }), 'upload do CV');

    const r = await rpc('submit_application', {
      restaurant_id: rid,
      first_name: p.first,
      last_name: p.last,
      email: p.email,
      phone: p.phone,
      job_id: jobId[p.job],
      job_title: p.job,
      availability: p.availability,
      experience: p.experience,
      observations: p.observations,
      future_consent: p.future,
      future_text: p.future ? futureText(NAME, 365) : '',
      storage_path: path,
      original_filename: `CV ${p.first} ${p.last}.pdf`,
      size_bytes: cv.length,
      consent_version: CONSENT_VERSION,
      privacy_notice_version: PRIVACY_NOTICE_VERSION
    }, 'candidatura demo');
    if (!r || !r.ok) throw new Error('Candidatura recusada: ' + JSON.stringify(r));
    return { ...p, aid: r.application_id };
  });

  console.log('A percorrer o processo de seleção…');

  await inBatches(apps, 8, async (a) => {
    const final = statusFor(a.daysAgo, a.future);
    const appliedMs = now - a.daysAgo * day - Math.floor(rand() * 10) * 3600000;
    const steps = PATH[final];

    for (const status of steps) {
      await rpc('set_application_status', {
        application_id: a.aid, restaurant_id: rid, user_id: uid, status
      }, 'estado demo');
    }

    /* Datas: candidatura no dia certo e cada passo um pouco depois. */
    const span = Math.max(1, a.daysAgo) * day * 0.8;
    const history = await check(sb().from('application_history')
      .select('id, event').eq('application_id', a.aid).order('id'), 'histórico');
    let last = appliedMs;
    for (let i = 0; i < history.length; i += 1) {
      const t = i === 0 ? appliedMs : appliedMs + Math.round(span * (i / (history.length)));
      last = Math.min(t, now - 3600000);
      await check(sb().from('application_history').update({ created_at: iso(i === 0 ? appliedMs : last) })
        .eq('id', history[i].id), 'data do histórico');
    }
    const closed = ['contratado', 'rechazado', 'reserva'].includes(final);
    await check(sb().from('applications').update({
      applied_at: iso(appliedMs),
      last_activity_at: iso(last),
      closed_at: closed ? iso(last) : null,
      favorite: ['entrevista', 'contratado'].includes(final) ? chance(0.5) : chance(0.05)
    }).eq('id', a.aid), 'datas da candidatura');
    await check(sb().rpc('recompute_retention', { p_aid: a.aid }), 'retenção');

    await check(sb().from('notifications').update({
      created_at: iso(appliedMs),
      status: a.daysAgo <= 1 ? 'unread' : 'read',
      read_at: a.daysAgo <= 1 ? null : iso(appliedMs + 3600000)
    }).eq('application_id', a.aid), 'notificação');

    if (steps.length >= 2 && chance(0.55)) {
      await check(sb().from('application_notes').insert({
        application_id: a.aid, restaurant_id: rid, user_id: uid,
        body: pick(NOTES), created_at: iso(last)
      }), 'nota');
    }
  });

  const counts = {};
  for (const r of await check(sb().from('applications').select('status').eq('restaurant_id', rid), 'contagem')) {
    counts[r.status] = (counts[r.status] || 0) + 1;
  }

  console.log('');
  console.log('Demo criada.');
  console.log(`  Negócio: ${NAME} (/r/${reg.slug})`);
  console.log(`  Candidaturas: ${apps.length}`, counts);
  console.log('  Entrar: /demo');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
