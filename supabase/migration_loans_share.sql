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

-- ════════════════════════════════════════════════════════════════════════════
-- Parcelas FORA das despesas (decisão do usuário, 2026-11-26)
-- ════════════════════════════════════════════════════════════════════════════
-- Empréstimo novo nasce com as parcelas aqui, não em `transactions`: não entram
-- na lista de despesas, no saldo, nos gráficos nem na fatura do cartão. Incluir
-- uma parcela no mês (ou o empréstimo todo) MOVE a linha pra `transactions`
-- (mesmo id) — a partir daí conta como qualquer despesa. Tirar faz o caminho
-- inverso. Assim nenhuma RPC de saldo/fatura precisa saber disso.
-- Empréstimos antigos (parcelas já em transactions) continuam como estavam.
create table if not exists public.loan_parcels (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references auth.users(id) on delete cascade,
  installment_group_id uuid not null,
  installment_number   int not null,
  installment_total    int not null,
  description          text not null,
  amount               numeric(12, 2) not null check (amount > 0),
  date                 date not null,
  category_id          uuid references public.categories(id) on delete set null,
  credit_card_id       uuid references public.credit_cards(id) on delete set null,
  notes                text,
  paid                 boolean not null default false,
  created_at           timestamptz default now()
);
create index if not exists idx_loan_parcels_user_date on public.loan_parcels(user_id, date);
create index if not exists idx_loan_parcels_group on public.loan_parcels(installment_group_id);

alter table public.loan_parcels enable row level security;
drop policy if exists loan_parcels_owner on public.loan_parcels;
create policy loan_parcels_owner on public.loan_parcels
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

/** Inclui parcelas nas despesas: loan_parcels → transactions (mesmo id). */
create or replace function public.loan_parcels_include(p_ids uuid[])
returns int
language plpgsql security invoker set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.transactions (id, user_id, type, amount, description, date, category_id, credit_card_id,
                                   notes, paid, installment_total, installment_number, installment_group_id, created_at)
  select id, user_id, 'expense', amount, description, date, category_id, credit_card_id,
         notes, paid, installment_total, installment_number, installment_group_id, created_at
  from public.loan_parcels
  where id = any(p_ids) and user_id = auth.uid();
  get diagnostics v_count = row_count;

  delete from public.loan_parcels where id = any(p_ids) and user_id = auth.uid();
  return v_count;
end $$;

/** Tira parcelas das despesas: transactions → loan_parcels (só parcelas de despesa). */
create or replace function public.loan_parcels_exclude(p_ids uuid[])
returns int
language plpgsql security invoker set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.loan_parcels (id, user_id, installment_group_id, installment_number, installment_total,
                                   description, amount, date, category_id, credit_card_id, notes, paid, created_at)
  select id, user_id, installment_group_id, installment_number, installment_total,
         description, amount, date, category_id, credit_card_id, notes, paid, coalesce(created_at, now())
  from public.transactions
  where id = any(p_ids) and user_id = auth.uid()
    and type = 'expense' and installment_group_id is not null;
  get diagnostics v_count = row_count;

  delete from public.transactions t
  where t.id = any(p_ids) and t.user_id = auth.uid()
    and exists (select 1 from public.loan_parcels l where l.id = t.id);
  return v_count;
end $$;

/** Empréstimo inteiro dentro (true) ou fora (false) das despesas. */
create or replace function public.loan_set_in_budget(p_group_id uuid, p_in boolean)
returns int
language plpgsql security invoker set search_path = public
as $$
begin
  if p_in then
    return public.loan_parcels_include(array(
      select id from public.loan_parcels where installment_group_id = p_group_id and user_id = auth.uid()));
  end if;
  return public.loan_parcels_exclude(array(
    select id from public.transactions where installment_group_id = p_group_id and user_id = auth.uid()));
end $$;

grant execute on function public.loan_parcels_include(uuid[])        to authenticated;
grant execute on function public.loan_parcels_exclude(uuid[])        to authenticated;
grant execute on function public.loan_set_in_budget(uuid, boolean)   to authenticated;
revoke execute on function public.loan_parcels_include(uuid[])       from anon;
revoke execute on function public.loan_parcels_exclude(uuid[])       from anon;
revoke execute on function public.loan_set_in_budget(uuid, boolean)  from anon;

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
  with m as (
    select * from public.loan_meta where installment_group_id = p_group_id
  ),
  p as (  -- parcelas nas despesas + fora delas
    select t.installment_number, t.installment_total, t.date, t.amount, t.paid, t.description, t.notes
    from public.transactions t join m on t.installment_group_id = m.installment_group_id and t.user_id = m.user_id
    union all
    select l.installment_number, l.installment_total, l.date, l.amount, l.paid, l.description, l.notes
    from public.loan_parcels l join m on l.installment_group_id = m.installment_group_id and l.user_id = m.user_id
  )
  select jsonb_build_object(
    'description', (
      select regexp_replace(p.description, '\s*\(\d+/\d+\)\s*$', '') from p order by p.installment_number limit 1
    ),
    'owner_name', public.user_display_name(m.user_id),
    'notes', m.notes,
    'monthly_rate', m.monthly_rate,
    'loan_info', (
      select substring(p.notes from '\[Financiamento\][^\n]*') from p
      where p.notes like '%[Financiamento]%' order by p.installment_number limit 1
    ),
    'parcels', coalesce((
      select jsonb_agg(jsonb_build_object(
        'number', p.installment_number,
        'total', p.installment_total,
        'date', p.date,
        'amount', p.amount,
        'paid', p.paid
      ) order by p.installment_number)
      from p
    ), '[]'::jsonb)
  )
  from m;
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
  if not exists (select 1 from public.transactions where installment_group_id = p_group_id and user_id = auth.uid())
     and not exists (select 1 from public.loan_parcels where installment_group_id = p_group_id and user_id = auth.uid()) then
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
