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
import ImportExport from './pages/ImportExport';

export default function App() {
  return (
    <AuthProvider>
      <MonthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />

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
              <Route path="settings" element={<Settings />} />
              <Route path="goals" element={<Goals />} />
              <Route path="import-export" element={<ImportExport />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </MonthProvider>
    </AuthProvider>
  );
}
