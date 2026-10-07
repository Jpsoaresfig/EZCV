'use strict';

/* Endpoint de manutenção para o agendador (ex.: Vercel Cron).
 *
 *   GET /internal/retention   Authorization: Bearer <CRON_SECRET>
 *
 * Desativado (404) se CRON_SECRET não estiver definido ou se RETENTION_AUTO
 * não for 1: a supressão automática só deve ser ligada depois de os prazos
 * terem sido validados juridicamente. Não usa sessão nem cookies; a
 * comparação do segredo é em tempo constante. Não devolve dados pessoais.
 */

const express = require('express');

const { safeEqual } = require('../lib/crypto');
const { runRetention } = require('../lib/retention');

const router = express.Router();

router.get('/internal/retention', async (req, res) => {
  const secret = process.env.CRON_SECRET || '';
  if (!secret || secret.length < 32 || process.env.RETENTION_AUTO !== '1') return res.status(404).end();

  const header = String(req.get('authorization') || '');
  if (!safeEqual(header, `Bearer ${secret}`)) return res.status(404).end();

  try {
    const report = await runRetention({ apply: true });
    res.json({
      ok: true,
      applications: report.applications,
      cvsRemoved: report.cvsRemoved,
      orphans: report.orphans
    });
  } catch (err) {
    console.error('[retention] falhou:', err.message);
    res.status(500).json({ ok: false });
  }
});

module.exports = router;
