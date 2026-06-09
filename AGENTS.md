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
| `/r/:code` | `RedirectLink.jsx` | encurtador: resolve código → redireciona pro PDF | pública |
| `/pix/:code` | `PixPay.jsx` | página de pagamento PIX (QR + copia-e-cola + valor) | pública |
| `/` | `Dashboard.jsx` | KPIs do mês, gráficos, comparação, alertas | Sidebar + BottomNav |
| `/incomes` | `TransactionListPage.jsx` (type=income) | lista/CRUD receitas | Sidebar + BottomNav |
| `/expenses` | `TransactionListPage.jsx` (type=expense) | lista/CRUD despesas, swipe-to-delete | Sidebar + BottomNav |
| `/recurring` | `Recurring.jsx` | modelos recorrentes (aluguel, assinaturas), lazy-gen por mês | Sidebar + "Mais" |
| `/cards` | `Cards.jsx` | cartões, faturas, ciclos, limite inteligente | Sidebar + BottomNav |
| `/cobrancas` | `Cobrancas.jsx` (lazy) | quem te deve, PIX/QR, WhatsApp, PDF, **parcelamento** | Sidebar + "Mais" |
| `/goals` | `Goals.jsx` | desafio 52 semanas, metas, notas | Sidebar + "Mais" |
| `/empregos` | `Empregos.jsx` | buscador de vagas (multi-fonte), filtros, favoritos | Sidebar + "Mais" |
| `/reports` | `Reports.jsx` (lazy) | relatório mensal PDF, link Storage, envio WhatsApp | Sidebar + "Mais" |
| `/categories` | `Categories.jsx` | CRUD categorias | Sidebar + "Mais" |
| `/ai` | `AiAssistant.jsx` | assistente IA (chat, análise de documentos, lançamentos por voz) | Sidebar + BottomNav |
| `/import-export` | `ImportExport.jsx` | CSV/XLSX import/export, backup JSON | via Settings |
| `/settings` | `Settings.jsx` | conta, senha, preferências | Sidebar + "Mais" |

**Navegação mobile:** `BottomNav` = 5 fixos (Início, Receitas, Despesas, Cartões, IA) + botão **"Mais"** (folha com Cobranças, Recorrências, Objetivos, Vagas, Categorias, Ajustes). `Sidebar` (desktop) lista tudo.

---

## Funcionalidades por domínio

