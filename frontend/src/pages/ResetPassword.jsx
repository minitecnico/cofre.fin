import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wallet, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

/**
 * Página de redefinição de senha (rota pública /reset-password).
 * --------------------------------------------------------------
 * O usuário chega aqui pelo link do email de recuperação. O supabase-js lê
 * o token da URL automaticamente (detectSessionInUrl) e cria uma sessão de
 * recuperação — basta então definir a nova senha via updateUser.
 *
 * Estilo alinhado ao Login (telas de auth compartilham a mesma identidade).
 */
export default function ResetPassword() {
  const { updatePassword } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  // Após sucesso, redireciona pro painel (já está logado pela sessão de recuperação).
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => navigate('/'), 1800);
    return () => clearTimeout(t);
  }, [done, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('A senha deve ter ao menos 6 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('As senhas não conferem.');
      return;
    }

    setLoading(true);
    try {
      await updatePassword(password);
      setDone(true);
    } catch (err) {
      setError(
        err.message ||
          'Não foi possível redefinir. O link pode ter expirado — solicite um novo na tela de login.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md">
        {/* Logo de topo */}
        <div className="flex items-center gap-3 mb-6 md:mb-8">
          <div className="w-11 h-11 md:w-12 md:h-12 bg-accent flex items-center justify-center border-2 border-ink-900 shadow-flat-sm flex-shrink-0">
            <Wallet className="w-5 h-5 md:w-6 md:h-6 text-ink-900" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-bold leading-none">Cofre</h1>
            <p className="text-[10px] md:text-xs uppercase tracking-widest text-ink-500 mt-1">
              Controle financeiro pessoal
            </p>
          </div>
        </div>

        <div className="card-flat p-5 md:p-8">
          {done ? (
            <div className="text-center py-4">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-positive/10 flex items-center justify-center">
                <ShieldCheck className="w-7 h-7 text-positive" strokeWidth={2.25} />
              </div>
              <h2 className="font-display text-2xl font-bold mb-1">Senha redefinida</h2>
              <p className="text-sm text-ink-500">Levando você ao painel…</p>
            </div>
          ) : (
            <>
              <h2 className="font-display text-2xl md:text-3xl font-bold mb-1 md:mb-2">
                Nova senha
              </h2>
              <p className="text-xs md:text-sm text-ink-500 mb-5 md:mb-6">
                Crie uma nova senha para acessar sua conta.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="label">Nova senha</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-field"
                    required
                    minLength={6}
                    autoFocus
                    autoComplete="new-password"
                  />
                </div>

                <div>
                  <label className="label">Confirmar senha</label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="input-field"
                    required
                    minLength={6}
                    autoComplete="new-password"
                  />
                </div>

                {error && (
                  <div className="px-4 py-3 bg-red-50 border-2 border-negative text-negative text-sm">
                    {error}
                  </div>
                )}

                <button type="submit" disabled={loading} className="btn-accent w-full disabled:opacity-60">
                  {loading ? 'Salvando…' : 'Redefinir senha'}
                </button>
              </form>

              <div className="mt-5 md:mt-6 pt-5 md:pt-6 border-t border-ink-200 text-center text-sm">
                <button
                  onClick={() => navigate('/login')}
                  className="font-semibold underline decoration-2 decoration-accent underline-offset-4 hover:text-accent-dark"
                >
                  Voltar ao login
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
