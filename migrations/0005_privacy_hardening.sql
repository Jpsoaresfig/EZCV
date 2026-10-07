-- ===========================================================================
-- Fíchame — 0005_privacy_hardening
--
-- Auditoria de proteção de dados e segurança (2026-10). Só ACRESCENTA:
-- nenhuma coluna ou tabela existente é apagada, nenhum dado é destruído.
-- Idempotente. Aplicar depois de 0004.
--
--   1. Default privileges: objetos novos deixam de ser concedidos a anon /
--      authenticated (o Supabase concede tudo por omissão).
--   2. Integridade por tenant ao nível da BD (FKs compostas com restaurant_id).
--   3. Dados legais do estabelecimento (identidade do responsável, art. 13 RGPD)
--      e aceitação de termos / acordo de encargo.
--   4. Base jurídica e consentimento: a seleção deixa de ser «consentimento»
--      (art. 6.1.b RGPD); o consentimento de futuras oportunidades passa a ter
--      data de concessão, retirada e caducidade.
--   5. Retenção por tenant: prazos por estabelecimento, retention_until
--      calculado, bloqueio por obrigação legal (legal_hold).
--   6. Direitos dos titulares (rights_requests), recuperação de senha
--      (password_resets) e rate limiting partilhado entre instâncias.
--   7. Funções novas/revistas, search_path fixo e autodiagnóstico de
--      segurança (security_self_check).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Default privileges
-- ---------------------------------------------------------------------------
-- No Supabase, `alter default privileges` concede ALL a anon/authenticated em
-- todas as tabelas, funções e sequências novas de `public`. Uma tabela criada
-- no futuro sem RLS ficaria legível com a chave anon. Revoga-se na origem.
do $$
declare
  has_anon boolean := exists (select 1 from pg_roles where rolname = 'anon');
  has_auth boolean := exists (select 1 from pg_roles where rolname = 'authenticated');
