'use strict';

/* Política de retenção — CLI.
 *
 *   npm run retention                → SIMULAÇÃO: mostra o que seria apagado
 *   npm run retention -- --aplicar   → aplica: suprime candidaturas vencidas,
 *                                      CVs no Storage, CVs órfãos, sessões e
 *                                      tokens expirados, logs antigos
 *
 * A regra, os prazos por restaurante e as exceções (legal_hold) estão em
 * src/lib/retention.js e na função SQL recompute_retention (migration 0005).
 * O resultado fica registado em security_logs (evento retencion_aplicada),
 * só com contagens — sem dados pessoais.
 *
 * Os prazos por omissão são valores técnicos provisórios: REQUIERE REVISIÓN
 * JURÍDICA antes de usar --aplicar com dados reais.
 */

const { runRetention } = require('../lib/retention');

const apply = process.argv.slice(2).includes('--aplicar');

async function main() {
  console.log('');
  console.log('  Fíchame — retenção de dados');
  console.log('  ---------------------------');
  console.log(`  modo: ${apply ? 'APLICAR (apaga dados)' : 'simulação (não altera nada)'}`);
  console.log('');

  const report = await runRetention({ apply, log: (m) => console.log(`  ${m}`) });

  console.log('');
  if (Object.keys(report.byRestaurant).length > 0) {
    console.log('  por restaurante (id → candidaturas):');
    for (const [rid, n] of Object.entries(report.byRestaurant)) console.log(`    ${rid} → ${n}`);
    console.log('');
  }
  if (!apply) console.log('  Nada foi alterado. Corre com --aplicar para executar.\n');
}

main().catch((err) => {
  console.error(`  ${err.message}`);
  process.exit(1);
});
