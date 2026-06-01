# 🚀 Guia de Deploy — Cofre + Supabase + Vercel

Tempo estimado: **~15 minutos**. Custo: **R$ 0** (free tier permanente).

---

## 📋 Visão geral

São apenas **3 etapas**:

1. **GitHub** — subir o código (5 min)
2. **Supabase** — criar projeto e rodar o SQL (5 min)
3. **Vercel** — conectar o GitHub e fazer deploy (5 min)

**Pré-requisitos:** uma conta de email. Só isso.

---

## 1️⃣ GitHub — subir o código

### 1.1. Criar conta
Acesse **https://github.com** → "Sign up".

### 1.2. Criar repositório
- Botão verde **"New"** → **"New repository"**
- Nome: `finance-dashboard`
- Marque **Public** (ou Private, ambos funcionam)
- **NÃO** marque "Add a README"
- Clique **"Create repository"**

### 1.3. Subir os arquivos (sem terminal)
- Na página do repositório recém-criado, clique em **"uploading an existing file"**
- **Arraste a pasta inteira `finance-dashboard`** para a área de upload
- Aguarde o upload finalizar (~30s)
- Clique no botão verde **"Commit changes"**

✅ Código no GitHub.

---

## 2️⃣ Supabase — banco + auth + API

### 2.1. Criar conta
Acesse **https://supabase.com** → **"Start your project"** → entre com GitHub (mais fácil).

### 2.2. Criar projeto
- Clique **"New project"**
- **Organization:** escolha sua org pessoal
- **Name:** `cofre` (ou o que preferir)
- **Database Password:** clique no botão pra **gerar uma senha forte** → **COPIE E GUARDE** (você não vai precisar agora, mas guarde por segurança)
- **Region:** escolha a mais próxima (`São Paulo` se disponível, senão `North Virginia`)
- **Pricing Plan:** Free
- Clique **"Create new project"**

⏱️ Aguarde ~2 minutos enquanto o Supabase provisiona o projeto.

### 2.3. Rodar o schema SQL
Quando o projeto estiver pronto:

- No menu lateral esquerdo, clique no ícone **"SQL Editor"** (parece com `>_`)
- Clique em **"+ New query"**
- Abra o arquivo `supabase/schema.sql` do projeto (no GitHub ou localmente)
- **Copie TODO o conteúdo** e cole no editor
- Clique no botão verde **"Run"** (ou `Ctrl+Enter`)

Você deve ver `Success. No rows returned` no rodapé. Pronto — 3 tabelas + 6 RPC functions + triggers + RLS configurados.

### 2.4. (Opcional) Desabilitar confirmação por email
Por padrão, o Supabase exige confirmação de email no signup. Pra demos é mais simples desligar:

- No menu lateral, **"Authentication"** → **"Providers"**
- Clique em **"Email"** (no topo)
- Desmarque **"Confirm email"** → **"Save"**

Agora qualquer email funciona pra criar conta sem precisar confirmar nada.

> 💡 Se quiser deixar a confirmação ativa, o app vai mostrar "Verifique seu email" no signup. Funciona normal, só mais um passo.

### 2.5. Pegar URL e ANON KEY
- No menu lateral, ícone de engrenagem **"Project Settings"** → **"API"**
- Você vai ver duas coisas importantes:
  - **Project URL** (algo como `https://xxxxxxxx.supabase.co`)
  - **Project API keys** → **anon public** (string longa começando com `eyJ...`)
- Mantenha essa aba aberta — vamos usar no próximo passo

✅ Banco e auth prontos.

---

## 3️⃣ Vercel — deploy do frontend

### 3.1. Criar conta
Acesse **https://vercel.com/signup** → **"Continue with GitHub"** → autorize.

### 3.2. Importar projeto
- Na home, clique **"Add New..."** → **"Project"**
- Encontre `finance-dashboard` → clique **"Import"**

### 3.3. Configurar
Na tela "Configure Project":

- **Framework Preset:** detecta **Vite** automaticamente ✓
- **Root Directory:** clique **"Edit"** → selecione **`frontend`** → "Continue"
- **Build Command** e **Output Directory:** deixe os defaults

### 3.4. Variáveis de ambiente
Expanda **"Environment Variables"** e adicione:

