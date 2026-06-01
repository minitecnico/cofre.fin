import { supabase } from './supabase';

export async function sendAiMessage(messages, context) {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Sua sessão expirou. Entre novamente na sua conta.');
  }

  const response = await fetch('/api/ai-chat', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages, context }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Não foi possível conversar com a IA agora.');
  }

  return data.message;
}
