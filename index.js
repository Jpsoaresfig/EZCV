'use strict';

/* Entrada para a Vercel (preset Express).
 *
 * A Vercel procura app.js, index.js, server.js e só depois src/*, e espera
 * que o ficheiro exporte a app Express. Sem este ficheiro escolhia
 * src/app.js, que exporta a fábrica { createApp } e não uma app.
 *
 * Localmente continua a usar-se `npm start` (src/server.js), que também
 * verifica o schema do Supabase no arranque. Aqui essa verificação fica de
 * fora para não pesar em cada arranque a frio; usar `npm run check`.
 *
 * Se faltar configuração, assertConfig() lança o erro com a lista do que
 * falta — aparece nos Runtime Logs da Vercel.
 */

const config = require('./src/config');
const { createApp } = require('./src/app');

config.assertConfig();

module.exports = createApp();
