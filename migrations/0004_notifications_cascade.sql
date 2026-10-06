-- ===========================================================================
-- Fíchame — 0004_notifications_cascade
-- ---------------------------------------------------------------------------
-- As notificações (painel e email) tinham application_id com
-- ON DELETE SET NULL: ao eliminar uma candidatura, a notificação ficava
-- «unread» sem candidatura e o contador do menu «Candidaturas» continuava a
-- contá-la. Também deixava para trás o registo de uma candidatura que o
-- restaurante pediu para apagar.
--
-- Passa a ON DELETE CASCADE (o que delete_application já assumia no
-- comentário) e apaga as notificações órfãs que ficaram de eliminações
-- anteriores. Idempotente.
-- ===========================================================================

alter table notifications
  drop constraint if exists notifications_application_id_fkey;

alter table notifications
  add constraint notifications_application_id_fkey
  foreign key (application_id) references applications(id) on delete cascade;

-- Todas as notificações são de candidaturas (type 'nueva_candidatura'):
-- sem application_id só podem ser restos de candidaturas eliminadas.
delete from notifications where application_id is null;

insert into schema_migrations (version) values ('0004_notifications_cascade')
on conflict (version) do nothing;

notify pgrst, 'reload schema';
