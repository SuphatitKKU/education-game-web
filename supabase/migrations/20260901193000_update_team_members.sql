alter table public.team_members
  add column if not exists is_active boolean not null default true;

alter table public.team_members
  drop constraint if exists team_members_team_position_unique;
drop index if exists public.team_members_team_name_unique_idx;
drop index if exists public.team_members_team_avatar_unique_idx;

create unique index team_members_active_position_unique_idx
  on public.team_members (team_id, position) where is_active;
create unique index team_members_active_name_unique_idx
  on public.team_members (team_id, lower(btrim(name))) where is_active;
create unique index team_members_active_avatar_unique_idx
  on public.team_members (team_id, avatar) where is_active;

create or replace function public.skip_inactive_member_response()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.team_members
    where id = new.member_id and is_active
  ) then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists student_responses_active_member_only on public.student_responses;
create trigger student_responses_active_member_only
before insert or update on public.student_responses
for each row execute function public.skip_inactive_member_response();

create or replace function public.update_team_members(p_team_id uuid, p_members jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team public.teams;
  v_member jsonb;
  v_position integer;
  v_member_id uuid;
begin
  select * into v_team
  from public.teams
  where id = p_team_id and status = 'active'
  for update;
  if not found then raise exception 'ไม่พบทีม' using errcode = 'P0002'; end if;

  if jsonb_typeof(p_members) <> 'array' or jsonb_array_length(p_members) not between 6 and 7 then
    raise exception 'ทีมต้องมีสมาชิก 6–7 คน' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_members) item
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
    raise exception 'ตัวละครในทีมต้องไม่ซ้ำกัน' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_members) item
    where nullif(item->>'id', '') is not null
      and not exists (
        select 1 from public.team_members member_row
        where member_row.id = (item->>'id')::uuid and member_row.team_id = p_team_id
      )
  ) then
    raise exception 'พบสมาชิกที่ไม่ได้อยู่ในทีมนี้' using errcode = '22023';
  end if;

  -- Archive omitted students first so their original names remain available in history.
  update public.team_members existing
  set is_active = false
  where existing.team_id = p_team_id and existing.is_active
    and not exists (
      select 1 from jsonb_array_elements(p_members) item
      where nullif(item->>'id', '') is not null and (item->>'id')::uuid = existing.id
    );

  -- Temporary unique values let retained students swap names and avatars safely.
  update public.team_members
  set name = 'tmp_' || left(replace(id::text, '-', ''), 8),
      avatar = 'tmp_' || id::text
  where team_id = p_team_id and is_active;

  for v_member, v_position in
    select item, (ordinality - 1)::integer
    from jsonb_array_elements(p_members) with ordinality as members(item, ordinality)
  loop
    v_member_id := nullif(v_member->>'id', '')::uuid;
    if v_member_id is null then
      insert into public.team_members (team_id, name, avatar, position)
      values (p_team_id, btrim(v_member->>'name'), v_member->>'avatar', v_position);
    else
      update public.team_members
      set name = btrim(v_member->>'name'), avatar = v_member->>'avatar', position = v_position, is_active = true
      where id = v_member_id and team_id = p_team_id;
    end if;
  end loop;

  update public.teams set updated_at = now() where id = p_team_id returning * into v_team;
  return jsonb_build_object(
    'id', v_team.id,
    'name', v_team.name,
    'created_at', v_team.created_at,
    'updated_at', v_team.updated_at,
    'members', (
      select coalesce(jsonb_agg(to_jsonb(member_row) order by member_row.position), '[]'::jsonb)
      from public.team_members member_row where member_row.team_id = p_team_id and member_row.is_active
    )
  );
end;
$$;

revoke execute on function public.update_team_members(uuid, jsonb) from public;
grant execute on function public.update_team_members(uuid, jsonb) to anon, authenticated;

comment on function public.update_team_members(uuid, jsonb) is
  'Updates a 6–7 student roster. Removed members are archived so historical responses remain available.';

-- Save individual answers by member id. The position key remains as a fallback
-- for runs created before attendance-aware rosters were introduced.
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
              and allowed_member.is_active
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
    select * from public.team_members
    where team_id = v_run.team_id and is_active
    order by position
  loop
    v_ticket := p_save_state #> array['exitTickets', 'member-' || v_member.id::text];
    if jsonb_typeof(v_ticket) <> 'object' then
      v_ticket := p_save_state #> array['exitTickets', 'student-' || v_member.position::text];
    end if;
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
