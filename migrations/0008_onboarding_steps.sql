-- ===========================================================================
-- Fíchame — 0008_onboarding_steps
--
-- Guia «Primeros pasos» do painel: os passos 3 (ver a página como candidato)
-- e 4 (QR / etiqueta) não têm um dado próprio que diga se foram feitos, por
-- isso ficam registados quando o dono abre a página ou o QR a partir do painel.
--
-- Só ACRESCENTA. Idempotente. Aplicar depois de 0007.
-- ===========================================================================

alter table restaurants add column if not exists page_viewed_at timestamptz;
alter table restaurants add column if not exists qr_viewed_at   timestamptz;
