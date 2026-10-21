import * as XLSX from 'xlsx';
import { supabase } from './supabase';
import { currentUserId } from './index';

/** Teto de linhas por cotação — acima disso a planilha pesa demais pra abrir. */
const MAX_ROWS = 5000;

/**
 * Lê a planilha no navegador e limpa o que planilha de cliente costuma ter:
 *   - linhas e colunas totalmente em branco somem;
 *   - títulos acima da tabela ("PREFEITURA…", "COTAÇÃO Nº…") são pulados:
 *     o cabeçalho é a 1ª linha "cheia" (≥ 60% da linha mais larga do topo);
 *   - cabeçalho repetido no meio (exportação com várias páginas) sai;
 *   - espaços sobrando nas células são removidos.
 * Valores vêm como aparecem no Excel (R$ 10,00, 21/10/2026). Devolve
 * { columns, rows } com rows = array de arrays de texto.
 */
export async function parseSpreadsheet(file) {
  let raw;
  try {
    const buf = await file.arrayBuffer();
    const wb = /\.csv$/i.test(file.name) || file.type === 'text/csv'
      ? XLSX.read(decodeCsv(buf), { type: 'string' })
      : XLSX.read(buf, { type: 'array' });
    raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false });
  } catch {
    throw new Error('Não consegui ler esse arquivo. Use .xlsx, .xls ou .csv.');
  }

  const lines = raw
    .map((r) => r.map((c) => String(c ?? '').replace(/\s+/g, ' ').trim()))
    .filter((r) => r.some(Boolean));
  if (!lines.length) throw new Error('A planilha está vazia.');

  const filled = (r) => r.filter(Boolean).length;
  const top = lines.slice(0, 30);
  const widest = Math.max(...top.map(filled));
  const headerAt = Math.max(0, top.findIndex((r) => filled(r) >= Math.max(2, Math.ceil(widest * 0.6))));
  const header = lines[headerAt];
  const sameAsHeader = (r) => r.join('|') === header.join('|');
  const body = lines.slice(headerAt + 1).filter((r) => !sameAsHeader(r));

  const width = Math.max(header.length, ...body.map((r) => r.length));
  const keep = [...Array(width).keys()].filter((i) => header[i] || body.some((r) => r[i]));
  const rows = body.map((r) => keep.map((i) => r[i] || '')).filter((r) => r.some(Boolean));

  if (!rows.length) throw new Error('Não achei itens abaixo do cabeçalho da planilha.');
  if (rows.length > MAX_ROWS) throw new Error(`A planilha tem mais de ${MAX_ROWS} itens.`);
  return { columns: keep.map((i, n) => header[i] || `Coluna ${n + 1}`), rows };
}

/**
 * CSV não diz a codificação: UTF-8 quando for válido; senão é o "ANSI" do
 * Excel no Windows (windows-1252). Sem isso os acentos viram "Ã§".
 */
function decodeCsv(buf) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

/**
 * Cotações (migration_quotes.sql). A lista não traz as linhas (podem ser
 * milhares). Destaque = um registro por linha em quote_marks: cada toque grava
 * só a sua linha, então várias pessoas na mesma conta não se sobrescrevem.
 */
export const quoteService = {
  /** Cotações com a contagem de itens destacados. */
  async list() {
    const { data, error } = await supabase
      .from('quotes')
      .select('id, name, created_at, updated_at, quote_marks(count)')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(({ quote_marks: m, ...q }) => ({ ...q, marks: m?.[0]?.count || 0 }));
  },

  /** Cotação inteira + índices das linhas destacadas. */
  async get(id) {
    const [quote, marks] = await Promise.all([
      supabase.from('quotes').select('*').eq('id', id).single(),
      supabase.from('quote_marks').select('row_index').eq('quote_id', id),
    ]);
    if (quote.error) throw quote.error;
    if (marks.error) throw marks.error;
    return { ...quote.data, highlighted: marks.data.map((m) => m.row_index) };
  },

  async create({ name, columns, rows }) {
    const userId = await currentUserId();
    const { data, error } = await supabase
      .from('quotes')
      .insert({ user_id: userId, name: name.slice(0, 200), columns, rows })
      .select('*')
      .single();
    if (error) throw error;
    return { ...data, highlighted: [] };
  },

  /** Destaca (on) ou tira o destaque de UMA linha. */
  async mark(quoteId, rowIndex, on) {
    const { error } = on
      ? await supabase.from('quote_marks').upsert(
        { quote_id: quoteId, row_index: rowIndex },
        { onConflict: 'quote_id,row_index', ignoreDuplicates: true },
      )
      : await supabase.from('quote_marks').delete().eq('quote_id', quoteId).eq('row_index', rowIndex);
    if (error) throw error;
  },

  async clearMarks(quoteId) {
    const { error } = await supabase.from('quote_marks').delete().eq('quote_id', quoteId);
    if (error) throw error;
  },

  async remove(id) {
    const { error } = await supabase.from('quotes').delete().eq('id', id);
    if (error) throw error;
  },

  /**
   * Destaques feitos em outros aparelhos, ao vivo: onMark(rowIndex, on).
   * DELETE no Realtime não aceita filtro — vem só a chave e conferimos aqui.
   */
  subscribe(quoteId, onMark) {
    const channel = supabase
      .channel(`quote_marks_${quoteId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'quote_marks', filter: `quote_id=eq.${quoteId}` },
        ({ new: m }) => onMark(m.row_index, true))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'quote_marks' },
        ({ old: m }) => { if (m?.quote_id === quoteId) onMark(m.row_index, false); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  },
};
