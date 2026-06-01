import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';

const AuthContext = createContext(null);

/**
 * AuthProvider — envolve o app e expõe estado de autenticação.
 * --------------------------------------------------------------
 * Supabase Auth cuida de:
 *  - Persistência da sessão (localStorage)
 *  - Refresh do token automaticamente
 *  - Evento onAuthStateChange (login, logout, refresh)
 *
 * Aqui só precisamos escutar esse evento e expor user/loading.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Carrega sessão atual (se já estiver logado, vem instantâneo do localStorage)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Escuta mudanças (login/logout em outras abas, refresh, etc)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.user;
  }

  async function register({ name, email, password }) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name }, // armazena no user_metadata
      },
    });
    if (error) throw error;

    // Se o projeto exigir confirmação por email, data.session será null.
    // Avisamos o usuário pra clicar no link recebido.
    if (!data.session) {
      throw new Error('CONFIRM_EMAIL');
    }
    return data.user;
  }

  async function logout() {
    await supabase.auth.signOut();
    setUser(null);
  }

  /**
   * Dispara o email de recuperação de senha. O Supabase manda um link com
   * token; ao clicar, o usuário cai em /reset-password com uma sessão de
   * recuperação ativa (evento PASSWORD_RECOVERY) e então define a nova senha.
   *
   * O redirectTo precisa estar cadastrado em Auth → URL Configuration no painel.
   */
  async function requestPasswordReset(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
  }

  /**
   * Define a nova senha do usuário logado (ou na sessão de recuperação).
   * Usado tanto no fluxo "esqueci a senha" quanto no trocar-senha de Settings.
   */
  async function updatePassword(newPassword) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  }

  // Wrapper para extrair nome amigável (vem do user_metadata)
  const userInfo = user
    ? {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.name || user.email?.split('@')[0] || 'Usuário',
      }
    : null;

  return (
    <AuthContext.Provider value={{ user: userInfo, loading, login, register, logout, requestPasswordReset, updatePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve estar dentro de AuthProvider');
  return ctx;
}
