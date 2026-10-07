'use strict';

/* Opções comuns dos QR gerados no servidor (painel do negócio e admin).
 * Correção «M» aguenta pequenos riscos no papel; margem 4 é a zona de
 * silêncio que os leitores esperam. */
const QR_OPTIONS = { errorCorrectionLevel: 'M', margin: 4 };

module.exports = { QR_OPTIONS };
