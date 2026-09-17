alter function public.skip_inactive_member_response() security invoker;
revoke execute on function public.skip_inactive_member_response() from public, anon, authenticated;

comment on function public.skip_inactive_member_response() is
  'Internal trigger only. Prevents responses from being written for archived roster members.';
