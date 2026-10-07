-- ===========================================================================
-- Fíchame — 0009_problem_reports
--
-- Durante a prova de mercado:
--   problem_reports  o dono do negócio reporta um erro, uma sugestão ou uma
--                    dúvida a partir do painel (/panel/reportar);
--   error_events     cada erro 500 do servidor fica registado com um código
--                    curto (ref) que a página de erro mostra e que o reporte
--                    pode levar, para ligar os dois.
-- Ambos só são lidos pelo admin (/admin/reportes), via service_role.
--
-- Minimização: o servidor redige emails e números longos das mensagens de
-- erro antes de gravar; os reportes avisam para não incluir dados de
-- candidatos. Retenção em src/lib/retention.js.
--
-- Só ACRESCENTA. Idempotente. Aplicar depois de 0008.
-- ===========================================================================

create table if not exists problem_reports (
  id             bigint generated always as identity primary key,
  restaurant_id  bigint      references restaurants(id) on delete cascade,
  user_id        bigint      references users(id) on delete set null,
  kind           text        not null check (kind in ('error', 'sugerencia', 'duda')),
  message        text        not null check (char_length(message) between 1 and 2000),
  page           text        not null default '' check (char_length(page) <= 200),
  error_ref      text        not null default '' check (error_ref ~ '^([A-F0-9]{6})?$'),
  user_agent     text        not null default '' check (char_length(user_agent) <= 200),
  status         text        not null default 'nuevo' check (status in ('nuevo', 'revisando', 'resuelto')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_problem_reports_created on problem_reports (created_at desc);
create index if not exists idx_problem_reports_restaurant on problem_reports (restaurant_id, created_at desc);

create table if not exists error_events (
  id             bigint generated always as identity primary key,
  ref            text        not null check (ref ~ '^[A-F0-9]{6}$'),
  status         int         not null default 500,
  method         text        not null default '' check (char_length(method) <= 10),
  path           text        not null default '' check (char_length(path) <= 200),
  message        text        not null default '' check (char_length(message) <= 500),
  stack          text        not null default '' check (char_length(stack) <= 3000),
  user_id        bigint      references users(id) on delete set null,
  restaurant_id  bigint      references restaurants(id) on delete set null,
  user_agent     text        not null default '' check (char_length(user_agent) <= 200),
  created_at     timestamptz not null default now()
);

create index if not exists idx_error_events_created on error_events (created_at desc);
create index if not exists idx_error_events_ref on error_events (ref);

-- RLS deny-all e revogação (como em 0001/0005): só o service_role lê.
do $$
declare
  t text;
  has_anon boolean := exists (select 1 from pg_roles where rolname = 'anon');
  has_auth boolean := exists (select 1 from pg_roles where rolname = 'authenticated');
begin
  foreach t in array array['problem_reports', 'error_events']
  loop
    execute format('alter table %I enable row level security', t);
    if has_anon then execute format('revoke all on table %I from anon', t); end if;
    if has_auth then execute format('revoke all on table %I from authenticated', t); end if;
  end loop;
end;
$$;

drop trigger if exists trg_problem_reports_updated_at on problem_reports;
create trigger trg_problem_reports_updated_at before update on problem_reports
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- purge_test_data (v3) — como a v2 (0005) e também os erros registados pelo
-- teste. Os reportes saem por cascata com o estabelecimento.
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

  delete from users where restaurant_id = any(v_rids);

  with gone as (
    delete from restaurants where id = any(v_rids) returning 1
  ) select count(*)::int into v_n from gone;

  delete from users where restaurant_id is null and email like '%' || v_prefix || '%';

  return jsonb_build_object('ok', true, 'restaurants', v_n, 'paths', v_paths, 'media', v_media);
end;
$$;

-- «create or replace» repõe as opções da função: voltar a fixar o
-- search_path e as permissões (como em 0005).
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

insert into schema_migrations (version) values ('0009_problem_reports')
on conflict (version) do nothing;

notify pgrst, 'reload schema';
