-- ============================================================================
-- migration_cobrancas_card.sql
-- ----------------------------------------------------------------------------
-- Vincula uma cobrança ao cartão de crédito emprestado. A UI mostra uma "tarja"
-- com a cor e o nome do cartão (igual à lista de transações) — facilita ver de
-- relance em qual cartão a dívida foi feita.
--
-- on delete set null: apagar/desativar o cartão NÃO apaga a cobrança; só some a
-- tarja. Idempotente (add column if not exists).
-- ============================================================================

alter table public.charges
  add column if not exists credit_card_id uuid
    references public.credit_cards(id) on delete set null;

create index if not exists idx_charges_card on public.charges(credit_card_id);
