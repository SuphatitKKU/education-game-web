create or replace function public.import_legacy_bundle(
  p_team_name text,
  p_save_state jsonb,
  p_statistics jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team_id uuid;
  v_members jsonb;
  v_team jsonb;
  v_stat jsonb;
  v_stat_state jsonb;
  v_run public.game_runs;
  v_member public.team_members;
  v_ticket jsonb;
  v_legacy_id text;
  v_status text;
begin
  select id into v_team_id from public.teams where lower(btrim(name)) = lower(btrim(p_team_name));
  if found then return jsonb_build_object('team_id', v_team_id, 'already_imported', true); end if;

  v_members := p_save_state->'team';
  if jsonb_typeof(v_members) <> 'array' or jsonb_array_length(v_members) not between 4 and 7 then
    if jsonb_typeof(p_statistics) = 'array' and jsonb_array_length(p_statistics) > 0 then
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', member_name,
        'avatar', (array['inventor_sun','inventor_star','inventor_green','inventor_glasses','inventor_curls','inventor_cap','inventor_braids'])[ordinality::integer]
      ) order by ordinality), '[]'::jsonb)
      into v_members
      from jsonb_array_elements_text(p_statistics->0->'members') with ordinality as names(member_name, ordinality);
    end if;
  end if;
  if jsonb_typeof(v_members) <> 'array' or jsonb_array_length(v_members) not between 4 and 7 then
    raise exception 'ข้อมูลเดิมไม่มีรายชื่อสมาชิก 4–7 คน' using errcode = '22023';
  end if;

  v_team := public.create_team_with_members(p_team_name, v_members);
  v_team_id := (v_team->>'id')::uuid;

  if jsonb_typeof(p_statistics) = 'array' then
    for v_stat in select value from jsonb_array_elements(p_statistics)
    loop
      v_legacy_id := nullif(v_stat->>'runId', '');
      if v_legacy_id is not null and exists (select 1 from public.game_runs where legacy_run_id = v_legacy_id) then continue; end if;
      v_stat_state := jsonb_build_object(
        'version', 1,
        'stage', 'summary',
        'team', v_members,
        'studyFocus', coalesce(v_stat->'studyFocus', '{}'::jsonb),
        'exitTickets', coalesce(v_stat->'exitTickets', '{}'::jsonb),
        'runId', coalesce(v_stat->>'runId', gen_random_uuid()::text),
        'audio', true
      );
      insert into public.game_runs (team_id, status, current_stage, save_state, legacy_run_id, started_at, updated_at, completed_at)
      values (
        v_team_id,
        'completed',
        'summary',
        v_stat_state,
        v_legacy_id,
        coalesce(nullif(v_stat->>'submittedAt', '')::timestamptz, now()),
        coalesce(nullif(v_stat->>'submittedAt', '')::timestamptz, now()),
        coalesce(nullif(v_stat->>'submittedAt', '')::timestamptz, now())
      ) returning * into v_run;

      for v_member in select * from public.team_members where team_id = v_team_id and is_active order by position
      loop
        v_ticket := coalesce(
          v_stat->'exitTickets'->('student-' || v_member.position::text),
          v_stat->'exitTickets'->v_member.name
        );
        if jsonb_typeof(v_ticket) = 'object' then
          insert into public.student_responses (run_id, member_id, k, p, v)
          values (v_run.id, v_member.id, coalesce(v_ticket->>'k',''), coalesce(v_ticket->>'p',''), coalesce(v_ticket->>'v',''));
        end if;
      end loop;
      insert into public.learning_events (run_id, team_id, event_type, stage, payload, occurred_at)
      values (v_run.id, v_team_id, 'legacy_run_imported', 'summary', '{}'::jsonb, v_run.completed_at);
    end loop;
  end if;

  if jsonb_typeof(p_save_state) = 'object' and jsonb_array_length(coalesce(p_save_state->'team', '[]'::jsonb)) between 4 and 7 then
    v_legacy_id := nullif(p_save_state->>'runId', '');
    if v_legacy_id is null or not exists (select 1 from public.game_runs where legacy_run_id = v_legacy_id) then
      v_status := case when p_save_state->>'stage' = 'summary' then 'completed' else 'in_progress' end;
      insert into public.game_runs (team_id, status, current_stage, save_state, legacy_run_id, completed_at)
      values (
        v_team_id,
        v_status,
        coalesce(nullif(p_save_state->>'stage',''), 'story'),
        p_save_state,
        v_legacy_id,
        case when v_status = 'completed' then now() else null end
      ) returning * into v_run;
      insert into public.learning_events (run_id, team_id, event_type, stage, payload)
      values (v_run.id, v_team_id, 'legacy_run_imported', v_run.current_stage, '{}'::jsonb);
    end if;
  end if;
  update public.teams set updated_at = now() where id = v_team_id;
  return jsonb_build_object('team_id', v_team_id, 'already_imported', false);
end;
$$;

revoke execute on function public.import_legacy_bundle(text, jsonb, jsonb) from public;
grant execute on function public.import_legacy_bundle(text, jsonb, jsonb) to anon, authenticated;

comment on function public.import_legacy_bundle(text, jsonb, jsonb) is
  'Imports a legacy 4–7 student team without deleting historical attempts.';
