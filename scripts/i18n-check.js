'use strict';

/* Lista os textos passados a tr('…') nas views que não têm tradução em
 * src/locales/ (para en ou pt). Uso: node scripts/i18n-check.js [ficheiros…]
 * Sem argumentos verifica todas as views. Só apanha literais com aspas
 * simples ou duplas; tr(variável) não é verificável aqui. */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DICT = {};
const dir = path.join(ROOT, 'src', 'locales');
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
  const part = require(path.join(dir, f));
  for (const [k, v] of Object.entries(part)) {
    if (DICT[k] && JSON.stringify(DICT[k]) !== JSON.stringify(v)) console.log(`! chave repetida com outra tradução em ${f}: ${k}`);
    DICT[k] = v;
  }
}

function walk(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.ejs') ? [path.join(d, e.name)] : []);
}

const files = process.argv.slice(2).length ? process.argv.slice(2).map((f) => path.resolve(f)) : walk(path.join(ROOT, 'src', 'views'));
let missing = 0;
const re = /\btr\(\s*(['"])((?:\\.|(?!\1).)*)\1/g;
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(re)) {
    const key = m[2].replace(/\\(['"\\])/g, '$1');
    const e = DICT[key];
    if (!e || !e.en || !e.pt) {
      missing += 1;
      console.log(`${path.relative(ROOT, file)}: ${key}`);
    }
  }
}
console.log(missing ? `\n${missing} textos sem tradução.` : 'Todas as traduções presentes.');
process.exitCode = missing ? 1 : 0;
