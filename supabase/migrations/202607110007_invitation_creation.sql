create or replace function public.create_invitation(invitation_expires_at timestamptz)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  invitation_token text;
begin
  if not public.has_app_role('admin'::public.app_role) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if invitation_expires_at <= now() then
    raise exception 'Invitation expiration must be in the future';
  end if;

  invitation_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.invitations (token_hash, expires_at, created_by)
  values (extensions.digest(invitation_token, 'sha256'), invitation_expires_at, current_user_id);
  return invitation_token;
end;
$$;

revoke all on function public.create_invitation(timestamptz) from public;
grant execute on function public.create_invitation(timestamptz) to authenticated;
