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
| `/extrato/:code` | `DebtorStatement.jsx` (lazy) | extrato do DEVEDOR, ao vivo: total, pago, a pagar, parcelas, PIX do saldo | pública |
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

**Navegação mobile:** `BottomNav` = 5 fixos (Início, Receitas, Despesas, Cartões, IA) + botão **"Mais"** (folha com Cobranças, Recorrências, Objetivos, Categorias, Ajustes). `Sidebar` (desktop) lista tudo.

---

## Funcionalidades por domínio

- **Saldo:** `saldo = Σ receitas − Σ despesas`. Toda despesa abate na hora, inclusive cartão (cartão é só etiqueta organizacional). Lógica em RPC SQL. Ver CLAUDE.md.
- **Mês como ciclo:** `MonthContext` é a fonte do mês selecionado (`'YYYY-MM'`). UI toda gira nele.
- **Parcelamento (despesas):** cada parcela = transação independente, `installment_group_id` compartilhado.
- **Recorrências:** templates em `recurring_transactions`, geração lazy ao abrir o mês (`useAutoRecurring`).
- **Cartões:** ciclo (`closing_day`/`due_day`), limite ocupado = compras **não pagas** do ciclo. RPCs `get_card_*`.
- **Alertas (sino):** `services/alerts.js` gera lista (vencidas, cartão alto, saldo negativo). Ações inline no painel: **Marcar paga**, **Adiar 3d** (snooze localStorage), **Ver**. Notificação nativa do navegador opt-in.
- **Relatórios:** `services/reports.js` → PDF (jsPDF+autotable) com KPIs/categorias/lançamentos. 3 formas de enviar: baixar, **Web Share** (anexo, mobile), **link curto** pra WhatsApp. Link: PDF no Storage `reports` (signed URL ~90d) + código curto em `report_links` → compartilha `<dominio>/r/<code>` (rota pública resolve via RPC `resolve_report_link` e redireciona).
- **Cobranças:** `services/cobrancas.js` — devedores + dívidas (valor, vencimento, pago; **editar** via `EditChargeModal`; **cartão opcional** via `charges.credit_card_id` → tarja colorida `CardTag` + `CardSelect` em `components/CardTag.jsx`, cartões via `cardService.listSimple`). **Múltiplas chaves PIX** (`pixKeyService` → tabela `pix_keys`, com padrão). **PIX** (`services/pix.js`: payload EMV BACEN + CRC16 + QR via lib `qrcode`; POI estático "11", chave normalizada por tipo, txid "***"). **Link de pagamento** (`pixLinkService.createPaymentLink`): gera QR PNG → bucket público `pix-qr` → `pix_links` → compartilha `<dominio>/pix/<code>` (página `PixPay` pública resolve via RPC `resolve_pix_link`). **Parcelamento** igual ao cartão. Cobrar via WhatsApp (msg + link). Relatório PDF com links clicáveis (`cobrancasReport.js`).
- **Assistente IA:** `services/ai.js` chama `/api/ai-chat` (serverless, auth via token Supabase). Análise de documentos (`aiDocuments.js`: mammoth p/ DOCX, pdfjs p/ PDF). Lançamentos por voz/chat.
- **Import/Export:** `services/importExport.js` (CSV/XLSX).
- **PWA:** `manifest.json`, install prompt (`useInstallPrompt`). Sem service worker de cache.

---

## Mapa de código

**Services** (`frontend/src/services/`): `index.js` (transactionService, categoryService, cardService, recurringService, dashboardService, loanService + `currentUserId`), `goals.js`, `alerts.js`, `reports.js`, `cobrancas.js` (debtorService, chargeService, settingsService), `cobrancasReport.js`, `pix.js`, `ai.js`, `aiDocuments.js`, `importExport.js`, `supabase.js` (singleton).

**Constantes** (`frontend/src/constants/`): `index.js` (prazos de cobrança, `PUBLIC_APP_URL` dos links públicos, tipos de chave PIX, bandeiras/cores de cartão, limites) e `banks.js` (catálogo de 41 bancos BR + `findBank(texto)`). Número mágico novo vai pra cá.

