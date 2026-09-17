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
  if jsonb_typeof(p_members) <> 'array' or jsonb_array_length(p_members) not between 4 and 7 then
    raise exception 'ทีมต้องมีสมาชิก 4–7 คน' using errcode = '22023';
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
      where member_row.team_id = v_team.id and member_row.is_active
    )
  );
end;
$$;

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

  if jsonb_typeof(p_members) <> 'array' or jsonb_array_length(p_members) not between 4 and 7 then
    raise exception 'ทีมต้องมีสมาชิก 4–7 คน' using errcode = '22023';
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

  update public.team_members existing
  set is_active = false
  where existing.team_id = p_team_id and existing.is_active
    and not exists (
      select 1 from jsonb_array_elements(p_members) item
      where nullif(item->>'id', '') is not null and (item->>'id')::uuid = existing.id
    );

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

revoke execute on function public.create_team_with_members(text, jsonb) from public;
grant execute on function public.create_team_with_members(text, jsonb) to anon, authenticated;

revoke execute on function public.update_team_members(uuid, jsonb) from public;
grant execute on function public.update_team_members(uuid, jsonb) to anon, authenticated;

comment on function public.create_team_with_members(text, jsonb) is
  'Creates a team with 4–7 active students.';
comment on function public.update_team_members(uuid, jsonb) is
  'Updates a 4–7 student roster. Removed members are archived so historical responses remain available.';
