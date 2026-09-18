alter table public.game_runs
  add column mission_number smallint,
  add column attempt_number integer;

-- Existing rows already contain enough information to recover the real
-- mission. Completion flags are intentionally ignored because they carry
-- forward into later missions.
update public.game_runs
set mission_number = case
  when (save_state->>'missionNumber') ~ '^[1-5]$'
    then (save_state->>'missionNumber')::smallint
  when current_stage like 'mission3%'
    then 3
  when current_stage in (
    'mission2Review', 'mission2Question', 'mission2Parts', 'mission2Intro',
    'testHub', 'compression', 'absorption', 'elasticity', 'impact',
    'notebook', 'comparison', 'recap', 'mission2Assessment',
    'mission2Complete', 'prediction', 'summary'
  ) then 2
  else 1
end;

with numbered_runs as (
  select
    id,
    row_number() over (
      partition by team_id, mission_number
      order by started_at, id
    )::integer as attempt_number
  from public.game_runs
)
update public.game_runs as target
set attempt_number = numbered_runs.attempt_number
from numbered_runs
where target.id = numbered_runs.id;

alter table public.game_runs
  alter column mission_number set not null,
  alter column attempt_number set not null,
  add constraint game_runs_mission_number_check check (mission_number between 1 and 5),
  add constraint game_runs_attempt_number_check check (attempt_number > 0),
  add constraint game_runs_team_mission_attempt_unique unique (team_id, mission_number, attempt_number);

create index game_runs_team_mission_attempt_idx
  on public.game_runs (team_id, mission_number, attempt_number desc);

create or replace function public.start_or_resume_run(p_team_id uuid, p_seed_state jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.game_runs;
  v_mission_number smallint;
  v_attempt_number integer;
begin
  perform 1 from public.teams where id = p_team_id and status = 'active' for update;
  if not found then raise exception 'ไม่พบทีม' using errcode = 'P0002'; end if;

  if coalesce(p_seed_state->>'missionNumber', '') !~ '^[1-5]$' then
    raise exception 'หมายเลขภารกิจไม่ถูกต้อง' using errcode = '22023';
  end if;
  v_mission_number := (p_seed_state->>'missionNumber')::smallint;

  select * into v_run
  from public.game_runs
  where team_id = p_team_id and status = 'in_progress'
  for update;

  if found then
    if v_run.mission_number <> v_mission_number then
      raise exception 'ทีมนี้กำลังทำภารกิจที่ % อยู่', v_run.mission_number using errcode = '22023';
    end if;
    insert into public.learning_events (run_id, team_id, event_type, stage, payload)
    values (
      v_run.id,
      p_team_id,
      'run_resumed',
      v_run.current_stage,
      jsonb_build_object('missionNumber', v_run.mission_number, 'attemptNumber', v_run.attempt_number)
    );
    return to_jsonb(v_run);
  end if;

  select coalesce(max(attempt_number), 0) + 1 into v_attempt_number
  from public.game_runs
  where team_id = p_team_id and mission_number = v_mission_number;

  insert into public.game_runs (
    team_id,
    mission_number,
    attempt_number,
    current_stage,
    save_state
  ) values (
    p_team_id,
    v_mission_number,
    v_attempt_number,
    coalesce(nullif(p_seed_state->>'stage', ''), 'story'),
    coalesce(p_seed_state, '{}'::jsonb)
  )
  returning * into v_run;

  update public.teams set updated_at = now() where id = p_team_id;
  insert into public.learning_events (run_id, team_id, event_type, stage, payload)
  values (
    v_run.id,
    p_team_id,
    'run_started',
    v_run.current_stage,
    jsonb_build_object('missionNumber', v_run.mission_number, 'attemptNumber', v_run.attempt_number)
  );
  return to_jsonb(v_run);
end;
$$;
