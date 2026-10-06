'use strict';

/* Verificação do estado do Supabase.
 *
 * Usado no arranque do servidor e disponível como `npm run check` para
 * diagnosticar um ambiente novo sem precisar de abrir o painel.
 */

const config = require('../config');
const { sb, many } = require('../db');
const storage = require('../lib/storage');

const REQUIRED_MIGRATIONS = ['0001_init', '0002_views_rpc', '0003_storage'];

/* As views e funções de que o código depende. Sem isto, uma migration
 * esquecida só daria erro no primeiro pedido que a usasse. */
const REQUIRED_VIEWS = [
  'session_context',
  'application_list',
  'application_status_counts',
  'restaurant_metrics',
  'job_list',
  'platform_metrics',
  'admin_restaurant_list',
  'admin_user_list'
];

async function appliedMigrations() {
  const rows = await many(
    sb().from('schema_migrations').select('version'),
    'versões do schema'
  );
  return rows.map((r) => r.version);
}

async function assertSchema() {
  let applied;

  try {
    applied = await appliedMigrations();
  } catch (err) {
    throw new Error(
      `Não foi possível ler o schema do Supabase.\n${err.message}\n\n` +
      'Confirma que:\n' +
      '  1. SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env estão corretos;\n' +
      '  2. aplicaste migrations/0001_init.sql no SQL Editor do Supabase.'
    );
  }

  const missing = REQUIRED_MIGRATIONS.filter((v) => !applied.includes(v));
  if (missing.length > 0) {
    throw new Error(
      `Migrations em falta: ${missing.join(', ')}.\n` +
      'Aplica os ficheiros correspondentes de migrations/ no SQL Editor do Supabase,\n' +
      'por ordem numérica.'
    );
  }

  /* Uma view em falta significa que 0002 foi aplicado a meio ou que o
   * PostgREST ainda não recarregou o schema. */
  const brokenViews = [];
  for (const view of REQUIRED_VIEWS) {
    const { error } = await sb().from(view).select('*').limit(0);
    if (error) brokenViews.push(`${view} (${error.message})`);
  }

  if (brokenViews.length > 0) {
    throw new Error(
      `Views inacessíveis:\n  ${brokenViews.join('\n  ')}\n\n` +
      'Reaplica migrations/0002_views_rpc.sql. Se as views existem mas dão erro,\n' +
      "corre `notify pgrst, 'reload schema';` no SQL Editor."
    );
  }

  await storage.assertBuckets();

  return true;
}

/* `npm run check` */
async function main() {
  console.log('');
  console.log('  EZCV — verificação do Supabase');
  console.log('  ------------------------------');

  try {
    config.assertConfig();
    console.log(`  ✓ .env   ${config.supabase.url}`);
  } catch (err) {
    console.error(`  ✗ .env\n\n  ${String(err.message).split('\n').join('\n  ')}\n`);
    process.exit(1);
  }

  try {
    const applied = await appliedMigrations();
    console.log(`  ✓ schema  migrations aplicadas: ${applied.sort().join(', ') || 'nenhuma'}`);
  } catch (err) {
    console.error(`  ✗ schema\n\n  ${String(err.message).split('\n').join('\n  ')}\n`);
    process.exit(1);
  }

  try {
    await assertSchema();
    console.log('  ✓ views   todas acessíveis');
    console.log(`  ✓ storage ${config.supabase.bucketCvs} e ${config.supabase.bucketMedia} privados`);
  } catch (err) {
    console.error(`  ✗ ${String(err.message).split('\n').join('\n  ')}\n`);
    process.exit(1);
  }

  console.log('');
  console.log('  Tudo pronto.');
  console.log('');
}

module.exports = { assertSchema, appliedMigrations };

if (require.main === module) main();
