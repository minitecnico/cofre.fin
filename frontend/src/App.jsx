import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { MonthProvider } from './context/MonthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import TransactionListPage from './pages/TransactionListPage';
import Cards from './pages/Cards';
import Categories from './pages/Categories';
import Recurring from './pages/Recurring';
import Settings from './pages/Settings';
import Goals from './pages/Goals';
import Fipe from './pages/Fipe';
import ImportExport from './pages/ImportExport';
import PixPay from './pages/PixPay';

// Lazy: Cobranças carrega o jsPDF (pesado) — só baixa quando acessada.
const Cobrancas = lazy(() => import('./pages/Cobrancas'));
// Lazy: só o admin abre — fora do bundle de todo mundo.
const Admin = lazy(() => import('./pages/Admin'));
const Cotacao = lazy(() => import('./pages/Cotacao'));
// Lazy: página pública do devedor (puxa o gerador de QR) — fora do bundle do app.
const DebtorStatement = lazy(() => import('./pages/DebtorStatement'));
// Lazy: destino do "Compartilhar" do Android (comprovantes) — fora do bundle do app.
const ShareReceipt = lazy(() => import('./pages/ShareReceipt'));

export default function App() {
  return (
    <AuthProvider>
      <MonthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/pix/:code" element={<PixPay />} />
            <Route
              path="/compartilhar"
              element={
                <Suspense fallback={<div className="p-8 text-center text-ink-500 text-sm">Carregando…</div>}>
                  <ShareReceipt />
                </Suspense>
              }
            />
            <Route
              path="/extrato/:code"
              element={
                <Suspense fallback={<div className="p-8 text-center text-ink-500 text-sm">Carregando…</div>}>
                  <DebtorStatement />
                </Suspense>
              }
            />

            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="incomes" element={<TransactionListPage type="income" />} />
              <Route path="expenses" element={<TransactionListPage type="expense" />} />
              <Route path="recurring" element={<Recurring />} />
              <Route path="cards" element={<Cards />} />
              <Route path="categories" element={<Categories />} />
              <Route path="fipe" element={<Fipe />} />
              <Route path="settings" element={<Settings />} />
              <Route path="goals" element={<Goals />} />
              <Route
                path="cobrancas"
                element={
                  <Suspense fallback={<div className="p-8 text-center text-ink-500 text-sm">Carregando…</div>}>
                    <Cobrancas />
                  </Suspense>
                }
              />
              <Route path="import-export" element={<ImportExport />} />
              <Route
                path="cotacao"
                element={
                  <Suspense fallback={<div className="p-8 text-center text-ink-500 text-sm">Carregando…</div>}>
                    <Cotacao />
                  </Suspense>
                }
              />
              <Route
                path="admin"
                element={
                  <Suspense fallback={<div className="p-8 text-center text-ink-500 text-sm">Carregando…</div>}>
                    <Admin />
                  </Suspense>
                }
              />
            </Route>
          </Routes>
        </BrowserRouter>
      </MonthProvider>
    </AuthProvider>
  );
}
