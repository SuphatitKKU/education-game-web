create extension if not exists pgcrypto;

create table public.teacher_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'ครู',
  created_at timestamptz not null default now(),
  constraint teacher_profiles_display_name_not_blank check (btrim(display_name) <> '')
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teams_name_not_blank check (btrim(name) <> ''),
  constraint teams_name_length check (char_length(btrim(name)) between 1 and 60),
  constraint teams_status_check check (status in ('active', 'archived'))
);

create unique index teams_normalized_name_unique_idx on public.teams (lower(btrim(name)));
create index teams_updated_at_idx on public.teams (updated_at desc);

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  avatar text not null,
  position smallint not null,
  created_at timestamptz not null default now(),
  constraint team_members_name_not_blank check (btrim(name) <> ''),
  constraint team_members_name_length check (char_length(btrim(name)) between 1 and 20),
  constraint team_members_avatar_not_blank check (btrim(avatar) <> ''),
  constraint team_members_position_check check (position between 0 and 6),
  constraint team_members_team_position_unique unique (team_id, position)
);

create index team_members_team_id_idx on public.team_members (team_id);
create unique index team_members_team_name_unique_idx on public.team_members (team_id, lower(btrim(name)));
create unique index team_members_team_avatar_unique_idx on public.team_members (team_id, avatar);

create table public.game_runs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  status text not null default 'in_progress',
  current_stage text not null default 'story',
  save_state jsonb not null default '{}'::jsonb,
  revision integer not null default 0,
  legacy_run_id text,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint game_runs_status_check check (status in ('in_progress', 'completed')),
  constraint game_runs_revision_check check (revision >= 0),
  constraint game_runs_completion_check check (
    (status = 'in_progress' and completed_at is null)
    or (status = 'completed' and completed_at is not null)
  )
);

create unique index game_runs_one_active_per_team_idx
  on public.game_runs (team_id)
  where status = 'in_progress';
create unique index game_runs_legacy_run_id_unique_idx
  on public.game_runs (legacy_run_id)
  where legacy_run_id is not null;
create index game_runs_team_started_idx on public.game_runs (team_id, started_at desc);
create index game_runs_status_updated_idx on public.game_runs (status, updated_at desc);

create table public.student_responses (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.game_runs(id) on delete cascade,
  member_id uuid not null references public.team_members(id) on delete cascade,
  k text not null default '',
  p text not null default '',
  v text not null default '',
  saved_at timestamptz not null default now(),
  constraint student_responses_run_member_unique unique (run_id, member_id)
);

create index student_responses_run_id_idx on public.student_responses (run_id);
create index student_responses_member_id_idx on public.student_responses (member_id);

create table public.learning_events (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.game_runs(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  member_id uuid references public.team_members(id) on delete set null,
  event_type text not null,
  stage text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint learning_events_event_type_not_blank check (btrim(event_type) <> ''),
  constraint learning_events_stage_not_blank check (btrim(stage) <> '')
);

create index learning_events_run_occurred_idx on public.learning_events (run_id, occurred_at desc);
create index learning_events_team_occurred_idx on public.learning_events (team_id, occurred_at desc);
create index learning_events_member_id_idx on public.learning_events (member_id) where member_id is not null;

alter table public.teacher_profiles enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.game_runs enable row level security;
alter table public.student_responses enable row level security;
alter table public.learning_events enable row level security;

revoke all on table public.teacher_profiles from anon, authenticated;
revoke all on table public.teams from anon, authenticated;
revoke all on table public.team_members from anon, authenticated;
revoke all on table public.game_runs from anon, authenticated;
revoke all on table public.student_responses from anon, authenticated;
revoke all on table public.learning_events from anon, authenticated;

grant select on table public.teacher_profiles to authenticated;
grant select on table public.teams to anon, authenticated;
grant select on table public.team_members to anon, authenticated;
grant select on table public.game_runs to anon, authenticated;
grant select on table public.student_responses to anon, authenticated;
grant select on table public.learning_events to anon, authenticated;

create policy teacher_profiles_select_own
  on public.teacher_profiles for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy teams_public_read
  on public.teams for select
  to anon, authenticated
  using (true);

create policy team_members_public_read
  on public.team_members for select
  to anon, authenticated
  using (true);

create policy game_runs_public_read
  on public.game_runs for select
  to anon, authenticated
  using (true);

create policy student_responses_public_read
  on public.student_responses for select
  to anon, authenticated
  using (true);

create policy learning_events_public_read
  on public.learning_events for select
  to anon, authenticated
  using (true);

create or replace function public.create_team_with_members(p_name text, p_members jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team public.teams;
  v_member jsonb;
  v_position integer;
begin
  if char_length(btrim(p_name)) not between 1 and 60 then
    raise exception 'กรุณาตั้งชื่อทีม 1–60 ตัวอักษร' using errcode = '22023';
  end if;
  if jsonb_typeof(p_members) <> 'array' or jsonb_array_length(p_members) not between 6 and 7 then
    raise exception 'ทีมต้องมีสมาชิก 6–7 คน' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_members) item
    where btrim(item->>'name') = ''
      or char_length(btrim(item->>'name')) > 20
      or btrim(item->>'avatar') = ''
  ) then
    raise exception 'ชื่อเล่นหรือ avatar ไม่ถูกต้อง' using errcode = '22023';
  end if;
  if (select count(distinct lower(btrim(item->>'name'))) from jsonb_array_elements(p_members) item) <> jsonb_array_length(p_members) then
    raise exception 'ชื่อเล่นในทีมต้องไม่ซ้ำกัน' using errcode = '22023';
  end if;
  if (select count(distinct item->>'avatar') from jsonb_array_elements(p_members) item) <> jsonb_array_length(p_members) then
    raise exception 'avatar ในทีมต้องไม่ซ้ำกัน' using errcode = '22023';
  end if;

  insert into public.teams (name) values (btrim(p_name)) returning * into v_team;
  for v_member, v_position in
    select item, (ordinality - 1)::integer
    from jsonb_array_elements(p_members) with ordinality as members(item, ordinality)
  loop
    insert into public.team_members (team_id, name, avatar, position)
    values (v_team.id, btrim(v_member->>'name'), v_member->>'avatar', v_position);
  end loop;

  return jsonb_build_object(
    'id', v_team.id,
    'name', v_team.name,
    'created_at', v_team.created_at,
    'updated_at', v_team.updated_at,
    'members', (
      select coalesce(jsonb_agg(to_jsonb(member_row) order by member_row.position), '[]'::jsonb)
      from public.team_members member_row
      where member_row.team_id = v_team.id
    )
  );
