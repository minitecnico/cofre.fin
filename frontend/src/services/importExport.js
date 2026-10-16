import { supabase } from './supabase';
import { transactionService } from './index';
import * as XLSX from 'xlsx';

/**
 * Service de Importação/Exportação de planilhas CSV.
 * --------------------------------------------------------------
 * Esse módulo é ISOLADO — não modifica nenhum outro service. Usa as
 * funções existentes (transactionService.create / createInstallments)
 * para criar transações.
 *
 * Recursos:
 *   - Geração de template CSV em branco (com cabeçalhos em PT-BR + exemplos)
 *   - Export CSV das transações do mês selecionado (ou todas)
 *   - Parse "tolerante" de CSV de upload, com fuzzy matching:
 *      • Categoria por nome aproximado (ignora acentos, case)
 *      • Cartão por nome aproximado
 *      • Tipo aceita variações ("despesa", "saída", "expense", "-")
 *      • Data aceita BR (DD/MM/YYYY) ou ISO (YYYY-MM-DD)
 *      • Valor aceita "1.234,56" ou "1234.56"
 *   - Detecção de duplicatas por (data + descrição + valor)
 *   - Validação linha-a-linha com erros e avisos detalhados
 *   - Importação atômica (só importa as linhas válidas)
 */

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

/** Normaliza texto: minúsculas, sem acento, sem espaços extras. */
function normalize(s) {
  if (s == null) return '';
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .toLowerCase()
    .trim();
}

/** Distância de edição (Levenshtein) — pra "mais parecido". */
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

/**
 * Encontra o item mais "próximo" pelo nome.
 * Retorna { item, exact } ou null se nenhuma proximidade razoável.
 */
function findClosest(query, items, getName) {
  if (!query) return null;
  const q = normalize(query);

  // Match exato (após normalização) tem prioridade
  for (const item of items) {
    if (normalize(getName(item)) === q) return { item, exact: true };
  }

  // Match parcial: nome do item começa/contém a query (ou vice-versa)
  for (const item of items) {
    const n = normalize(getName(item));
    if (n.startsWith(q) || q.startsWith(n) || n.includes(q) || q.includes(n)) {
      return { item, exact: false };
    }
  }

  // Fuzzy: distância de edição pequena (até 30% do tamanho)
  let best = null;
  let bestDist = Infinity;
  for (const item of items) {
    const n = normalize(getName(item));
    const d = levenshtein(q, n);
    if (d < bestDist) {
      bestDist = d;
      best = item;
    }
  }
  if (best && bestDist <= Math.max(2, Math.floor(q.length * 0.3))) {
    return { item: best, exact: false };
  }

  return null;
}

/** Parse CSV simples — suporta aspas duplas, vírgula como separador. */
function parseCsvText(text) {
  const lines = [];
  let current = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',' || ch === ';') {
        current.push(cell);
        cell = '';
      } else if (ch === '\n' || ch === '\r') {
        if (cell !== '' || current.length > 0) {
          current.push(cell);
          lines.push(current);
        }
        cell = '';
        current = [];
        // pula \r\n
        if (ch === '\r' && text[i + 1] === '\n') i++;
      } else {
        cell += ch;
      }
    }
  }
  if (cell !== '' || current.length > 0) {
    current.push(cell);
    lines.push(current);
  }
  return lines.filter((l) => l.some((c) => c.trim() !== ''));
}

