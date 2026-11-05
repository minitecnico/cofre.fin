-- ============================================================================
-- Migration: Central do administrador — dados em dia, avisos e mensagens
-- ============================================================================
-- Rodar DEPOIS de migration_admin.sql e migration_trips_shared.sql. Idempotente.
--
--   admin_overview()          → contagens em dia: viagens, metas coletivas,
--                               depósitos, comprovantes, cotações, @nicks,
--                               mensagens e links públicos abertos
--   admin_users()             → + @nick, viagens, cotações e aparelhos com push
--   admin_public_links()      → quem tem link público aberto (só contagens)
--   admin_feature_usage()     → /viagens/<id> agrupado numa tela só
--
--   app_announcements         → avisos do admin que aparecem como faixa no app
--   app_announcement_reads    → "já vi" por pessoa (a faixa some pra ela)
--   list_my_announcements()   → avisos ativos que a pessoa ainda não fechou
--   dismiss_announcement(id)  → fecha o aviso pra ela
--   admin_announcements()     → lista do admin com "visto por" e resultado do push
--   admin_announcement_*      → publicar, encerrar/reativar, excluir
--   admin_push_stats()        → quantos aparelhos/pessoas recebem push
--   (o push em si sai de /api/push-broadcast, na Vercel — só o servidor envia)
--
--   app_feedback              → problemas e sugestões enviados em Ajustes
--   admin_feedback()          → caixa de entrada do admin
--   admin_feedback_set_status → aberta ↔ resolvida
--
-- Privacidade (LGPD): continua valendo a regra do painel — contagens e datas,
-- nunca valores ou descrições financeiras. A mensagem de feedback é escrita
-- pela própria pessoa PARA o admin; junto vai só o tipo de aparelho/navegador.
-- ============================================================================


-- ── 1. Visão geral em dia ───────────────────────────────────────────────────
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
    'feedback_open', (select count(*) from public.app_feedback where status = 'new'),
    'counts', jsonb_build_object(
      'transactions',       (select count(*) from public.transactions),
      'credit_cards',       (select count(*) from public.credit_cards),
      'recurring',          (select count(*) from public.recurring_transactions),
      'goals',              (select count(*) from public.goals),
      'goals_shared',       (select count(*) from public.goals where is_shared),
      'goal_members',       (select count(*) from public.goal_members where role <> 'owner'),
      'goal_contributions', (select count(*) from public.goal_contributions),
      'goal_receipts',      (select count(*) from public.goal_receipts),
      'debtors',            (select count(*) from public.debtors),
      'charges',            (select count(*) from public.charges),
      'payment_notices',    (select count(*) from public.payment_notices),
      'payment_receipts',   (select count(*) from public.payment_receipts),
      'trips',              (select count(*) from public.trips),
      'trip_expenses',      (select count(*) from public.trip_expenses),
      'trip_members',       (select count(*) from public.trip_members where role <> 'owner'),
      'quotes',             (select count(*) from public.quotes),
      'profiles',           (select count(*) from public.profiles),
      'push_subscriptions', (select count(*) from public.push_subscriptions),
      'feedback',           (select count(*) from public.app_feedback)
    ),
    'public_links', jsonb_build_object(
      'statements', (select count(*) from public.debtors
                      where share_code is not null and (share_expires_at is null or share_expires_at > now())),
      'trips',      (select count(*) from public.trips where share_code is not null),
      'pix',        (select count(*) from public.pix_links)
    ),
    'db_bytes', pg_database_size(current_database()),
    'storage', coalesce((
      select jsonb_object_agg(s.bucket_id, jsonb_build_object('files', s.files, 'bytes', s.bytes))
        from (select o.bucket_id, count(*) as files, coalesce(sum((o.metadata ->> 'size')::bigint), 0) as bytes
                from storage.objects o group by o.bucket_id) s
    ), '{}'::jsonb)
  );
end $$;