- **Saldo:** `saldo = Σ receitas − Σ despesas`. Toda despesa abate na hora, inclusive cartão (cartão é só etiqueta organizacional). Lógica em RPC SQL. Ver CLAUDE.md.
- **Mês como ciclo:** `MonthContext` é a fonte do mês selecionado (`'YYYY-MM'`). UI toda gira nele.
- **Parcelamento (despesas):** cada parcela = transação independente, `installment_group_id` compartilhado.
- **Recorrências:** templates em `recurring_transactions`, geração lazy ao abrir o mês (`useAutoRecurring`).
- **Cartões:** ciclo (`closing_day`/`due_day`), limite ocupado = compras **não pagas** do ciclo. RPCs `get_card_*`.
- **Alertas (sino):** `services/alerts.js` gera lista (vencidas, cartão alto, saldo negativo). Ações inline no painel: **Marcar paga**, **Adiar 3d** (snooze localStorage), **Ver**. Notificação nativa do navegador opt-in.
- **Relatórios:** `services/reports.js` → PDF (jsPDF+autotable) com KPIs/categorias/lançamentos. 3 formas de enviar: baixar, **Web Share** (anexo, mobile), **link curto** pra WhatsApp. Link: PDF no Storage `reports` (signed URL ~90d) + código curto em `report_links` → compartilha `<dominio>/r/<code>` (rota pública resolve via RPC `resolve_report_link` e redireciona).
- **Cobranças:** `services/cobrancas.js` — devedores + dívidas (valor, vencimento, pago; **editar** via `EditChargeModal`). **Múltiplas chaves PIX** (`pixKeyService` → tabela `pix_keys`, com padrão). **PIX** (`services/pix.js`: payload EMV BACEN + CRC16 + QR via lib `qrcode`; POI estático "11", chave normalizada por tipo, txid "***"). **Link de pagamento** (`pixLinkService.createPaymentLink`): gera QR PNG → bucket público `pix-qr` → `pix_links` → compartilha `<dominio>/pix/<code>` (página `PixPay` pública resolve via RPC `resolve_pix_link`). **Parcelamento** igual ao cartão. Cobrar via WhatsApp (msg + link). Relatório PDF com links clicáveis (`cobrancasReport.js`).
- **Assistente IA:** `services/ai.js` chama `/api/ai-chat` (serverless, auth via token Supabase). Análise de documentos (`aiDocuments.js`: mammoth p/ DOCX, pdfjs p/ PDF). Lançamentos por voz/chat.
- **Buscador de Vagas:** `services/jobs.js` (`jobService.search` chama `/api/jobs`; `savedJobService` p/ favoritos). Engine no **serverless** `frontend/api/jobs.js` (mesmo molde do ai-chat: auth Supabase + proxy — resolve CORS e esconde chaves). Providers **plugáveis** num array (`{ name, search }`), rodam **em paralelo** com timeout 8s e dedup por `title|company|location`; falha de 1 não derruba a busca. Fontes grátis sem chave: **GitHub Vagas BR** (issues dos repos `frontendbr/vagas`, `backend-br/vagas`, etc. — vagas brasileiras em PT; `GITHUB_TOKEN` opcional sobe rate limit 60→5000/h), **Remotive**, **Arbeitnow**. Provider **Adzuna BR** já implementado mas **inerte** até existir `ADZUNA_APP_ID` + `ADZUNA_APP_KEY` (tier grátis) — `enabled()` pula o provider sem chave. Cobre vagas BR não-tech. **Jobicy**, **Himalayas** e **The Muse** (remoto/global, grátis, sem chave — `THEMUSE_API_KEY` opcional só sobe rate limit) sempre ativos. **Jooble** (agregador BR de vários boards, inclui estilo TrabalhaBrasil/Catho) implementado mas inerte até `JOOBLE_API_KEY` (grátis). Sites BR sem API (TrabalhaBrasil/Catho/Vagas.com/Gupy) **não** dá pra integrar direto — só via agregadores (Jooble/Adzuna). JSearch fica plugável p/ depois. Cache "5 min" via `useJobSearch` (sessionStorage TTL, no lugar de React Query); buscas recentes também no sessionStorage. Favoritos em `saved_jobs`. ⚠️ Rodar `migration_jobs.sql`.
- **Import/Export:** `services/importExport.js` (CSV/XLSX), `services/backup.js` (JSON completo).
- **PWA:** `manifest.json`, install prompt (`useInstallPrompt`). Sem service worker de cache.

---

## Mapa de código

**Services** (`frontend/src/services/`): `index.js` (transactionService, categoryService, cardService, recurringService, dashboardService, loanService + `currentUserId`), `goals.js`, `alerts.js`, `reports.js`, `cobrancas.js` (debtorService, chargeService, settingsService), `cobrancasReport.js`, `pix.js`, `ai.js`, `aiDocuments.js`, `jobs.js` (jobService, savedJobService), `importExport.js`, `backup.js`, `supabase.js` (singleton).

**Serverless** (`frontend/api/`): `ai-chat.js` (proxy IA 9Router), `jobs.js` (engine de busca de vagas, providers plugáveis). Ambos autenticam via token Supabase.

**Hooks** (`frontend/src/hooks/`): `useDashboard`, `useTransactions`, `useAlerts`, `useCobrancas`, `useAutoRecurring`, `useDisclosure`, `useInstallPrompt`, `useJobSearch` (cache TTL), `useSavedJobs`.

**Regra de arquitetura:** componentes NÃO importam `supabase` direto — sempre via service. Lógica de domínio pesada vai em RPC SQL. Páginas consomem hooks.

---

## Supabase

**Tabelas:** `categories`, `credit_cards`, `transactions`, `recurring_transactions`, `weekly_challenges`, `goals`, `notes`, `user_settings` (legado, chave única), `debtors`, `charges`, `report_links` (encurtador PDF), `pix_keys` (múltiplas chaves PIX), `pix_links` (links de pagamento), `saved_jobs` (vagas favoritadas). Todas com RLS `auth.uid() = user_id`.

**Storage:** bucket privado `reports` (PDFs; signed URL) + bucket **público** `pix-qr` (imagens de QR PIX). Policies de escrita por pasta `{user_id}/...`.

