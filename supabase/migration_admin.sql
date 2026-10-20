-- ============================================================================
-- Migration: Central do administrador (/admin)
-- ============================================================================
-- Só quem está em app_admins vê o painel. Tudo que cruza usuários sai de RPCs
-- SECURITY DEFINER que conferem is_admin() logo na primeira linha — o RLS das
-- tabelas continua intacto e o admin NÃO ganha acesso direto a dado de ninguém.
--
--   app_admins                → quem é admin (seed: minitecnico@gmail.com)
--   app_events                → uso do app (página aberta, erro). Cada usuário
--                               grava os próprios; ninguém lê direto.
--   is_admin()                → o app usa pra mostrar o menu "Admin"
--   admin_overview()          → números gerais, tamanho do banco e dos arquivos
--   admin_daily(dias)         → por dia: cadastros, usuários ativos, páginas vistas
--   admin_users()             → todos os usuários: último acesso e contagens
--   admin_feature_usage(dias) → páginas mais usadas
--   admin_logs(origem, qtd)   → eventos do app + log de autenticação do Supabase
--
-- Privacidade (LGPD): o painel mostra CONTAGENS, datas e e-mails — nunca
-- valores, descrições ou qualquer dado financeiro dos usuários.
-- "Ativo" = qualquer sinal de uso: página aberta, lançamento criado ou login.
--
-- Rodar depois das migrations de cobranças, metas e push. Idempotente.
-- ============================================================================

-- ── Quem é admin ────────────────────────────────────────────────────────────
create table if not exists public.app_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
-- Sem policies de propósito: só as funções abaixo leem esta tabela.

insert into public.app_admins (user_id)
select id from auth.users where lower(email) = 'minitecnico@gmail.com'
on conflict do nothing;

create or replace function public.is_admin()
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;

create or replace function public.assert_admin()
returns void
language plpgsql security definer set search_path = public stable
as $$
begin
  if not public.is_admin() then
    raise exception 'Acesso restrito ao administrador.' using errcode = '42501';
  end if;
end $$;

-- ── Uso do app ──────────────────────────────────────────────────────────────
create table if not exists public.app_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('page_view', 'error')),
  detail     text check (length(detail) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists idx_app_events_created on public.app_events(created_at desc);
create index if not exists idx_app_events_user on public.app_events(user_id, created_at desc);

alter table public.app_events enable row level security;
drop policy if exists "app_events_insere_proprio" on public.app_events;
create policy "app_events_insere_proprio" on public.app_events
  for insert to authenticated with check (user_id = auth.uid());

-- Todo sinal de uso (uso interno das funções do admin).
create or replace function public.admin_activity()
returns table (user_id uuid, at timestamptz)
language sql security definer set search_path = public, auth stable
as $$
  select e.user_id, e.created_at from public.app_events e
  union all
  select t.user_id, t.created_at from public.transactions t where t.created_at is not null
  union all
  select u.id, u.last_sign_in_at from auth.users u where u.last_sign_in_at is not null;
$$;

-- ── Visão geral ─────────────────────────────────────────────────────────────
create or replace function public.admin_overview()
returns jsonb
language plpgsql security definer set search_path = public, auth volatile
as $$
declare
  v_a1  bigint;
  v_a7  bigint;
  v_a30 bigint;
begin
  perform public.assert_admin();

  -- Faxina barata: eventos com mais de 180 dias não entram em métrica nenhuma.
  delete from public.app_events where created_at < now() - interval '180 days';

  select count(distinct a.user_id) filter (where a.at > now() - interval '1 day'),
         count(distinct a.user_id) filter (where a.at > now() - interval '7 days'),
         count(distinct a.user_id) filter (where a.at > now() - interval '30 days')
    into v_a1, v_a7, v_a30
    from public.admin_activity() a;

  return jsonb_build_object(
    'users_total',   (select count(*) from auth.users),
    'users_new_7d',  (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'users_new_30d', (select count(*) from auth.users where created_at > now() - interval '30 days'),
    'active_1d', v_a1, 'active_7d', v_a7, 'active_30d', v_a30,
    'page_views_7d', (select count(*) from public.app_events where kind = 'page_view' and created_at > now() - interval '7 days'),
    'errors_7d',     (select count(*) from public.app_events where kind = 'error' and created_at > now() - interval '7 days'),
    'counts', jsonb_build_object(
      'transactions',       (select count(*) from public.transactions),
      'credit_cards',       (select count(*) from public.credit_cards),
      'recurring',          (select count(*) from public.recurring_transactions),
      'goals',              (select count(*) from public.goals),
      'debtors',            (select count(*) from public.debtors),
      'charges',            (select count(*) from public.charges),
      'payment_notices',    (select count(*) from public.payment_notices),
      'push_subscriptions', (select count(*) from public.push_subscriptions)
    ),
    'db_bytes', pg_database_size(current_database()),
    'storage', coalesce((
      select jsonb_object_agg(s.bucket_id, jsonb_build_object('files', s.files, 'bytes', s.bytes))
        from (select o.bucket_id, count(*) as files, coalesce(sum((o.metadata ->> 'size')::bigint), 0) as bytes
                from storage.objects o group by o.bucket_id) s
    ), '{}'::jsonb)
  );
end $$;

-- ── Série diária (fuso de Brasília) ─────────────────────────────────────────
create or replace function public.admin_daily(p_days int default 30)
returns table (day date, signups bigint, active_users bigint, page_views bigint)
language plpgsql security definer set search_path = public, auth stable
as $$
#variable_conflict use_column
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_days  int  := least(greatest(coalesce(p_days, 30), 1), 180);
begin
  perform public.assert_admin();
  return query
  with d as (
    select generate_series(v_today - (v_days - 1), v_today, interval '1 day')::date as dd
  ),
  act as (
    select distinct a.user_id, (a.at at time zone 'America/Sao_Paulo')::date as dd
      from public.admin_activity() a
     where a.at >= (v_today - (v_days - 1))::timestamp at time zone 'America/Sao_Paulo'
  )
  select d.dd,
         (select count(*) from auth.users u where (u.created_at at time zone 'America/Sao_Paulo')::date = d.dd),
         (select count(*) from act where act.dd = d.dd),
         (select count(*) from public.app_events e
           where e.kind = 'page_view' and (e.created_at at time zone 'America/Sao_Paulo')::date = d.dd)
    from d
   order by d.dd;
end $$;

-- ── Usuários ────────────────────────────────────────────────────────────────
create or replace function public.admin_users()
returns table (
  id uuid, email text, name text, provider text, created_at timestamptz,
  last_sign_in_at timestamptz, last_seen_at timestamptz,
  transactions bigint, debtors bigint, goals bigint, page_views_30d bigint, is_admin boolean
)
language plpgsql security definer set search_path = public, auth stable
as $$
#variable_conflict use_column
begin
  perform public.assert_admin();
  return query
  select u.id,
         u.email::text,
         coalesce(nullif(u.raw_user_meta_data ->> 'name', ''), nullif(u.raw_user_meta_data ->> 'full_name', ''), split_part(u.email, '@', 1)),
         coalesce(u.raw_app_meta_data ->> 'provider', 'email'),
         u.created_at,
         u.last_sign_in_at,
         la.last_at,
         (select count(*) from public.transactions t where t.user_id = u.id),
         (select count(*) from public.debtors dd where dd.user_id = u.id),
         (select count(*) from public.goals g where g.user_id = u.id),
         (select count(*) from public.app_events e
           where e.user_id = u.id and e.kind = 'page_view' and e.created_at > now() - interval '30 days'),
         exists (select 1 from public.app_admins aa where aa.user_id = u.id)
    from auth.users u
    left join (
      select a.user_id, max(a.at) as last_at from public.admin_activity() a group by a.user_id
    ) la on la.user_id = u.id
   order by la.last_at desc nulls last;
end $$;

-- ── Páginas mais usadas ─────────────────────────────────────────────────────
create or replace function public.admin_feature_usage(p_days int default 30)
returns table (route text, views bigint, users bigint)
language plpgsql security definer set search_path = public stable
as $$
#variable_conflict use_column
begin
  perform public.assert_admin();
  return query
  select e.detail, count(*), count(distinct e.user_id)
    from public.app_events e
   where e.kind = 'page_view'
     and e.created_at > now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 180))
   group by e.detail
   order by 2 desc
   limit 30;
