'use strict';

/* Aplica as migrations de migrations/ por ordem numérica.
 *
 *   npm run migrate              aplica 0001, 0002, 0003, …
 *   npm run migrate -- --reset   ⚠️ corre 0000_reset.sql antes (apaga tudo)
 *   npm run migrate -- --so 2    aplica apenas 0002
 *
 * O supabase-js não executa DDL, por isso isto usa o psql com a
 * DATABASE_URL. Os ficheiros são idempotentes: reaplicar não tem efeito.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const config = require('../config');

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'migrations');

const args = process.argv.slice(2);
const doReset = args.includes('--reset');
const soIdx = args.indexOf('--so');
const apenas = soIdx !== -1 ? String(args[soIdx + 1] || '').padStart(4, '0') : null;

/* Encontra o psql: variável PSQL, depois a PATH, depois as instalações
 * típicas do Windows (a mais recente primeiro). */
function findPsql() {
  if (process.env.PSQL && fs.existsSync(process.env.PSQL)) return process.env.PSQL;

  const onPath = spawnSync('psql', ['--version'], { encoding: 'utf8' });
  if (!onPath.error) return 'psql';

  const base = 'C:\\Program Files\\PostgreSQL';
  try {
    const versions = fs.readdirSync(base)
      .filter((d) => /^\d+$/.test(d))
      .sort((a, b) => Number(b) - Number(a));

    for (const v of versions) {
      const candidate = path.join(base, v, 'bin', 'psql.exe');
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch { /* não é Windows ou não está instalado */ }

  return null;
}

function listMigrations() {
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .filter((f) => f !== '0000_reset.sql')
    .filter((f) => (apenas ? f.startsWith(apenas) : true))
    .sort();
}

function run(psql, url, file) {
  const full = path.join(MIGRATIONS_DIR, file);

  /* ON_ERROR_STOP=1: para no primeiro erro em vez de continuar a aplicar
   * statements sobre um schema meio construído. */
  const res = spawnSync(psql, [
    url,
    '--variable=ON_ERROR_STOP=1',
    '--no-psqlrc',
    '--quiet',
    '--file', full
  ], { encoding: 'utf8' });

  return res;
}

function main() {
  const url = process.env.DATABASE_URL || '';

  if (!url) {
    console.error('');
    console.error('  Falta DATABASE_URL no .env.');
    console.error('');
    console.error('  Supabase → Project Settings → Database → Connection string → URI');
    console.error('  (é a senha da base de dados, não a service_role)');
    console.error('');
    process.exit(1);
  }

  const psql = findPsql();
  if (!psql) {
    console.error('');
    console.error('  Não encontrei o psql. Instala o PostgreSQL client ou define PSQL');
    console.error('  com o caminho completo para psql.exe.');
    console.error('');
    console.error('  Alternativa: colar o conteúdo de cada ficheiro de migrations/');
    console.error('  no SQL Editor do Supabase, por ordem numérica.');
    console.error('');
    process.exit(1);
  }

  const files = doReset ? ['0000_reset.sql', ...listMigrations()] : listMigrations();

  if (files.length === 0) {
    console.error(`  Nenhuma migration encontrada${apenas ? ` com o prefixo ${apenas}` : ''}.`);
    process.exit(1);
  }

  console.log('');
  console.log('  EZCV — migrations');
  console.log('  -----------------');
  if (doReset) console.log('  ⚠️  --reset: o schema vai ser apagado antes de ser recriado');
  console.log('');

  for (const file of files) {
    process.stdout.write(`  ${file} … `);
    const res = run(psql, url, file);

    if (res.error) {
      console.log('falhou');
      console.error(`\n  Não foi possível executar o psql: ${res.error.message}\n`);
      process.exit(1);
    }

    if (res.status !== 0) {
      console.log('ERRO');
      console.error('');
      if (res.stdout && res.stdout.trim()) console.error(res.stdout.trim());
      if (res.stderr && res.stderr.trim()) console.error(res.stderr.trim());
      console.error('');

      /* Os projetos Supabase recentes só expõem a ligação direta em IPv6.
       * Quem está em IPv4 tem de usar o pooler. */
      const msg = `${res.stderr || ''}${res.stdout || ''}`;
      if (/could not translate host name|Network is unreachable|No route to host|timeout expired/i.test(msg)) {
        console.error('  A ligação falhou, não o SQL. Os projetos Supabase recentes só');
        console.error('  expõem db.<ref>.supabase.co em IPv6. Em IPv4, usar a connection');
        console.error('  string do pooler em modo Session (porta 5432):');
        console.error('');
        console.error('    Project Settings → Database → Connection string → Session pooler');
        console.error('');
      }

      process.exit(1);
    }

    console.log('ok');
    if (res.stderr && res.stderr.trim()) {
      /* Os NOTICE/WARNING do Postgres saem em stderr mesmo quando corre bem. */
      for (const line of res.stderr.trim().split('\n')) console.log(`      ${line}`);
    }
  }

  console.log('');
  console.log('  Migrations aplicadas. A seguir: npm run check');
  console.log('');
}

main();
