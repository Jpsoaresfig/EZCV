'use strict';

/* Política de retenção (§30).
 *
 * O MVP não apaga nada automaticamente — isso exigiria uma política definida
 * e comunicada aos candidatos. O que existe é a estrutura para a aplicar:
 *
 *   applications.retention_until  quando os dados deixam de ser necessários
 *   applications.anonymized_at    quando foram anonimizados
 *
 * Este script é o passo seguinte dessa estrutura, e por omissão corre em
 * SIMULAÇÃO: mostra o que seria afetado sem tocar em nada. Só com --aplicar
 * é que escreve, e mesmo assim apenas em candidaturas cuja retention_until já
 * passou e que não tenham sido anonimizadas antes.
 *
 *   node src/db/retention.js                 → simulação (não altera nada)
 *   node src/db/retention.js --aplicar        → anonimiza o que está vencido
 *   node src/db/retention.js --dias 365       → marca retention_until
 */

const config = require('../config');
const { sb, many, run } = require('./index');

const args = process.argv.slice(2);
const apply = args.includes('--aplicar');
const diasIdx = args.indexOf('--dias');
const dias = diasIdx !== -1 ? parseInt(args[diasIdx + 1], 10) : null;

/* Estados em que a candidatura ainda está em uso legítimo: nunca entram numa
 * limpeza automática, mesmo com a data vencida. */
const ESTADOS_ATIVOS = ['nuevo', 'revisado', 'contactar', 'contactado', 'entrevista'];

async function marcarPrazos(diasRetencao) {
  const limite = new Date(Date.now() + diasRetencao * 24 * 60 * 60 * 1000).toISOString();

  const candidatas = await many(
    sb().from('applications')
      .select('id, status')
      .is('retention_until', null)
      .in('status', ['contratado', 'rechazado', 'reserva']),
    'candidaturas sem prazo'
  );

  console.log(`  candidaturas sem prazo definido: ${candidatas.length}`);

  if (candidatas.length === 0) return;

  if (!apply) {
    console.log(`  SIMULAÇÃO: definiria retention_until = ${limite.slice(0, 10)} nessas ${candidatas.length}`);
    return;
  }

  await run(
    sb().from('applications')
      .update({ retention_until: limite })
      .is('retention_until', null)
      .in('status', ['contratado', 'rechazado', 'reserva']),
    'definir prazos'
  );

  console.log(`  prazo definido em ${candidatas.length} candidatura(s)`);
}

async function anonimizarVencidas() {
  const agora = new Date().toISOString();

  const vencidas = await many(
    sb().from('applications')
      .select('id, status, retention_until, candidate_id')
      .not('retention_until', 'is', null)
      .lt('retention_until', agora)
      .is('anonymized_at', null),
    'candidaturas vencidas'
  );

  const elegiveis = vencidas.filter((a) => !ESTADOS_ATIVOS.includes(a.status));
  const protegidas = vencidas.length - elegiveis.length;

  console.log(`  candidaturas com prazo vencido: ${vencidas.length}`);
  if (protegidas > 0) {
    console.log(`  ${protegidas} protegida(s) por estarem num processo ativo`);
  }

  if (elegiveis.length === 0) return;

  if (!apply) {
    console.log(`  SIMULAÇÃO: anonimizaria ${elegiveis.length} candidatura(s)`);
    console.log(`  ids: ${elegiveis.map((a) => a.id).join(', ')}`);
    console.log('  (corre com --aplicar para executar)');
    return;
  }

  /* Anonimizar, não apagar: a candidatura fica no histórico do restaurante
   * sem dados pessoais, e os CVs são removidos do Storage. */
  console.log('  anonimização ainda não implementada — requer política definida.');
  console.log('  Passos a implementar quando a política existir:');
  console.log('    1. apagar o objeto do bucket cvs e a linha em cvs;');
  console.log('    2. substituir nome/email/telefone/documento do candidato;');
  console.log('    3. gravar anonymized_at;');
  console.log('    4. registar o evento no histórico da candidatura.');
}

async function main() {
  config.assertConfig();

  console.log('');
  console.log('  Fíchame — retenção de dados');
  console.log('  ------------------------');
  console.log(`  modo: ${apply ? 'APLICAR (escreve na base de dados)' : 'simulação (não altera nada)'}`);
  console.log('');

  if (dias !== null) {
    if (!Number.isInteger(dias) || dias < 1) {
      console.error('  --dias requer um número inteiro de dias maior que zero.');
      process.exit(1);
    }
    console.log(`  Definir prazos a ${dias} dias:`);
    await marcarPrazos(dias);
    console.log('');
  }

  console.log('  Prazos vencidos:');
  await anonimizarVencidas();
  console.log('');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