**RPCs principais:** `get_balance`, `get_period_summary`, `get_expenses_by_category`, `get_monthly_history`, `get_card_summary`, `get_card_bills`, `get_card_bill_transactions`, `pay_card_bill`, `get_balance_forecast`, `generate_recurring_for_month`, `get_debtors_summary`, `resolve_report_link` + `resolve_pix_link` (SECURITY DEFINER, pública/anon).

**Migrations** (`supabase/`, rodar em ordem; idempotentes): `schema.sql` + `migration_*.sql`. Aplicar via Dashboard SQL Editor ou `supabase db query --linked -f <arquivo>` (CLI logada). Projeto: `cofre` ref `lnkrplyghpukmovpzkea`.

---

## Changelog (alimentar a cada mudança)

- **2026-06-09** — +2 fontes de vaga grátis SEM chave: **Himalayas** (board remoto, >100k vagas; salário omitido por ser anual em moeda estrangeira) e **The Muse** (board global; suporta filtro `location`, `THEMUSE_API_KEY` opcional só p/ rate limit). Sempre ativas. RemoteOK avaliado mas descartado (Cloudflare bloqueia + overlap c/ Remotive/Jobicy). Engine agora: GitHub BR, Adzuna BR, Jooble, Remotive, Arbeitnow, Jobicy, Himalayas, The Muse.
- **2026-06-08** — +2 fontes de vaga: **Jobicy** (remoto, grátis, sem chave — sempre ativo) e **Jooble** (agregador BR de muitos boards, gated por `JOOBLE_API_KEY` grátis — inerte sem chave). Sites BR sem API pública (TrabalhaBrasil/Catho/etc.) não são integráveis direto (scraping frágil/ToS); cobertura BR vem de agregadores (Adzuna/Jooble). Engine agora: GitHub BR, Adzuna BR, Jooble, Remotive, Arbeitnow, Jobicy.
- **2026-06-08** — Provider **Adzuna BR** (vagas BR não-tech) no `api/jobs.js`, com gate `enabled()`: roda só se `ADZUNA_APP_ID`+`ADZUNA_APP_KEY` (tier grátis) existirem nas env vars da Vercel; inerte sem chave, não quebra. Handler filtra providers habilitados.
- **2026-06-08** — Vagas BR + tour: provider **GitHub Vagas BR** (issues de repos de vaga da comunidade dev BR — vagas em português) adicionado ao `api/jobs.js`, primeiro na ordem. Passo do tour pra `/empregos` (`TourContext`, `STORAGE_KEY` → `cofre_tour_v3` re-dispara p/ todos) + anchor `data-tour="page-header"` em `Empregos.jsx`. `GITHUB_TOKEN` opcional pra rate limit.
- **2026-06-08** — Módulo **Buscador de Vagas** (`/empregos`): engine serverless `frontend/api/jobs.js` com providers plugáveis (Remotive + Arbeitnow, grátis sem chave) rodando em paralelo c/ timeout + dedup + fallback resiliente; normalização pro formato `Job`. Front: `services/jobs.js`, `hooks/useJobSearch` (cache 5min sessionStorage, sem React Query) + `useSavedJobs` (otimista), página `Empregos.jsx` (abas Buscar/Salvos, filtros avançados, skeletons, estados vazio/erro, buscas recentes), `JobCard.jsx` + `JobFilters.jsx`. Favoritos em `saved_jobs` (RLS padrão). Item de menu em Sidebar + "Mais". ⚠️ Rodar `migration_jobs.sql` e fazer deploy (function serverless nova). Adzuna/JSearch ficam plugáveis p/ ligar depois com env vars na Vercel.
- **2026-06-08** — Gráficos refatorados (`Charts.jsx`): visual minimalista, cores seguem semântica receita=verde/despesa=vermelho, rótulos de valor fixos nas barras (lê sem hover), wrapper polimórfico `ChartCard`.
- **2026-06-05** — UX Cobranças/nav: barra de seleção agora é **flutuante** (fixa acima da BottomNav, sempre visível — seleção elevada à página, age sobre 1 devedor por vez); botões "Cobrança"/"Pessoa" com **texto sempre visível** no PWA; **BottomNav primário** = Início, Receitas, Despesas, Cobranças, Relatórios (Cartões/IA/Recorrências/Objetivos/Categorias/Ajustes vão pro "Mais").

