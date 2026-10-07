-- ===========================================================================
-- Fíchame — 0006_tenant_fk_cleanup
--
-- 0005 acrescentou FKs compostas (id, restaurant_id) que garantem, na BD,
-- que nenhuma linha aponta para outro tenant. As FKs simples antigas ficaram
-- redundantes e, pior, o PostgREST passou a ver DUAS relações entre as mesmas
-- tabelas e recusa embeds como notifications → applications → candidates
-- (erro PGRST201: «more than one relationship was found»).
--
-- Remove as FKs simples SÓ quando a composta equivalente existe. A semântica
-- de ON DELETE é a mesma (cascade / set null (job_id)). Idempotente.
-- ===========================================================================

do $$
declare
  pair text[];
begin
  foreach pair slice 1 in array array[
    array['applications',        'applications_candidate_id_fkey',   'applications_candidate_same_tenant'],
    array['applications',        'applications_job_id_fkey',         'applications_job_same_tenant'],
    array['cvs',                 'cvs_application_id_fkey',          'cvs_application_same_tenant'],
    array['application_notes',   'application_notes_application_id_fkey',   'notes_application_same_tenant'],
    array['application_history', 'application_history_application_id_fkey', 'history_application_same_tenant'],
    array['notifications',       'notifications_application_id_fkey', 'notifications_application_same_tenant']
  ]
  loop
    if exists (select 1 from pg_constraint where conname = pair[3])
       and exists (select 1 from pg_constraint where conname = pair[2]) then
      execute format('alter table %I drop constraint %I', pair[1], pair[2]);
    end if;
  end loop;
end;
$$;

insert into schema_migrations (version) values ('0006_tenant_fk_cleanup')
on conflict (version) do nothing;

notify pgrst, 'reload schema';
