# 📋 Papelaria Criativa — Sistema de Pedidos

Sistema web mobile-first para gerenciar pedidos de papelaria, com autenticação e banco de dados via Supabase, hospedável gratuitamente no GitHub Pages.

---

## 🗂️ Estrutura de arquivos

```
/
├── index.html       ← Tela de Login e Cadastro
├── dashboard.html   ← Dashboard principal de pedidos
├── script.js        ← Toda a lógica JS + integração Supabase
├── styles.css       ← Estilos mobile-first
└── README.md        ← Este arquivo
```

---

## ⚙️ 1. Configuração do Supabase

### 1.1 — Criar projeto
1. Acesse [https://supabase.com](https://supabase.com) e crie uma conta gratuita.
2. Clique em **New Project**, escolha um nome e senha para o banco.
3. Aguarde o projeto inicializar (~1 min).

### 1.2 — Criar a tabela `pedidos`
No painel do Supabase, vá em **SQL Editor** e execute o seguinte SQL:

```sql
-- Criação da tabela de pedidos
CREATE TABLE pedidos (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cliente     TEXT NOT NULL,
  descricao   TEXT NOT NULL,
  valor       NUMERIC(10,2) NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'concluído')),
  data_pedido DATE,
  data_entrega DATE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar Row Level Security (RLS) para proteger os dados
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;

-- Política: cada usuário só vê/edita seus próprios pedidos
CREATE POLICY "Usuário acessa apenas seus pedidos"
  ON pedidos
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### 1.3 — Obter as credenciais
1. No painel Supabase, vá em **Settings → API**.
2. Copie:
   - **Project URL** → ex.: `https://xyzabc123.supabase.co`
   - **anon / public key** → chave longa começando com `eyJ...`

### 1.4 — Inserir as credenciais no projeto
Abra `script.js` e substitua as linhas:

```javascript
const SUPABASE_URL = 'https://SEU_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'SUA_ANON_KEY_AQUI';
```

pelas suas credenciais reais.

---

## 🧪 2. Testar localmente

### Opção A — Extensão VS Code (recomendada)
1. Instale a extensão **Live Server** no VS Code.
2. Clique com o botão direito em `index.html` → **Open with Live Server**.
3. O navegador abrirá em `http://127.0.0.1:5500`.

### Opção B — Python (sem instalação de dependências)
```bash
# Python 3
python -m http.server 8080
```
Acesse `http://localhost:8080`.

### Opção C — Node.js
```bash
npx serve .
```

> **Importante:** Abra sempre via servidor HTTP local. Abrir o `index.html` diretamente como arquivo (`file://`) pode causar problemas de CORS com o Supabase.

---

## 🚀 3. Publicar no GitHub Pages

### 3.1 — Criar repositório no GitHub
1. Vá em [github.com/new](https://github.com/new) e crie um **novo repositório público**.
2. Nomeie como quiser, ex.: `papelaria-criativa`.

### 3.2 — Enviar os arquivos
```bash
git init
git add .
git commit -m "feat: sistema de pedidos papelaria"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/papelaria-criativa.git
git push -u origin main
```

### 3.3 — Ativar o GitHub Pages
1. No repositório, vá em **Settings → Pages**.
2. Em **Source**, selecione **Deploy from a branch**.
3. Selecione branch **main** e pasta **/ (root)**.
4. Clique em **Save**.

Após ~2 minutos, seu site estará disponível em:
```
https://SEU_USUARIO.github.io/papelaria-criativa/
```

### 3.4 — Autorizar a URL no Supabase
Para que o login funcione no domínio publicado:
1. No painel Supabase, vá em **Authentication → URL Configuration**.
2. Em **Site URL**, adicione: `https://SEU_USUARIO.github.io`
3. Em **Redirect URLs**, adicione: `https://SEU_USUARIO.github.io/papelaria-criativa/dashboard.html`

---

## 📱 Funcionalidades

| Funcionalidade | Descrição |
|---|---|
| ✅ Login / Cadastro | Autenticação via Supabase Auth (e-mail + senha) |
| ✅ Novo pedido | Formulário com cliente, descrição, valor, datas e status |
| ✅ Editar pedido | Modal pré-preenchido com os dados existentes |
| ✅ Excluir pedido | Confirmação antes de excluir |
| ✅ Alterar status | Botão para marcar como concluído ou reverter para pendente |
| ✅ Filtros | Exibir todos / apenas pendentes / apenas concluídos |
| ✅ Resumo financeiro | Soma total dos pedidos pendentes e concluídos |
| ✅ Mobile first | Interface otimizada para celular com botões grandes |

---

## 🔐 Segurança

- Row Level Security (RLS) ativa: cada usuário só acessa seus próprios dados.
- A `anon key` é segura para uso público — ela não dá acesso admin ao banco.
- Nunca exponha a `service_role key` no frontend.

---

## 🛠️ Tecnologias utilizadas

- **HTML5 / CSS3 / JavaScript** puro (sem frameworks)
- **Supabase** — banco de dados PostgreSQL + autenticação
- **Google Fonts** — Playfair Display + DM Sans
- **GitHub Pages** — hospedagem estática gratuita
