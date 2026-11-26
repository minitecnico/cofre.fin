-- ════════════════════════════════════════════════════════════════════════════
-- Empréstimos: observações, taxa e link público de compartilhamento
-- ════════════════════════════════════════════════════════════════════════════
-- Empréstimo continua sendo N parcelas em `transactions` ligadas por
-- installment_group_id. Esta tabela guarda só o que não cabe nas parcelas:
--   * notes        → observações do empréstimo (aparecem no link)
--   * monthly_rate → taxa em % a.m. informada à mão (ex.: 1.5). Quando null, a
--                    tela usa a taxa gravada pelo LoanForm na 1ª parcela.
--   * share_code   → link público <dominio>/emprestimo/<code> (CSPRNG, null = desligado)
--
-- O link e os convidados pelo @nick veem: descrição, parcelas (nº, data, valor,
-- paga), taxa, resumo do financiamento e observações. Sem categoria, cartão,
-- ids nem outras notas.
-- Idempotente.

create table if not exists public.loan_meta (
  installment_group_id uuid primary key,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  notes        text check (length(notes) <= 2000),
  monthly_rate numeric(7, 4) check (monthly_rate is null or (monthly_rate >= 0 and monthly_rate <= 100)),
  share_code   text unique,
  updated_at   timestamptz not null default now()
);

alter table public.loan_meta enable row level security;

drop policy if exists loan_meta_owner on public.loan_meta;
create policy loan_meta_owner on public.loan_meta
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

/**
 * Extrato de um empréstimo (jsonb) — base do link público e da visão de quem
 * foi convidado. As parcelas só entram se forem do MESMO usuário dono do
 * loan_meta: criar meta pra um grupo alheio não vaza nada. Da 1ª parcela sai
 * só a linha "[Financiamento] …" (o resto da nota é privado).
 * Interna: só as RPCs abaixo chamam.
 */
create or replace function public.loan_statement(p_group_id uuid)
returns jsonb
language sql security definer set search_path = public stable
as $$
  select jsonb_build_object(
    'description', (
      select regexp_replace(t.description, '\s*\(\d+/\d+\)\s*$', '')
      from public.transactions t
      where t.installment_group_id = m.installment_group_id and t.user_id = m.user_id
      order by t.installment_number limit 1
    ),
    'owner_name', public.user_display_name(m.user_id),
    'notes', m.notes,
    'monthly_rate', m.monthly_rate,
    'loan_info', (
      select substring(t.notes from '\[Financiamento\][^\n]*')
      from public.transactions t
      where t.installment_group_id = m.installment_group_id and t.user_id = m.user_id
        and t.notes like '%[Financiamento]%'
      order by t.installment_number limit 1
    ),
    'parcels', coalesce((
      select jsonb_agg(jsonb_build_object(
        'number', t.installment_number,
        'total', t.installment_total,
        'date', t.date,
        'amount', t.amount,
        'paid', t.paid
      ) order by t.installment_number)
      from public.transactions t
      where t.installment_group_id = m.installment_group_id and t.user_id = m.user_id
    ), '[]'::jsonb)
  )
  from public.loan_meta m
  where m.installment_group_id = p_group_id;
$$;
revoke execute on function public.loan_statement(uuid) from public, anon, authenticated;

/** Página pública /emprestimo/:code — sem o nome do dono (quem abre é anônimo). */
create or replace function public.resolve_loan_share(p_code text)
returns jsonb
language sql security definer set search_path = public stable
as $$
  select public.loan_statement(m.installment_group_id) - 'owner_name'
  from public.loan_meta m
  where m.share_code = p_code and length(p_code) >= 16
  limit 1;
$$;

grant execute on function public.resolve_loan_share(text) to anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- Convite pelo @nick: outro usuário do app acompanha o empréstimo (só leitura)
-- ════════════════════════════════════════════════════════════════════════════
-- Como nas viagens: o dono convida, a pessoa aceita em Empréstimos. Quem entra
-- vê o mesmo extrato do link (via RPC) — nunca lê `transactions` do dono.

