import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Joyride, { EVENTS, STATUS, ACTIONS } from 'react-joyride';

/**
 * TourContext — tour guiado interativo (onboarding) do app inteiro.
 * --------------------------------------------------------------
 * Usa react-joyride em modo CONTROLADO (run + stepIndex próprios) porque o
 * tour atravessa várias rotas. Cada passo declara a `route` onde mora; ao
 * avançar, navegamos e só mostramos o balão DEPOIS que a rota montou e o
 * elemento-alvo existe no DOM. Isso é essencial aqui: a transição de página
 * anima a saída (~0.26s, AnimatePresence) e algumas telas mostram skeleton
 * enquanto carregam — sem essa espera, o passo cairia em alvo inexistente.
 *
 * Roda automático na 1ª visita (flag no localStorage) e pode ser
 * re-disparado por useTour().start() (botão em Ajustes).
 */
const TourContext = createContext(null);
const STORAGE_KEY = 'cofre_tour_v3';

const STEPS = [
  {
    route: '/', target: 'body', placement: 'center',
    title: 'Bem-vindo ao Cofre 👋',
    content: 'Em menos de 1 minuto eu te mostro como o app funciona. Pode pular quando quiser.',
  },
  {
    route: '/', target: '[data-tour="month"]',
    title: 'O mês é o centro de tudo',
    content: 'Saldos, listas e gráficos respeitam o mês selecionado. Navegue ◀ ▶ pra ver outros meses sem perder contexto.',
  },
  {
    route: '/', target: '[data-tour="stats"]',
    title: 'Seu panorama do mês',
    content: 'Saldo, receitas e despesas. As cores mudam: ficam vermelhas quando você gasta mais do que ganha.',
  },
  {
    // FAB fica no canto inferior; balão vai ACIMA (top-end) pra não jogar os
    // botões Voltar/Próximo pra fora da viewport — senão não dá pra avançar.
    route: '/', target: '[data-tour="add-button"]', placement: 'top-end',
    title: 'Adicionar lançamento',
    content: 'O botão + cria receita ou despesa — com parcelamento, cartão de crédito e recorrência.',
  },
  {
    route: '/cards', target: '[data-tour="cards"]', placement: 'top',
    title: 'Seus cartões',
    content: 'Acompanhe fatura, limite e ciclo. Toque num cartão pra abrir as faturas e pagar.',
  },
  {
    route: '/recurring', target: '[data-tour="page-header"]',
    title: 'Recorrências',
    content: 'Cadastre contas que se repetem (aluguel, assinaturas). Elas entram sozinhas a cada novo mês.',
  },
  {
    route: '/goals', target: '[data-tour="page-header"]',
    title: 'Metas e desafios',
    content: 'Crie metas de economia, organize notas e acompanhe o desafio das 52 semanas.',
  },
  {
    route: '/cobrancas', target: '[data-tour="page-header"]',
    title: 'Cobranças — quem te deve',
    content: 'Cadastre quem te deve (até parcelado), marque o que já foi pago e cobre pelo WhatsApp. As pagas afundam pro fim; as em aberto ficam sempre no topo.',
  },
  {
    route: '/cobrancas', target: '[data-tour="page-header"]',
    title: 'PIX e relatório de cobrança',
    content: 'Cadastre suas chaves PIX pra gerar QR Code e link de pagamento. Selecione as cobranças em aberto pra mandar o PDF de quem te deve — ou desmarque as pagas pro relatório geral.',
  },
  {
    route: '/reports', target: '[data-tour="page-header"]',
    title: 'Relatórios do mês',
    content: 'Gere o resumo financeiro de qualquer mês (receitas, despesas, saldo) e compartilhe direto pelo WhatsApp.',
  },
  {
    route: '/ai', target: '[data-tour="page-header"]',
    title: 'Cofre IA',
    content: 'Um assistente que conhece suas finanças do mês. Pergunte onde você gastou mais, peça dicas de economia ou um resumo rápido.',
  },
  {
    route: '/settings', target: '[data-tour="link-accounts"]', placement: 'top',
    title: 'Conta e login Google',
    content: 'Vincule o Google pra entrar com um toque. Aqui também troca senha e exporta seus dados.',
  },
  {
    route: '/settings', target: 'body', placement: 'center',
    title: 'Pronto! 🎉',
    content: 'É isso. Você pode rever este tour quando quiser, aqui em Ajustes.',
  },
].map((s) => ({ disableBeacon: true, ...s }));

export function TourProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [pending, setPending] = useState(null); // índice aguardando rota/alvo montar

  const start = useCallback(() => {
    setRun(false);
    setStepIndex(0);
    if (location.pathname !== STEPS[0].route) navigate(STEPS[0].route);
    setPending(0);
  }, [location.pathname, navigate]);

  function finish() {
    setRun(false);
    setStepIndex(0);
    setPending(null);
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* ignora */ }
  }

  // Autostart só na 1ª visita.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { if (localStorage.getItem(STORAGE_KEY)) return; } catch { return; }
    const t = setTimeout(() => start(), 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Espera a rota correta + o alvo existir antes de exibir o passo pendente.
  useEffect(() => {
    if (pending == null) return;
    const step = STEPS[pending];
    if (!step) { setPending(null); return; }
    if (step.route && location.pathname !== step.route) return; // ainda navegando

    let tries = 0;
    const id = setInterval(() => {
      tries += 1;
      const ok = step.target === 'body' || document.querySelector(step.target);
      if (ok || tries > 25) { // ~3.5s de teto pra carregar
        clearInterval(id);
        setStepIndex(pending);
        setPending(null);
        setRun(true);
      }
    }, 140);
    return () => clearInterval(id);
  }, [pending, location.pathname]);

  const handleCallback = useCallback((data) => {
    const { action, index, status, type } = data;

    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) { finish(); return; }
    if (action === ACTIONS.CLOSE) { finish(); return; } // X fecha o tour

    if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
      const dir = action === ACTIONS.PREV ? -1 : 1;
      const next = index + dir;
      if (next < 0) { setStepIndex(0); return; }
      if (next >= STEPS.length) { finish(); return; }

      const nextStep = STEPS[next];
      setRun(false); // esconde enquanto navega/espera o alvo
      if (nextStep.route && nextStep.route !== location.pathname) navigate(nextStep.route);
      setPending(next);
    }
  }, [location.pathname, navigate]);

  return (
    <TourContext.Provider value={{ start }}>
      {children}
      <Joyride
        steps={STEPS}
        run={run}
        stepIndex={stepIndex}
        continuous
        showSkipButton
        showProgress
        disableScrollParentFix
        scrollOffset={90}
        callback={handleCallback}
        locale={{ back: 'Voltar', close: 'Fechar', last: 'Concluir', next: 'Próximo', skip: 'Pular' }}
        styles={{
          options: {
            primaryColor: '#9bc92e',
            textColor: '#27272a',
            backgroundColor: '#ffffff',
            arrowColor: '#ffffff',
            zIndex: 10000,
          },
          tooltip: { borderRadius: 16 },
          tooltipTitle: { fontWeight: 800 },
        }}
      />
    </TourContext.Provider>
  );
}

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour deve estar dentro de TourProvider');
  return ctx;
}
