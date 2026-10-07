'use strict';

/* Aviso sobre categorias especiais e características protegidas em texto livre
 * escrito pelo recrutador (notas internas).
 *
 * ISTO NÃO É UMA SOLUÇÃO para dados sensíveis nem para discriminação. É uma
 * fricção: uma lista curta de termos que, numa nota de recrutamento, quase
 * sempre indicam informação que não deve ser registada (art. 9 RGPD; art. 5 e
 * 45 da Ley 3/2023 de Empleo; art. 16.1.c TRLISOS). Tem falsos positivos e
 * falsos negativos — basta escrever de outra forma. Por isso:
 *
 *   - não bloqueia definitivamente: pede confirmação explícita;
 *   - a confirmação fica registada no log de auditoria (sem o conteúdo);
 *   - a proteção real é a formação e a responsabilidade do estabelecimento
 *     (docs/legal/04-recruitment-discrimination-risks.md).
 */

const TERMS = [
  // saúde / deficiência
  'embaraz', 'enferm', 'discapac', 'minusv', 'baja medica', 'baja médica', 'salud mental',
  'depresi', 'ansiedad', 'diabet', 'vih', 'cancer', 'cáncer',
  // religião / crenças
  'religi', 'musulm', 'islam', 'cristian', 'catolic', 'católic', 'judio', 'judia ', 'hiyab',
  // origem / nacionalidade / etnia
  'gitan', 'raza', 'etnia', 'nacionalidad', 'extranjer', 'inmigrant', 'moro', 'sudaca', 'negr',
  // orientação / identidade
  'homosex', 'gay', 'lesbi', 'transex', 'orientacion sexual', 'orientación sexual',
  // sindicato / política
  'sindica', 'afiliad', 'ideolog', 'politic', 'polític', 'vota a', 'comunista', 'facha',
  // idade / família / estado civil
  'muy mayor', 'muy joven', 'demasiado mayor', 'demasiado joven', 'edad', 'años de edad',
  'hijos', 'quedarse embarazada', 'casad', 'divorci', 'solter',
  // sexo
  'no contratar mujer', 'no contratar hombre', 'solo hombres', 'solo mujeres', 'por ser mujer', 'por ser hombre'
];

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

const NORMALIZED = [...new Set(TERMS.map(normalize))];

/* Devolve os termos encontrados (normalizados), ou [] se nenhum. Procura no
 * início de palavra para reduzir falsos positivos (ex.: «negr» não apanha
 * «integrar»). */
function findProtectedTerms(text) {
  const t = ` ${normalize(text).replace(/[^a-z0-9ñ ]+/g, ' ')} `;
  return NORMALIZED.filter((term) => t.includes(` ${term}`));
}

module.exports = { findProtectedTerms };