end $$;

-- ── Logs: app + autenticação do Supabase ────────────────────────────────────
create or replace function public.admin_logs(p_source text default null, p_limit int default 200)
returns table (at timestamptz, source text, kind text, user_email text, detail text)
language plpgsql security definer set search_path = public, auth stable
as $$
#variable_conflict use_column
begin
  perform public.assert_admin();
  return query
  select x.at, x.source, x.kind, x.user_email, x.detail
    from (
      select e.created_at as at, 'app'::text as source, e.kind, u.email::text as user_email, e.detail
        from public.app_events e
        left join auth.users u on u.id = e.user_id
       where p_source is null or p_source = 'app'
      union all
      -- token_refreshed/revoked são automáticos (a cada hora) e só fazem ruído.
      select l.created_at, 'auth'::text, coalesce(l.payload ->> 'action', '?'),
             coalesce(l.payload ->> 'actor_username', ''), nullif(l.ip_address::text, '')
        from auth.audit_log_entries l
       where (p_source is null or p_source = 'auth')
         and coalesce(l.payload ->> 'action', '') not in ('token_refreshed', 'token_revoked')
    ) x
   order by x.at desc
   limit least(greatest(coalesce(p_limit, 200), 1), 500);
end $$;

-- ── Permissões ──────────────────────────────────────────────────────────────
-- O Supabase dá EXECUTE pra anon/authenticated em toda função nova: tira de todos
-- e devolve só o necessário. Internas (assert/activity) ficam só pro dono.
revoke execute on function public.is_admin()                 from public, anon, authenticated;
revoke execute on function public.assert_admin()             from public, anon, authenticated;
revoke execute on function public.admin_activity()           from public, anon, authenticated;
revoke execute on function public.admin_overview()           from public, anon, authenticated;
revoke execute on function public.admin_daily(int)           from public, anon, authenticated;
revoke execute on function public.admin_users()              from public, anon, authenticated;
revoke execute on function public.admin_feature_usage(int)   from public, anon, authenticated;
revoke execute on function public.admin_logs(text, int)      from public, anon, authenticated;

grant execute on function public.is_admin()                  to authenticated;
grant execute on function public.admin_overview()            to authenticated;
grant execute on function public.admin_daily(int)            to authenticated;
grant execute on function public.admin_users()               to authenticated;
grant execute on function public.admin_feature_usage(int)    to authenticated;
grant execute on function public.admin_logs(text, int)       to authenticated;
