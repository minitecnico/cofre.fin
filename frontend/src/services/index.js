import { supabase } from './supabase';

/**
 * TransactionService — wrapper sobre o cliente Supabase.
 * --------------------------------------------------------------
 * RLS garante que cada usuário só vê suas próprias transações,
 * então não precisamos passar user_id manualmente nos selects.
 *
 * No insert SIM precisamos: o supabase exige user_id pelo policy "with check".
 */

async function currentUserId() {
  const { data } = await supabase.auth.getUser();
  return data.user?.id;
}

export const transactionService = {
  async list(filters = {}) {
    let query = supabase
      .from('transactions')
      .select(`
        *,
        category:categories ( id, name, color, icon, type ),
        credit_card:credit_cards ( id, name, color )
      `)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });

    if (filters.type) query = query.eq('type', filters.type);
    if (filters.categoryId) query = query.eq('category_id', filters.categoryId);
    if (filters.creditCardId) query = query.eq('credit_card_id', filters.creditCardId);
    if (filters.recurringId) query = query.eq('recurring_id', filters.recurringId);
    if (filters.installmentGroupId) query = query.eq('installment_group_id', filters.installmentGroupId);
    if (filters.startDate) query = query.gte('date', filters.startDate);
    if (filters.endDate) query = query.lte('date', filters.endDate);

    if (filters.limit) query = query.limit(filters.limit);

    const { data, error, count } = await query;
    if (error) throw error;
    return { transactions: data || [], total: count || data?.length || 0 };
  },

  async create(payload) {
    const userId = await currentUserId();
    const { data, error } = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        type: payload.type,
        amount: payload.amount,
        description: payload.description,
        date: payload.date,
        category_id: payload.category_id,
        credit_card_id: payload.credit_card_id || null,
      })
      .select(`*, category:categories(*), credit_card:credit_cards(*)`)
      .single();
    if (error) throw error;
    return data;
  },

  /**
   * Cria várias transações de uma vez (lançamento em massa).
   * Mais eficiente que N chamadas separadas: 1 só request, transação atômica.
   *
   * Cada item do array deve ter: type, amount, description, date, category_id,
   * e opcionalmente credit_card_id.
   *
   * Retorna a quantidade criada.
   */
  async createBatch(items) {
    if (!items || items.length === 0) return { count: 0, transactions: [] };

    const userId = await currentUserId();
    const rows = items.map((item) => ({
      user_id: userId,
      type: item.type,
      amount: item.amount,
      description: item.description,
      date: item.date,
      category_id: item.category_id,
      credit_card_id: item.credit_card_id || null,
      paid: item.type === 'income', // receita já vem como recebida
    }));

    const { data, error } = await supabase
      .from('transactions')
      .insert(rows)
      .select(`*, category:categories(*), credit_card:credit_cards(*)`);
    if (error) throw error;
    return { count: data?.length || 0, transactions: data || [] };
  },

  async update(id, payload) {
    // Constrói o patch só com campos definidos no payload — permite atualizar
    // só `notes` (ex: anotar amortização) ou só `amount`, sem precisar
    // re-enviar tudo. Campos undefined ficam de fora.
    const patch = {};
    if (payload.type !== undefined) patch.type = payload.type;
    if (payload.amount !== undefined) patch.amount = payload.amount;
    if (payload.description !== undefined) patch.description = payload.description;
    if (payload.date !== undefined) patch.date = payload.date;
    if (payload.category_id !== undefined) patch.category_id = payload.category_id;
    if (payload.credit_card_id !== undefined) patch.credit_card_id = payload.credit_card_id || null;
    if (payload.notes !== undefined) patch.notes = payload.notes;
    if (payload.paid !== undefined) patch.paid = payload.paid;

    const { data, error } = await supabase
      .from('transactions')
      .update(patch)
      .eq('id', id)
      .select(`*, category:categories(*), credit_card:credit_cards(*)`)
      .single();
    if (error) throw error;
    return data;
  },

  async remove(id) {
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (error) throw error;
  },

  /**
   * Remove TODAS as parcelas de uma compra (mesmo installment_group_id).
   */
  async removeGroup(groupId) {
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('installment_group_id', groupId);
    if (error) throw error;
  },

  /**
   * Cria uma compra parcelada — N transações com mesmo installment_group_id.
   * Cada parcela é independente (cai no mês correspondente, pode ser editada
   * separadamente). O groupId conecta todas para edição/exclusão em massa.
   *
   * @param {Object} payload - dados da compra (sem amount/date — calculados aqui)
   * @param {number} payload.totalAmount - valor TOTAL da compra
   * @param {number} payload.installmentCount - número de parcelas (>= 2)
   * @param {string} payload.startDate - data da primeira parcela (YYYY-MM-DD)
   * @param {string} payload.description - descrição (vai virar "X (1/N)", "X (2/N)"...)
   */
  async createInstallments(payload) {
    const { generateInstallmentDates, splitInstallmentAmount } = await import('../utils/format');
    const userId = await currentUserId();

    const { totalAmount, installmentCount, startDate, description, ...rest } = payload;

    if (installmentCount < 2) throw new Error('Use create() para 1 parcela');

    const dates = generateInstallmentDates(startDate, installmentCount);
    const amounts = splitInstallmentAmount(totalAmount, installmentCount);

    // Gera UUID no cliente — o Postgres aceita
    const groupId = crypto.randomUUID();

    const rows = dates.map((date, i) => ({
      user_id: userId,
      type: rest.type,
      amount: amounts[i],
      description: `${description} (${i + 1}/${installmentCount})`,
      date,
      category_id: rest.category_id,
      credit_card_id: rest.credit_card_id || null,
      installment_total: installmentCount,
      installment_number: i + 1,
      installment_group_id: groupId,
      paid: false,
    }));

    const { data, error } = await supabase.from('transactions').insert(rows).select();
    if (error) throw error;
    return { groupId, transactions: data };
  },

  /**
   * Alterna o status de pagamento de uma despesa.
   * Atualização otimista: o frontend já reflete a mudança antes da resposta.
   */
  async togglePaid(id, paid) {
    const { data, error } = await supabase
      .from('transactions')
      .update({ paid })
      .eq('id', id)
      .select(`*, category:categories(*), credit_card:credit_cards(*)`)
      .single();
    if (error) throw error;
    return data;
  },
};