/** Escape CSV: envolve em aspas se contém , ; " ou nova linha. */
function csvEscape(value) {
  if (value == null) return '';
  const s = String(value);
  if (/[",;\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Parse de valor monetário.
 * --------------------------------------------------------------
 * Aceita:
 *   - number direto: 1234.56 → 1234.56  (caso vindo de planilha Excel raw)
 *   - "1.234,56" (BR)                   → 1234.56
 *   - "1234,56"  (BR sem milhar)        → 1234.56
 *   - "1234.56"  (US sem milhar)        → 1234.56
 *   - "R$ 1.234,56"                     → 1234.56
 *
 * Heurística para strings ambíguas (com vírgula E ponto):
 *   - O ÚLTIMO separador (mais à direita) é o decimal
 *   - O outro é separador de milhar (sempre removido)
 *
 * Estratégia para strings com APENAS UM tipo de separador:
 *   - Se o separador aparece UMA vez E tem 1-2 dígitos depois → é decimal
 *   - Se o separador aparece UMA vez E tem 3 dígitos depois → é MILHAR (não decimal)
 *   - Se o separador aparece MAIS DE UMA vez → é separador de milhar
 *
 * Exemplos críticos da heurística:
 *   "1.234"      → 1234     (3 dígitos depois do ponto = milhar)
 *   "1.23"       → 1.23     (2 dígitos depois do ponto = decimal)
 *   "1,234"      → 1234     (3 dígitos depois da vírgula = milhar — formato US!)
 *   "1,23"       → 1.23     (2 dígitos depois da vírgula = decimal — formato BR!)
 *   "1.234.567"  → 1234567  (mais de uma ocorrência = milhar)
 */
function parseMoney(input) {
  if (input == null || input === '') return null;

  // Se já é número, devolve direto (caso de Excel lido com raw:true)
  if (typeof input === 'number') {
    return isNaN(input) ? null : input;
  }

  let s = String(input).replace(/[^\d,.-]/g, '').trim();
  if (!s) return null;

  // Trata negativo
  let isNegative = false;
  if (s.startsWith('-')) {
    isNegative = true;
    s = s.slice(1);
  }
  s = s.replace(/-/g, ''); // remove eventuais hífens do meio

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  let normalized;

  if (hasComma && hasDot) {
    // Tem AMBOS — o último (mais à direita) é o decimal
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > lastDot) {
      // Vírgula é decimal (formato BR): "1.234,56"
      normalized = s.replace(/\./g, '').replace(',', '.');
    } else {
      // Ponto é decimal (formato US): "1,234.56"
      normalized = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    // Só vírgula
    const parts = s.split(',');
    if (parts.length > 2) {
      // Múltiplas vírgulas = separador de milhar (formato US sem decimal)
      normalized = s.replace(/,/g, '');
    } else {
      // Uma vírgula só: olha quantos dígitos vêm depois
      const after = parts[1];
      if (after.length === 3) {
        // 3 dígitos = milhar (ex: "1,234" = 1234)
        normalized = s.replace(',', '');
      } else {
        // 1 ou 2 dígitos = decimal (ex: "1,23" ou "1,5" = formato BR)
        normalized = s.replace(',', '.');
      }
    }
  } else if (hasDot) {
    // Só ponto
    const parts = s.split('.');
    if (parts.length > 2) {
      // Múltiplos pontos = separador de milhar (formato BR sem decimal)
      normalized = s.replace(/\./g, '');
    } else {
      // Um ponto só
      const after = parts[1];
      if (after.length === 3) {
        // 3 dígitos = milhar (ex: "1.234" = 1234, formato BR)
        normalized = s.replace('.', '');
      } else {
        // 1 ou 2 dígitos = decimal (ex: "1.23" = 1.23)
        normalized = s;
      }
    }
  } else {
    // Sem separadores
    normalized = s;
  }

  const n = parseFloat(normalized);
  if (isNaN(n)) return null;
  return isNegative ? -n : n;
}

/** Parse de data: aceita BR (DD/MM/YYYY ou DD/MM/YY) ou ISO (YYYY-MM-DD). */
function parseDate(input) {
  if (input == null || input === '') return null;
  const s = String(input).trim();

  // ISO: 2026-05-04 (com ou sem hora)
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const mo = parseInt(m[2], 10);
    const d = parseInt(m[3], 10);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return `${m[1]}-${m[2]}-${m[3]}`;
    }
    return null;
  }

  // BR: 04/05/2026, 4/5/26, 04-05-2026
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    const mo = parseInt(m[2], 10);
    const d = parseInt(m[1], 10);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  return null;
}

/** Parse de tipo: aceita variações em PT-BR. */
function parseType(input) {
  const n = normalize(input);
  if (!n) return null;
  if (['despesa', 'saida', 'expense', '-', 'gasto', 'pagamento'].includes(n)) return 'expense';
  if (['receita', 'entrada', 'income', '+', 'recebimento', 'salario'].includes(n)) return 'income';
  return null;
}

/** Parse de booleano "sim/não" pra coluna "Pago". */
function parseBool(input) {
  const n = normalize(input);
  if (['sim', 's', 'yes', 'y', '1', 'true', 'pago', 'paid'].includes(n)) return true;
  if (['nao', 'n', 'no', '0', 'false', 'pendente', 'unpaid', ''].includes(n)) return false;
  return false;
}

/** Mapa flexível de nome de coluna → chave canônica. */
const COLUMN_ALIASES = {
  tipo: 'type',
  type: 'type',
  descricao: 'description',
  descrição: 'description',
  description: 'description',
  desc: 'description',
  valor: 'amount',
  amount: 'amount',
  preco: 'amount',
  preço: 'amount',
  data: 'date',
  date: 'date',
  vencimento: 'date',
  categoria: 'category',
  category: 'category',
  cartao: 'card',
  cartão: 'card',
  card: 'card',
  parcelas: 'installments',
  installments: 'installments',
  parcelado: 'installments',
  pago: 'paid',
  paid: 'paid',
  observacoes: 'notes',
  observações: 'notes',
  notes: 'notes',
};

function canonicalizeHeaders(headers) {
  return headers.map((h) => COLUMN_ALIASES[normalize(h)] || normalize(h));
}

// ─────────────────────────────────────────────────────────────────────────
// Geração de template
// ─────────────────────────────────────────────────────────────────────────

export function generateTemplateCSV() {
  const today = new Date();
  const todayStr = today.toLocaleDateString('pt-BR'); // DD/MM/YYYY

  const lines = [
    ['Tipo', 'Descrição', 'Valor', 'Data', 'Categoria', 'Cartão', 'Parcelas', 'Pago', 'Observações'],
    ['Despesa', 'Aluguel', '1800,00', todayStr, 'Moradia', '', '1', 'Não', 'Pago via PIX'],
    ['Despesa', 'Tênis novo', '300,00', todayStr, 'Vestuário', 'Nubank', '8', 'Não', 'Black Friday'],
    ['Receita', 'Salário', '5000,00', todayStr, 'Trabalho', '', '1', 'Sim', ''],
    [],
    ['# DICAS DE PREENCHIMENTO:'],
    ['# Tipo:'],
    ['#   "Despesa" ou "Receita" (também aceita Saída/Entrada)'],
    ['# Valor:'],
    ['#   Use vírgula para decimais. Ex: 1234,56'],
    ['# Data:'],
    ['#   Formato BR (DD/MM/AAAA) ou ISO (AAAA-MM-DD). Ex: 04/05/2026'],
    ['# Categoria:'],
    ['#   Nome aproximado da categoria já cadastrada. Ex: "Alimentação", "alimentacao"'],
    ['# Cartão:'],
    ['#   Nome do cartão já cadastrado, ou deixe vazio para "Conta/dinheiro"'],
    ['# Parcelas:'],
    ['#   1 ou vazio = à vista. 8 = parcela em 8x. Apenas com cartão.'],
    ['# Pago:'],
    ['#   "Sim" se já paga, "Não" ou vazio se pendente.'],
    ['# Apague essas linhas com # antes de subir o arquivo.'],
  ];

  return lines.map((row) => row.map(csvEscape).join(',')).join('\n');
}

// ─────────────────────────────────────────────────────────────────────────
// Export CSV das transações
// ─────────────────────────────────────────────────────────────────────────

export async function exportTransactionsCSV({ startDate, endDate } = {}) {
  let query = supabase
    .from('transactions')
    .select(`*, category:categories(name), credit_card:credit_cards(name)`)
    .order('date', { ascending: false });

  if (startDate) query = query.gte('date', startDate);
  if (endDate) query = query.lte('date', endDate);

  const { data, error } = await query;
  if (error) throw error;

  const lines = [
    ['Tipo', 'Descrição', 'Valor', 'Data', 'Categoria', 'Cartão', 'Parcelas', 'Pago', 'Observações'],
  ];

  for (const t of data || []) {
    const tipo = t.type === 'income' ? 'Receita' : 'Despesa';
    const valor = String(Number(t.amount).toFixed(2)).replace('.', ',');
    const date = t.date ? t.date.slice(0, 10).split('-').reverse().join('/') : '';
    const categoria = t.category?.name || '';
    const cartao = t.credit_card?.name || '';
    const parcelas = t.installment_total > 1
      ? `${t.installment_number}/${t.installment_total}`
      : '1';
    const pago = t.paid ? 'Sim' : 'Não';
    const obs = t.notes || '';

    lines.push([tipo, t.description || '', valor, date, categoria, cartao, parcelas, pago, obs]);
  }

  return {
    csv: lines.map((row) => row.map(csvEscape).join(',')).join('\n'),
    count: data?.length || 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Parse + validação do CSV de upload
// ─────────────────────────────────────────────────────────────────────────

/**
 * Parseia um CSV de upload e retorna preview com validação.
 * NÃO importa nada — apenas valida.
 *
 * Retorna:
 *   {
 *     rows: [{ status: 'ok'|'warn'|'error', original, parsed, messages }],
 *     summary: { ok, warn, error, total }
 *   }
 */
export async function parseImportCSV(text, { categories, cards, existingTransactions }) {
  const rawLines = parseCsvText(text);
  if (rawLines.length === 0) {
    throw new Error('Arquivo vazio.');
  }

  // Filtra linhas que começam com # (comentários) e linhas vazias
  const lines = rawLines.filter((row) => {
    const first = (row[0] || '').trim();
    return first !== '' && !first.startsWith('#');
  });

  if (lines.length < 2) {
    throw new Error('O arquivo precisa ter pelo menos um cabeçalho e uma linha de dados.');
  }

  // Primeira linha = cabeçalhos
  const headers = canonicalizeHeaders(lines[0]);

  // Verifica colunas obrigatórias
  const required = ['type', 'description', 'amount', 'date'];
  const missing = required.filter((r) => !headers.includes(r));
  if (missing.length > 0) {
    const labels = { type: 'Tipo', description: 'Descrição', amount: 'Valor', date: 'Data' };
    throw new Error(
      `Faltam colunas obrigatórias: ${missing.map((m) => labels[m]).join(', ')}.`
    );
  }

  // Indexa colunas
  const colIdx = {};
  headers.forEach((h, i) => { colIdx[h] = i; });

  // Set de chaves de duplicatas existentes no banco
  const dupSet = new Set(
    (existingTransactions || []).map(
      (t) => `${t.date}::${normalize(t.description)}::${Number(t.amount).toFixed(2)}`
    )
  );

  const dataLines = lines.slice(1);
  const rows = [];

  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i];
    const get = (key) => (colIdx[key] != null ? (line[colIdx[key]] || '').trim() : '');

    const messages = [];
    let status = 'ok';

    // Tipo
    const type = parseType(get('type'));
    if (!type) {
      messages.push({ level: 'error', text: `Tipo inválido: "${get('type')}". Use "Despesa" ou "Receita".` });
      status = 'error';
    }

    // Descrição
    const description = get('description');
    if (!description) {
      messages.push({ level: 'error', text: 'Descrição vazia.' });
      status = 'error';
    }

    // Valor
    const amount = parseMoney(get('amount'));
    if (amount == null || amount <= 0) {
      messages.push({ level: 'error', text: `Valor inválido: "${get('amount')}".` });
      status = 'error';
    }

    // Data
    const date = parseDate(get('date'));
    if (!date) {
      messages.push({ level: 'error', text: `Data inválida: "${get('date')}". Use DD/MM/AAAA.` });
      status = 'error';
    }

    // Categoria — busca aproximada
    const categoryRaw = get('category');
    let categoryId = null;
    let categoryName = '';
    if (!categoryRaw) {
      messages.push({ level: 'error', text: 'Categoria vazia.' });
      status = 'error';
    } else {
      const expectedType = type;
      const filteredCats = categories.filter((c) => !expectedType || c.type === expectedType);
      const match = findClosest(categoryRaw, filteredCats, (c) => c.name);
      if (!match) {
        messages.push({
          level: 'error',
          text: `Categoria "${categoryRaw}" não encontrada. Cadastre antes ou use uma existente.`,
        });
        status = 'error';
      } else {
        categoryId = match.item.id;
        categoryName = match.item.name;
        if (!match.exact) {
          messages.push({
            level: 'warn',
            text: `Categoria "${categoryRaw}" interpretada como "${match.item.name}".`,
          });
          if (status !== 'error') status = 'warn';
        }
      }
    }

    // Cartão (opcional)
    const cardRaw = get('card');
    let creditCardId = null;
    let cardName = '';
    if (cardRaw) {
      const match = findClosest(cardRaw, cards, (c) => c.name);
      if (!match) {
        messages.push({
          level: 'warn',
          text: `Cartão "${cardRaw}" não encontrado. Despesa será como "Conta/dinheiro".`,
        });
        if (status !== 'error') status = 'warn';
      } else {
        creditCardId = match.item.id;
        cardName = match.item.name;
        if (!match.exact) {
          messages.push({
            level: 'warn',
            text: `Cartão "${cardRaw}" interpretado como "${match.item.name}".`,
          });
          if (status !== 'error') status = 'warn';
        }
      }
    }

    // Parcelas (opcional)
    let installments = 1;
    const instRaw = get('installments');
    if (instRaw) {
      // Aceita "8" ou "1/8" (importa como linha individual, não cria 8 parcelas)
      const parts = instRaw.split('/').map((s) => s.trim());
      const n = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(n) && n >= 1) installments = n;
    }
    if (installments > 1 && !creditCardId) {
      messages.push({
        level: 'warn',
        text: `Parcelamento ignorado (sem cartão). Lançamento como à vista.`,
      });
      if (status !== 'error') status = 'warn';
      installments = 1;
    }

    // Pago (default: pendente)
    const paid = parseBool(get('paid'));

    // Detecção de duplicata (baseado no que JÁ existe no banco)
    if (status !== 'error' && date && description && amount != null) {
      const key = `${date}::${normalize(description)}::${amount.toFixed(2)}`;
      if (dupSet.has(key)) {
        messages.push({
          level: 'warn',
          text: 'Já existe uma transação com essa mesma data, descrição e valor. Será ignorada.',
        });
        status = 'duplicate';
      }
    }

    rows.push({
      lineNumber: i + 2, // +2 = pula cabeçalho e usa numeração 1-based
      status, // 'ok' | 'warn' | 'error' | 'duplicate'
      original: line,
      parsed: {
        type, description, amount, date,
        category_id: categoryId, categoryName,
        credit_card_id: creditCardId, cardName,
        installments, paid,
      },
      messages,
    });
  }

  const summary = {
    total: rows.length,
    ok: rows.filter((r) => r.status === 'ok').length,
    warn: rows.filter((r) => r.status === 'warn').length,
    error: rows.filter((r) => r.status === 'error').length,
    duplicate: rows.filter((r) => r.status === 'duplicate').length,
  };

  return { rows, summary };
}

