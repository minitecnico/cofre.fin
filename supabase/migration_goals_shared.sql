-- ============================================================================
-- Migration: Metas coletivas (ex.: casal juntando para uma viagem)
-- ============================================================================
-- 1. goals ganha is_shared + dados da conta PIX onde o dinheiro é depositado.
-- 2. goal_members      → quem participa (o dono entra sozinho, via trigger).
-- 3. profiles         → @nick único de cada usuário (é por ele que se convida).
--    goal_invites      → convite feito dentro do app pelo @nick; o convidado
--                        ACEITA ou RECUSA logado na própria conta.
-- 4. goal_contributions→ histórico de depósitos (quem, quanto, quando).
-- 5. RPCs SECURITY DEFINER: convidar, responder convite, depositar.
-- 6. Realtime nas 4 tabelas → todos acompanham o progresso ao vivo.
--
-- Por que RPC para depositar: o membro NÃO pode dar UPDATE em goals (a policy
-- de escrita continua só do dono); a RPC valida a participação, grava o
-- depósito e soma no current_amount numa única transação.
--
-- Pré-requisito: goals.id é uuid. Idempotente.
-- ============================================================================

-- ── 1. Colunas novas em goals ───────────────────────────────────────────────
alter table public.goals add column if not exists is_shared    boolean not null default false;
alter table public.goals add column if not exists pix_key      text;
alter table public.goals add column if not exists pix_key_type text;
alter table public.goals add column if not exists pix_name     text;  -- titular da conta
alter table public.goals add column if not exists pix_city     text;

-- ── 2. Tabelas ──────────────────────────────────────────────────────────────
create table if not exists public.goal_members (
  goal_id      uuid not null references public.goals(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'member' check (role in ('owner','member')),
  display_name text,
  joined_at    timestamptz default now(),
  primary key (goal_id, user_id)
);
create index if not exists idx_goal_members_user on public.goal_members(user_id);

-- @nick: minúsculo, 3–20 caracteres (letras, números, _ e .).
create table if not exists public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  nick       text not null unique check (nick ~ '^[a-z0-9_.]{3,20}$'),
  created_at timestamptz default now()
);

-- Versão anterior desta migration convidava por e-mail: descarta a tabela
-- antiga (só convites de teste) para recriar no formato com @nick.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'goal_invites' and column_name = 'email'
  ) then
    drop table public.goal_invites;
  end if;
end $$;