| Nome                       | Valor                                          |
|----------------------------|------------------------------------------------|
| `VITE_SUPABASE_URL`        | a Project URL do Supabase                      |
| `VITE_SUPABASE_ANON_KEY`   | a anon public key do Supabase                  |
| `NINEROUTER_API_KEY`       | a chave privada gerada no painel do 9Router    |
| `NINEROUTER_BASE_URL`      | `https://9router.com/v1`                       |
| `NINEROUTER_MODEL`         | nome do combo configurado, ex.: `free-combo`   |

⚠️ **Não adicione `/` no final da URL.**

As variáveis `NINEROUTER_*` ficam somente no servidor da Vercel. Nunca use o
prefixo `VITE_` para a chave privada do 9Router.

### 3.5. Deploy
Clique no botão **"Deploy"** e aguarde ~1-2 minutos.

Quando aparecer "Congratulations!" 🎉, sua URL estará pronta — algo como `https://finance-dashboard-xyz.vercel.app`.

---

## 🎉 Tudo pronto!

Acesse a URL da Vercel:

1. Clique em **"Criar agora"**
2. Cadastre-se com email e senha
3. As 10 categorias padrão são criadas automaticamente (graças ao trigger SQL)
4. Comece a registrar suas transações pelo botão flutuante "+"

---

## 🔧 Troubleshooting

### "VITE_SUPABASE_URL não está definida"
- Verifique se as variáveis no Vercel estão **exatamente** com esses nomes (com `VITE_` no início)
- Após adicionar/editar, force um redeploy: Vercel → seu projeto → "Deployments" → último deploy → `...` → "Redeploy"

### "Invalid login credentials" no login
- A senha está errada, ou
- Você marcou "Confirm email" e não confirmou o email — verifique sua caixa de entrada (incluindo spam)

### "permission denied for table xxx" no console
- O `schema.sql` não foi rodado completo, ou rodou com erro
- Volte no SQL Editor e rode novamente — ele é **idempotente** (pode rodar várias vezes sem quebrar)

### Login funciona mas as páginas ficam vazias
- Abra F12 → Console → veja o erro
- Provavelmente é uma das RPC functions faltando — confirme que rodou o schema **inteiro**

### "Table not found" / "Function not found"
- Vá no Supabase → **"Database"** → **"Tables"** — devem aparecer `categories`, `credit_cards`, `transactions`
- Vá em **"Database"** → **"Functions"** — devem aparecer 6 functions começando com `get_`
- Se não aparecerem, rode o `schema.sql` novamente

### Cadastrei e não recebi email de confirmação
- Caixa de spam
- Ou desligue confirmação em Authentication → Providers → Email → desmarque "Confirm email"

### Categorias padrão não foram criadas
- O trigger pode ter falhado em conta existente (a trigger só roda em novos signups)
- Crie as categorias manualmente pela tela "Categorias", ou
- Apague o usuário em Authentication → Users → e cadastre novamente

---

## 🔄 Como atualizar o app depois

1. Edite arquivos no GitHub (pode ser pela web mesmo)
2. Vercel detecta o commit e faz **redeploy automático** em ~1 min
3. Mudou o schema? Rode o novo SQL no Supabase

---

## 💻 Rodar localmente (opcional)

```bash
cd frontend
cp .env.example .env
# Edite .env: cole VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY do Supabase
npm install
npm run dev
```

Vai abrir em `http://localhost:5173`. Você usa o **mesmo** banco da Vercel — não precisa de Postgres local.

---

## 💸 Sobre os custos

- **Supabase Free:** 500 MB de banco, 2 GB de transferência/mês, 50.000 usuários autenticados/mês — gratuito **permanente**, sem cartão de crédito
- **Vercel Hobby:** 100 GB de bandwidth/mês, builds ilimitados, gratuito permanente para projetos pessoais

Pra um app de finanças pessoais, esses limites são **muito** maiores do que você vai precisar. Em ~10 anos de uso pesado, dificilmente alguém chega perto.

⚠️ **Limite real do Supabase Free:** o projeto é **pausado após 7 dias sem atividade**. Basta abrir o dashboard do Supabase 1x por semana ou usar o app — qualquer query reseta o contador.
