'use strict';

/* Testes unitários — sem rede nem Supabase. Executar: npm run test:unit
 *
 * Cobrem as peças de segurança/privacidade que não precisam de BD: validação
 * de PDF, nomes de ficheiro, deteção de características protegidas,
 * truncagem de IP, política de senha, textos de consentimento e cabeçalhos
 * HTTP de rotas estáticas.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

/* A app exige configuração mínima para carregar; valores fictícios chegam
 * porque estes testes não fazem pedidos ao Supabase. */
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'chave-de-teste-unitario';

const { inspectPdf, safeFilename, isPdf, sniffImage } = require('../src/middleware/uploads');
const { findProtectedTerms } = require('../src/lib/sensitive');
const { truncateIp, emailTag } = require('../src/lib/privacy');
const { passwordProblem } = require('../src/routes/auth');
const { futureText, interestText, CONSENT_VERSION, PRIVACY_NOTICE_VERSION } = require('../src/lib/consent');
const { hashPassword, verifyPassword, safeEqual } = require('../src/lib/crypto');

const pdf = (body) => Buffer.from(`%PDF-1.4\n${body}\n%%EOF\n`, 'latin1');

test('PDF simples é aceite', () => {
  assert.deepEqual(inspectPdf(pdf('1 0 obj << /Type /Catalog /OpenAction [3 0 R /Fit] >> endobj')), { ok: true });
});

test('PDF com conteúdo ativo é recusado (incl. nomes ofuscados)', () => {
  for (const body of ['<< /S /JavaScript /JS (x) >>', '<< /S /Launch /F (cmd.exe) >>', '<< /Type /EmbeddedFile >>',
    '<< /XFA 5 0 R >>', '<< /S /J#61vaScript >>', '<< /RichMedia 1 >>', '<< /S /SubmitForm >>']) {
    assert.equal(inspectPdf(pdf(body)).reason, 'ACTIVO', body);
  }
});

test('nomes parecidos não dão falso positivo', () => {
  assert.equal(inspectPdf(pdf('<< /JSON 1 /JSXType 2 /Launcher 3 >>')).ok, true);
});

test('PDF truncado, não-PDF e vazio são recusados', () => {
  assert.equal(inspectPdf(Buffer.from('%PDF-1.4\n1 0 obj', 'latin1')).reason, 'CORRUPTO');
  assert.equal(inspectPdf(Buffer.from('MZ\x90\x00', 'latin1')).reason, 'NO_PDF');
  assert.equal(inspectPdf(Buffer.alloc(0)).reason, 'NO_PDF');
  assert.equal(isPdf('não é buffer'), false);
});

test('imagens: só PNG/JPEG/WEBP reais', () => {
  assert.equal(sniffImage(Buffer.from('<svg onload=alert(1)>          ')), null);
  assert.equal(sniffImage(Buffer.from('89504e470d0a1a0a0000000d', 'hex')), 'image/png');
});

test('nome de ficheiro: sem diretórios, controlo nem HTML', () => {
  assert.equal(safeFilename('../../etc/passwd'), 'passwd.pdf');
  assert.equal(safeFilename('..\\..\\win.ini'), 'win.ini.pdf');
  assert.equal(safeFilename('<img src=x onerror=alert(1)>.pdf'), '_img src=x onerror=alert(1)_.pdf');
  assert.equal(safeFilename('a\u0000b\r\n.pdf'), 'a_b__.pdf');
  assert.equal(safeFilename(''), 'cv.pdf');
  assert.equal(safeFilename('...'), 'cv.pdf');
  assert.ok(safeFilename('x'.repeat(500)).length <= 124);
});

test('notas: deteta características protegidas, sem falsos positivos óbvios', () => {
  assert.deepEqual(findProtectedTerms('Está embarazada, no contratar'), ['embaraz']);
  assert.ok(findProtectedTerms('Es musulmana y lleva hiyab').includes('musulm'));
  assert.ok(findProtectedTerms('Muy mayor para el puesto').includes('muy mayor'));
  assert.ok(findProtectedTerms('Afiliado al sindicato').length > 0);
  assert.deepEqual(findProtectedTerms('Buena actitud, sabe integrar equipos, velocidad alta, disponibilidad de tarde'), []);
  assert.deepEqual(findProtectedTerms('2 años en sala. Entrevista el viernes.'), []);
});

test('IP truncado (IPv4 /24, IPv6 /48)', () => {
  assert.equal(truncateIp('203.0.113.77'), '203.0.113.0');
  assert.equal(truncateIp('::ffff:10.1.2.3'), '10.1.2.0');
  assert.equal(truncateIp('2001:db8:aa:bb::1'), '2001:db8:aa::/48');
  assert.equal(truncateIp('lixo'), '');
});

test('emailTag: estável, sem o email, normalizado', () => {
  const t = emailTag('Ana@Example.com ');
  assert.equal(t, emailTag('ana@example.com'));
  assert.ok(!t.includes('ana') && /^e:[a-f0-9]{12}$/.test(t));
});

test('política de senha', () => {
  assert.ok(passwordProblem('curta', 'a@b.es'));
  assert.ok(passwordProblem('1234567890', 'a@b.es'));
  assert.ok(passwordProblem('aaaaaaaaaaaa', 'a@b.es'));
  assert.ok(passwordProblem('juanito2024xx', 'juanito@b.es'));
  assert.equal(passwordProblem('caballo-bateria-grapa', 'a@b.es'), '');
});

test('hash de senha: scrypt com salt individual, verificação em tempo constante', () => {
  const a = hashPassword('uma senha longa');
  const b = hashPassword('uma senha longa');
  assert.notEqual(a, b);
  assert.ok(a.startsWith('scrypt$'));
  assert.ok(verifyPassword('uma senha longa', a));
  assert.ok(!verifyPassword('outra', a));
  assert.ok(!verifyPassword('x', 'lixo'));
  assert.ok(!safeEqual('abc', 'abcd'));
});

test('consentimento futuro: específico do estabelecimento, prazo, sem cessão', () => {
  const t = futureText('Bar Sol', 365);
  assert.ok(t.includes('Bar Sol'));
  assert.ok(t.includes('12 meses'));
  assert.ok(t.includes('No autorizo que se compartan con otros establecimientos'));
  assert.ok(t.includes('retirarlo'));
  assert.ok(interestText('Bar Sol', 180).includes('6 meses'));
  assert.ok(CONSENT_VERSION && PRIVACY_NOTICE_VERSION);
});

test('cabeçalhos de segurança, robots.txt e estáticos (sem BD)', async () => {
  const { createApp } = require('../src/app');
  const app = createApp();
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    let res = await fetch(`${base}/robots.txt`);
    const body = await res.text();
    assert.equal(res.status, 200);
    assert.ok(body.includes('Disallow: /panel') && body.includes('Disallow: /admin'));
    assert.ok((res.headers.get('content-security-policy') || '').includes("object-src 'none'"));
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('cross-origin-opener-policy'), 'same-origin');
    assert.equal(res.headers.get('x-powered-by'), null);

    res = await fetch(`${base}/css/style.css`);
    assert.equal(res.status, 200);
    assert.ok((res.headers.get('cache-control') || '').includes('max-age'));

    res = await fetch(`${base}/internal/retention`);
    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});