create table if not exists public.goal_invites (
  id           uuid primary key default gen_random_uuid(),
  goal_id      uuid not null references public.goals(id) on delete cascade,
  invitee_id   uuid not null references auth.users(id) on delete cascade,
  invitee_nick text not null,                 -- cópia p/ o dono ver (profiles é privado)
  invited_by   uuid not null references auth.users(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at   timestamptz default now(),
  unique (goal_id, invitee_id)
);
create index if not exists idx_goal_invites_invitee on public.goal_invites(invitee_id) where status = 'pending';

create table if not exists public.goal_contributions (
  id           uuid primary key default gen_random_uuid(),
  goal_id      uuid not null references public.goals(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text,
  amount       numeric(12,2) not null check (amount > 0),
  created_at   timestamptz default now()
);
create index if not exists idx_goal_contrib_goal on public.goal_contributions(goal_id, created_at desc);

-- ── Helpers ─────────────────────────────────────────────────────────────────
-- SECURITY DEFINER evita recursão infinita de RLS (policy de goal_members
-- consultando goal_members).
create or replace function public.is_goal_member(p_goal_id uuid)
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (select 1 from public.goal_members where goal_id = p_goal_id and user_id = auth.uid());
$$;

/** Nome amigável do usuário: name do cadastro → full_name do Google → parte do e-mail. */
create or replace function public.user_display_name(p_user_id uuid)
returns text
language sql security definer set search_path = public, auth stable
as $$
  select coalesce(
    nullif(raw_user_meta_data->>'name', ''),
    nullif(raw_user_meta_data->>'full_name', ''),
    split_part(email, '@', 1)
  ) from auth.users where id = p_user_id;
$$;
revoke execute on function public.user_display_name(uuid) from public, anon;

-- Dono vira membro 'owner' assim que a meta é compartilhada (insert ou update).
create or replace function public.goal_add_owner_member()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.is_shared then
    insert into public.goal_members (goal_id, user_id, role, display_name)
    values (new.id, new.user_id, 'owner', public.user_display_name(new.user_id))
    on conflict (goal_id, user_id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists trg_goal_add_owner_member on public.goals;
create trigger trg_goal_add_owner_member
  after insert or update of is_shared on public.goals
  for each row execute function public.goal_add_owner_member();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- goals: a policy "dono faz tudo" já existente continua; esta só libera LEITURA
-- para os participantes.
drop policy if exists "goals_membros_leem" on public.goals;
create policy "goals_membros_leem" on public.goals
  for select using (public.is_goal_member(id));

alter table public.profiles           enable row level security;
alter table public.goal_members       enable row level security;
alter table public.goal_invites       enable row level security;
alter table public.goal_contributions enable row level security;

-- Cada um só vê/edita o próprio nick. Buscar o nick de outra pessoa só pela
-- RPC invite_to_goal (que exige o nick exato) — não dá para listar usuários.
drop policy if exists "profiles_dono" on public.profiles;
create policy "profiles_dono" on public.profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "goal_members_leitura" on public.goal_members;
create policy "goal_members_leitura" on public.goal_members
  for select using (public.is_goal_member(goal_id));

-- Sair da meta (o próprio membro) ou remover alguém (o dono). O dono não sai.
drop policy if exists "goal_members_remover" on public.goal_members;
create policy "goal_members_remover" on public.goal_members
  for delete using (
    role <> 'owner' and (
      user_id = auth.uid()
      or exists (select 1 from public.goals g where g.id = goal_id and g.user_id = auth.uid())
    )
  );

-- Convites: o dono vê/cancela os da meta; o convidado vê os que recebeu.
-- Criar e responder só via RPC (sem policy de insert/update).
drop policy if exists "goal_invites_leitura" on public.goal_invites;
create policy "goal_invites_leitura" on public.goal_invites
  for select using (
    invitee_id = auth.uid()
    or exists (select 1 from public.goals g where g.id = goal_id and g.user_id = auth.uid())
  );

drop policy if exists "goal_invites_cancelar" on public.goal_invites;
create policy "goal_invites_cancelar" on public.goal_invites
  for delete using (
    exists (select 1 from public.goals g where g.id = goal_id and g.user_id = auth.uid())
  );

-- Depósitos: participantes leem; gravação só pela RPC goal_contribute.
drop policy if exists "goal_contrib_leitura" on public.goal_contributions;
create policy "goal_contrib_leitura" on public.goal_contributions
  for select using (public.is_goal_member(goal_id));

-- ── RPCs ────────────────────────────────────────────────────────────────────

/** Dono convida alguém pelo @nick (com ou sem o @). */
-- drop: a versão anterior tinha o parâmetro p_email (não dá para renomear com replace).
drop function if exists public.invite_to_goal(uuid, text);
create or replace function public.invite_to_goal(p_goal_id uuid, p_nick text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_nick    text := lower(ltrim(trim(p_nick), '@'));
  v_invitee uuid;
  v_id      uuid;
begin
  if not exists (select 1 from public.goals where id = p_goal_id and user_id = auth.uid() and is_shared) then
    raise exception 'Só o dono de uma meta coletiva pode convidar.';
  end if;
  select user_id into v_invitee from public.profiles where nick = v_nick;
  if v_invitee is null then
    raise exception 'Nenhum usuário com o nick @%.', v_nick;
  end if;
  if v_invitee = auth.uid() then
    raise exception 'Você já participa desta meta.';
  end if;
  if exists (select 1 from public.goal_members where goal_id = p_goal_id and user_id = v_invitee) then
    raise exception 'Essa pessoa já participa da meta.';
  end if;

  insert into public.goal_invites (goal_id, invitee_id, invitee_nick, invited_by, status)
  values (p_goal_id, v_invitee, v_nick, auth.uid(), 'pending')
  on conflict (goal_id, invitee_id) do update set status = 'pending', created_at = now()
  returning id into v_id;
  return v_id;
end $$;

/** Convites pendentes do usuário logado, com título da meta e quem convidou. */
create or replace function public.list_my_goal_invites()
returns table (id uuid, goal_id uuid, goal_title text, target_amount numeric, inviter_name text, created_at timestamptz)
language sql security definer set search_path = public stable
as $$
  select i.id, i.goal_id, g.title, g.target_amount, public.user_display_name(i.invited_by), i.created_at
  from public.goal_invites i join public.goals g on g.id = i.goal_id
  where i.status = 'pending' and i.invitee_id = auth.uid()
  order by i.created_at desc;
$$;

/** Convidado aceita (vira membro) ou recusa. Só o próprio convidado responde. */
create or replace function public.respond_goal_invite(p_invite_id uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_goal uuid;
begin
  select goal_id into v_goal from public.goal_invites
  where id = p_invite_id and status = 'pending' and invitee_id = auth.uid();
  if v_goal is null then
    raise exception 'Convite não encontrado ou já respondido.';
  end if;

  update public.goal_invites
  set status = case when p_accept then 'accepted' else 'declined' end
  where id = p_invite_id;

  if p_accept then
    insert into public.goal_members (goal_id, user_id, role, display_name)
    values (v_goal, auth.uid(), 'member', public.user_display_name(auth.uid()))
    on conflict (goal_id, user_id) do nothing;
  end if;
end $$;

/** Participante registra um depósito feito na conta PIX da meta. */
create or replace function public.goal_contribute(p_goal_id uuid, p_amount numeric)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_goal_member(p_goal_id) then
    raise exception 'Você não participa desta meta.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Informe um valor válido.';
  end if;

  insert into public.goal_contributions (goal_id, user_id, display_name, amount)
  values (p_goal_id, auth.uid(), public.user_display_name(auth.uid()), round(p_amount, 2));

  update public.goals
  set current_amount = coalesce(current_amount, 0) + round(p_amount, 2),
      completed = coalesce(current_amount, 0) + round(p_amount, 2) >= target_amount
  where id = p_goal_id;
end $$;

grant execute on function public.invite_to_goal(uuid, text)          to authenticated;
grant execute on function public.list_my_goal_invites()              to authenticated;
grant execute on function public.respond_goal_invite(uuid, boolean)  to authenticated;
grant execute on function public.goal_contribute(uuid, numeric)      to authenticated;
revoke execute on function public.invite_to_goal(uuid, text)         from anon;
revoke execute on function public.list_my_goal_invites()             from anon;
revoke execute on function public.respond_goal_invite(uuid, boolean) from anon;
revoke execute on function public.goal_contribute(uuid, numeric)     from anon;

-- ── Realtime: todos os participantes veem o progresso ao vivo ──────────────
do $$
declare t text;
begin
  foreach t in array array['goals','goal_members','goal_invites','goal_contributions'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
