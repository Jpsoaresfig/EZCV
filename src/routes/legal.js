'use strict';

/* Páginas de privacidade (§6, §29).
 *
 * Nota honesta sobre o âmbito: estas páginas e a estrutura de consentimentos
 * preparam a plataforma para conformidade com o RGPD — não a declaram
 * conforme. O texto final e a identificação do responsável pelo tratamento
 * têm de ser revistos juridicamente antes de uso real em Espanha.
 */

const express = require('express');

const { SELECTION_TEXT, FUTURE_TEXT, CONSENT_VERSION } = require('../lib/consent');

const router = express.Router();

router.get('/privacidad', (req, res) => {
  res.render('legal/privacy', {
    consentVersion: CONSENT_VERSION,
    selectionText: SELECTION_TEXT,
    futureText: FUTURE_TEXT
  });
});

module.exports = router;