end;
$$;

create or replace function public.start_or_resume_run(p_team_id uuid, p_seed_state jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.game_runs;
begin
  perform 1 from public.teams where id = p_team_id and status = 'active' for update;
  if not found then raise exception 'ไม่พบทีม' using errcode = 'P0002'; end if;

  select * into v_run
  from public.game_runs
  where team_id = p_team_id and status = 'in_progress'
  for update;

  if found then
    insert into public.learning_events (run_id, team_id, event_type, stage, payload)
    values (v_run.id, p_team_id, 'run_resumed', v_run.current_stage, '{}'::jsonb);
    return to_jsonb(v_run);
  end if;

  insert into public.game_runs (team_id, current_stage, save_state)
  values (p_team_id, coalesce(nullif(p_seed_state->>'stage', ''), 'story'), coalesce(p_seed_state, '{}'::jsonb))
  returning * into v_run;
  update public.teams set updated_at = now() where id = p_team_id;
  insert into public.learning_events (run_id, team_id, event_type, stage, payload)
  values (v_run.id, p_team_id, 'run_started', v_run.current_stage, '{}'::jsonb);
  return to_jsonb(v_run);
end;
$$;

create or replace function public.save_run_checkpoint(
  p_run_id uuid,
  p_expected_revision integer,
  p_save_state jsonb,
  p_current_stage text,
  p_events jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.game_runs;
  v_event jsonb;
  v_member public.team_members;
  v_ticket jsonb;
begin
  select * into v_run from public.game_runs where id = p_run_id for update;
  if not found then raise exception 'ไม่พบรอบภารกิจ' using errcode = 'P0002'; end if;
  if v_run.status <> 'in_progress' then raise exception 'รอบภารกิจนี้จบแล้ว' using errcode = '22023'; end if;
  if v_run.revision <> p_expected_revision then
    return jsonb_build_object('conflict', true, 'run', to_jsonb(v_run));
  end if;

  update public.game_runs
  set save_state = coalesce(p_save_state, '{}'::jsonb),
      current_stage = coalesce(nullif(p_current_stage, ''), current_stage),
      revision = revision + 1,
      updated_at = now()
  where id = p_run_id
  returning * into v_run;
  update public.teams set updated_at = v_run.updated_at where id = v_run.team_id;

  if jsonb_typeof(p_events) = 'array' then
    for v_event in select value from jsonb_array_elements(p_events)
    loop
      insert into public.learning_events (run_id, team_id, member_id, event_type, stage, payload)
      values (
        v_run.id,
        v_run.team_id,
        case
          when nullif(v_event->>'member_id', '') is null then null
          when exists (
            select 1 from public.team_members allowed_member
            where allowed_member.id = (v_event->>'member_id')::uuid
              and allowed_member.team_id = v_run.team_id
          ) then (v_event->>'member_id')::uuid
          else null
        end,
        coalesce(nullif(v_event->>'event_type', ''), 'checkpoint_saved'),
        coalesce(nullif(v_event->>'stage', ''), v_run.current_stage),
        coalesce(v_event->'payload', '{}'::jsonb)
      );
    end loop;
  end if;

  for v_member in
    select * from public.team_members where team_id = v_run.team_id order by position
  loop
    v_ticket := p_save_state #> array['exitTickets', 'student-' || v_member.position::text];
    if jsonb_typeof(v_ticket) = 'object' then
      insert into public.student_responses (run_id, member_id, k, p, v, saved_at)
      values (
        v_run.id,
        v_member.id,
        coalesce(v_ticket->>'k', ''),
        coalesce(v_ticket->>'p', ''),
        coalesce(v_ticket->>'v', ''),
        now()
      )
      on conflict (run_id, member_id) do update
      set k = excluded.k, p = excluded.p, v = excluded.v, saved_at = excluded.saved_at;
    end if;
  end loop;

  return jsonb_build_object('conflict', false, 'run', to_jsonb(v_run));
end;
$$;

create or replace function public.complete_run(
  p_run_id uuid,
  p_expected_revision integer,
  p_save_state jsonb,
  p_current_stage text,
  p_events jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_checkpoint jsonb;
  v_run public.game_runs;
begin
  v_checkpoint := public.save_run_checkpoint(
    p_run_id,
    p_expected_revision,
    p_save_state,
    p_current_stage,
    p_events
  );
  if coalesce((v_checkpoint->>'conflict')::boolean, false) then return v_checkpoint; end if;

  update public.game_runs
  set status = 'completed', completed_at = now(), updated_at = now()
  where id = p_run_id and status = 'in_progress'
  returning * into v_run;
  if not found then raise exception 'รอบภารกิจนี้จบแล้ว' using errcode = '22023'; end if;
  update public.teams set updated_at = v_run.updated_at where id = v_run.team_id;
  insert into public.learning_events (run_id, team_id, event_type, stage, payload)
  values (v_run.id, v_run.team_id, 'run_completed', v_run.current_stage, '{}'::jsonb);
  return jsonb_build_object('conflict', false, 'run', to_jsonb(v_run));
end;
$$;

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
  if jsonb_typeof(v_members) <> 'array' or jsonb_array_length(v_members) not between 6 and 7 then
    if jsonb_typeof(p_statistics) = 'array' and jsonb_array_length(p_statistics) > 0 then
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', member_name,
        'avatar', (array['inventor_sun','inventor_star','inventor_green','inventor_glasses','inventor_curls','inventor_cap','inventor_braids'])[ordinality::integer]
      ) order by ordinality), '[]'::jsonb)
      into v_members
      from jsonb_array_elements_text(p_statistics->0->'members') with ordinality as names(member_name, ordinality);
    end if;
  end if;
  if jsonb_typeof(v_members) <> 'array' or jsonb_array_length(v_members) not between 6 and 7 then
    raise exception 'ข้อมูลเดิมไม่มีรายชื่อสมาชิก 6–7 คน' using errcode = '22023';
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

      for v_member in select * from public.team_members where team_id = v_team_id order by position
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

  if jsonb_typeof(p_save_state) = 'object' and jsonb_array_length(coalesce(p_save_state->'team', '[]'::jsonb)) between 6 and 7 then
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

revoke execute on function public.create_team_with_members(text, jsonb) from public;
revoke execute on function public.start_or_resume_run(uuid, jsonb) from public;
revoke execute on function public.save_run_checkpoint(uuid, integer, jsonb, text, jsonb) from public;
revoke execute on function public.complete_run(uuid, integer, jsonb, text, jsonb) from public;
revoke execute on function public.import_legacy_bundle(text, jsonb, jsonb) from public;

grant execute on function public.create_team_with_members(text, jsonb) to anon, authenticated;
grant execute on function public.start_or_resume_run(uuid, jsonb) to anon, authenticated;
grant execute on function public.save_run_checkpoint(uuid, integer, jsonb, text, jsonb) to anon, authenticated;
grant execute on function public.complete_run(uuid, integer, jsonb, text, jsonb) to anon, authenticated;
grant execute on function public.import_legacy_bundle(text, jsonb, jsonb) to anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'game_runs'
  ) then alter publication supabase_realtime add table public.game_runs; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'learning_events'
  ) then alter publication supabase_realtime add table public.learning_events; end if;
end $$;

comment on table public.teams is 'Public classroom team list. Store nicknames only.';
comment on table public.learning_events is 'Meaningful learning events only; excludes low-value UI clicks.';
