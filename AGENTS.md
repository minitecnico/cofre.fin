# AGENTS.md — Mapa vivo do Cofre

> **Para o agente (Claude/IA):** este arquivo é o índice rápido de **rotas + funcionalidades + onde mora cada coisa**.
> **PROTOCOLO DE ATUALIZAÇÃO (obrigatório):** a cada mudança de rota, feature, service, tabela, RPC ou regra de negócio, **atualize este arquivo na mesma tarefa** — adicione/edite a linha relevante e registre no Changelog no fim. O objetivo é que ele fique cada vez mais inteligente e seja a primeira leitura antes de qualquer alteração.
> Convenções profundas (estilo, datas, dinheiro, design system, o que NÃO fazer) ficam no **[CLAUDE.md](CLAUDE.md)** — não duplicar aqui; só referenciar.

App de controle financeiro pessoal. **React puro + Supabase** (RLS é a segurança). PWA instalável. Deploy Vercel. Sem TypeScript, sem testes, sem state manager externo (só hooks + Context).

⚠️ **Exceção ao "sem backend":** existe **uma** função serverless `/api/ai-chat` (Vercel) usada só pelo Assistente IA. Todo o resto fala direto com o Supabase via services.

---

## Rotas

| Rota | Página | O que faz | Nav |
|---|---|---|---|
| `/login` | `Login.jsx` | login/registro, OAuth Google | pública |
| `/reset-password` | `ResetPassword.jsx` | recuperação de senha | pública |
| `/` | `Dashboard.jsx` | KPIs do mês, gráficos, comparação, alertas | Sidebar + BottomNav |
| `/incomes` | `TransactionListPage.jsx` (type=income) | lista/CRUD receitas | Sidebar + BottomNav |
| `/expenses` | `TransactionListPage.jsx` (type=expense) | lista/CRUD despesas, swipe-to-delete | Sidebar + BottomNav |
| `/recurring` | `Recurring.jsx` | modelos recorrentes (aluguel, assinaturas), lazy-gen por mês | Sidebar + "Mais" |
| `/cards` | `Cards.jsx` | cartões, faturas, ciclos, limite inteligente | Sidebar + BottomNav |
| `/cobrancas` | `Cobrancas.jsx` (lazy) | quem te deve, PIX/QR, WhatsApp, PDF, **parcelamento** | Sidebar + "Mais" |
| `/goals` | `Goals.jsx` | desafio 52 semanas, metas, notas | Sidebar + "Mais" |
| `/reports` | `Reports.jsx` (lazy) | relatório mensal PDF, link Storage, envio WhatsApp | Sidebar + "Mais" |
| `/categories` | `Categories.jsx` | CRUD categorias | Sidebar + "Mais" |
| `/ai` | `AiAssistant.jsx` | assistente IA (chat, análise de documentos, lançamentos por voz) | Sidebar + BottomNav |
| `/import-export` | `ImportExport.jsx` | CSV/XLSX import/export, backup JSON | via Settings |
| `/settings` | `Settings.jsx` | conta, senha, preferências | Sidebar + "Mais" |

**Navegação mobile:** `BottomNav` = 5 fixos (Início, Receitas, Despesas, Cartões, IA) + botão **"Mais"** (folha com Cobranças, Recorrências, Objetivos, Relatórios, Categorias, Ajustes). `Sidebar` (desktop) lista tudo.

---

## Funcionalidades por domínio

