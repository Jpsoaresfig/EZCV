'use strict';

/* Ícones SVG inline, expostos às views como `icon('home')`.
 *
 * Inline e não ficheiros: são poucos, evitam um pedido HTTP por ícone, e
 * herdam a cor do texto através de `currentColor` — o que faz o estado ativo
 * da navegação funcionar sem precisar de duas versões de cada imagem.
 *
 * Expostos via app.locals porque o EJS não partilha funções entre includes.
 * Nas views usar `<%- icon('home') %>` (sem escape: é marcação, não dados).
 */

const PATHS = {
  home:
    '<path d="M3 10.5 12 3l9 7.5"/>' +
    '<path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5"/>' +
    '<path d="M9.5 21v-6h5v6"/>',

  people:
    '<circle cx="9" cy="8" r="3.2"/>' +
    '<path d="M2.5 20a6.5 6.5 0 0 1 13 0"/>' +
    '<path d="M16 5.2a3.2 3.2 0 0 1 0 5.9"/>' +
    '<path d="M17.8 14.4A6.5 6.5 0 0 1 21.5 20"/>',

  jobs:
    '<rect x="2.8" y="7" width="18.4" height="13" rx="2"/>' +
    '<path d="M8.5 7V5.2A1.7 1.7 0 0 1 10.2 3.5h3.6A1.7 1.7 0 0 1 15.5 5.2V7"/>' +
    '<path d="M2.8 12.5h18.4"/>',

  bell:
    '<path d="M18 8.6a6 6 0 1 0-12 0c0 5-2.2 6.4-2.2 6.4h16.4S18 13.6 18 8.6"/>' +
    '<path d="M13.7 19a2 2 0 0 1-3.4 0"/>',

  store:
    '<path d="M3.5 9.5 5 4h14l1.5 5.5"/>' +
    '<path d="M4.5 9.5h15V20a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z"/>' +
    '<path d="M3.5 9.5a2.6 2.6 0 0 0 5.2 0 2.6 2.6 0 0 0 5.2 0 2.6 2.6 0 0 0 5.2 0"/>' +
    '<path d="M9.5 21v-5.5h5V21"/>',

  cog:
    '<circle cx="12" cy="12" r="3.1"/>' +
    '<path d="M12 2.5a1.5 1.5 0 0 1 1.5 1.5v.6a1.5 1.5 0 0 0 2.2 1.1l.4-.2a1.5 1.5 0 0 1 2 .6l.3.5a1.5 1.5 0 0 1-.5 2l-.5.3a1.5 1.5 0 0 0 0 2.6l.5.3a1.5 1.5 0 0 1 .5 2l-.3.5a1.5 1.5 0 0 1-2 .6l-.4-.2a1.5 1.5 0 0 0-2.2 1.1v.6a1.5 1.5 0 0 1-1.5 1.5h-.6a1.5 1.5 0 0 1-1.5-1.5v-.5a1.5 1.5 0 0 0-2.2-1.2l-.4.2a1.5 1.5 0 0 1-2-.6l-.3-.5a1.5 1.5 0 0 1 .5-2l.5-.3a1.5 1.5 0 0 0 0-2.6l-.5-.3a1.5 1.5 0 0 1-.5-2l.3-.5a1.5 1.5 0 0 1 2-.6l.4.2A1.5 1.5 0 0 0 9.9 4.6V4a1.5 1.5 0 0 1 1.5-1.5z"/>',

  chart:
    '<path d="M3 3v16.5a1.5 1.5 0 0 0 1.5 1.5H21"/>' +
    '<path d="M7.5 15.5V11"/>' +
    '<path d="M12 15.5V7"/>' +
    '<path d="M16.5 15.5v-6"/>',

  shield:
    '<path d="M12 3 4.5 6v6c0 4.6 3.1 7.9 7.5 9 4.4-1.1 7.5-4.4 7.5-9V6z"/>' +
    '<path d="m9.2 12 2 2 3.6-3.8"/>',

  nfc:
    '<path d="M6.5 8.5a7 7 0 0 0 0 7"/>' +
    '<path d="M9.8 10.4a3.2 3.2 0 0 0 0 3.2"/>' +
    '<path d="M14.2 10.4a3.2 3.2 0 0 1 0 3.2"/>' +
    '<path d="M17.5 8.5a7 7 0 0 1 0 7"/>'
};

function icon(name) {
  const body = PATHS[name];
  if (!body) return '';

  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
         'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ' +
         'focusable="false">' + body + '</svg>';
}

/* Iniciais do candidato para o avatar: identifica a pessoa numa lista longa
 * sem pedir uma fotografia que não é necessária para o processo. */
function initials(first, last) {
  const a = String(first || '').trim();
  const b = String(last || '').trim();
  const out = (a.charAt(0) + b.charAt(0)).toUpperCase();
  return out || (a.charAt(0) || '?').toUpperCase();
}

module.exports = { icon, initials };