- **2026-06-05** — Cobranças (lembretes + alertas): rastreio de envio pra **não cobrar a mesma pessoa 2-3x**. Migration `migration_cobrancas_reminders.sql` adiciona `charges.last_charged_at` + `charged_count`, RPC `mark_charges_sent(p_ids)` e recria `get_debtors_summary` com `last_charged_at`. Ao **Cobrar** (WhatsApp) ou enviar **link PIX**, marca as dívidas abertas como cobradas (`chargeService.markCharged` / hook `markCharged`). UI: **selo** "Cobrado hoje/há Xd / Nunca cobrado" (neutro→verde→âmbar), **esquema de cores por urgência** (borda do card: vencido vermelho, vence-em-breve âmbar, quitado verde), **painel de alertas** "Pra cobrar" (vencidos/vencendo, ordenados, com botão Cobrar) e **notificação de navegador** opt-in (1x/dia se há vencidas). ⚠️ Rodar a migration no Supabase.

- **2026-06-05** — Tour guiado atualizado (`TourContext.jsx`, `STORAGE_KEY` → `cofre_tour_v2` re-dispara p/ todos): novos passos **Cobranças** (devedores, parcelamento, pagas afundam), **PIX/relatório de cobrança**, **Relatórios** e **Cofre IA**. Anchors `data-tour="page-header"` adicionados em `Cobrancas.jsx`, `Reports.jsx`, `AiAssistant.jsx`.

- **2026-06-05** — Cobranças (ordenação): cobranças **pagas afundam** — blocos totalmente quitados vão pro fim, abertos ficam no topo (`groupCharges` faz sort estável por `every(c.paid)`). Desmarcar volta a cobrança pro topo. Fluxo de relatório: seleciona as em aberto → PDF "em aberto"; pra relatório geral, basta desmarcar as pagas.

- **2026-06-05** — Cobranças (organização): cada cobrança vira um **bloco** visual separado (`ChargeBlock`); parcelamento = um bloco agrupado por `installment_group_id` com cabeçalho (base, Nx, total, pagas) e as parcelas dentro.

- **2026-06-05** — Cobranças (funcional): cadastrar cobrança no topo (botão "Cobrança" → `CobrancaQuickForm`); **multi-seleção** de cobranças/parcelas (checkbox + selecionar todas) com barra em lote: **PIX das selecionadas** (soma → QR → link → WhatsApp), **PDF das selecionadas** e **excluir em lote** (`chargeService.removeMany` / hook `removeCharges`). Editar via canetinha (já existia).

- **2026-06-05** — PIX inteligente: **múltiplas chaves** (`pix_keys` + `PixKeysModal`, com padrão) e **link de pagamento** — QR vira imagem PNG no bucket público `pix-qr`, link curto `<dominio>/pix/<code>` → página pública `PixPay` (`/pix/:code`) onde a pessoa paga. Tabela `pix_links` + RPC `resolve_pix_link`. Migration: `migration_pix_keys_links.sql`.

- **2026-06-05** — Cobranças: editar cobrança lançada (canetinha → `EditChargeModal`, `chargeService.update` via hook `updateCharge`).

- **2026-06-05** — UI: removido o spinner nativo feio de `input[type=number]` (CSS global em `styles/index.css`); parcelas usam `Stepper.jsx` (−/+) reutilizável.

- **2026-06-05** — Encurtador de link: rota pública `/r/:code` (`RedirectLink.jsx`) + tabela `report_links` + RPC `resolve_report_link`. Relatório agora compartilha link curto no domínio próprio. Migration: `migration_report_links.sql`.
- **2026-06-05** — FAB ("+"): seletor Transação | **Cobrança** (`CobrancaQuickForm.jsx`, escolhe/cria devedor + parcela), lançar cobrança de qualquer tela.
- **2026-06-05** — Cobranças: módulo novo (devedores, dívidas, PIX/QR, WhatsApp, PDF) + parcelamento. Relatórios: PDF mensal + link via Storage + WhatsApp. Alertas: ações inline (pagar/adiar/ver). BottomNav: 5 + "Mais". Fix PIX: POI estático "11", normalização de chave, txid "***". Migrations: `migration_cobrancas.sql`, `migration_cobrancas_installments.sql`, `migration_reports_storage.sql`.
- _(commits anteriores: Assistente IA, Google OAuth, redesign Cartões, tour guiado, swipe-to-delete, recuperação de senha — ver `git log`.)_