-- ── 1b. Usuários com os recursos novos ──────────────────────────────────────
-- Muda as colunas devolvidas → precisa dropar antes de recriar.
drop function if exists public.admin_users();
create function public.admin_users()
returns table (
  id uuid, email text, name text, nick text, provider text, created_at timestamptz,
  last_sign_in_at timestamptz, last_seen_at timestamptz,
  transactions bigint, debtors bigint, goals bigint, trips bigint, quotes bigint,
  push_devices bigint, page_views_30d bigint, is_admin boolean
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
         (select p.nick from public.profiles p where p.user_id = u.id),
         coalesce(u.raw_app_meta_data ->> 'provider', 'email'),
         u.created_at,
         u.last_sign_in_at,
         la.last_at,
         (select count(*) from public.transactions t where t.user_id = u.id),
         (select count(*) from public.debtors dd where dd.user_id = u.id),
         (select count(*) from public.goals g where g.user_id = u.id),
         (select count(*) from public.trips tr where tr.user_id = u.id),
         (select count(*) from public.quotes q where q.user_id = u.id),
         (select count(*) from public.push_subscriptions ps where ps.user_id = u.id),
         (select count(*) from public.app_events e
           where e.user_id = u.id and e.kind = 'page_view' and e.created_at > now() - interval '30 days'),
         exists (select 1 from public.app_admins aa where aa.user_id = u.id)
    from auth.users u
    left join (
      select a.user_id, max(a.at) as last_at from public.admin_activity() a group by a.user_id
    ) la on la.user_id = u.id
   order by la.last_at desc nulls last;
end $$;


-- ── 1c. Links públicos abertos, por dono ────────────────────────────────────
-- Só contagens: nada de nome do devedor, da viagem ou valores.
-- (Sem report_links: o encurtador /r/:code saiu do app e a tabela pode nem existir.)
drop function if exists public.admin_public_links(); -- 1ª versão devolvia também `reports`
create function public.admin_public_links()
returns table (email text, statements bigint, trips bigint, pix bigint)
language plpgsql security definer set search_path = public, auth stable
as $$
#variable_conflict use_column
begin
  perform public.assert_admin();
  return query
  select x.email, x.statements, x.trips, x.pix
    from (
      select u.email::text as email,
             (select count(*) from public.debtors d
               where d.user_id = u.id and d.share_code is not null
                 and (d.share_expires_at is null or d.share_expires_at > now())) as statements,
             (select count(*) from public.trips t where t.user_id = u.id and t.share_code is not null) as trips,
             (select count(*) from public.pix_links p where p.user_id = u.id) as pix
        from auth.users u
    ) x
   where x.statements + x.trips + x.pix > 0
   order by x.statements + x.trips + x.pix desc, x.email;
end $$;


-- ── 1d. Páginas mais usadas: /viagens/<id> conta como uma tela só ───────────
-- Sem isso cada viagem aberta virava uma "página" diferente no ranking.
create or replace function public.admin_feature_usage(p_days int default 30)
returns table (route text, views bigint, users bigint)
language plpgsql security definer set search_path = public stable
as $$
#variable_conflict use_column
begin
  perform public.assert_admin();
  return query
  select r.route, count(*), count(distinct r.user_id)
    from (
      select regexp_replace(e.detail, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', ':id', 'gi') as route,
             e.user_id
        from public.app_events e
       where e.kind = 'page_view'
         and e.created_at > now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 180))
    ) r
   group by r.route
   order by 2 desc
   limit 30;
end $$;


-- ── 4. Avisos no app ────────────────────────────────────────────────────────
create table if not exists public.app_announcements (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (length(title) between 1 and 80),
  body         text check (length(body) <= 500),
  url          text check (url is null or url ~ '^/([^/]|$)'), -- só rota do próprio app
  active       boolean not null default true,
  created_by   uuid default auth.uid() references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  -- Resultado do push (gravado por /api/push-broadcast com a service role).
  pushed_at    timestamptz,
  push_sent    int,
  push_failed  int,
  push_removed int
);
alter table public.app_announcements enable row level security;
-- Sem policies: leitura e escrita só pelas funções abaixo.

create table if not exists public.app_announcement_reads (
  announcement_id uuid not null references public.app_announcements(id) on delete cascade,
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (announcement_id, user_id)
);
alter table public.app_announcement_reads enable row level security;

create or replace function public.list_my_announcements()
returns table (id uuid, title text, body text, url text, created_at timestamptz)
language sql security definer set search_path = public stable
as $$
  select a.id, a.title, a.body, a.url, a.created_at
    from public.app_announcements a
   where a.active
     and auth.uid() is not null
     and not exists (select 1 from public.app_announcement_reads r
                      where r.announcement_id = a.id and r.user_id = auth.uid())
   order by a.created_at desc
   limit 5;
$$;

create or replace function public.dismiss_announcement(p_id uuid)
returns void
language sql security definer set search_path = public volatile
as $$
  insert into public.app_announcement_reads (announcement_id, user_id)
  select p_id, auth.uid() where auth.uid() is not null
  on conflict do nothing;
$$;

create or replace function public.admin_announcements()
returns table (
  id uuid, title text, body text, url text, active boolean, created_at timestamptz,
  reads bigint, pushed_at timestamptz, push_sent int, push_failed int, push_removed int
)
language plpgsql security definer set search_path = public stable
as $$
#variable_conflict use_column
begin
  perform public.assert_admin();
  return query
  select a.id, a.title, a.body, a.url, a.active, a.created_at,
         (select count(*) from public.app_announcement_reads r where r.announcement_id = a.id),
         a.pushed_at, a.push_sent, a.push_failed, a.push_removed
    from public.app_announcements a
   order by a.created_at desc
   limit 100;
end $$;

create or replace function public.admin_announcement_create(p_title text, p_body text default null, p_url text default null)
returns uuid
language plpgsql security definer set search_path = public volatile
as $$
declare
  v_id uuid;
