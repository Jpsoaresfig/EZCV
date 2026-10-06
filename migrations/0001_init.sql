-- ===========================================================================
-- EZCV — 0001_init
-- Schema base: tabelas, constraints, índices e Row Level Security.
--
-- Aplicar em: Supabase → SQL Editor → New query → colar → Run.
-- Idempotente: pode ser executado várias vezes sem efeitos secundários.
-- ===========================================================================

create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- Controlo de versões do schema
-- ---------------------------------------------------------------------------
create table if not exists schema_migrations (
  version     text        primary key,
  applied_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- restaurants
-- ---------------------------------------------------------------------------
create table if not exists restaurants (
  id                  bigint generated always as identity primary key,
  slug                text        not null unique,
  name                text        not null,
  commercial_name     text        not null default '',
  owner_name          text        not null,
  email               citext      not null,
  phone               text        not null default '',
  address             text        not null default '',
  postal_code         text        not null default '',
  city                text        not null default '',
  establishment_type  text        not null default '',
  description         text        not null default '',
  -- caminhos de objeto no bucket `media` do Supabase Storage (não URLs)
  logo_path           text        not null default '',
  photo_path          text        not null default '',
  hiring_status       text        not null default 'open',
  active              boolean     not null default true,
  -- marca de isolamento usada pelos testes E2E; null em uso real
  test_prefix         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint restaurants_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  constraint restaurants_hiring_status check (hiring_status in ('open', 'paused'))
);

create index if not exists idx_restaurants_active on restaurants (active);
create index if not exists idx_restaurants_test   on restaurants (test_prefix) where test_prefix is not null;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
-- `blocked` é o único interruptor de acesso do utilizador. O §23 lista também
-- um `active`; manter os dois seria redundante e uma fonte de bugs (dois
-- campos a dizer a mesma coisa), por isso só existe `blocked`.
create table if not exists users (
  id             bigint generated always as identity primary key,
  restaurant_id  bigint      references restaurants(id) on delete set null,
  email          citext      not null unique,
  password_hash  text        not null,
  full_name      text        not null,
  phone          text        not null default '',
  role           text        not null default 'owner',
  blocked        boolean     not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint users_role check (role in ('owner', 'admin'))
);

create index if not exists idx_users_restaurant on users (restaurant_id);

-- ---------------------------------------------------------------------------
-- jobs (vacantes)
-- ---------------------------------------------------------------------------
create table if not exists jobs (
  id             bigint generated always as identity primary key,
  restaurant_id  bigint      not null references restaurants(id) on delete cascade,
  title          text        not null,
  description    text        not null default '',
  requirements   text        not null default '',
  availability   text        not null default '',
  contract_type  text        not null default '',
  work_schedule  text        not null default '',
  active         boolean     not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_jobs_restaurant on jobs (restaurant_id, active);

-- ---------------------------------------------------------------------------
-- candidates
-- ---------------------------------------------------------------------------
-- IMPORTANTE (correção face ao schema SQLite anterior): o candidato pertence
-- a um restaurante. Antes `candidates.email` era UNIQUE global, o que fazia
-- com que uma candidatura no restaurante B sobrescrevesse o nome/telefone/
-- documento que o restaurante A estava a ver, e tornava impossível apagar ou
-- anonimizar dados por restaurante (§29). Cada restaurante tem agora a sua
-- própria cópia dos dados do candidato.
create table if not exists candidates (
  id             bigint generated always as identity primary key,
  restaurant_id  bigint      not null references restaurants(id) on delete cascade,
  first_name     text        not null,
  last_name      text        not null default '',
  email          citext      not null,
  phone          text        not null default '',
  doc_type       text        not null default '',
  doc_number     text        not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint candidates_unique_per_restaurant unique (restaurant_id, email),
  constraint candidates_doc_type check (doc_type in ('', 'nie', 'dni', 'pasaporte', 'otro'))
);

-- ---------------------------------------------------------------------------
-- applications (candidaturas)
-- ---------------------------------------------------------------------------
create table if not exists applications (
  id               bigint generated always as identity primary key,
  restaurant_id    bigint      not null references restaurants(id) on delete cascade,
  candidate_id     bigint      not null references candidates(id) on delete cascade,
  job_id           bigint      references jobs(id) on delete set null,
  -- snapshot do título: a candidatura sobrevive à eliminação da vaga
  job_title        text        not null default '',
  status           text        not null default 'nuevo',
  availability     text        not null default '',
  experience       text        not null default '',
  observations     text        not null default '',
  future_interest  boolean     not null default false,
  favorite         boolean     not null default false,
  -- preparação para a política de retenção (§30): nada é apagado
  -- automaticamente no MVP, as colunas existem para quando houver política.
  retention_until  timestamptz,
  anonymized_at    timestamptz,
  applied_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint applications_status check (status in (
    'nuevo', 'revisado', 'contactar', 'contactado',
    'entrevista', 'contratado', 'rechazado', 'reserva'
  ))
);

create index if not exists idx_app_restaurant_status on applications (restaurant_id, status);
create index if not exists idx_app_restaurant_date   on applications (restaurant_id, applied_at desc);
create index if not exists idx_app_candidate         on applications (candidate_id);
create index if not exists idx_app_job               on applications (job_id);
create index if not exists idx_app_favorite          on applications (restaurant_id) where favorite;
create index if not exists idx_app_retention         on applications (retention_until) where retention_until is not null;

-- ---------------------------------------------------------------------------
-- cvs
-- ---------------------------------------------------------------------------
-- O ficheiro vive no bucket PRIVADO `cvs`. Aqui guarda-se só o caminho do
-- objeto. Nunca é gerada uma URL pública permanente (§14, §24).
create table if not exists cvs (
  id                 bigint generated always as identity primary key,
  application_id     bigint      not null unique references applications(id) on delete cascade,
  restaurant_id      bigint      not null references restaurants(id) on delete cascade,
  storage_path       text        not null,
  original_filename  text        not null default 'cv.pdf',
  mime_type          text        not null default 'application/pdf',
  size_bytes         bigint      not null default 0,
  created_at         timestamptz not null default now()
);

create index if not exists idx_cvs_restaurant on cvs (restaurant_id);

-- ---------------------------------------------------------------------------
-- application_notes (notas internas — nunca visíveis ao candidato)
-- ---------------------------------------------------------------------------
create table if not exists application_notes (
  id              bigint generated always as identity primary key,
  application_id  bigint      not null references applications(id) on delete cascade,
  restaurant_id   bigint      not null references restaurants(id) on delete cascade,
  user_id         bigint      references users(id) on delete set null,
  body            text        not null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_notes_app on application_notes (application_id, created_at desc);

-- ---------------------------------------------------------------------------
-- application_history
-- ---------------------------------------------------------------------------
create table if not exists application_history (
  id              bigint generated always as identity primary key,
  application_id  bigint      not null references applications(id) on delete cascade,
  restaurant_id   bigint      not null references restaurants(id) on delete cascade,
  user_id         bigint      references users(id) on delete set null,
  event           text        not null,
  old_status      text,
  new_status      text,
  detail          text        not null default '',
  metadata        jsonb       not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists idx_history_app on application_history (application_id, created_at desc);

-- ---------------------------------------------------------------------------
-- consents (§6)
-- ---------------------------------------------------------------------------
-- Dois consentimentos independentes, com o texto e a versão exatos que o
-- candidato viu no momento em que aceitou.
create table if not exists consents (
  id                           bigint generated always as identity primary key,
  application_id               bigint      not null unique references applications(id) on delete cascade,
  selection_consent            boolean     not null default false,
  future_opportunity_consent   boolean     not null default false,
  consent_version              text        not null default '',
  consent_text                 text        not null default '',
  created_at                   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
create table if not exists notifications (
  id              bigint generated always as identity primary key,
  restaurant_id   bigint      not null references restaurants(id) on delete cascade,
  application_id  bigint      references applications(id) on delete set null,
  type            text        not null,
  channel         text        not null default 'panel',
  status          text        not null default 'unread',
  detail          text        not null default '',
  read_at         timestamptz,
  created_at      timestamptz not null default now(),

  constraint notifications_channel check (channel in ('panel', 'email')),
  -- panel: unread/read · email: pending/sent/failed/logged
  -- ("logged" = sem SMTP configurado, o email foi apenas escrito no log)
  constraint notifications_status  check (status in (
    'unread', 'read', 'pending', 'sent', 'failed', 'logged'
  ))
);

create index if not exists idx_notif_restaurant on notifications (restaurant_id, channel, status);
create index if not exists idx_notif_created    on notifications (restaurant_id, created_at desc);

-- ---------------------------------------------------------------------------
-- sessions (autenticação própria, §27)
-- ---------------------------------------------------------------------------
-- expires_at/created_at em milissegundos epoch: é o que o código JS compara
-- diretamente com Date.now(), sem ambiguidade de fuso horário.
create table if not exists sessions (
  token_hash   text    primary key,
  user_id      bigint  references users(id) on delete cascade,
  csrf_token   text    not null,
  ip           text    not null default '',
  user_agent   text    not null default '',
  expires_at   bigint  not null,
  created_at   bigint  not null
);

create index if not exists idx_sessions_user    on sessions (user_id);
create index if not exists idx_sessions_expires on sessions (expires_at);

-- ---------------------------------------------------------------------------
-- security_logs (§22, §26)
-- ---------------------------------------------------------------------------
create table if not exists security_logs (
  id             bigint generated always as identity primary key,
  event          text        not null,
  user_id        bigint      references users(id) on delete set null,
  restaurant_id  bigint      references restaurants(id) on delete set null,
  ip             text        not null default '',
  user_agent     text        not null default '',
  detail         text        not null default '',
  metadata       jsonb       not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists idx_logs_created on security_logs (created_at desc);
create index if not exists idx_logs_event   on security_logs (event, created_at desc);

-- ---------------------------------------------------------------------------
-- Triggers de updated_at
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['restaurants', 'users', 'jobs', 'candidates', 'applications']
  loop
    execute format('drop trigger if exists trg_%s_updated_at on %I', t, t);
    execute format(
      'create trigger trg_%s_updated_at before update on %I
       for each row execute function set_updated_at()', t, t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security — deny-all (§8, §26)
-- ---------------------------------------------------------------------------
-- O backend acede com a service_role, que ignora RLS por design: o isolamento
-- entre restaurantes é garantido pelo filtro restaurant_id em todas as queries
-- e pelas funções RPC. O RLS aqui é defesa em profundidade: se a chave
-- publishable/anon for exposta, não lê nem escreve nada. Não há políticas
-- `using (true)` em nenhuma tabela.
do $$
declare
  t text;
  has_anon boolean := exists (select 1 from pg_roles where rolname = 'anon');
  has_auth boolean := exists (select 1 from pg_roles where rolname = 'authenticated');
begin
  foreach t in array array[
    'restaurants', 'users', 'jobs', 'candidates', 'applications', 'cvs',
    'application_notes', 'application_history', 'consents', 'notifications',
    'sessions', 'security_logs', 'schema_migrations'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    if has_anon then execute format('revoke all on table %I from anon', t); end if;
    if has_auth then execute format('revoke all on table %I from authenticated', t); end if;
  end loop;
end;
$$;

insert into schema_migrations (version) values ('0001_init')
on conflict (version) do nothing;
