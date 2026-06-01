import { Outlet, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import Sidebar from './Sidebar';
import MobileHeader from './MobileHeader';
import BottomNav from './BottomNav';
import FloatingAddButton from './FloatingAddButton';
import Toast from './Toast';
import { useAutoRecurring } from '../hooks/useAutoRecurring';
import { TourProvider } from '../context/TourContext';

export default function Layout() {
  const [tick, setTick] = useState(0);
  const { created, ack } = useAutoRecurring();
  const [toastMessage, setToastMessage] = useState(null);
  const location = useLocation();
  const reduceMotion = useReducedMotion();

  // Quando o hook detecta novas recorrências geradas, mostra toast e força refresh
  useEffect(() => {
    if (created > 0) {
      const word = created === 1 ? 'recorrência adicionada' : 'recorrências adicionadas';
      setToastMessage(`✨ ${created} ${word} a este mês`);
      ack();
      // Força re-render dos filhos pra mostrar as novas transações
      setTick((t) => t + 1);
    }
  }, [created, ack]);

  return (
    <TourProvider>
    <div className="min-h-screen md:flex">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <MobileHeader />
        <main className="flex-1 p-4 sm:p-5 md:p-6 lg:p-8 pb-24 md:pb-8 max-w-[1400px] w-full mx-auto md:mx-0">
          {reduceMotion ? (
            <Outlet key={tick} />
          ) : (
            // Transição entre telas: keyed por pathname (troca de rota anima;
            // o `tick` de refresh silencioso fica no Outlet interno, sem reanimar).
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 16, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.99 }}
                transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
              >
                <Outlet key={tick} />
              </motion.div>
            </AnimatePresence>
          )}
        </main>
      </div>

      <BottomNav />
      <FloatingAddButton onAdded={() => setTick((t) => t + 1)} />

      <Toast message={toastMessage} onClose={() => setToastMessage(null)} />
    </div>
    </TourProvider>
  );
}
