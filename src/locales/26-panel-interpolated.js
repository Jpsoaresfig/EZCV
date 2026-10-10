'use strict';

/* Mensagens do painel com valores variáveis, traduzidas no servidor com
 * req.tr antes do redirecionamento (src/routes/panel.js). */

module.exports = {
  'Estado actualizado: {status}': { en: 'Status updated: {status}', pt: 'Estado atualizado: {status}' },
  'La imagen supera el límite de {mb} MB.': { en: 'The image exceeds the {mb} MB limit.', pt: 'A imagem ultrapassa o limite de {mb} MB.' },
  'Datos del candidato suprimidos: {n} candidatura(s) con sus CV, notas, historial y consentimientos.': {
    en: 'Candidate data erased: {n} application(s) with their CVs, notes, history and consents.',
    pt: 'Dados do candidato apagados: {n} candidatura(s) com os CV, notas, histórico e consentimentos.'
  }
};
