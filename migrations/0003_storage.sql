-- ===========================================================================
-- Fíchame — 0003_storage
-- Buckets do Supabase Storage. Aplicar depois de 0002. Idempotente.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- cvs — PRIVADO (§24)
-- ---------------------------------------------------------------------------
-- Só PDF, e o limite de tamanho é também imposto aqui, não apenas no multer:
-- o Storage rejeita o objeto mesmo que o backend se engane.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cvs', 'cvs', false, 10485760, array['application/pdf'])
on conflict (id) do update set
  public             = false,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- media — logo e foto do estabelecimento
-- ---------------------------------------------------------------------------
-- Privado também. As imagens são públicas por destino (aparecem na página
-- NFC), mas são servidas pela rota /r/:slug/imagen/:tipo do backend. Assim
-- o Content-Security-Policy continua `img-src 'self'` e não é preciso
-- autorizar o domínio do Supabase no browser.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 5242880,
        array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public             = false,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Acesso
-- ---------------------------------------------------------------------------
-- `storage.objects` já tem RLS ativo por omissão no Supabase e sem políticas
-- não é legível por ninguém além da service_role. Por isso aqui NÃO se cria
-- nenhuma política: a ausência de políticas é o que garante que nem a chave
-- anon nem um utilizador autenticado conseguem ler um CV.
--
-- O acesso ao CV passa sempre pelo backend, que verifica, por esta ordem:
--   1. sessão válida;
--   2. a candidatura existe;
--   3. a candidatura pertence ao restaurante do utilizador;
--   4. o CV pertence a essa candidatura.
-- Só depois o ficheiro é transmitido (§24).

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (qual = 'true' or with_check = 'true')
  ) then
    raise warning 'Existe uma política permissiva em storage.objects. Revê-a: um CV não deve ser legível sem passar pelo backend.';
  end if;
end;
$$;

insert into schema_migrations (version) values ('0003_storage')
on conflict (version) do nothing;

notify pgrst, 'reload schema';
