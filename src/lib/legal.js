'use strict';

/* Identificação do operador da plataforma e versões dos textos legais.
 *
 * Os dados do operador vêm do ambiente. Enquanto não forem preenchidos, as
 * páginas mostram os marcadores [RAZÓN SOCIAL], [NIF]… — de propósito: é
 * informação obrigatória (art. 10 LSSI; art. 13 RGPD) que não pode ser
 * inventada. Ver docs/legal/00-legal-review-required.md.
 *
 * Versões: ao alterar o significado de /terminos ou /encargo, incrementar a
 * versão. A versão aceite fica gravada no restaurante (terms_version,
 * dpa_version, terms_accepted_at).
 */

const TERMS_VERSION = '2026-10-08-borrador';
const DPA_VERSION = '2026-10-borrador';
const COOKIES_VERSION = '2026-10';

const operator = {
  name: process.env.OPERATOR_LEGAL_NAME || '[RAZÓN SOCIAL]',
  nif: process.env.OPERATOR_NIF || '[NIF]',
  address: process.env.OPERATOR_ADDRESS || '[DOMICILIO]',
  email: process.env.OPERATOR_PRIVACY_EMAIL || '[EMAIL DE PRIVACIDAD]',
  registry: process.env.OPERATOR_REGISTRY || '[DATOS REGISTRALES, SI APLICA]',
  dpo: process.env.OPERATOR_DPO || ''
};

function operatorComplete() {
  return !Object.entries(operator).some(([k, v]) => k !== 'dpo' && /^\[.*\]$/.test(v));
}

module.exports = { TERMS_VERSION, DPA_VERSION, COOKIES_VERSION, operator, operatorComplete };
