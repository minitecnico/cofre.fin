import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import GoogleIcon from '../components/GoogleIcon';

export default function Login() {
  const { user, login, register, requestPasswordReset, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);

  if (user) return <Navigate to="/" replace />;

  async function handleGoogle() {
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      await loginWithGoogle();
      // Redireciona para o Google; o retorno é tratado pelo onAuthStateChange.
    } catch (err) {
      setError(err.message || 'Erro ao entrar com Google');
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(form.email, form.password);
        navigate('/');
      } else if (mode === 'forgot') {
        await requestPasswordReset(form.email);
        // Mensagem genérica de propósito — não revela se o email existe.
        setInfo('Se existir uma conta com esse email, enviamos um link para redefinir a senha. Confira a caixa de entrada (e o spam).');
        setMode('login');
        setForm({ ...form, password: '' });
      } else {
        await register(form);
        navigate('/');
      }
    } catch (err) {
      // Erro especial: cadastro feito mas precisa confirmar email
      if (err.message === 'CONFIRM_EMAIL') {
        setInfo(
          'Conta criada! Verifique seu email para confirmar antes de fazer login.'
        );
        setMode('login');
        setForm({ ...form, password: '' });
      } else {
        setError(err.message || 'Erro ao autenticar');
      }
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
          <h2 className="font-display text-2xl md:text-3xl font-bold mb-1 md:mb-2">
            {mode === 'login' ? 'Bem-vindo de volta' : mode === 'forgot' ? 'Recuperar senha' : 'Criar conta'}
          </h2>
          <p className="text-xs md:text-sm text-ink-500 mb-5 md:mb-6">
            {mode === 'login'
              ? 'Entre para acessar seu painel'
              : mode === 'forgot'
                ? 'Digite seu email e enviaremos um link para criar uma nova senha.'
                : 'Comece a organizar suas finanças hoje'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="label">Nome</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input-field"
                  required
                  autoFocus
                  autoComplete="name"
                />
              </div>
            )}

            <div>
              <label className="label">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="input-field"
                required
                autoFocus={mode === 'login'}
                autoComplete="email"
                inputMode="email"
              />
            </div>

            {mode !== 'forgot' && (
              <div>
                <div className="flex items-baseline justify-between">
                  <label className="label">Senha</label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => { setMode('forgot'); setError(null); setInfo(null); }}
                      className="text-xs font-semibold text-ink-500 hover:text-accent-dark"
                    >
                      Esqueci minha senha
                    </button>
                  )}
                </div>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="input-field"
                  required
                  minLength={6}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
              </div>
            )}

            {info && (
              <div className="px-4 py-3 bg-yellow-50 border-2 border-warn text-yellow-900 text-sm">
                {info}
              </div>
            )}

            {error && (
              <div className="px-4 py-3 bg-red-50 border-2 border-negative text-negative text-sm">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-accent w-full disabled:opacity-60">
              {loading ? 'Aguarde…' : mode === 'login' ? 'Entrar' : mode === 'forgot' ? 'Enviar link' : 'Criar conta'}
            </button>
          </form>

          {mode !== 'forgot' && (
            <>
              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-ink-200" />
                <span className="text-[10px] uppercase tracking-widest text-ink-400 font-semibold">ou</span>
                <div className="flex-1 h-px bg-ink-200" />
              </div>

              <button
                type="button"
                onClick={handleGoogle}
                disabled={loading}
                className="btn-ghost w-full flex items-center justify-center gap-3 disabled:opacity-60"
              >
                <GoogleIcon className="w-5 h-5" />
                <span>Continuar com Google</span>
              </button>
            </>
          )}

          <div className="mt-5 md:mt-6 pt-5 md:pt-6 border-t border-ink-200 text-center text-sm">
            {mode === 'forgot' ? (
              <>
                Lembrou da senha?{' '}
                <button
                  onClick={() => { setMode('login'); setError(null); setInfo(null); }}
                  className="font-semibold underline decoration-2 decoration-accent underline-offset-4 hover:text-accent-dark"
                >
                  Voltar ao login
                </button>
              </>
            ) : mode === 'login' ? (
              <>
                Não tem conta?{' '}
                <button
                  onClick={() => { setMode('register'); setError(null); setInfo(null); }}
                  className="font-semibold underline decoration-2 decoration-accent underline-offset-4 hover:text-accent-dark"
                >
                  Criar agora
                </button>
              </>
            ) : (
              <>
                Já tem conta?{' '}
                <button
                  onClick={() => { setMode('login'); setError(null); setInfo(null); }}
                  className="font-semibold underline decoration-2 decoration-accent underline-offset-4 hover:text-accent-dark"
                >
                  Fazer login
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
