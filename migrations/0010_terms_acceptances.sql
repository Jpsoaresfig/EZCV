-- ===========================================================================
-- Fíchame — 0010_terms_acceptances
--
-- Histórico de aceitações de /terminos e /encargo. restaurants.terms_version
-- guarda só a última; isto guarda todas, para poder provar que versão cada
-- negócio aceitou, quando e por quem (art. 11 dos termos).
--
-- restaurant_id fica a null se o negócio for apagado: a prova sobrevive ao
-- cierre de la cuenta, com a razão social copiada no momento da aceitação.
--
-- Só ACRESCENTA. Idempotente. Aplicar depois de 0009.
-- ===========================================================================

create table if not exists terms_acceptances (
  id             bigint generated always as identity primary key,
  restaurant_id  bigint      references restaurants(id) on delete set null,
  user_id        bigint      references users(id) on delete set null,
  legal_name     text        not null default '' check (char_length(legal_name) <= 150),
  terms_version  text        not null check (char_length(terms_version) between 1 and 40),
  dpa_version    text        not null check (char_length(dpa_version) between 1 and 40),
  via            text        not null check (via in ('registro', 'panel', 'historico')),
  ip             text        not null default '' check (char_length(ip) <= 64),
  accepted_at    timestamptz not null default now()
);

create index if not exists idx_terms_acceptances_restaurant on terms_acceptances (restaurant_id, accepted_at desc);

-- Negócios que já tinham aceitado no registo: entram no histórico com a
-- data que estava em restaurants (sem utilizador nem IP, que não se guardaram).
insert into terms_acceptances (restaurant_id, legal_name, terms_version, dpa_version, via, accepted_at)
select r.id, r.legal_name, r.terms_version, r.dpa_version, 'historico', r.terms_accepted_at
from restaurants r
where r.terms_version <> '' and r.dpa_version <> '' and r.terms_accepted_at is not null
  and not exists (select 1 from terms_acceptances t where t.restaurant_id = r.id);

-- RLS deny-all e revogação (como em 0001/0005): só o service_role lê.
do $$
declare
  has_anon boolean := exists (select 1 from pg_roles where rolname = 'anon');
  has_auth boolean := exists (select 1 from pg_roles where rolname = 'authenticated');
begin
  execute 'alter table terms_acceptances enable row level security';
  if has_anon then execute 'revoke all on table terms_acceptances from anon'; end if;
  if has_auth then execute 'revoke all on table terms_acceptances from authenticated'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- purge_test_data (v4) — como a v3 (0009) e também as aceitações dos
-- negócios de teste (com set null não sairiam por cascata).
-- ---------------------------------------------------------------------------
create or replace function purge_test_data(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_prefix text := p->>'test_prefix';
  v_paths  text[];
  v_media  text[];
  v_rids   bigint[];
  v_n      int;
begin
  if coalesce(v_prefix, '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'missing_prefix');
  end if;

  select coalesce(array_agg(id), '{}'::bigint[]) into v_rids
  from restaurants where test_prefix = v_prefix;

  select coalesce(array_agg(cv.storage_path), '{}'::text[]) into v_paths
  from cvs cv where cv.restaurant_id = any(v_rids);

  select coalesce(array_agg(x) filter (where x is not null and x <> ''), '{}'::text[]) into v_media
  from restaurants r
  cross join lateral (values (r.logo_path), (r.photo_path)) as t(x)
  where r.id = any(v_rids);

  delete from security_logs
  where restaurant_id = any(v_rids)
     or user_id in (select id from users where restaurant_id = any(v_rids) or email like '%' || v_prefix || '%')
     or detail like '%' || v_prefix || '%';

  -- A rota /__test/erro só existe com EZCV_TEST_PREFIX; os pedidos anónimos
  -- não têm negócio associado.
  delete from error_events
  where restaurant_id = any(v_rids)
     or user_id in (select id from users where restaurant_id = any(v_rids) or email like '%' || v_prefix || '%')
     or starts_with(path, '/__test/');

  delete from terms_acceptances where restaurant_id = any(v_rids);

  delete from users where restaurant_id = any(v_rids);

  with gone as (
    delete from restaurants where id = any(v_rids) returning 1
  ) select count(*)::int into v_n from gone;

  delete from users where restaurant_id is null and email like '%' || v_prefix || '%';

  return jsonb_build_object('ok', true, 'restaurants', v_n, 'paths', v_paths, 'media', v_media);
end;
$$;

do $$
declare
  has_anon boolean := exists (select 1 from pg_roles where rolname = 'anon');
  has_auth boolean := exists (select 1 from pg_roles where rolname = 'authenticated');
  has_svc  boolean := exists (select 1 from pg_roles where rolname = 'service_role');
begin
  execute 'alter function purge_test_data(jsonb) set search_path = public, pg_temp';
  execute 'revoke all on function purge_test_data(jsonb) from public';
  if has_anon then execute 'revoke all on function purge_test_data(jsonb) from anon'; end if;
  if has_auth then execute 'revoke all on function purge_test_data(jsonb) from authenticated'; end if;
  if has_svc  then execute 'grant execute on function purge_test_data(jsonb) to service_role'; end if;
end;
$$;

insert into schema_migrations (version) values ('0010_terms_acceptances')
on conflict (version) do nothing;

notify pgrst, 'reload schema';
