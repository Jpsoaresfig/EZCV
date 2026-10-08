-- ===========================================================================
-- Fíchame — 0011_password_help_requests
--
-- Recuperação de senha sem email: quando não há SMTP configurado, o
-- «¿Has olvidado tu contraseña?» deixa aqui um pedido e o admin da
-- plataforma define uma senha nova em /admin/usuarios.
--
-- Minimização: só se guarda o pedido de contas que existem (o email fica na
-- própria conta), sem IP nem texto livre. Um pedido pendente por conta. O
-- pedido é apagado quando o admin muda a senha ou o descarta, e sai por
-- cascata com a conta.
--
-- Só ACRESCENTA. Idempotente. Aplicar depois de 0010.
-- ===========================================================================

create table if not exists password_help_requests (
  id          bigint generated always as identity primary key,
  user_id     bigint      not null unique references users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- RLS deny-all e revogação (como em 0001/0005): só o service_role lê.
do $$
declare
  has_anon boolean := exists (select 1 from pg_roles where rolname = 'anon');
  has_auth boolean := exists (select 1 from pg_roles where rolname = 'authenticated');
begin
  execute 'alter table password_help_requests enable row level security';
  if has_anon then execute 'revoke all on table password_help_requests from anon'; end if;
  if has_auth then execute 'revoke all on table password_help_requests from authenticated'; end if;
end;
$$;

insert into schema_migrations (version) values ('0011_password_help_requests')
on conflict (version) do nothing;

notify pgrst, 'reload schema';
