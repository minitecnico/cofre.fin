# 💰 Cofre — Personal Finance Dashboard

Sistema completo de controle de finanças pessoais. O frontend conversa direto
com Supabase e usa uma função serverless privada para o assistente financeiro.

```
finance-dashboard/
├── frontend/         →  React SPA (deploy na Vercel)
├── supabase/
│   └── schema.sql    →  schema completo (rode no Supabase)
└── DEPLOY.md         →  guia passo a passo (LEIA PRIMEIRO)
```

---

## 🚀 Como rodar online

**Apenas 2 serviços, ambos gratuitos para sempre:**

| Serviço         | Função                                | Plano free                     |
|-----------------|---------------------------------------|--------------------------------|
| **Supabase**    | Postgres + auth + REST automática     | 500 MB, sem limite de tempo    |
| **Vercel**      | hospedar o frontend                   | ilimitado para projetos pessoais |

**👉 Siga o passo a passo em [`DEPLOY.md`](./DEPLOY.md)** — ~15 minutos.

---

## 🧠 Funcionalidades

- ✅ Dashboard com saldo, receitas, despesas
- ✅ Gráficos: histórico mensal + gastos por categoria
- ✅ CRUD de receitas e despesas
- ✅ Cartões de crédito com fatura/limite calculados em tempo real
- ✅ Categorias personalizáveis
- ✅ Filtros por período (dia, semana, mês)
- ✅ Alertas automáticos de gastos altos
- ✅ Simulação de saldo futuro
- ✅ Exportação CSV
- ✅ Login/registro com Supabase Auth (email/senha)
- ✅ Cada usuário só vê seus dados (Row Level Security do Postgres)
- ✅ Assistente IA para conversar sobre os dados financeiros do mês
- ✅ Central de IA com diagnóstico mensal, lançamento por texto, busca natural e criação de metas
- ✅ Sugestão de categorias com IA durante a importação de planilhas

---

## 🏗️ Arquitetura

```
┌──────────────────┐         ┌──────────────────────┐
│   Vercel         │         │   Supabase           │
│ ┌──────────────┐ │         │ ┌──────────────────┐ │
│ │  React SPA   │ │ ──────▶ │ │  Auth (JWT)      │ │
│ │  + Supabase  │ │         │ │  Postgres + RLS  │ │
│ │     SDK      │ │         │ │  RPC Functions   │ │
│ └──────────────┘ │         │ └──────────────────┘ │
└──────────────────┘         └──────────────────────┘
```

O frontend usa o SDK oficial do Supabase, que cuida de:
- **Auth**: signup, login, logout, refresh de token, persistência de sessão
- **REST automática** a partir das tabelas (com RLS aplicado)
- **RPC** para chamar funções SQL (saldo, fatura, agregações)

A segurança vem das **policies de Row Level Security** definidas no `schema.sql`: cada policy usa `auth.uid() = user_id`, então mesmo que alguém pegue o token de outro usuário e tente listar todas as transações, o Postgres só retorna as do dono do token.

---

## 🚀 Stack

| Camada       | Tecnologia                                                 |
|--------------|------------------------------------------------------------|
| **Frontend** | React 18 + Vite + Tailwind + Recharts + Lucide Icons       |
| **Auth**     | Supabase Auth (JWT, email/senha)                           |
| **DB**       | PostgreSQL gerenciado pelo Supabase                        |
| **Lógica**   | RPC functions PL/pgSQL (saldo, fatura, projeção, agregados)|
| **Segurança**| Row Level Security do Postgres                             |

---

## 🏗️ Estrutura

```
frontend/
├── src/
│   ├── components/         # componentes reutilizáveis
│   │   ├── Sidebar.jsx
│   │   ├── Modal.jsx
│   │   ├── StatCard.jsx
│   │   ├── TransactionForm.jsx
│   │   ├── TransactionList.jsx
│   │   ├── Charts.jsx
│   │   ├── FloatingAddButton.jsx
│   │   ├── Layout.jsx
│   │   └── ProtectedRoute.jsx
│   ├── pages/              # páginas roteadas
│   │   ├── Login.jsx
│   │   ├── Dashboard.jsx
│   │   ├── TransactionListPage.jsx
│   │   ├── Cards.jsx
│   │   └── Categories.jsx
│   ├── services/
│   │   ├── supabase.js     # cliente Supabase
│   │   └── index.js        # services (transactions, categories, cards, dashboard)
│   ├── hooks/              # useDashboard, useTransactions, useDisclosure
│   ├── context/AuthContext.jsx
│   ├── utils/format.js
│   └── styles/index.css
├── public/_redirects       # SPA routing fallback
├── vercel.json             # config de deploy
├── tailwind.config.js
└── package.json

supabase/
└── schema.sql              # tabelas + RLS + triggers + RPC functions
```

---

## 📈 Como o saldo é calculado

```
Saldo = Σ receitas − Σ despesas (TODAS, incluindo cartão)
```

**Regra:** toda despesa diminui o saldo no momento em que é cadastrada — independente da forma de pagamento. O cartão de crédito serve como **etiqueta organizacional** (você vê fatura, limite e ciclo separadamente), mas não muda o cálculo do saldo.

**Por que isso?** Evita "falsa sensação de riqueza". Se você gasta R$ 3.000 no cartão hoje, esse dinheiro já está comprometido — faz sentido o saldo refletir isso na hora.

A lógica vive em SQL puro (`schema.sql`), nas RPC functions:
- `get_balance()` — saldo total (receitas − todas as despesas)
- `get_period_summary(period)` — resumo do dia/semana/mês
- `get_expenses_by_category()` — agregação para gráfico de pizza
- `get_monthly_history(months)` — histórico para gráfico de barras
- `get_card_summary(card_id)` — fatura e limite disponível em tempo real (do ciclo do cartão)
- `get_balance_forecast(months)` — projeção dos próximos meses

---

## 🎨 Design

Aesthetic neo-brutalista — bordas pretas sólidas, sombras "duras" `4px 4px 0`, paleta ink + verde-limão `#c4f542`. Fontes Fraunces (display), Inter (corpo) e JetBrains Mono (números — alinhamento tabular nativo).

---

## 🔒 Sobre a segurança

A **anon key** do Supabase é exposta publicamente no JS do frontend. Isso é **por design** — a segurança vem das **policies de RLS** no Postgres, não de "esconder a chave".

Cada policy garante que `auth.uid() = user_id` — o Postgres rejeita qualquer tentativa de ler/modificar dados de outro usuário, mesmo que alguém forje requisições.

---

## 📝 Licença

MIT
