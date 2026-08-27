create or replace function public.delete_team_for_teacher(p_team_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not exists (
    select 1
    from public.teacher_profiles
    where user_id = (select auth.uid())
  ) then
    raise exception 'บัญชีนี้ไม่มีสิทธิ์ลบทีม' using errcode = '42501';
  end if;

  delete from public.teams where id = p_team_id;
  if not found then
    raise exception 'ไม่พบทีมที่ต้องการลบ' using errcode = 'P0002';
  end if;

  return p_team_id;
end;
$$;

revoke execute on function public.delete_team_for_teacher(uuid) from public;
revoke execute on function public.delete_team_for_teacher(uuid) from anon;
grant execute on function public.delete_team_for_teacher(uuid) to authenticated;

comment on function public.delete_team_for_teacher(uuid) is
  'Permanently deletes one team and its cascaded learning records; teacher_profiles members only.';
