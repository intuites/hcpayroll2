create table if not exists public.app_password_reset_tokens (
  token_hash text primary key,
  user_id uuid not null references public.app_login_users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists app_password_reset_tokens_user_id_idx
  on public.app_password_reset_tokens(user_id);

create or replace function public.set_app_login_password(
  p_user_id uuid,
  p_new_password text
)
returns void
language plpgsql
security definer
as $$
begin
  update public.app_login_users
  set password_hash = crypt(p_new_password, gen_salt('bf'))
  where id = p_user_id;
end;
$$;

grant execute on function public.set_app_login_password(uuid, text) to anon, authenticated;