begin
  if has_anon then
    execute 'alter default privileges in schema public revoke all on tables from anon';
    execute 'alter default privileges in schema public revoke all on sequences from anon';
    execute 'alter default privileges in schema public revoke all on functions from anon';
    execute 'revoke all on all sequences in schema public from anon';
  end if;
  if has_auth then
    execute 'alter default privileges in schema public revoke all on tables from authenticated';
    execute 'alter default privileges in schema public revoke all on sequences from authenticated';
    execute 'alter default privileges in schema public revoke all on functions from authenticated';
    execute 'revoke all on all sequences in schema public from authenticated';
  end if;
  execute 'alter default privileges in schema public revoke execute on functions from public';
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Integridade por tenant
-- ---------------------------------------------------------------------------
-- O backend já filtra tudo por restaurant_id. Isto garante, ao nível da BD,
-- que nenhuma linha pode apontar para uma linha de OUTRO restaurante — um bug
-- no backend que tentasse ligar o CV do restaurante A a uma candidatura de B
-- falha com violação de FK em vez de criar uma fuga silenciosa.
create unique index if not exists uq_candidates_id_rid   on candidates   (id, restaurant_id);
create unique index if not exists uq_applications_id_rid on applications (id, restaurant_id);
create unique index if not exists uq_jobs_id_rid         on jobs         (id, restaurant_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'applications_candidate_same_tenant') then
    alter table applications add constraint applications_candidate_same_tenant
      foreign key (candidate_id, restaurant_id) references candidates (id, restaurant_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'applications_job_same_tenant') then
    -- PG ≥ 15: ao apagar a vaga só job_id fica null (restaurant_id mantém-se)
    alter table applications add constraint applications_job_same_tenant
      foreign key (job_id, restaurant_id) references jobs (id, restaurant_id) on delete set null (job_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cvs_application_same_tenant') then
    alter table cvs add constraint cvs_application_same_tenant
      foreign key (application_id, restaurant_id) references applications (id, restaurant_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'notes_application_same_tenant') then
    alter table application_notes add constraint notes_application_same_tenant
      foreign key (application_id, restaurant_id) references applications (id, restaurant_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'history_application_same_tenant') then
    alter table application_history add constraint history_application_same_tenant
      foreign key (application_id, restaurant_id) references applications (id, restaurant_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'notifications_application_same_tenant') then
    alter table notifications add constraint notifications_application_same_tenant
      foreign key (application_id, restaurant_id) references applications (id, restaurant_id) on delete cascade;
  end if;
end;
$$;

-- O caminho do CV no Storage tem de estar na pasta do próprio restaurante.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cvs_path_in_tenant_folder') then
    alter table cvs add constraint cvs_path_in_tenant_folder
      check (storage_path like 'r/' || restaurant_id::text || '/%') not valid;
    alter table cvs validate constraint cvs_path_in_tenant_folder;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Restaurante: identidade do responsável, aceitação, prazos de retenção
-- ---------------------------------------------------------------------------
-- Prazos por omissão: VALORES TÉCNICOS PROVISÓRIOS, não prazos legais. Ver
-- docs/legal/00-legal-review-required.md. Cada estabelecimento pode ajustá-los
-- dentro dos limites das constraints.
alter table restaurants
  add column if not exists legal_name            text        not null default '',
  add column if not exists privacy_email         citext      not null default '',
  add column if not exists terms_version         text        not null default '',
  add column if not exists dpa_version           text        not null default '',
  add column if not exists terms_accepted_at     timestamptz,
  add column if not exists retention_closed_days   int       not null default 90,
  add column if not exists retention_inactive_days int       not null default 180,
  add column if not exists retention_reserve_days  int       not null default 365;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'restaurants_retention_bounds') then
    alter table restaurants add constraint restaurants_retention_bounds check (
      retention_closed_days   between 1 and 365 and
      retention_inactive_days between 30 and 365 and
      retention_reserve_days  between 30 and 730
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Candidaturas e consentimentos
-- ---------------------------------------------------------------------------
alter table applications
  add column if not exists last_activity_at  timestamptz not null default now(),
  add column if not exists closed_at         timestamptz,
  add column if not exists legal_hold        boolean     not null default false,
  add column if not exists legal_hold_reason text        not null default '';

update applications set last_activity_at = updated_at where last_activity_at > updated_at;

-- consents.selection_consent passa a ser histórico: a gestão da candidatura
-- tem base no art. 6.1.b RGPD, não em consentimento (AEPD, «La protección de
-- datos en las relaciones laborales», III.1).
alter table consents
  add column if not exists selection_basis         text        not null default '',
  add column if not exists privacy_notice_version  text        not null default '',
  add column if not exists future_text             text        not null default '',
  add column if not exists future_granted_at       timestamptz,
  add column if not exists future_withdrawn_at     timestamptz,
  add column if not exists future_source           text        not null default '';

update consents
   set future_granted_at = created_at
 where future_opportunity_consent and future_granted_at is null;

-- future_interest deixa de poder ser verdadeiro sem consentimento ativo.
update applications a
   set future_interest = coalesce((
         select c.future_opportunity_consent and c.future_withdrawn_at is null
           from consents c where c.application_id = a.id), false);

-- O estado existente não é reescrito. Uma «reserva» sem consentimento ativo é
-- tratada por recompute_retention como candidatura fechada (AEPD, III.7: a
-- reserva exige consentimento).
update applications
   set closed_at = updated_at
 where status in ('rechazado', 'contratado', 'reserva') and closed_at is null;

-- ---------------------------------------------------------------------------
-- 5. Pedidos de exercício de direitos (arts. 15-22 RGPD)
-- ---------------------------------------------------------------------------
create table if not exists rights_requests (
  id              bigint generated always as identity primary key,
  restaurant_id   bigint      not null references restaurants(id) on delete cascade,
  -- referência opaca dada ao titular (não é o id interno)
  public_ref      text        not null unique,
  kind            text        not null,
  requester_name  text        not null,
  requester_email citext      not null,
  message         text        not null default '',
  status          text        not null default 'recibida',
  -- art. 12.3 RGPD: 1 mês, prorrogável 2 meses informando o titular
  due_at          timestamptz not null,
  extended        boolean     not null default false,
  resolution_note text        not null default '',
  resolved_at     timestamptz,
  resolved_by     bigint      references users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint rights_kind check (kind in (
    'acceso', 'rectificacion', 'supresion', 'oposicion', 'limitacion',
    'portabilidad', 'retirada_consentimiento', 'otro'
  )),
  constraint rights_status check (status in ('recibida', 'en_curso', 'resuelta', 'denegada'))
);

create index if not exists idx_rights_restaurant on rights_requests (restaurant_id, status, due_at);

-- ---------------------------------------------------------------------------
-- 6. Recuperação de senha
-- ---------------------------------------------------------------------------
-- Só o hash do token é guardado. Uso único, validade curta.
create table if not exists password_resets (
  token_hash  text        primary key,
  user_id     bigint      not null references users(id) on delete cascade,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists idx_pwreset_user on password_resets (user_id);

-- ---------------------------------------------------------------------------
-- 7. Rate limiting partilhado (várias instâncias na Vercel)
-- ---------------------------------------------------------------------------
-- A chave é um hash (sha256) de ip|rota|…: não se guardam IPs em claro.
create table if not exists rate_limit_hits (
  key           text        primary key,
  window_start  timestamptz not null default now(),
  count         int         not null default 0
);

create index if not exists idx_ratelimit_window on rate_limit_hits (window_start);

-- RLS deny-all e revogação nas tabelas novas (como em 0001).
do $$
declare
  t text;
  has_anon boolean := exists (select 1 from pg_roles where rolname = 'anon');
  has_auth boolean := exists (select 1 from pg_roles where rolname = 'authenticated');
begin
  foreach t in array array['rights_requests', 'password_resets', 'rate_limit_hits']
  loop
    execute format('alter table %I enable row level security', t);
    if has_anon then execute format('revoke all on table %I from anon', t); end if;
    if has_auth then execute format('revoke all on table %I from authenticated', t); end if;
  end loop;
end;
$$;

drop trigger if exists trg_rights_requests_updated_at on rights_requests;
create trigger trg_rights_requests_updated_at before update on rights_requests
  for each row execute function set_updated_at();

-- ===========================================================================
-- VIEWS
-- ===========================================================================
-- application_list: o número de documento sai da busca livre (deixou de ser
-- recolhido; ver docs/legal/03-data-minimization.md). As colunas mantêm-se
-- iguais às de 0002 para que reaplicar 0002 continue a funcionar; os campos
-- novos (legal_hold, closed_at…) leem-se diretamente de `applications`.
create or replace view application_list
with (security_invoker = on) as
select
  a.id,
  a.restaurant_id,
  a.candidate_id,
  a.job_id,
  a.job_title,
  a.status,
  a.availability,
  a.experience,
  a.observations,
  a.future_interest,
  a.favorite,
  a.retention_until,
  a.anonymized_at,
  a.applied_at,
  c.first_name,
  c.last_name,
  c.email,
  c.phone,
  c.doc_type,
  c.doc_number,
  j.title  as job_name,
  j.active as job_active,
  lower(concat_ws(' ',
    c.first_name, c.last_name, c.email, c.phone,
    a.job_title, a.experience, a.observations
  )) as search_text
from applications a
join candidates c       on c.id = a.candidate_id
left join jobs j        on j.id = a.job_id;

-- admin_restaurant_list: colunas explícitas (antes r.*), igual a 0002.
drop view if exists admin_restaurant_list;
create view admin_restaurant_list
with (security_invoker = on) as
select
  r.id, r.slug, r.name, r.owner_name, r.email, r.city,
  r.active, r.hiring_status, r.created_at,
  (select count(*) from applications a where a.restaurant_id = r.id)::int as apps,
  (select count(*) from users u where u.restaurant_id = r.id)::int        as owners
from restaurants r;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on admin_restaurant_list from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on admin_restaurant_list from authenticated';
  end if;
end;
$$;

-- ===========================================================================
-- FUNÇÕES
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- recompute_retention — fonte única da regra de retenção
-- ---------------------------------------------------------------------------
--   ativa (nuevo…entrevista)  → última atividade + retention_inactive_days
--   fechada (rechazado/contratado) → closed_at + retention_closed_days
--   consentimento de futuras oportunidades ativo → no mínimo até
--     future_granted_at + retention_reserve_days
--   reserva sem consentimento ativo → como fechada
-- Os prazos são os do restaurante dono da candidatura (retenção por tenant).
create or replace function recompute_retention(p_aid bigint) returns timestamptz
language plpgsql as $$
declare
  v_until  timestamptz;
  v_future timestamptz;
begin
  select
    case
      when a.status in ('nuevo', 'revisado', 'contactar', 'contactado', 'entrevista')
        then a.last_activity_at + make_interval(days => r.retention_inactive_days)
      else coalesce(a.closed_at, a.last_activity_at) + make_interval(days => r.retention_closed_days)
    end,
    case
      when c.future_opportunity_consent and c.future_withdrawn_at is null and c.future_granted_at is not null
        then c.future_granted_at + make_interval(days => r.retention_reserve_days)
    end
  into v_until, v_future
  from applications a
  join restaurants r on r.id = a.restaurant_id
  left join consents c on c.application_id = a.id
  where a.id = p_aid;

  if v_future is not null and (v_until is null or v_future > v_until) then
    v_until := v_future;
  end if;

  update applications set retention_until = v_until where id = p_aid;
  return v_until;
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_application (v2) — sem documento de identidade, base 6.1.b
-- ---------------------------------------------------------------------------
create or replace function submit_application(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_rid    bigint  := (p->>'restaurant_id')::bigint;
  v_email  citext  := (p->>'email')::citext;
  v_future boolean := coalesce((p->>'future_consent')::boolean, false);
  v_cid    bigint;
  v_aid    bigint;
begin
  -- duplicado recente NO MESMO restaurante; o backend responde ao candidato
  -- exatamente como a um envio novo (sem revelar que a pessoa já se candidatou)
  if exists (
    select 1
    from applications a
    join candidates c on c.id = a.candidate_id
    where a.restaurant_id = v_rid
      and c.email = v_email
      and a.applied_at > now() - interval '2 days'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'duplicate');
  end if;

  insert into candidates (restaurant_id, first_name, last_name, email, phone)
  values (
    v_rid,
    p->>'first_name',
    coalesce(p->>'last_name', ''),
    v_email,
    coalesce(p->>'phone', '')
  )
  on conflict (restaurant_id, email) do update set
    first_name = excluded.first_name,
    last_name  = excluded.last_name,
    phone      = excluded.phone
  returning id into v_cid;

  insert into applications (
    restaurant_id, candidate_id, job_id, job_title,
    availability, experience, observations, future_interest
  ) values (
    v_rid,
    v_cid,
    nullif(p->>'job_id', '')::bigint,
    coalesce(p->>'job_title', ''),
    coalesce(p->>'availability', ''),
    coalesce(p->>'experience', ''),
    coalesce(p->>'observations', ''),
    v_future
  )
  returning id into v_aid;

  insert into cvs (
    application_id, restaurant_id, storage_path,
    original_filename, mime_type, size_bytes
  ) values (
    v_aid,
    v_rid,
    p->>'storage_path',
    coalesce(nullif(p->>'original_filename', ''), 'cv.pdf'),
    'application/pdf',
    coalesce((p->>'size_bytes')::bigint, 0)
  );

  insert into consents (
    application_id, selection_consent, future_opportunity_consent,
    consent_version, consent_text,
    selection_basis, privacy_notice_version,
    future_text, future_granted_at, future_source
  ) values (
    v_aid,
    false,
    v_future,
    coalesce(p->>'consent_version', ''),
    '',
    'rgpd_6_1_b',
    coalesce(p->>'privacy_notice_version', ''),
    case when v_future then coalesce(p->>'future_text', '') else '' end,
    case when v_future then now() end,
    case when v_future then 'formulario_candidatura' else '' end
  );

  insert into application_history (application_id, restaurant_id, event, new_status, detail)
  values (v_aid, v_rid, 'recibida', 'nuevo', 'Candidatura recibida');

  insert into notifications (restaurant_id, application_id, type, channel, status)
  values (v_rid, v_aid, 'nueva_candidatura', 'panel', 'unread');

  perform recompute_retention(v_aid);

  return jsonb_build_object('ok', true, 'application_id', v_aid, 'candidate_id', v_cid);
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_interest (v2) — base: consentimento (única finalidade do formulário)
-- ---------------------------------------------------------------------------
create or replace function submit_interest(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_rid   bigint := (p->>'restaurant_id')::bigint;
  v_email citext := (p->>'email')::citext;
  v_cid   bigint;
  v_aid   bigint;
begin
  if exists (
    select 1
    from applications a
    join candidates c on c.id = a.candidate_id
    where a.restaurant_id = v_rid
      and c.email = v_email
      and a.applied_at > now() - interval '2 days'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'duplicate');
  end if;

  insert into candidates (restaurant_id, first_name, email, phone)
  values (v_rid, p->>'first_name', v_email, coalesce(p->>'phone', ''))
  on conflict (restaurant_id, email) do update set
    first_name = excluded.first_name,
    phone      = excluded.phone
  returning id into v_cid;

  insert into applications (
    restaurant_id, candidate_id, job_title, status, future_interest, experience
  ) values (
    v_rid, v_cid, 'Oportunidades futuras', 'reserva', true,
    coalesce(p->>'experience', '')
  )
  returning id into v_aid;

  insert into consents (
    application_id, selection_consent, future_opportunity_consent,
    consent_version, consent_text,
    selection_basis, privacy_notice_version,
    future_text, future_granted_at, future_source
  ) values (
    v_aid, false, true,
    coalesce(p->>'consent_version', ''), '',
    'rgpd_6_1_a', coalesce(p->>'privacy_notice_version', ''),
    coalesce(p->>'future_text', ''), now(), 'formulario_interes'
  );

  insert into application_history (application_id, restaurant_id, event, new_status, detail)
  values (v_aid, v_rid, 'recibida', 'reserva', 'Interés para futuras oportunidades');

  insert into notifications (restaurant_id, application_id, type, channel, status)
  values (v_rid, v_aid, 'nueva_candidatura', 'panel', 'unread');

  perform recompute_retention(v_aid);

  return jsonb_build_object('ok', true, 'application_id', v_aid, 'candidate_id', v_cid);
end;
$$;

-- ---------------------------------------------------------------------------
-- set_application_status (v2)
-- ---------------------------------------------------------------------------
-- «reserva» só com consentimento de futuras oportunidades ATIVO: um candidato
-- rejeitado não entra na reserva por decisão do restaurante.
create or replace function set_application_status(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_aid    bigint := (p->>'application_id')::bigint;
  v_rid    bigint := (p->>'restaurant_id')::bigint;
  v_uid    bigint := nullif(p->>'user_id', '')::bigint;
  v_status text   := p->>'status';
  v_old    text;
  v_future boolean;
begin
  select a.status,
         coalesce(c.future_opportunity_consent and c.future_withdrawn_at is null, false)
    into v_old, v_future
  from applications a
  left join consents c on c.application_id = a.id
  where a.id = v_aid and a.restaurant_id = v_rid
  for update of a;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_status = 'reserva' and not v_future then
    return jsonb_build_object('ok', false, 'reason', 'no_consent');
  end if;

  update applications set
    status = v_status,
    future_interest = v_future,
    last_activity_at = now(),
    closed_at = case
      when v_status in ('rechazado', 'contratado', 'reserva') then coalesce(
        case when v_old in ('rechazado', 'contratado', 'reserva') then closed_at end, now())
      else null
    end
  where id = v_aid and restaurant_id = v_rid;

  if v_old is distinct from v_status then
    insert into application_history (
      application_id, restaurant_id, user_id, event, old_status, new_status, detail
    ) values (v_aid, v_rid, v_uid, 'estado', v_old, v_status, coalesce(p->>'detail', ''));
  end if;

  perform recompute_retention(v_aid);

  return jsonb_build_object('ok', true, 'old_status', v_old, 'new_status', v_status);
end;
$$;

-- ---------------------------------------------------------------------------
-- withdraw_future_consent — retirada do consentimento (art. 7.3 RGPD)
-- ---------------------------------------------------------------------------
-- Uma candidatura em reserva cuja única base era esse consentimento passa a
-- fechada com retenção imediata (será apagada na próxima execução da
-- retenção, salvo legal_hold).
create or replace function withdraw_future_consent(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_aid    bigint := (p->>'application_id')::bigint;
  v_rid    bigint := (p->>'restaurant_id')::bigint;
  v_uid    bigint := nullif(p->>'user_id', '')::bigint;
  v_status text;
  v_had    boolean;
begin
  select a.status,
         coalesce(c.future_opportunity_consent and c.future_withdrawn_at is null, false)
    into v_status, v_had
  from applications a
  left join consents c on c.application_id = a.id
  where a.id = v_aid and a.restaurant_id = v_rid
  for update of a;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if not v_had then
    return jsonb_build_object('ok', false, 'reason', 'no_consent');
  end if;

  update consents set future_withdrawn_at = now() where application_id = v_aid;

  update applications set
    future_interest = false,
    status = case when status = 'reserva' then 'rechazado' else status end,
    closed_at = case when status = 'reserva' then now() else closed_at end,
    last_activity_at = now()
  where id = v_aid and restaurant_id = v_rid;

  insert into application_history (application_id, restaurant_id, user_id, event, detail)
  values (v_aid, v_rid, v_uid, 'consentimiento_retirado',
          'Consentimiento de futuras oportunidades retirado');

  perform recompute_retention(v_aid);

  -- reserva sem outra base: elegível já para supressão
  if v_status = 'reserva' then
    update applications set retention_until = now() where id = v_aid;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- set_legal_hold — bloqueio da supressão (obrigação legal, reclamação, etc.)
-- ---------------------------------------------------------------------------
create or replace function set_legal_hold(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_aid  bigint  := (p->>'application_id')::bigint;
  v_rid  bigint  := (p->>'restaurant_id')::bigint;
  v_uid  bigint  := nullif(p->>'user_id', '')::bigint;
  v_hold boolean := coalesce((p->>'hold')::boolean, false);
  v_why  text    := left(coalesce(p->>'reason', ''), 300);
begin
  if v_hold and length(trim(v_why)) < 5 then
    return jsonb_build_object('ok', false, 'reason', 'reason_required');
  end if;

  update applications set
    legal_hold = v_hold,
    legal_hold_reason = case when v_hold then v_why else '' end
  where id = v_aid and restaurant_id = v_rid;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  insert into application_history (application_id, restaurant_id, user_id, event, detail)
  values (v_aid, v_rid, v_uid, 'bloqueo',
          case when v_hold then 'Conservación bloqueada: ' || v_why else 'Bloqueo retirado' end);

  return jsonb_build_object('ok', true, 'hold', v_hold);
end;
$$;

-- ---------------------------------------------------------------------------
-- delete_application (v2) — respeita legal_hold
-- ---------------------------------------------------------------------------
create or replace function delete_application(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_aid  bigint := (p->>'application_id')::bigint;
  v_rid  bigint := (p->>'restaurant_id')::bigint;
  v_cid  bigint;
  v_hold boolean;
  v_path text;
  v_left int;
begin
  select a.candidate_id, a.legal_hold, cv.storage_path
    into v_cid, v_hold, v_path
  from applications a
  left join cvs cv on cv.application_id = a.id
  where a.id = v_aid and a.restaurant_id = v_rid;

  if v_cid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_hold then
    return jsonb_build_object('ok', false, 'reason', 'legal_hold');
  end if;

  -- cvs, consents, notes, history e notifications caem por ON DELETE CASCADE
  delete from applications where id = v_aid and restaurant_id = v_rid;

  select count(*)::int into v_left from applications where candidate_id = v_cid;
  if v_left = 0 then
    delete from candidates where id = v_cid and restaurant_id = v_rid;
  end if;

  return jsonb_build_object('ok', true, 'storage_path', v_path);
end;
$$;

-- ---------------------------------------------------------------------------
-- delete_candidate — supressão de TODOS os dados de um candidato num tenant
-- ---------------------------------------------------------------------------
-- Usado no atendimento de um pedido de supressão (art. 17). Só toca no
-- restaurante indicado: o mesmo email noutro restaurante é outro titular de
-- outro responsável e não é afetado.
create or replace function delete_candidate(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_cid   bigint := (p->>'candidate_id')::bigint;
  v_rid   bigint := (p->>'restaurant_id')::bigint;
  v_paths text[];
  v_n     int;
begin
  if not exists (select 1 from candidates where id = v_cid and restaurant_id = v_rid) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if exists (select 1 from applications where candidate_id = v_cid and restaurant_id = v_rid and legal_hold) then
    return jsonb_build_object('ok', false, 'reason', 'legal_hold');
  end if;

  select coalesce(array_agg(cv.storage_path), '{}'::text[]) into v_paths
  from cvs cv join applications a on a.id = cv.application_id
  where a.candidate_id = v_cid and a.restaurant_id = v_rid;

  with gone as (
    delete from applications where candidate_id = v_cid and restaurant_id = v_rid returning 1
  ) select count(*)::int into v_n from gone;

  delete from candidates where id = v_cid and restaurant_id = v_rid;

  return jsonb_build_object('ok', true, 'applications', v_n, 'paths', v_paths);
end;
$$;

-- ---------------------------------------------------------------------------
-- apply_retention — supressão automática do que passou o prazo
-- ---------------------------------------------------------------------------
-- dry_run = true (omissão) só conta. Devolve os caminhos dos CVs para o backend
-- apagar no Storage. Nunca toca em candidaturas com legal_hold. Cada linha
-- usa o prazo do SEU restaurante (calculado em recompute_retention).
create or replace function apply_retention(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_dry   boolean := coalesce((p->>'dry_run')::boolean, true);
  v_limit int     := least(greatest(coalesce((p->>'limit')::int, 500), 1), 5000);
  v_ids   bigint[];
  v_paths text[];
  v_by_r  jsonb;
  v_cids  bigint[];
  v_cands int;
begin
  select coalesce(array_agg(id), '{}'::bigint[]) into v_ids
  from (
    select id from applications
    where retention_until is not null
      and retention_until < now()
      and not legal_hold
    order by retention_until
    limit v_limit
  ) x;

  select coalesce(jsonb_object_agg(restaurant_id::text, n), '{}'::jsonb) into v_by_r
  from (select restaurant_id, count(*)::int as n from applications where id = any(v_ids) group by restaurant_id) y;

  if v_dry then
    return jsonb_build_object('ok', true, 'dry_run', true, 'applications', cardinality(v_ids), 'by_restaurant', v_by_r);
  end if;

  select coalesce(array_agg(storage_path), '{}'::text[]) into v_paths
  from cvs where application_id = any(v_ids);

  select coalesce(array_agg(distinct candidate_id), '{}'::bigint[]) into v_cids
  from applications where id = any(v_ids);

  delete from applications where id = any(v_ids);

  with gone as (
    delete from candidates c
    where c.id = any(v_cids)
      and not exists (select 1 from applications a where a.candidate_id = c.id)
    returning 1
  ) select count(*)::int into v_cands from gone;

  return jsonb_build_object(
    'ok', true, 'dry_run', false,
    'applications', cardinality(v_ids), 'candidates', v_cands,
    'by_restaurant', v_by_r, 'paths', v_paths
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- set_retention_settings — prazos de um restaurante + recálculo
-- ---------------------------------------------------------------------------
create or replace function set_retention_settings(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_rid bigint := (p->>'restaurant_id')::bigint;
  v_n   int := 0;
  v_aid bigint;
begin
  update restaurants set
    retention_closed_days   = (p->>'closed_days')::int,
    retention_inactive_days = (p->>'inactive_days')::int,
    retention_reserve_days  = (p->>'reserve_days')::int
  where id = v_rid;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  for v_aid in select id from applications where restaurant_id = v_rid loop
    perform recompute_retention(v_aid);
    v_n := v_n + 1;
  end loop;

  return jsonb_build_object('ok', true, 'recomputed', v_n);
exception
  when check_violation then
    return jsonb_build_object('ok', false, 'reason', 'out_of_bounds');
end;
$$;

-- ---------------------------------------------------------------------------
-- purge_expired — limpeza técnica (sessões, tokens, rate limit, logs, pedidos)
-- ---------------------------------------------------------------------------
create or replace function purge_expired(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_now_ms   bigint := (extract(epoch from now()) * 1000)::bigint;
  v_log_days int := greatest(coalesce((p->>'security_log_days')::int, 365), 30);
  v_req_days int := greatest(coalesce((p->>'rights_request_days')::int, 1095), 365);
  v_dry      boolean := coalesce((p->>'dry_run')::boolean, true);
  v_s int; v_r int; v_l int; v_q int; v_x int;
begin
  select count(*)::int into v_s from sessions where expires_at <= v_now_ms;
  select count(*)::int into v_r from password_resets where expires_at < now() - interval '1 day' or used_at is not null;
  select count(*)::int into v_x from rate_limit_hits where window_start < now() - interval '1 day';
  select count(*)::int into v_l from security_logs where created_at < now() - make_interval(days => v_log_days);
  select count(*)::int into v_q from rights_requests
    where status in ('resuelta', 'denegada') and resolved_at < now() - make_interval(days => v_req_days);

  if not v_dry then
    delete from sessions where expires_at <= v_now_ms;
    delete from password_resets where expires_at < now() - interval '1 day' or used_at is not null;
    delete from rate_limit_hits where window_start < now() - interval '1 day';
    delete from security_logs where created_at < now() - make_interval(days => v_log_days);
    delete from rights_requests
      where status in ('resuelta', 'denegada') and resolved_at < now() - make_interval(days => v_req_days);
  end if;

  return jsonb_build_object('ok', true, 'dry_run', v_dry,
    'sessions', v_s, 'password_resets', v_r, 'rate_limits', v_x,
    'security_logs', v_l, 'rights_requests', v_q);
end;
$$;

-- ---------------------------------------------------------------------------
-- rate_limit_hit — contador atómico por janela fixa
-- ---------------------------------------------------------------------------
create or replace function rate_limit_hit(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_key   text := p->>'key';
  v_win   int  := greatest(coalesce((p->>'window_seconds')::int, 60), 1);
  v_max   int  := greatest(coalesce((p->>'max')::int, 10), 1);
  v_count int;
  v_start timestamptz;
begin
  insert into rate_limit_hits as h (key, window_start, count)
  values (v_key, now(), 1)
  on conflict (key) do update set
    count = case when h.window_start < now() - make_interval(secs => v_win) then 1 else h.count + 1 end,
    window_start = case when h.window_start < now() - make_interval(secs => v_win) then now() else h.window_start end
  returning h.count, h.window_start into v_count, v_start;

  return jsonb_build_object(
    'allowed', v_count <= v_max,
    'count', v_count,
    'retry_after', greatest(ceil(extract(epoch from (v_start + make_interval(secs => v_win) - now())))::int, 1)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- create_rights_request / update_rights_request
-- ---------------------------------------------------------------------------
create or replace function create_rights_request(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_rid bigint := (p->>'restaurant_id')::bigint;
  v_id  bigint;
  v_due timestamptz := now() + interval '1 month';
begin
  insert into rights_requests (
    restaurant_id, public_ref, kind, requester_name, requester_email, message, due_at
  ) values (
    v_rid, p->>'public_ref', p->>'kind', p->>'requester_name',
    (p->>'requester_email')::citext, coalesce(p->>'message', ''), v_due
  ) returning id into v_id;

  insert into notifications (restaurant_id, application_id, type, channel, status, detail)
  values (v_rid, null, 'solicitud_derechos', 'panel', 'unread', 'Solicitud de derechos recibida');

  return jsonb_build_object('ok', true, 'id', v_id, 'due_at', v_due);
end;
$$;

create or replace function update_rights_request(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_id     bigint := (p->>'id')::bigint;
  v_rid    bigint := (p->>'restaurant_id')::bigint;
  v_status text   := p->>'status';
  v_extend boolean := coalesce((p->>'extend')::boolean, false);
begin
  update rights_requests set
    status = v_status,
    resolution_note = left(coalesce(p->>'note', resolution_note), 2000),
    resolved_at = case when v_status in ('resuelta', 'denegada') then now() else null end,
    resolved_by = case when v_status in ('resuelta', 'denegada') then nullif(p->>'user_id', '')::bigint else null end,
    -- prorrogação única de 2 meses (art. 12.3 RGPD)
    due_at = case when v_extend and not extended then due_at + interval '2 months' else due_at end,
    extended = extended or v_extend
  where id = v_id and restaurant_id = v_rid;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- delete_restaurant_account — fecho de conta SEM órfãos
-- ---------------------------------------------------------------------------
-- Só pela CLI (npm run delete-account), nunca por uma rota HTTP. Exige o slug
-- como confirmação. Devolve os caminhos de CVs e imagens para o Storage.
create or replace function delete_restaurant_account(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_rid   bigint := (p->>'restaurant_id')::bigint;
  v_slug  text   := p->>'confirm_slug';
  v_dry   boolean := coalesce((p->>'dry_run')::boolean, true);
  v_paths text[];
  v_media text[];
  v_apps  int;
  v_hold  int;
begin
  if not exists (select 1 from restaurants where id = v_rid and slug = v_slug) then
    return jsonb_build_object('ok', false, 'reason', 'not_found_or_slug_mismatch');
  end if;

  select count(*)::int, count(*) filter (where legal_hold)::int into v_apps, v_hold
  from applications where restaurant_id = v_rid;

  select coalesce(array_agg(storage_path), '{}'::text[]) into v_paths from cvs where restaurant_id = v_rid;
  select coalesce(array_agg(x) filter (where x <> ''), '{}'::text[]) into v_media
  from restaurants r cross join lateral (values (r.logo_path), (r.photo_path)) t(x) where r.id = v_rid;

  if v_dry or v_hold > 0 then
    return jsonb_build_object('ok', v_hold = 0, 'dry_run', true, 'reason',
      case when v_hold > 0 then 'legal_hold' else null end,
      'applications', v_apps, 'held', v_hold, 'cvs', cardinality(v_paths), 'media', cardinality(v_media));
  end if;

  delete from sessions where user_id in (select id from users where restaurant_id = v_rid);
  delete from users where restaurant_id = v_rid and role <> 'admin';
  delete from restaurants where id = v_rid;

  return jsonb_build_object('ok', true, 'dry_run', false,
    'applications', v_apps, 'paths', v_paths, 'media', v_media);
end;
$$;

-- ---------------------------------------------------------------------------
-- security_self_check — autodiagnóstico (npm run check, gate de produção)
-- ---------------------------------------------------------------------------
create or replace function security_self_check(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_no_rls   jsonb;
  v_grants   jsonb;
  v_definer  jsonb;
  v_public_b jsonb := '[]'::jsonb;
begin
  select coalesce(jsonb_agg(c.relname order by c.relname), '[]'::jsonb) into v_no_rls
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

  select coalesce(jsonb_agg(distinct table_name), '[]'::jsonb) into v_grants
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee in ('anon', 'authenticated');

  select coalesce(jsonb_agg(p2.proname order by p2.proname), '[]'::jsonb) into v_definer
  from pg_proc p2 join pg_namespace n on n.oid = p2.pronamespace
  where n.nspname = 'public' and p2.prosecdef;

  if to_regclass('storage.buckets') is not null then
    execute 'select coalesce(jsonb_agg(id), ''[]''::jsonb) from storage.buckets where public' into v_public_b;
  end if;

  return jsonb_build_object(
    'tables_without_rls', v_no_rls,
    'tables_granted_to_anon_or_authenticated', v_grants,
    'security_definer_functions', v_definer,
    'public_buckets', v_public_b
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- purge_test_data (v2) — inclui os pedidos de direitos e os logs do teste
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

  delete from users where restaurant_id = any(v_rids);

  with gone as (
    delete from restaurants where id = any(v_rids) returning 1
  ) select count(*)::int into v_n from gone;

  delete from users where restaurant_id is null and email like '%' || v_prefix || '%';

  return jsonb_build_object('ok', true, 'restaurants', v_n, 'paths', v_paths, 'media', v_media);
end;
$$;

-- ===========================================================================
-- search_path fixo e permissões
-- ===========================================================================
-- Nenhuma função é SECURITY DEFINER; ainda assim o search_path fica fixo para
-- que nenhum objeto com o mesmo nome noutro schema possa ser resolvido antes
-- (aviso «function_search_path_mutable» do Supabase).
do $$
declare
  f text;
  has_anon boolean := exists (select 1 from pg_roles where rolname = 'anon');
  has_auth boolean := exists (select 1 from pg_roles where rolname = 'authenticated');
  has_svc  boolean := exists (select 1 from pg_roles where rolname = 'service_role');
begin
  foreach f in array array[
    'register_restaurant(jsonb)', 'submit_application(jsonb)',
    'submit_interest(jsonb)', 'set_application_status(jsonb)',
    'toggle_favorite(jsonb)', 'delete_application(jsonb)',
    'toggle_job_active(jsonb)', 'delete_job(jsonb)',
    'mark_notifications_read(jsonb)', 'toggle_restaurant_active(jsonb)',
    'toggle_user_blocked(jsonb)', 'touch_session(jsonb)',
    'purge_test_data(jsonb)',
    'recompute_retention(bigint)', 'withdraw_future_consent(jsonb)',
    'set_legal_hold(jsonb)', 'delete_candidate(jsonb)', 'apply_retention(jsonb)',
    'set_retention_settings(jsonb)', 'purge_expired(jsonb)', 'rate_limit_hit(jsonb)',
    'create_rights_request(jsonb)', 'update_rights_request(jsonb)',
    'delete_restaurant_account(jsonb)', 'security_self_check(jsonb)'
  ]
  loop
    execute format('alter function %s set search_path = public, pg_temp', f);
    execute format('revoke all on function %s from public', f);
    if has_anon then execute format('revoke all on function %s from anon', f); end if;
    if has_auth then execute format('revoke all on function %s from authenticated', f); end if;
    if has_svc  then execute format('grant execute on function %s to service_role', f); end if;
  end loop;

  execute 'alter function set_updated_at() set search_path = public, pg_temp';

  if has_anon then execute 'revoke all on application_list from anon'; end if;
  if has_auth then execute 'revoke all on application_list from authenticated'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Minimização retroativa (dados já gravados antes desta auditoria)
-- ---------------------------------------------------------------------------
-- Logs antigos tinham emails em claro no `detail` (login falhado, registo,
-- bloqueio) e IP/user-agent completos de candidatos. Sessões anónimas tinham
-- IP e user-agent de quem abriu a página NFC.
update security_logs
   set detail = regexp_replace(detail, '[^\s@]+@[^\s@]+', '[email redactado]', 'g')
 where detail ~ '[^\s@]+@[^\s@]+';

update security_logs
   set ip = regexp_replace(ip, '\.\d{1,3}$', '.0'), user_agent = ''
 where event in ('candidatura_enviada', 'spam_honeypot') and (user_agent <> '' or ip ~ '\.\d{1,3}$' and ip !~ '\.0$');

update sessions set ip = '', user_agent = '' where user_id is null and (ip <> '' or user_agent <> '');

-- Prazos de retenção para as candidaturas já existentes.
do $$
declare
  v_aid bigint;
begin
  for v_aid in select id from applications loop
    perform recompute_retention(v_aid);
  end loop;
end;
$$;

insert into schema_migrations (version) values ('0005_privacy_hardening')
on conflict (version) do nothing;

notify pgrst, 'reload schema';