begin
  perform public.assert_admin();
  insert into public.app_announcements (title, body, url)
  values (btrim(p_title), nullif(btrim(coalesce(p_body, '')), ''), nullif(btrim(coalesce(p_url, '')), ''))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.admin_announcement_set_active(p_id uuid, p_active boolean)
returns void
language plpgsql security definer set search_path = public volatile
as $$
begin
  perform public.assert_admin();
  update public.app_announcements set active = p_active where id = p_id;
end $$;

create or replace function public.admin_announcement_delete(p_id uuid)
returns void
language plpgsql security definer set search_path = public volatile
as $$
begin
  perform public.assert_admin();
  delete from public.app_announcements where id = p_id;
end $$;

create or replace function public.admin_push_stats()
returns jsonb
language plpgsql security definer set search_path = public stable
as $$
begin
  perform public.assert_admin();
  return jsonb_build_object(
    'devices', (select count(*) from public.push_subscriptions),
    'users',   (select count(distinct user_id) from public.push_subscriptions),
    'new_30d', (select count(*) from public.push_subscriptions where created_at > now() - interval '30 days')
  );
end $$;


-- ── 5. Problemas e sugestões ────────────────────────────────────────────────
create table if not exists public.app_feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('problem', 'suggestion')),
  message    text not null check (length(btrim(message)) between 1 and 2000),
  context    text check (length(context) <= 300),  -- aparelho/navegador (ajuda a reproduzir)
  status     text not null default 'new' check (status in ('new', 'done')),
  created_at timestamptz not null default now()
);
create index if not exists idx_app_feedback_created on public.app_feedback(created_at desc);
alter table public.app_feedback enable row level security;

-- A pessoa só envia (sempre como "nova"); ler e mudar status é do admin, por RPC.
drop policy if exists "app_feedback_envia_proprio" on public.app_feedback;
create policy "app_feedback_envia_proprio" on public.app_feedback
  for insert to authenticated with check (user_id = auth.uid() and status = 'new');

create or replace function public.admin_feedback()
returns table (
  id uuid, kind text, message text, context text, status text, created_at timestamptz,
  user_email text, user_name text
)
language plpgsql security definer set search_path = public, auth stable
as $$
#variable_conflict use_column
begin
  perform public.assert_admin();
  return query
  select f.id, f.kind, f.message, f.context, f.status, f.created_at,
         u.email::text,
         coalesce(nullif(u.raw_user_meta_data ->> 'name', ''), nullif(u.raw_user_meta_data ->> 'full_name', ''), split_part(u.email, '@', 1))
    from public.app_feedback f
    left join auth.users u on u.id = f.user_id
   order by f.created_at desc
   limit 300;
end $$;

create or replace function public.admin_feedback_set_status(p_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public volatile
as $$
begin
  perform public.assert_admin();
  if p_status not in ('new', 'done') then
    raise exception 'Status inválido.' using errcode = '22023';
  end if;
  update public.app_feedback set status = p_status where id = p_id;
end $$;


-- ── Permissões ──────────────────────────────────────────────────────────────
-- O Supabase dá EXECUTE pra anon/authenticated em toda função nova: tira de
-- todos e devolve só pra quem tem login (as de admin ainda conferem is_admin).
revoke execute on function public.admin_overview()                            from public, anon, authenticated;
revoke execute on function public.admin_users()                               from public, anon, authenticated;
revoke execute on function public.admin_public_links()                        from public, anon, authenticated;
revoke execute on function public.list_my_announcements()                     from public, anon, authenticated;
revoke execute on function public.dismiss_announcement(uuid)                  from public, anon, authenticated;
revoke execute on function public.admin_announcements()                       from public, anon, authenticated;
revoke execute on function public.admin_announcement_create(text, text, text) from public, anon, authenticated;
revoke execute on function public.admin_announcement_set_active(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.admin_announcement_delete(uuid)             from public, anon, authenticated;
revoke execute on function public.admin_push_stats()                          from public, anon, authenticated;
revoke execute on function public.admin_feedback()                            from public, anon, authenticated;
revoke execute on function public.admin_feedback_set_status(uuid, text)       from public, anon, authenticated;

grant execute on function public.admin_overview()                             to authenticated;
grant execute on function public.admin_users()                                to authenticated;
grant execute on function public.admin_public_links()                         to authenticated;
grant execute on function public.list_my_announcements()                      to authenticated;
grant execute on function public.dismiss_announcement(uuid)                   to authenticated;
grant execute on function public.admin_announcements()                        to authenticated;
grant execute on function public.admin_announcement_create(text, text, text)  to authenticated;
grant execute on function public.admin_announcement_set_active(uuid, boolean) to authenticated;
grant execute on function public.admin_announcement_delete(uuid)              to authenticated;
grant execute on function public.admin_push_stats()                           to authenticated;
grant execute on function public.admin_feedback()                             to authenticated;
grant execute on function public.admin_feedback_set_status(uuid, text)        to authenticated;