create table if not exists public.loan_members (
  installment_group_id uuid not null references public.loan_meta(installment_group_id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text,
  joined_at    timestamptz default now(),
  primary key (installment_group_id, user_id)
);
create index if not exists idx_loan_members_user on public.loan_members(user_id);

create table if not exists public.loan_invites (
  id           uuid primary key default gen_random_uuid(),
  installment_group_id uuid not null references public.loan_meta(installment_group_id) on delete cascade,
  invitee_id   uuid not null references auth.users(id) on delete cascade,
  invitee_nick text not null,                 -- cópia p/ o dono ver (profiles é privado)
  invited_by   uuid not null references auth.users(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at   timestamptz default now(),
  unique (installment_group_id, invitee_id)
);
create index if not exists idx_loan_invites_invitee on public.loan_invites(invitee_id) where status = 'pending';

alter table public.loan_members enable row level security;
alter table public.loan_invites enable row level security;

-- Membros: o dono vê/remove todos; cada um vê a si e pode sair.
drop policy if exists loan_members_leitura on public.loan_members;
create policy loan_members_leitura on public.loan_members
  for select using (
    user_id = auth.uid()
    or exists (select 1 from public.loan_meta m where m.installment_group_id = loan_members.installment_group_id and m.user_id = auth.uid())
  );

drop policy if exists loan_members_remover on public.loan_members;
create policy loan_members_remover on public.loan_members
  for delete using (
    user_id = auth.uid()
    or exists (select 1 from public.loan_meta m where m.installment_group_id = loan_members.installment_group_id and m.user_id = auth.uid())
  );

-- Convites: o dono vê/cancela; o convidado vê os que recebeu. Criar e responder só via RPC.
drop policy if exists loan_invites_leitura on public.loan_invites;
create policy loan_invites_leitura on public.loan_invites
  for select using (
    invitee_id = auth.uid()
    or exists (select 1 from public.loan_meta m where m.installment_group_id = loan_invites.installment_group_id and m.user_id = auth.uid())
  );

drop policy if exists loan_invites_cancelar on public.loan_invites;
create policy loan_invites_cancelar on public.loan_invites
  for delete using (
    exists (select 1 from public.loan_meta m where m.installment_group_id = loan_invites.installment_group_id and m.user_id = auth.uid())
  );

/** Dono convida alguém pelo @nick (com ou sem o @). */
create or replace function public.invite_to_loan(p_group_id uuid, p_nick text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_nick    text := lower(ltrim(trim(p_nick), '@'));
  v_invitee uuid;
  v_id      uuid;
begin
  if not exists (select 1 from public.transactions where installment_group_id = p_group_id and user_id = auth.uid()) then
    raise exception 'Só quem cadastrou o empréstimo pode convidar.';
  end if;
  select user_id into v_invitee from public.profiles where nick = v_nick;
  if v_invitee is null then
    raise exception 'Nenhum usuário com o nick @%.', v_nick;
  end if;
  if v_invitee = auth.uid() then
    raise exception 'Esse é o seu próprio nick.';
  end if;
  if exists (select 1 from public.loan_members where installment_group_id = p_group_id and user_id = v_invitee) then
    raise exception 'Essa pessoa já acompanha este empréstimo.';
  end if;

  insert into public.loan_meta (installment_group_id, user_id)
  values (p_group_id, auth.uid())
  on conflict (installment_group_id) do nothing;

  insert into public.loan_invites (installment_group_id, invitee_id, invitee_nick, invited_by, status)
  values (p_group_id, v_invitee, v_nick, auth.uid(), 'pending')
  on conflict (installment_group_id, invitee_id) do update set status = 'pending', created_at = now()
  returning id into v_id;
  return v_id;
end $$;

/** Convites pendentes do usuário logado, com o nome do empréstimo e quem convidou. */
create or replace function public.list_my_loan_invites()
returns table (id uuid, installment_group_id uuid, description text, inviter_name text, created_at timestamptz)
language sql security definer set search_path = public stable
as $$
  select i.id, i.installment_group_id, public.loan_statement(i.installment_group_id)->>'description',
         public.user_display_name(i.invited_by), i.created_at
  from public.loan_invites i
  where i.status = 'pending' and i.invitee_id = auth.uid()
  order by i.created_at desc;
$$;

/** Convidado aceita (passa a acompanhar) ou recusa. Só o próprio convidado responde. */
create or replace function public.respond_loan_invite(p_invite_id uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_group uuid;
begin
  select installment_group_id into v_group from public.loan_invites
  where id = p_invite_id and status = 'pending' and invitee_id = auth.uid();
  if v_group is null then
    raise exception 'Convite não encontrado ou já respondido.';
  end if;

  update public.loan_invites
  set status = case when p_accept then 'accepted' else 'declined' end
  where id = p_invite_id;

  if p_accept then
    insert into public.loan_members (installment_group_id, user_id, display_name)
    values (v_group, auth.uid(), public.user_display_name(auth.uid()))
    on conflict do nothing;
  end if;
end $$;

/** Empréstimos que outros compartilharam comigo, com o extrato de cada um. */
create or replace function public.list_loans_shared_with_me()
returns table (installment_group_id uuid, statement jsonb)
language sql security definer set search_path = public stable
as $$
  select lm.installment_group_id, public.loan_statement(lm.installment_group_id)
  from public.loan_members lm
  where lm.user_id = auth.uid()
  order by lm.joined_at;
$$;

grant execute on function public.invite_to_loan(uuid, text)          to authenticated;
grant execute on function public.list_my_loan_invites()              to authenticated;
grant execute on function public.respond_loan_invite(uuid, boolean)  to authenticated;
grant execute on function public.list_loans_shared_with_me()         to authenticated;
revoke execute on function public.invite_to_loan(uuid, text)         from anon;
revoke execute on function public.list_my_loan_invites()             from anon;
revoke execute on function public.respond_loan_invite(uuid, boolean) from anon;
revoke execute on function public.list_loans_shared_with_me()        from anon;
