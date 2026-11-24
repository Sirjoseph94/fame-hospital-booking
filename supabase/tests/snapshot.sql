-- Dumps policies, function privileges, triggers, indexes and constraints so two
-- migration runs can be diffed (idempotency check). Rows sorted by name.
\pset format unaligned
\pset tuples_only on
select 'POLICY', schemaname, tablename, policyname, cmd, coalesce(qual,''), coalesce(with_check,'') from pg_policies where schemaname in ('public','storage') order by 2,3,4;
select 'FUNC', p.proname, pg_get_function_identity_arguments(p.oid), p.prosecdef, coalesce(array_to_string(p.proconfig, ','),''), coalesce(array_to_string(p.proacl, ','),'') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by 2,3;
select 'TRIGGER', event_object_table, trigger_name, action_timing, event_manipulation from information_schema.triggers where trigger_schema='public' order by 2,3,5;
select 'INDEX', tablename, indexname, indexdef from pg_indexes where schemaname='public' order by 2,3;
select 'CONSTRAINT', conrelid::regclass, conname, pg_get_constraintdef(oid), convalidated from pg_constraint where connamespace='public'::regnamespace order by conrelid::regclass::text, conname;