// ─────────────────────────────────────────────────────────────────────────
// Importa as linhas validadas
// ─────────────────────────────────────────────────────────────────────────

/**
 * Importa as linhas que passaram pela validação (status 'ok' ou 'warn').
 * Linhas 'error' e 'duplicate' são automaticamente ignoradas.
 */
export async function importValidRows(rows) {
  const validRows = rows.filter((r) => r.status === 'ok' || r.status === 'warn');

  let created = 0;
  let installmentsCreated = 0;

  for (const row of validRows) {
    const p = row.parsed;
    if (p.installments > 1) {
      // Cria como compra parcelada (gera N parcelas)
      const result = await transactionService.createInstallments({
        type: p.type,
        totalAmount: p.amount,
        installmentCount: p.installments,
        startDate: p.date,
        description: p.description,
        category_id: p.category_id,
        credit_card_id: p.credit_card_id,
      });
      installmentsCreated += result.transactions?.length || p.installments;
    } else {
      // Cria como despesa simples — usa create + atualiza paid se necessário
      const tx = await transactionService.create({
        type: p.type,
        amount: p.amount,
        description: p.description,
        date: p.date,
        category_id: p.category_id,
        credit_card_id: p.credit_card_id,
      });
      // Se foi marcada como paga na planilha, atualiza
      if (p.paid && tx?.id) {
        try {
          await transactionService.togglePaid(tx.id, true);
        } catch {
          /* não crítico */
        }
      }
      created += 1;
    }
  }

  return {
    simpleCreated: created,
    installmentTransactionsCreated: installmentsCreated,
    total: created + installmentsCreated,
    skipped: rows.length - validRows.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers expostos pra UI
// ─────────────────────────────────────────────────────────────────────────

/** Carrega tudo que o parser precisa. */
export async function loadImportContext() {
  const [catsRes, cardsRes, txsRes] = await Promise.all([
    supabase.from('categories').select('id, name, type, color'),
    supabase.from('credit_cards').select('id, name, color').eq('active', true),
    // Pega todas pra detectar duplicatas (limit alto pra cobrir histórico)
    supabase.from('transactions').select('date, description, amount').limit(5000),
  ]);

  return {
    categories: catsRes.data || [],
    cards: cardsRes.data || [],
    existingTransactions: txsRes.data || [],
  };
}

/** Helper pra disparar download de string como arquivo. */
export function downloadCSV(content, filename) {
  // BOM UTF-8 pra Excel abrir com acentos certos
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// =========================================================================
// EXCEL (.xlsx) — formato preferido (templates bonitos, dropdowns, etc.)
// =========================================================================

/** Helper: converte um array de arrays em uma worksheet com larguras de coluna. */
function arraysToSheet(data, columnWidths) {
  const ws = XLSX.utils.aoa_to_sheet(data);
  if (columnWidths) {
    ws['!cols'] = columnWidths.map((w) => ({ wch: w }));
  }
  return ws;
}

/**
 * Gera o template Excel com 3 abas:
 *   - Transações (principal, com exemplos e formatação de data/valor)
 *   - Categorias (lista pra consulta)
 *   - Cartões (lista pra consulta)
 *
 * NOTA: dropdowns reais via "data validation" requerem biblioteca paga
 * do XLSX. Como alternativa, listamos as categorias/cartões em abas
 * separadas para fácil consulta. O parser do upload usa fuzzy matching,
 * então mesmo se o usuário digitar "alimentacao" no lugar de "Alimentação"
 * (ou abrir as abas e copiar/colar), tudo funciona.
 */
export async function generateTemplateXLSX() {
  // Busca categorias e cartões pra incluir nas abas auxiliares
  const [catsRes, cardsRes] = await Promise.all([
    supabase.from('categories').select('name, type, color').order('name'),
    supabase.from('credit_cards').select('name, brand, last_digits').eq('active', true).order('name'),
  ]);

  const cats = catsRes.data || [];
  const cards = cardsRes.data || [];

  // ── Aba 1: Transações (com exemplos) ──────────────────────────────────
  const today = new Date();
  const txData = [
    // Cabeçalho
    ['Tipo', 'Descrição', 'Valor', 'Data', 'Categoria', 'Cartão', 'Parcelas', 'Pago', 'Observações'],
    // Exemplos (3 linhas)
    ['Despesa', 'Aluguel',     1800.00, today, 'Moradia',    '',        1, 'Não', 'Pago via PIX'],
    ['Despesa', 'Tênis novo',  300.00,  today, 'Vestuário',  'Nubank',  8, 'Não', 'Black Friday'],
    ['Receita', 'Salário',     5000.00, today, 'Trabalho',   '',        1, 'Sim', ''],
  ];

  // 7 linhas vazias pra usuário começar
  for (let i = 0; i < 7; i++) {
    txData.push(['', '', '', '', '', '', '', '', '']);
  }

  const wsTx = arraysToSheet(txData, [12, 30, 14, 14, 22, 18, 10, 10, 30]);

  // Formatação numérica/data nas colunas de exemplo
  // Coluna C (Valor) = moeda BR
  // Coluna D (Data) = data BR
  for (let r = 1; r <= 9; r++) { // linhas 2-10 (1-indexed → 1-9 zero-indexed)
    const cellValor = XLSX.utils.encode_cell({ r, c: 2 });
    const cellData = XLSX.utils.encode_cell({ r, c: 3 });
    if (wsTx[cellValor]) wsTx[cellValor].z = '#,##0.00';
    if (wsTx[cellData]) wsTx[cellData].z = 'dd/mm/yyyy';
  }

  // ── Aba 2: Categorias disponíveis ─────────────────────────────────────
  const catData = [
    ['Categoria', 'Tipo'],
    ...cats.map((c) => [c.name, c.type === 'income' ? 'Receita' : 'Despesa']),
  ];
  const wsCats = arraysToSheet(catData, [25, 12]);

  // ── Aba 3: Cartões disponíveis ────────────────────────────────────────
  const cardData = [
    ['Cartão', 'Bandeira', 'Final'],
    ...cards.map((c) => [c.name, c.brand || '', c.last_digits || '']),
  ];
  const wsCards = arraysToSheet(cardData, [22, 14, 8]);

  // ── Aba 4: Como preencher (instruções) ────────────────────────────────
  const helpData = [
    ['Como preencher esta planilha'],
    [''],
    ['Coluna', 'Como preencher', 'Exemplo'],
    ['Tipo', 'Despesa ou Receita (também aceita Saída/Entrada)', 'Despesa'],
    ['Descrição', 'O que foi gasto/recebido', 'Aluguel'],
    ['Valor', 'Use vírgula nos centavos', '1800,00'],
    ['Data', 'Formato BR (dd/mm/aaaa) ou ISO (aaaa-mm-dd)', '04/05/2026'],
    ['Categoria', 'Nome da categoria já cadastrada (veja aba "Categorias")', 'Moradia'],
    ['Cartão', 'Nome do cartão (veja aba "Cartões"), ou vazio para conta/dinheiro', 'Nubank'],
    ['Parcelas', '1 ou vazio = à vista. 8 = 8x. (Apenas com cartão.)', '8'],
    ['Pago', 'Sim se já paga, Não ou vazio se pendente', 'Não'],
    ['Observações', 'Texto livre', 'Pago via PIX'],
    [''],
    ['DICAS:'],
    ['• Sistema aceita nomes aproximados (ex: "nubank" ou "nu" → "Nubank")'],
    ['• Sempre tem um preview antes de importar — você confere tudo'],
    ['• Duplicatas (mesma data + descrição + valor) são detectadas automaticamente'],
    ['• Apague as linhas de exemplo antes de subir!'],
  ];
  const wsHelp = arraysToSheet(helpData, [16, 50, 24]);

  // ── Monta o workbook ──────────────────────────────────────────────────
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsTx, 'Transações');
  XLSX.utils.book_append_sheet(wb, wsCats, 'Categorias');
  XLSX.utils.book_append_sheet(wb, wsCards, 'Cartões');
  XLSX.utils.book_append_sheet(wb, wsHelp, 'Como preencher');

  // Gera o arquivo binário (ArrayBuffer)
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/**
 * Exporta as transações (do mês ou todas) como Excel.
 * @param {Object} options - { startDate, endDate } opcionais
 */
export async function exportTransactionsXLSX({ startDate, endDate } = {}) {
  let query = supabase
    .from('transactions')
    .select(`*, category:categories(name), credit_card:credit_cards(name)`)
    .order('date', { ascending: false });

  if (startDate) query = query.gte('date', startDate);
  if (endDate) query = query.lte('date', endDate);

  const { data, error } = await query;
  if (error) throw error;

  const rows = [
    ['Tipo', 'Descrição', 'Valor', 'Data', 'Categoria', 'Cartão', 'Parcelas', 'Pago', 'Observações'],
  ];

  for (const t of data || []) {
    const tipo = t.type === 'income' ? 'Receita' : 'Despesa';
    const valor = Number(t.amount);
    // Converte string ISO em Date (timezone local pra evitar shift)
    let dateObj = '';
    if (t.date) {
      const [y, m, d] = t.date.slice(0, 10).split('-').map(Number);
      dateObj = new Date(y, m - 1, d);
    }
    const categoria = t.category?.name || '';
    const cartao = t.credit_card?.name || '';
    const parcelas = t.installment_total > 1
      ? `${t.installment_number}/${t.installment_total}`
      : '1';
    const pago = t.paid ? 'Sim' : 'Não';
    const obs = t.notes || '';

    rows.push([tipo, t.description || '', valor, dateObj, categoria, cartao, parcelas, pago, obs]);
  }

  const ws = arraysToSheet(rows, [12, 30, 14, 14, 22, 18, 10, 10, 30]);

  // Formatação numérica
  for (let r = 1; r < rows.length; r++) {
    const cellValor = XLSX.utils.encode_cell({ r, c: 2 });
    const cellData = XLSX.utils.encode_cell({ r, c: 3 });
    if (ws[cellValor]) ws[cellValor].z = '#,##0.00';
    if (ws[cellData]) ws[cellData].z = 'dd/mm/yyyy';
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Transações');

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return {
    blob: new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    count: data?.length || 0,
  };
}

/**
 * Lê um arquivo Excel/CSV e devolve as linhas em formato uniforme pra validação.
 *
 * Estratégia para evitar ambiguidades de formato:
 *   - Excel: usamos raw:true → números vêm como number, datas como Date
 *   - Convertemos datas para string DD/MM/YYYY (formato BR esperado pelo parser)
 *   - Mantemos números como number (parseMoney aceita number direto)
 *   - Strings (texto livre) ficam como string
 *
 * Por que NÃO raw:false:
 *   raw:false força XLSX a formatar números como string usando locale do JS
 *   (geralmente US: "254,400.00") — o que confunde a heurística de parseMoney.
 *   Com raw:true recebemos o valor numérico EXATO, sem ambiguidades.
 */
async function readSpreadsheetFile(file) {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });

  // Procura a aba "Transações" — se não existir, usa a primeira
  const sheetName = wb.SheetNames.find((n) => /transac/i.test(n)) || wb.SheetNames[0];
  if (!sheetName) throw new Error('Arquivo sem abas válidas.');

  const ws = wb.Sheets[sheetName];

  // raw: true mantém números e datas em seus tipos nativos (sem string ambígua)
  const rows = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: '',
    raw: true,
    blankrows: false,
  });

  // Converte cada célula para string preservando o significado:
  //   - Date     → "DD/MM/YYYY" (timezone-safe)
  //   - number   → string com vírgula como decimal (formato BR)
  //   - boolean  → "Sim"/"Não"
  //   - resto    → String(cell)
  return rows.map((row) =>
    (Array.isArray(row) ? row : []).map((cell) => {
      if (cell == null || cell === '') return '';

      // Date object → string BR (sem timezone shift)
      if (cell instanceof Date) {
        const dd = String(cell.getDate()).padStart(2, '0');
        const mm = String(cell.getMonth() + 1).padStart(2, '0');
        const yyyy = cell.getFullYear();
        return `${dd}/${mm}/${yyyy}`;
      }

      // Number → string em formato BR ("1234.56" → "1234,56")
      // Importante: NÃO adicionamos separador de milhar pra não confundir o parser
      if (typeof cell === 'number') {
        return String(cell).replace('.', ',');
      }

      // Boolean (raro no Excel mas possível)
      if (typeof cell === 'boolean') {
        return cell ? 'Sim' : 'Não';
      }

      return String(cell);
    })
  );
}

/**
 * Parseia um arquivo (.xlsx, .xls ou .csv) e retorna preview com validação.
 * Reaproveita TODA a lógica de parseImportCSV — apenas troca a leitura inicial.
 */
export async function parseImportSpreadsheet(file, ctx) {
  const isCSV = /\.csv$/i.test(file.name);

  if (isCSV) {
    // CSV: usa o caminho antigo (já existente)
    const text = await file.text();
    return parseImportCSV(text, ctx);
  }

  // Excel: lê com xlsx, depois reaproveita a validação convertendo
  // o array de arrays em CSV-like (joinando com vírgula com escape correto)
  const rows = await readSpreadsheetFile(file);

  // Filtra linhas vazias e linhas que começam com #
  const cleanRows = rows.filter((row) => {
    const first = (row[0] || '').trim();
    return row.some((c) => (c || '').trim() !== '') && !first.startsWith('#');
  });

  // Reconstrói como CSV pra reutilizar parseImportCSV (que já valida tudo)
  const csvText = cleanRows
    .map((row) => row.map(csvEscape).join(','))
    .join('\n');

  return parseImportCSV(csvText, ctx);
}

/** Helper pra disparar download de Blob como arquivo. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
