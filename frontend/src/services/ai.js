import { supabase } from './supabase';

/**
 * Base da função serverless do assistente.
 *
 * Na web (Vercel) a função vive na mesma origem, então caminho relativo basta.
 * Dentro do app Android (Capacitor) a origem passa a ser `https://localhost`,
 * onde `/api/ai-chat` não existe — aí é obrigatório apontar para o domínio
 * publicado via VITE_API_BASE_URL (sem barra no final).
 */
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

export async function sendAiMessage(messages, context, documents = []) {
  const data = await aiRequest({ messages, context, documents });
  return data.message;
}

export async function requestAiTask(type, input, context) {
  const data = await aiRequest({ task: { type, input, context } });
  return data.data;
}

async function aiRequest(body) {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Sua sessão expirou. Entre novamente na sua conta.');
  }

  const response = await fetch(`${API_BASE_URL}/api/ai-chat`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Não foi possível conversar com a IA agora.');
  }

  return data;
}
