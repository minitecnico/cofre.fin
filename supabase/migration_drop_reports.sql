-- ============================================================================
-- Migration: remove o que sobrou dos Relatórios e do dashboard antigo
-- ============================================================================
-- O app parou de usar (commit fc7e786): a página de Relatórios (PDF no
-- Storage + link curto /r/:code), o gráfico dos últimos 6 meses e o saldo
-- projetado.
--
-- O bucket `reports` NÃO sai por SQL — o Supabase bloqueia apagar direto das
-- tabelas do Storage. Apague pelo painel: Storage › reports › Empty bucket ›
-- Delete bucket.
--
-- Rodar por último (depois de migration_report_links.sql,
-- migration_reports_storage.sql e migration_security_hardening.sql).
-- Idempotente.
-- ============================================================================

-- Link curto do PDF (/r/:code)
drop function if exists public.resolve_report_link(text);
drop table if exists public.report_links;

-- Policies do bucket `reports`
drop policy if exists "reports_select_own" on storage.objects;
drop policy if exists "reports_insert_own" on storage.objects;
drop policy if exists "reports_update_own" on storage.objects;
drop policy if exists "reports_delete_own" on storage.objects;

-- Gráfico dos últimos 6 meses e saldo projetado
drop function if exists public.get_balance_forecast(int);
drop function if exists public.get_monthly_history(int);
