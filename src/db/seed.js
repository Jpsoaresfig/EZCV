'use strict';

/* Cria o administrador da plataforma (§22).
 * Executar: npm run setup
 */

const { sb, one } = require('./index');
const config = require('../config');
const { hashPassword } = require('../lib/crypto');

const email = process.env.ADMIN_EMAIL || 'admin@fichame.local';
const password = process.env.ADMIN_PASSWORD || '';
const name = process.env.ADMIN_NAME || 'Administrador Fíchame';

async function main() {
  config.assertConfig();

  /* Sem senha definida o seed não inventa uma: uma senha previsível num
   * painel de administração é um problema de segurança, não uma conveniência. */
  if (!password) {
    console.error('');
    console.error('  Define ADMIN_PASSWORD no .env antes de correr `npm run setup`.');
    console.error('  Usa uma senha longa e única (mínimo 12 caracteres).');
    console.error('');
    process.exit(1);
  }

  if (password.length < 12) {
    console.error('');
    console.error('  ADMIN_PASSWORD tem de ter pelo menos 12 caracteres (conta com acesso a toda a plataforma).');
    console.error('');
    process.exit(1);
  }

  const existing = await one(sb().from('users').select('id').eq('email', email), 'admin existente');

  if (existing) {
    console.log(`Admin já existe: ${email}`);
    process.exit(0);
  }

  const { error } = await sb().from('users').insert({
    email,
    password_hash: hashPassword(password),
    full_name: name,
    role: 'admin'
  });

  if (error) {
    console.error('Falha a criar o admin:', error.message);
    process.exit(1);
  }

  console.log('Admin criado com sucesso.');
  console.log(`  Email: ${email}`);
  console.log('  Senha: a que definiste em ADMIN_PASSWORD');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