- **Saldo:** `saldo = Σ receitas − Σ despesas`. Toda despesa abate na hora, inclusive cartão (cartão é só etiqueta organizacional). Lógica em RPC SQL. Ver CLAUDE.md.
- **Mês como ciclo:** `MonthContext` é a fonte do mês selecionado (`'YYYY-MM'`). UI toda gira nele.
- **Parcelamento (despesas):** cada parcela = transação independente, `installment_group_id` compartilhado.
- **Recorrências:** templates em `recurring_transactions`, geração lazy ao abrir o mês (`useAutoRecurring`).
- **Cartões:** ciclo (`closing_day`/`due_day`), limite ocupado = compras **não pagas** do ciclo. RPCs `get_card_*`.
- **Alertas (sino):** `services/alerts.js` gera lista (vencidas, cartão alto, saldo negativo). Ações inline no painel: **Marcar paga**, **Adiar 3d** (snooze localStorage), **Ver**. Notificação nativa do navegador opt-in.
- **Relatórios:** `services/reports.js` → PDF (jsPDF+autotable) com KPIs/categorias/lançamentos. 3 formas de enviar: baixar, **Web Share** (anexo, mobile), **link assinado** (Supabase Storage bucket `reports`, ~90d) pra WhatsApp.
- **Cobranças:** `services/cobrancas.js` — devedores + dívidas (valor, vencimento, pago). **PIX** (`services/pix.js`: payload EMV BACEN + CRC16 + QR via lib `qrcode`; POI estático "11", chave normalizada por tipo, txid "***"). **Parcelamento** igual ao cartão. Cobrar via WhatsApp (msg pronta + PIX). Relatório PDF com links clicáveis (`cobrancasReport.js`).
- **Assistente IA:** `services/ai.js` chama `/api/ai-chat` (serverless, auth via token Supabase). Análise de documentos (`aiDocuments.js`: mammoth p/ DOCX, pdfjs p/ PDF). Lançamentos por voz/chat.
- **Import/Export:** `services/importExport.js` (CSV/XLSX), `services/backup.js` (JSON completo).
- **PWA:** `manifest.json`, install prompt (`useInstallPrompt`). Sem service worker de cache.

---

## Mapa de código

**Services** (`frontend/src/services/`): `index.js` (transactionService, categoryService, cardService, recurringService, dashboardService, loanService + `currentUserId`), `goals.js`, `alerts.js`, `reports.js`, `cobrancas.js` (debtorService, chargeService, settingsService), `cobrancasReport.js`, `pix.js`, `ai.js`, `aiDocuments.js`, `importExport.js`, `backup.js`, `supabase.js` (singleton).

**Hooks** (`frontend/src/hooks/`): `useDashboard`, `useTransactions`, `useAlerts`, `useCobrancas`, `useAutoRecurring`, `useDisclosure`, `useInstallPrompt`.

**Regra de arquitetura:** componentes NÃO importam `supabase` direto — sempre via service. Lógica de domínio pesada vai em RPC SQL. Páginas consomem hooks.

---

## Supabase

**Tabelas:** `categories`, `credit_cards`, `transactions`, `recurring_transactions`, `weekly_challenges`, `goals`, `notes`, `user_settings` (PIX), `debtors`, `charges`. Todas com RLS `auth.uid() = user_id`.

**Storage:** bucket privado `reports` (PDFs; signed URL). Policies por pasta `{user_id}/...`.

**RPCs principais:** `get_balance`, `get_period_summary`, `get_expenses_by_category`, `get_monthly_history`, `get_card_summary`, `get_card_bills`, `get_card_bill_transactions`, `pay_card_bill`, `get_balance_forecast`, `generate_recurring_for_month`, `get_debtors_summary`.

**Migrations** (`supabase/`, rodar em ordem; idempotentes): `schema.sql` + `migration_*.sql`. Aplicar via Dashboard SQL Editor ou `supabase db query --linked -f <arquivo>` (CLI logada). Projeto: `cofre` ref `lnkrplyghpukmovpzkea`.

---

## Changelog (alimentar a cada mudança)

- **2026-06-05** — Cobranças: módulo novo (devedores, dívidas, PIX/QR, WhatsApp, PDF) + parcelamento. Relatórios: PDF mensal + link via Storage + WhatsApp. Alertas: ações inline (pagar/adiar/ver). BottomNav: 5 + "Mais". Fix PIX: POI estático "11", normalização de chave, txid "***". Migrations: `migration_cobrancas.sql`, `migration_cobrancas_installments.sql`, `migration_reports_storage.sql`.
- _(commits anteriores: Assistente IA, Google OAuth, redesign Cartões, tour guiado, swipe-to-delete, recuperação de senha — ver `git log`.)_
