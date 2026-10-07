'use strict';

const crypto = require('crypto');

const { sb } = require('../db');

/* Registo de erros do servidor (tabela error_events, migration 0009).
 *
 * Cada erro 500 recebe um código curto (ref) que a página de erro mostra.
 * Quem reporta o problema pode citar esse código e o admin encontra o erro
 * exato em /admin/reportes.
 *
 * Minimização: o caminho vai sem query string, e mensagem e stack passam por
 * redact() antes de gravar — uma mensagem do Postgres pode citar o valor que
 * falhou («Key (email)=(ana@…)»). Nunca lança: registar o erro não pode
 * causar outro. */

function newRef() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

/* Emails e sequências longas de dígitos (telefones, documentos) saem. */
function redact(text) {
  return String(text || '')
    .replace(/[^\s@()<>"'=,;:]+@[^\s@()<>"'=,;:]+/g, '[email]')
    .replace(/\+?\d[\d\s-]{7,}\d/g, '[número]');
}

function stackHead(err) {
  const stack = String((err && err.stack) || '');
  return stack.split('\n').slice(0, 12).join('\n');
}

function recordError(err, req, ref) {
  const user = req.user || {};
  const row = {
    ref,
    status: 500,
    method: String(req.method || '').slice(0, 10),
    path: String(req.path || '').slice(0, 200),
    message: redact(err && err.message).slice(0, 500),
    stack: redact(stackHead(err)).slice(0, 3000),
    user_id: user.id || null,
    restaurant_id: user.restaurant_id || null,
    user_agent: String(req.headers['user-agent'] || '').slice(0, 200)
  };

  return Promise.resolve(sb().from('error_events').insert(row))
    .then(({ error }) => {
      if (error) console.error('[error-events] falha:', error.message);
    })
    .catch((e) => console.error('[error-events] falha:', e.message));
}

module.exports = { newRef, redact, recordError };
