begin;
select plan(16);

select has_table('public', 'teams', 'teams table exists');
select has_table('public', 'game_runs', 'game_runs table exists');
select has_table('public', 'student_responses', 'student_responses table exists');
select has_table('public', 'learning_events', 'learning_events table exists');
select policies_are('public', 'teams', array['teams_public_read'], 'teams has explicit public read policy');
select policies_are('public', 'teacher_profiles', array['teacher_profiles_select_own'], 'teacher profile is self-readable only');
select table_privs_are('public', 'teams', 'anon', array['SELECT'], 'anon can only select teams directly');
select table_privs_are('public', 'game_runs', 'anon', array['SELECT'], 'anon can only select runs directly');
select table_privs_are('public', 'learning_events', 'anon', array['SELECT'], 'anon can only select events directly');
select function_privs_are('public', 'save_run_checkpoint', array['uuid','integer','jsonb','text','jsonb'], 'anon', array['EXECUTE'], 'anon can save through guarded RPC');
select function_privs_are('public', 'complete_run', array['uuid','integer','jsonb','text','jsonb'], 'anon', array['EXECUTE'], 'anon can complete through guarded RPC');
select col_is_pk('public', 'teacher_profiles', 'user_id', 'teacher profile uses auth user id as primary key');
select has_function('public', 'delete_team_for_teacher', array['uuid'], 'teacher team deletion RPC exists');
select function_privs_are('public', 'delete_team_for_teacher', array['uuid'], 'anon', array[]::text[], 'anon cannot execute team deletion');
select function_privs_are('public', 'delete_team_for_teacher', array['uuid'], 'authenticated', array['EXECUTE'], 'authenticated users can reach guarded team deletion RPC');
select table_privs_are('public', 'teams', 'authenticated', array['SELECT'], 'authenticated users cannot delete teams directly');

select * from finish();
rollback;
