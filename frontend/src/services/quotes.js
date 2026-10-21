import * as XLSX from 'xlsx';
import { supabase } from './supabase';
import { currentUserId } from './index';

/** Teto de linhas por cotação — acima disso a planilha pesa demais pra abrir. */
const MAX_ROWS = 5000;

/**
 * Lê a planilha no navegador: 1ª linha não vazia = cabeçalho, linhas em
 * branco somem. Devolve { columns, rows } com rows = array de arrays.
 */
export async function parseSpreadsheet(file) {
  let data;
  try {
    const buf = await file.arrayBuffer();
    const wb = /\.csv$/i.test(file.name) || file.type === 'text/csv'
      ? XLSX.read(decodeCsv(buf), { type: 'string' })
      : XLSX.read(buf, { type: 'array' });
    data = XLSX.utils
      .sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
      .filter((r) => r.some((c) => String(c).trim() !== ''));
  } catch {
    throw new Error('Não consegui ler esse arquivo. Use .xlsx, .xls ou .csv.');
  }
  if (!data.length) throw new Error('A planilha está vazia.');
  if (data.length - 1 > MAX_ROWS) throw new Error(`A planilha tem mais de ${MAX_ROWS} linhas.`);

  const columns = data[0].map((c, i) => String(c).trim() || `Coluna ${i + 1}`);
  const rows = data.slice(1).map((r) => columns.map((_, i) => String(r[i] ?? '')));
  return { columns, rows };
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
 * Cotações (tabela quotes — migration_quotes.sql). A lista não traz as
 * linhas (podem ser milhares); `get` traz a cotação inteira.
 */
export const quoteService = {
  async list() {
    const { data, error } = await supabase
      .from('quotes')
      .select('id, name, highlighted, created_at, updated_at')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async get(id) {
    const { data, error } = await supabase.from('quotes').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  },

  async create({ name, columns, rows }) {
    const userId = await currentUserId();
    const { data, error } = await supabase
      .from('quotes')
      .insert({ user_id: userId, name: name.slice(0, 200), columns, rows })
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },

  /** Grava quais linhas (índices) estão destacadas. */
  async setHighlighted(id, highlighted) {
    const { error } = await supabase
      .from('quotes')
      .update({ highlighted, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  async remove(id) {
    const { error } = await supabase.from('quotes').delete().eq('id', id);
    if (error) throw error;
  },
};