**Utils de domínio:** `utils/charges.js` (`groupCharges`, `summarizeCharges`, `isOverdue`) — usado pela tela do credor E pelo extrato público (números sempre batem).

**Componentes base:** `Select.jsx` (seletor com ícone/logo, busca automática >7 opções, abre em linha — use no lugar de `<select>`), `ConfirmDialog.jsx` (trava p/ ações destrutivas), `BankLogo.jsx` (logo por `bankId` ou texto livre; lib `@edusites/bancos-brasil` carregada lazy — importada via alias do Vite p/ `src/core.js`, pois o `index.js` dela puxa `vue`).

**Serverless** (`frontend/api/`): `ai-chat.js` (proxy IA 9Router, autentica via token Supabase) e `push-notify.js` (Web Push do aviso de pagamento; pública, valida pelo código do extrato, usa service role).

**Hooks** (`frontend/src/hooks/`): `useDashboard`, `useTransactions`, `useAlerts`, `useCobrancas`, `useAutoRecurring`, `useDisclosure`, `useInstallPrompt`.

**Regra de arquitetura:** componentes NÃO importam `supabase` direto — sempre via service. Lógica de domínio pesada vai em RPC SQL. Páginas consomem hooks.

---

## Supabase

**Tabelas:** `categories`, `credit_cards`, `transactions`, `recurring_transactions`, `weekly_challenges`, `goals`, `notes`, `user_settings` (legado, chave única), `debtors`, `charges`, `report_links` (encurtador PDF), `pix_keys` (múltiplas chaves PIX), `pix_links` (links de pagamento), `payment_notices` (avisos do devedor; Realtime), `push_subscriptions` (aparelhos inscritos no Web Push). `debtors.share_code` = código do extrato público; `debtors.code` = nº humano sequencial por usuário (#001). Todas com RLS `auth.uid() = user_id`.

**Storage:** bucket privado `reports` (PDFs; signed URL) + bucket **público** `pix-qr` (imagens de QR PIX). Policies de escrita por pasta `{user_id}/...`.

**RPCs principais:** `get_balance`, `get_period_summary`, `get_expenses_by_category`, `get_monthly_history`, `get_card_summary`, `get_card_bills`, `get_card_bill_transactions`, `pay_card_bill`, `get_balance_forecast`, `generate_recurring_for_month`, `get_debtors_summary`, `resolve_report_link` + `resolve_pix_link` + `resolve_debtor_statement` (SECURITY DEFINER, pública/anon).

**Migrations** (`supabase/`, rodar em ordem; idempotentes): `schema.sql` + `migration_*.sql`. Aplicar via Dashboard SQL Editor ou `supabase db query --linked -f <arquivo>` (CLI logada). Projeto: `cofre` ref `lnkrplyghpukmovpzkea`.

---

## Changelog (alimentar a cada mudança)

- **2026-10-16** — Cobranças: layout responsivo. Card do devedor em 1 linha no md+ (identidade + selos | valor "a receber · N% pago" alinhado à direita | ações com divisória), empilhado no mobile com `ActionButton` (ícone sobre texto, 44px, larguras iguais). Barra PIX/PDF/compartilhar como pílulas (`TOOL_BTN`, grid 1fr 1fr auto no mobile). Resumo 2 col no mobile (3º ocupa a linha) → 3 col sm+. Carteira: stats + progresso lado a lado no md+. Blocos de cobrança em 2 colunas no xl.
- **2026-10-16** — Extrato, passo "Pagar via PIX": logo + "Recebe no <banco>" (via `findBank(pix.label)`) e logo no "Copiar só a chave". `resolve_debtor_statement` passa a devolver `pix.label`. ⚠️ Rodar `migration_extrato_pix_label.sql`.
- **2026-10-16** — **Web Push** (aviso com o app FECHADO). `services/push.js` inscreve o aparelho (`pushManager.subscribe` com `VAPID_PUBLIC_KEY` de `constants`) e grava em `push_subscriptions` — ao ativar notificações em Cobranças e, silenciosamente, a cada abertura do app se já autorizado. Extrato: após `notify_payment` ok → `POST /api/push-notify {code}` (keepalive). Serverless `api/push-notify.js` (lib `web-push`, service role): acha o aviso pendente ≤2 min sem `pushed_at`, carimba antes de enviar (não reenvia), manda pra todas as inscrições do credor e apaga as mortas (404/410). `sw.js` trata `push`. Mesma `tag` do aviso in-app → sem duplicar. Sem as envs, a função responde `not-configured` e tudo segue via Realtime. Não funciona no APK (WebView); iPhone só com o PWA instalado (iOS 16.4+). ⚠️ Rodar `migration_push_subscriptions.sql` + envs na Vercel: `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
- **2026-10-16** — **Aviso de pagamento** devedor → credor. No extrato, "Pagar" chama a RPC anon `notify_payment(code, ids)` (valida parcelas do devedor e em aberto, recalcula o valor no servidor, não duplica o mesmo conjunto em 10 min, teto 30/dia). Tabela `payment_notices` (RLS dono, no `supabase_realtime`). App: `usePaymentNoticeAlerts` no `Layout` escuta inserts (Realtime) em qualquer tela → toast + notificação do sistema (`utils/notify.js`, via service worker p/ funcionar no Android; `sw.js` trata o toque → abre /cobrancas) + evento `cofre:payment-notice` que recarrega Cobranças. Em Cobranças: `NoticePanel` com **Ok, visto** (só tira da lista). ⚠️ Aviso é **SÓ notificação** — nunca marca parcela como paga (decisão do usuário); marcar continua manual. `resolve_debtor_statement` passa a devolver o `id` das cobranças. Limite: notificação com o app FECHADO exige Web Push (não implementado). ⚠️ Rodar `migration_payment_notices.sql`.
- **2026-10-16** — Lista mais enxuta (credor e extrato): dívidas **quitadas por inteiro** vão pra uma seção recolhida "N quitada(s) · R$ X" no fim; dentro de parcelamento em aberto, as **parcelas pagas** ficam recolhidas ("N parcela(s) paga(s)") e só as em aberto aparecem. Componente `PaidDisclosure.jsx`.
- **2026-10-16** — **Fix:** editar cobrança/parcelamento preenchia o valor como `16.67` (`String(n)`) e o `parseAmount` (pt-BR, ponto = milhar) salvava **1667**. Novo `toAmountInput()` em `format.js` (16.67 → "16,67") + prévia "Vai salvar: R$ …" sob o campo. Regra: nunca `String(numero)` em input lido por `parseAmount`.
- **2026-10-16** — Extrato público: **pagar por mês em 2 passos**. Nada vem marcado; card "Qual mês você vai pagar?" agrupa as parcelas em aberto por mês de vencimento (atrasado em vermelho, "este mês", sem vencimento à parte) — 1 toque junta todas do mês (somáveis entre meses; parcela a parcela continua). "Pagar" já copia o copia-e-cola com o valor (gesto do usuário) e abre o passo 2: ① copiado ② abrir o app do banco (Android: grade de 12 bancos via `intent://` com fallback pra Play Store; pacotes em `BANKS[].android`; último banco lembrado no localStorage do devedor) ③ colar em Pix Copia e Cola. QR e "copiar só a chave" ficam como alternativas. iOS/desktop: instrução em texto (sem deep link confiável).
- **2026-10-16** — **Número por devedor** (`debtors.code`, `#001`…): sequencial e único por usuário (trigger `trg_debtors_code` com advisory lock; não reaproveita números), backfill por ordem de cadastro, `get_debtors_summary` recriada com `code`. UI: selo `#003` no card e no painel "Pra cobrar", hint no seletor de pessoa (busca por número funciona), título dos modais e nome no PDF (`João (#003)`). Aviso não-bloqueante de **nome repetido** ao cadastrar/editar (`sameNameDebtors`). Sem a migration o app funciona igual, só sem o número. ⚠️ Rodar `migration_debtors_code.sql`.
- **2026-10-16** — Cobranças (credor): **parcela paga = travada**. Sem seleção (no modo seleção aparece com cadeado e não responde), sem editar e sem excluir; checkbox do parcelamento e atalho "Todas pendentes" só pegam as em aberto. Única saída: botão verde → "Desfazer pagamento" com confirmação.
- **2026-10-16** — Extrato público: devedor **escolhe as parcelas** que vai pagar (padrão = todas as pendentes; atalhos Todas / Só vencidas / Nenhuma; checkbox por parcela e por parcelamento). Barra fixa mostra o total escolhido → modal com QR + copia-e-cola **desse valor** e botão "copiar só a chave PIX". Sem mudança no banco. O credor ainda marca como pago manualmente (o app não recebe aviso do banco).
- **2026-10-16** — Cobranças viram **carteira do credor**. (1) Por pessoa: total da dívida, pago, a pagar, barra de progresso, pagas × faltando (`WalletSummary`, `utils/charges.js`); cabeçalho do parcelamento mostra `k/N pagas · faltam X`. (2) **Extrato público ao vivo** `/extrato/:code` (`DebtorStatement.jsx`): botão "Extrato" no card → `ShareStatementModal` (copiar, WhatsApp, compartilhar, gerar novo link = revoga o antigo). `debtorService.shareLink` grava `debtors.share_code` (CSPRNG); RPC `resolve_debtor_statement` (anon) devolve só nome, cobranças e chave PIX padrão — sem telefone/cartão/ids. (3) **Trava de pagamento:** parcela paga mostra cadeado + "Pago em dd/mm"; desfazer pede confirmação (`ConfirmDialog`); excluir cobrança/pessoa/seleção também confirma; valor de cobrança paga fica travado na edição. (4) **Seleção** só em modo explícito ("Selecionar") com atalhos Pendentes/Todas/Nenhuma, linha inteira tocável, checkbox de grupo tri-state; fora do modo a linha tem só o botão de pago. (5) **Editar** pessoa (`EditDebtorModal`) e parcelamento inteiro (`EditGroupModal` → `chargeService.updateGroup`: nome, cartão, valor das pendentes; pagas intactas). (6) `Select.jsx` substitui `<select>` em cobranças, chaves PIX e cartões. (7) **Logos de bancos** (`@edusites/bancos-brasil`, 41 bancos): tarja do cartão, face do cartão, chaves PIX, seletor "Banco emissor" no form de cartão (preenche nome + cor). (8) `constants/` criado; `PUBLIC_APP_URL` corrige links /pix, /r e /extrato gerados no APK (antes saíam `https://localhost`). (9) `todayISO()` local em `format.js` (cobranças usavam UTC → "vencida" errado após 21h). (10) Limpeza: removidos `AiTools.jsx`, `JobFilters.jsx`, `services/backup.js` (sem uso), `migration_jobs.sql` (feature removida), dep `date-fns` (zero imports), código morto em `importExport.js`. ⚠️ Rodar `migration_cobrancas_extrato.sql` (só o extrato depende dela).

- **2026-06-09** — Cobranças: **cartão de crédito por cobrança**. Migration `migration_cobrancas_card.sql` (add `charges.credit_card_id` FK → `credit_cards`, `on delete set null` + índice). `chargeService` (create/createInstallments/update) aceita `cardId`/`credit_card_id` e faz join `credit_card:credit_cards(id,name,color)`. Novo `cardService.listSimple` (lista enxuta sem RPC de summary). UI: `components/CardTag.jsx` (`CardTag` tarja colorida + `CardSelect`), seletor em `ChargeModal`/`EditChargeModal`/`CobrancaQuickForm`, tarja no `ChargeRow` (avulsas) e no cabeçalho do bloco de parcelamento. ⚠️ Rodar a migration ANTES do deploy (front passa a enviar `credit_card_id`).
- **2026-06-09** — **Recorte Brasil** no buscador. (1) Normalização Brasil↔Brazil (`normLoc`/`toApiLocation`): APIs querem "Brazil"(z), usuário digita "Brasil"(s) — antes o filtro de local nunca casava. (2) Gate `isBrazilJob` LIGADO por padrão (`filters.brazilOnly !== false`): mantém vaga BR explícita + remota global (anywhere/worldwide/latam), descarta presa a outro país ("USA Only", "Berlin"). Toggle "🇧🇷 Só Brasil" visível no `JobFilters` (default on, desligável). The Muse/Jooble agora focam Brazil quando sem `location`. Recent searches antigos (sem flag) caem no default = BR.
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
