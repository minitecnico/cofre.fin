-- ============================================================================
-- Migration: parcelamento de cobranças
-- ============================================================================
-- Mesma ideia das despesas parceladas no cartão: cada parcela é uma cobrança
-- independente (linha em `charges`), com vencimento no mês correto, todas
-- compartilhando um installment_group_id.
-- Idempotente.
-- ============================================================================

alter table public.charges
  add column if not exists installment_total  int,
  add column if not exists installment_number int,
  add column if not exists installment_group_id uuid;

create index if not exists idx_charges_inst_group on public.charges(installment_group_id);