export const categoryService = {
  async list(type) {
    let query = supabase.from('categories').select('*').order('name');
    if (type) query = query.eq('type', type);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async create(payload) {
    const userId = await currentUserId();
    const { data, error } = await supabase
      .from('categories')
      .insert({ user_id: userId, ...payload })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id, payload) {
    const { data, error } = await supabase
      .from('categories')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async remove(id) {
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) throw error;
  },
};

export const cardService = {
  async list() {
    const { data, error } = await supabase
      .from('credit_cards')
      .select('*')
      .eq('active', true)
      .order('created_at');
    if (error) throw error;

    // Enriquecer com summary (fatura, disponível) via RPC para cada cartão
    const enriched = await Promise.all(
      (data || []).map(async (card) => {
        const { data: summary } = await supabase.rpc('get_card_summary', {
          p_card_id: card.id,
        });
        const s = summary?.[0] || {};
        return {
          card,
          // Limite total
          cardLimit: Number(s.card_limit || card.card_limit || 0),
          // Compras não pagas (ocupam limite) — agora considera TODAS as faturas não pagas
          openBill: Number(s.open_bill || 0),
          // Compras já pagas no ciclo (referência)
          paidInCycle: Number(s.paid_in_cycle || 0),
          // Compatibilidade com nomes antigos
          currentBill: Number(s.open_bill || 0),
          totalUsed: Number(s.total_used || 0),
          available: Number(s.available || card.card_limit || 0),
          purchaseCount: Number(s.purchase_count || 0),
          unpaidCount: Number(s.unpaid_count || 0),
          cycleStart: s.cycle_start,
          cycleEnd: s.cycle_end,
          utilizationPercent: Number(s.utilization_percent || 0),
          // Fatura "atual" (mais antiga não paga) — usado pelo botão "Pagar fatura"
          currentBillMonth: s.current_bill_month || null,
          currentBillAmount: Number(s.current_bill_amount || 0),
        };
      })
    );

    return enriched;
  },

  async create(payload) {
    const userId = await currentUserId();
    const { data, error } = await supabase
      .from('credit_cards')
      .insert({
        user_id: userId,
        name: payload.name,
        brand: payload.brand,
        last_digits: payload.lastDigits || null,
        card_limit: payload.limit,
        closing_day: payload.closingDay,
        due_day: payload.dueDay,
        color: payload.color,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id, payload) {
    const { data, error } = await supabase
      .from('credit_cards')
      .update({
        name: payload.name,
        brand: payload.brand,
        last_digits: payload.lastDigits || null,
        card_limit: payload.limit,
        closing_day: payload.closingDay,
        due_day: payload.dueDay,
        color: payload.color,
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async remove(id) {
    // Política de exclusão inteligente:
    //   - Cartão SEM nenhuma transação vinculada → apaga de verdade do banco
    //     (não acumula cartão morto / inativo sem serventia).
    //   - Cartão COM histórico → soft delete (active=false) pra não perder os
    //     lançamentos já feitos. Aí o "lixo" tem motivo de existir.
    // Retorna { hardDeleted } pra UI poder dar a mensagem certa.
    const [txRes, recRes] = await Promise.all([
      supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('credit_card_id', id),
      supabase.from('recurring_transactions').select('id', { count: 'exact', head: true }).eq('credit_card_id', id),
    ]);
    if (txRes.error) throw txRes.error;
    if (recRes.error) throw recRes.error;
    const refCount = (txRes.count ?? 0) + (recRes.count ?? 0);

    if (refCount === 0) {
      const { error } = await supabase.from('credit_cards').delete().eq('id', id);
      if (error) throw error;
      return { hardDeleted: true };
    }

    const { error } = await supabase
      .from('credit_cards')
      .update({ active: false })
      .eq('id', id);
    if (error) throw error;
    return { hardDeleted: false };
  },

  async history(cardId) {
    const { data, error } = await supabase
      .from('transactions')
      .select(`*, category:categories(*)`)
      .eq('credit_card_id', cardId)
      .order('date', { ascending: false })
      .limit(50);
    if (error) throw error;
    return data || [];
  },

  /**
   * Paga uma fatura específica do cartão (todas as compras não pagas daquela fatura).
   * @param {string} cardId - UUID do cartão
   * @param {string|null} billMonth - 'YYYY-MM-DD' (dia 1 do mês da fatura). Se null, paga a fatura mais antiga não paga.
   * @returns {Promise<number>} quantidade de compras marcadas como pagas.
   */
  async payBill(cardId, billMonth = null) {
    const { data, error } = await supabase.rpc('pay_card_bill', {
      p_card_id: cardId,
      p_bill_month: billMonth,
    });
    if (error) throw error;
    return data || 0;
  },

  /**
   * Lista todas as faturas do cartão (apenas meses que têm transações).
   * Retorna ordenado da mais antiga pra mais recente.
   */
  async bills(cardId) {
    const { data, error } = await supabase.rpc('get_card_bills', { p_card_id: cardId });
    if (error) throw error;
    return (data || []).map((b) => ({
      billMonth: b.bill_month,
      closesOn: b.closes_on,
      dueOn: b.due_on,
      totalAmount: Number(b.total_amount || 0),
      paidAmount: Number(b.paid_amount || 0),
      unpaidAmount: Number(b.unpaid_amount || 0),
      purchaseCount: Number(b.purchase_count || 0),
      isFullyPaid: !!b.is_fully_paid,
      isClosed: !!b.is_closed,
    }));
  },

  /**
   * Lista transações de UMA fatura específica.
   */
  async billTransactions(cardId, billMonth) {
    const { data, error } = await supabase.rpc('get_card_bill_transactions', {
      p_card_id: cardId,
      p_bill_month: billMonth,
    });
    if (error) throw error;
    return data || [];
  },
};

/**
 * RecurringService — gerencia transações recorrentes (modelos).
 * --------------------------------------------------------------
 * Modelos = "templates" que geram transações reais nos meses.
 * O frontend chama generateForMonth() ao abrir um mês — a função SQL
 * cria as transações que faltam (idempotente, não duplica).
 */
export const recurringService = {
  async list() {
    const { data, error } = await supabase
      .from('recurring_transactions')
      .select(`*, category:categories(*), credit_card:credit_cards(*)`)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async create(payload) {
    const userId = await currentUserId();
    const { data, error } = await supabase
      .from('recurring_transactions')
      .insert({
        user_id: userId,
        type: payload.type,
        amount: payload.amount,
        description: payload.description,
        category_id: payload.category_id,
        credit_card_id: payload.credit_card_id || null,
        day_of_month: payload.day_of_month,
        start_month: payload.start_month, // YYYY-MM-DD (dia 1 do mês de início)
        end_month: payload.end_month ?? null, // YYYY-MM-01 do último mês a gerar; null = sem fim
        kind: payload.kind || 'recurring', // 'recurring' | 'subscription' (legado)
        active: true,
      })
      .select(`*, category:categories(*), credit_card:credit_cards(*)`)
      .single();
    if (error) throw error;
    return data;
  },

  async update(id, payload) {
    const { data, error } = await supabase
      .from('recurring_transactions')
      .update(payload)
      .eq('id', id)
      .select(`*, category:categories(*), credit_card:credit_cards(*)`)
      .single();
    if (error) throw error;
    return data;
  },

  async toggleActive(id, active) {
    const { error } = await supabase
      .from('recurring_transactions')
      .update({ active })
      .eq('id', id);
    if (error) throw error;
  },

  async remove(id) {
    // Exclui APENAS o modelo. As transações já geradas ficam (recurring_id vira
    // null pela FK on delete set null) — histórico preservado, para de gerar.
    const { error } = await supabase.from('recurring_transactions').delete().eq('id', id);
    if (error) throw error;
  },

  /**
   * Conta quantas transações este modelo já gerou (qualquer mês).
   * Usado pra UI mostrar "isto vai apagar N lançamentos".
   */
  async countGenerated(id) {
    const { count, error } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('recurring_id', id);
    if (error) throw error;
    return count ?? 0;
  },

  /**
   * Exclusão TOTAL: apaga de verdade o modelo E todas as transações que ele
   * gerou (em qualquer mês). Sem deixar resíduo no banco.
   */
  async removeWithTransactions(id) {
    const { error: txErr } = await supabase
      .from('transactions')
      .delete()
      .eq('recurring_id', id);
    if (txErr) throw txErr;
    const { error } = await supabase
      .from('recurring_transactions')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  /**
   * Exclui vários modelos numa única request via `.in('id', ids)`.
   * Retorna a quantidade afetada (ou ids.length como fallback).
   */
  async removeMany(ids) {
    if (!ids || ids.length === 0) return 0;
    const { error, count } = await supabase
      .from('recurring_transactions')
      .delete({ count: 'exact' })
      .in('id', ids);
    if (error) throw error;
    return count ?? ids.length;
  },

  /**
   * Exclusão TOTAL em lote: apaga os modelos E todas as transações geradas
   * por eles. Retorna a quantidade de modelos excluídos.
   */
  async removeManyWithTransactions(ids) {
    if (!ids || ids.length === 0) return 0;
    const { error: txErr } = await supabase
      .from('transactions')
      .delete()
      .in('recurring_id', ids);
    if (txErr) throw txErr;
    const { error, count } = await supabase
      .from('recurring_transactions')
      .delete({ count: 'exact' })
      .in('id', ids);
    if (error) throw error;
    return count ?? ids.length;
  },

  /**
   * Atualiza o campo `active` de vários modelos em uma só chamada.
   */
  async setActiveMany(ids, active) {
    if (!ids || ids.length === 0) return 0;
    const { error, count } = await supabase
      .from('recurring_transactions')
      .update({ active }, { count: 'exact' })
      .in('id', ids);
    if (error) throw error;
    return count ?? ids.length;
  },

  /**
   * Gera as transações recorrentes do mês informado.
   * Idempotente: se já tiverem sido geradas, não duplica.
   * Retorna quantas foram criadas (0 = nada novo).
   */
  async generateForMonth(month) {
    const { data, error } = await supabase.rpc('generate_recurring_for_month', { p_month: month });
    if (error) throw error;
    return data || 0;
  },
};

/**
 * LoanService — empréstimos vigentes.
 * --------------------------------------------------------------
 * Empréstimo no Cofre = compra parcelada com `installment_total >= 36`
 * (≥ 3 anos). Não vive em `recurring_transactions` — são N parcelas em
 * `transactions` ligadas por `installment_group_id`. Esse service agrupa
 * essas parcelas pra mostrar o estado consolidado de cada empréstimo.
 */
export const loanService = {
  /**
   * Lista empréstimos vigentes (ainda têm parcelas não pagas).
   * Agrupa por installment_group_id e calcula totais.
   */
  async list() {
    // Threshold do que o Cofre considera "empréstimo" (vs parcelamento normal)
    const LOAN_THRESHOLD = 36;

    const { data, error } = await supabase
      .from('transactions')
      .select(`
        id, description, amount, date, paid,
        installment_number, installment_total, installment_group_id,
        category:categories ( id, name, color ),
        credit_card:credit_cards ( id, name, color )
      `)
      .gte('installment_total', LOAN_THRESHOLD)
      .not('installment_group_id', 'is', null)
      .order('date', { ascending: true });

    if (error) throw error;

    // Agrupa por installment_group_id
    const groups = new Map();
    for (const tx of (data || [])) {
      const gid = tx.installment_group_id;
      if (!groups.has(gid)) {
        groups.set(gid, {
          groupId: gid,
          // pega descrição "limpa" tirando o " (X/N)" do final
          description: (tx.description || '').replace(/\s*\(\d+\/\d+\)\s*$/, ''),
          total: 0,
          paid: 0,
          unpaid: 0,
          parcels: [],
          firstDate: tx.date,
          installmentTotal: tx.installment_total,
          category: tx.category,
          creditCard: tx.credit_card,
        });
      }
      const g = groups.get(gid);
      const amount = Number(tx.amount) || 0;
      g.total += amount;
      if (tx.paid) g.paid += amount;
      else g.unpaid += amount;
      g.parcels.push(tx);
    }

    // Só mantém os que ainda têm parcelas não pagas (vigentes)
    return Array.from(groups.values())
      .filter((g) => g.unpaid > 0)
      .map((g) => {
        const paidCount = g.parcels.filter((p) => p.paid).length;
        return {
          ...g,
          paidCount,
          remainingCount: g.installmentTotal - paidCount,
          // valor médio da parcela
          installmentValue: g.total / g.installmentTotal,
          progressPercent: Math.round((paidCount / g.installmentTotal) * 100),
        };
      })
      .sort((a, b) => a.firstDate.localeCompare(b.firstDate));
  },
};

/**
 * DashboardService — usa as RPC functions criadas no schema.sql
 * Aceita mês de referência ('YYYY-MM') para todas as agregações.
 */
export const dashboardService = {
  async summary(period = 'month', referenceMonth = null) {
    // Calcula mês anterior pra comparação
    const previousMonth = (() => {
      if (!referenceMonth) {
        // Se não passou mês de referência, usa o atual
        const now = new Date();
        const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
      }
      const [y, m] = referenceMonth.split('-').map(Number);
      const prev = new Date(y, m - 2, 1); // m-2: getMonth é 0-indexed e queremos -1 mês
      return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
    })();

    const [balance, periodSummary, byCategory, monthlyHistory, previousBalance] = await Promise.all([
      supabase.rpc('get_balance', { p_month: referenceMonth }).then((r) => r.data?.[0] || { balance: 0, total_income: 0, total_expense: 0 }),
      supabase.rpc('get_period_summary', { p_period: period, p_reference: referenceMonth }).then((r) => r.data?.[0] || { income: 0, expense: 0, balance: 0, tx_count: 0 }),
      supabase.rpc('get_expenses_by_category', { p_month: referenceMonth }).then((r) => r.data || []),
      supabase.rpc('get_monthly_history', { p_months: 6 }).then((r) => r.data || []),
      supabase.rpc('get_balance', { p_month: previousMonth }).then((r) => r.data?.[0] || { balance: 0, total_income: 0, total_expense: 0 }),
    ]);
    // Normaliza pra estrutura que o frontend já consome
    const balanceObj = {
      balance: Number(balance.balance) || 0,
      totalIncome: Number(balance.total_income) || 0,
      totalExpense: Number(balance.total_expense) || 0,
    };
    const periodObj = {
      period,
      income: Number(periodSummary.income) || 0,
      expense: Number(periodSummary.expense) || 0,
      balance: Number(periodSummary.balance) || 0,
      count: Number(periodSummary.tx_count) || 0,
    };

    // Comparação com mês anterior — calcula variações em %
    const prevIncome = Number(previousBalance.total_income) || 0;
    const prevExpense = Number(previousBalance.total_expense) || 0;
    const prevBalanceVal = Number(previousBalance.balance) || 0;

    function pctChange(current, previous) {
      // Base praticamente zero (< 1 centavo) não dá comparação útil — geraria
      // porcentagens absurdas tipo "+20000000%". Trata como "sem base".
      if (Math.abs(previous) < 0.005) return null;
      return ((current - previous) / Math.abs(previous)) * 100;
    }

    const comparison = {
      incomeChange: pctChange(periodObj.income, prevIncome),
      expenseChange: pctChange(periodObj.expense, prevExpense),
      balanceChange: pctChange(balanceObj.balance, prevBalanceVal),
      previous: {
        income: prevIncome,
        expense: prevExpense,
        balance: prevBalanceVal,
      },
    };

    const alerts = [];
    if (periodObj.income > 0 && periodObj.expense > periodObj.income * 0.8) {
      alerts.push({
        type: 'warning',
        message: `Despesas representam ${Math.round(
          (periodObj.expense / periodObj.income) * 100
        )}% das receitas neste período.`,
      });
    }
    if (balanceObj.balance < 0) {
      alerts.push({ type: 'danger', message: 'Saldo negativo! Reveja seus gastos.' });
    }

    return {
      balance: balanceObj,
      periodSummary: periodObj,
      comparison,
      byCategory: byCategory.map((c) => ({
        categoryId: c.category_id,
        name: c.name,
        color: c.color,
        icon: c.icon,
        total: Number(c.total) || 0,
        count: Number(c.tx_count) || 0,
      })),
      monthlyHistory: monthlyHistory.map((m) => ({
        month: m.month,
        income: Number(m.income) || 0,
        expense: Number(m.expense) || 0,
        balance: Number(m.balance) || 0,
      })),
      alerts,
    };
  },

  async forecast(months = 3) {
    const { data, error } = await supabase.rpc('get_balance_forecast', { p_months: months });
    if (error) throw error;
    const balance = await supabase.rpc('get_balance').then((r) => r.data?.[0]);
    return {
      current: Number(balance?.balance) || 0,
      forecast: (data || []).map((f) => ({
        month: f.month,
        projected: Number(f.projected) || 0,
        avgIncome: Number(f.avg_income) || 0,
        avgExpense: Number(f.avg_expense) || 0,
      })),
    };
  },

  async recent(limit = 10) {
    const { transactions } = await transactionService.list({ limit });
    return transactions;
  },

  /**
   * Exporta CSV no próprio cliente — sem precisar de backend.
   * Busca as transações com os mesmos filtros e gera o CSV em memória.
   */
  async exportCSV(filters = {}) {
    const { transactions } = await transactionService.list({ ...filters, limit: 10000 });

    const header = ['Data', 'Tipo', 'Descrição', 'Categoria', 'Valor (R$)', 'Cartão'];
    const rows = transactions.map((t) => {
      const dateBr = new Date(t.date + 'T00:00:00').toLocaleDateString('pt-BR');
      return [
        dateBr,
        t.type === 'income' ? 'Receita' : 'Despesa',
        `"${(t.description || '').replace(/"/g, '""')}"`,
        t.category?.name || '',
        Number(t.amount).toFixed(2).replace('.', ','),
        t.credit_card?.name || '',
      ].join(';');
    });

    // BOM para Excel reconhecer UTF-8
    return '\ufeff' + [header.join(';'), ...rows].join('\n');
  },
};
