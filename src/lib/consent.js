'use strict';

/* Consentimentos (§6, §29).
 *
 * Dois consentimentos independentes: um obrigatório para participar no
 * processo, outro opcional para conservação de dados para vagas futuras.
 *
 * O texto é guardado junto com a candidatura, não apenas a versão: se amanhã
 * o texto mudar, continua a ser possível provar o que o candidato leu e
 * aceitou naquele momento. Ao alterar qualquer texto aqui, incrementar
 * CONSENT_VERSION — nunca editar um texto mantendo a versão.
 */

const CONSENT_VERSION = 'v2-2026-10';

const SELECTION_TEXT =
  'Autorizo el tratamiento de mis datos personales y de mi currículum por parte ' +
  'del establecimiento con la finalidad exclusiva de gestionar mi candidatura en ' +
  'este proceso de selección. Mis datos no se cederán a terceros ni se utilizarán ' +
  'para otras finalidades.';

const FUTURE_TEXT =
  'Autorizo además, de forma voluntaria, que el establecimiento conserve mis datos ' +
  'y mi currículum para considerarme en futuras oportunidades de empleo. Puedo ' +
  'retirar este consentimiento en cualquier momento.';

/* Texto completo associado a uma candidatura, conforme o que foi aceite. */
function consentSnapshot(futureAccepted) {
  return futureAccepted ? `${SELECTION_TEXT}\n\n${FUTURE_TEXT}` : SELECTION_TEXT;
}

module.exports = { CONSENT_VERSION, SELECTION_TEXT, FUTURE_TEXT, consentSnapshot };
