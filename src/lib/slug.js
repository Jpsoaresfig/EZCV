'use strict';

function slugify(text) {
  const map = {
    á: 'a', à: 'a', â: 'a', ä: 'a', ã: 'a', å: 'a',
    é: 'e', è: 'e', ê: 'e', ë: 'e',
    í: 'i', ì: 'i', î: 'i', ï: 'i',
    ó: 'o', ò: 'o', ô: 'o', ö: 'o', õ: 'o', ø: 'o',
    ú: 'u', ù: 'u', û: 'u', ü: 'u',
    ñ: 'n', ç: 'c', ß: 'ss'
  };
  return String(text)
    .toLowerCase()
    .replace(/[áàâäãåéèêëíìîïóòôöõúùûüñçß]/g, (c) => map[c] || c)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'establecimiento';
}

/* A desambiguação do slug (-2, -3, …) é feita dentro da função
 * register_restaurant no Postgres, para ser à prova de corrida: dois registos
 * simultâneos com o mesmo nome não podem gerar o mesmo slug. */

module.exports = { slugify };
