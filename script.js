// ============================================================
//  script.js — Papelaria Criativa
//  Integração completa com Supabase (Auth + CRUD de pedidos)
// ============================================================

// ────────────────────────────────────────────────────────────
// ① CONFIGURAÇÃO DO SUPABASE
//    Substitua os valores abaixo pelas suas credenciais.
//    Encontre-as em: Supabase Dashboard → Settings → API
// ────────────────────────────────────────────────────────────
const SUPABASE_URL = ‘https://SEU_PROJECT_ID.supabase.co’;   // ← substitua
const SUPABASE_ANON_KEY = ‘SUA_ANON_KEY_AQUI’;               // ← substitua

// ⚠️ CORREÇÃO: variável renomeada para “sbClient” para não conflitar
//    com a propriedade global “supabase” exposta pelo CDN
const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ────────────────────────────────────────────────────────────
// ② VARIÁVEIS GLOBAIS
// ────────────────────────────────────────────────────────────
let allOrders = [];
let currentFilter = ‘todos’;
let deleteTargetId = null;

// ────────────────────────────────────────────────────────────
// ③ INICIALIZAÇÃO
// ────────────────────────────────────────────────────────────
document.addEventListener(‘DOMContentLoaded’, async () => {
const page = detectPage();

if (page === ‘auth’) {
const { data: { session } } = await sbClient.auth.getSession();
if (session) {
window.location.href = ‘dashboard.html’;
}
}

if (page === ‘dashboard’) {
const { data: { session } } = await sbClient.auth.getSession();
if (!session) {
window.location.href = ‘index.html’;
return;
}
document.getElementById(‘user-email-display’).textContent = session.user.email;
await loadOrders();
}
});

function detectPage() {
const path = window.location.pathname;
if (path.includes(‘dashboard’)) return ‘dashboard’;
return ‘auth’;
}

// ────────────────────────────────────────────────────────────
// ④ AUTENTICAÇÃO
// ────────────────────────────────────────────────────────────

function switchTab(tab) {
const isLogin = tab === ‘login’;
document.getElementById(‘form-login’).classList.toggle(‘hidden’, !isLogin);
document.getElementById(‘form-register’).classList.toggle(‘hidden’, isLogin);
document.getElementById(‘tab-login’).classList.toggle(‘active’, isLogin);
document.getElementById(‘tab-register’).classList.toggle(‘active’, !isLogin);
hideAuthMessage();
}

async function handleLogin(event) {
event.preventDefault();
const email = document.getElementById(‘login-email’).value.trim();
const password = document.getElementById(‘login-password’).value;

setButtonLoading(‘btn-login’, true);

const { error } = await sbClient.auth.signInWithPassword({ email, password });

if (error) {
showAuthMessage(translateError(error.message), ‘error’);
setButtonLoading(‘btn-login’, false);
return;
}

window.location.href = ‘dashboard.html’;
}

async function handleRegister(event) {
event.preventDefault();
const email = document.getElementById(‘reg-email’).value.trim();
const password = document.getElementById(‘reg-password’).value;
const confirm = document.getElementById(‘reg-confirm’).value;

if (password !== confirm) {
showAuthMessage(‘As senhas não coincidem.’, ‘error’);
return;
}

setButtonLoading(‘btn-register’, true);

const { error } = await sbClient.auth.signUp({ email, password });

if (error) {
showAuthMessage(translateError(error.message), ‘error’);
setButtonLoading(‘btn-register’, false);
return;
}

showAuthMessage(‘Conta criada! Verifique seu e-mail para confirmar o cadastro.’, ‘success’);
setButtonLoading(‘btn-register’, false);
}

async function handleLogout() {
await sbClient.auth.signOut();
window.location.href = ‘index.html’;
}

// ────────────────────────────────────────────────────────────
// ⑤ CRUD DE PEDIDOS
// ────────────────────────────────────────────────────────────

async function loadOrders() {
showLoadingState(true);

const { data: { session } } = await sbClient.auth.getSession();
if (!session) return;

const { data, error } = await sbClient
.from(‘pedidos’)
.select(’*’)
.eq(‘user_id’, session.user.id)
.order(‘data_pedido’, { ascending: false });

showLoadingState(false);

if (error) {
console.error(‘Erro ao carregar pedidos:’, error);
return;
}

allOrders = data || [];
renderOrders();
updateSummaryCards();
}

function renderOrders() {
const list = document.getElementById(‘orders-list’);
const emptyState = document.getElementById(‘empty-state’);

const filtered = currentFilter === ‘todos’
? allOrders
: allOrders.filter(p => p.status === currentFilter);

if (filtered.length === 0) {
list.innerHTML = ‘’;
emptyState.classList.remove(‘hidden’);
return;
}

emptyState.classList.add(‘hidden’);

list.innerHTML = filtered.map(order => `
<article class="order-card status-${order.status.replace('í','i')}" data-id="${order.id}">
<div class="order-card-top">
<div class="order-client">${escapeHtml(order.cliente)}</div>
<span class="status-badge ${order.status === 'concluído' ? 'badge-done' : 'badge-pending'}">
${order.status === ‘concluído’ ? ‘✅ Concluído’ : ‘⏳ Pendente’}
</span>
</div>

```
  <div class="order-desc">${escapeHtml(order.descricao)}</div>

  <div class="order-card-meta">
    <span class="order-value">R$ ${formatCurrency(order.valor)}</span>
    <span class="order-dates">
      ${order.data_pedido ? '📅 ' + formatDate(order.data_pedido) : ''}
      ${order.data_entrega ? ' → 🚚 ' + formatDate(order.data_entrega) : ''}
    </span>
  </div>

  <div class="order-card-actions">
    <button class="btn-status-toggle" onclick="toggleStatus('${order.id}', '${order.status}')">
      ${order.status === 'concluído' ? '↩ Pendente' : '✓ Concluir'}
    </button>
    <button class="btn-edit" onclick="openEditModal('${order.id}')">✏️ Editar</button>
    <button class="btn-delete" onclick="openDeleteModal('${order.id}')">🗑️</button>
  </div>
</article>
```

`).join(’’);
}

function updateSummaryCards() {
const pending = allOrders.filter(p => p.status === ‘pendente’);
const done = allOrders.filter(p => p.status === ‘concluído’);

const sumPending = pending.reduce((acc, p) => acc + Number(p.valor), 0);
const sumDone = done.reduce((acc, p) => acc + Number(p.valor), 0);

document.getElementById(‘total-pending’).textContent = `R$ ${formatCurrency(sumPending)}`;
document.getElementById(‘total-done’).textContent = `R$ ${formatCurrency(sumDone)}`;
document.getElementById(‘count-pending’).textContent = `${pending.length} pedido${pending.length !== 1 ? 's' : ''}`;
document.getElementById(‘count-done’).textContent = `${done.length} pedido${done.length !== 1 ? 's' : ''}`;
}

async function handleSaveOrder(event) {
event.preventDefault();
setButtonLoading(‘btn-save’, true);
hideModalMessage();

const { data: { session } } = await sbClient.auth.getSession();
const orderId = document.getElementById(‘order-id’).value;

const payload = {
cliente: document.getElementById(‘field-cliente’).value.trim(),
descricao: document.getElementById(‘field-descricao’).value.trim(),
valor: parseFloat(document.getElementById(‘field-valor’).value) || 0,
status: document.getElementById(‘field-status’).value,
data_pedido: document.getElementById(‘field-data-pedido’).value || null,
data_entrega: document.getElementById(‘field-data-entrega’).value || null,
user_id: session.user.id,
};

let error;

if (orderId) {
({ error } = await sbClient
.from(‘pedidos’)
.update(payload)
.eq(‘id’, orderId)
.eq(‘user_id’, session.user.id));
} else {
({ error } = await sbClient.from(‘pedidos’).insert(payload));
}

setButtonLoading(‘btn-save’, false);

if (error) {
showModalMessage(‘Erro ao salvar pedido. Tente novamente.’, ‘error’);
return;
}

closeModal();
await loadOrders();
}

async function toggleStatus(id, currentStatus) {
const newStatus = currentStatus === ‘concluído’ ? ‘pendente’ : ‘concluído’;

const { data: { session } } = await sbClient.auth.getSession();

const { error } = await sbClient
.from(‘pedidos’)
.update({ status: newStatus })
.eq(‘id’, id)
.eq(‘user_id’, session.user.id);

if (!error) {
await loadOrders();
}
}

function openDeleteModal(id) {
deleteTargetId = id;
document.getElementById(‘delete-modal’).classList.remove(‘hidden’);
}

function closeDeleteModal() {
deleteTargetId = null;
document.getElementById(‘delete-modal’).classList.add(‘hidden’);
}

function closeDeleteModalOnOverlay(event) {
if (event.target === document.getElementById(‘delete-modal’)) {
closeDeleteModal();
}
}

async function confirmDelete() {
if (!deleteTargetId) return;

const { data: { session } } = await sbClient.auth.getSession();

const { error } = await sbClient
.from(‘pedidos’)
.delete()
.eq(‘id’, deleteTargetId)
.eq(‘user_id’, session.user.id);

closeDeleteModal();

if (!error) {
await loadOrders();
}
}

// ────────────────────────────────────────────────────────────
// ⑥ MODAL DE PEDIDO
// ────────────────────────────────────────────────────────────

function openModal() {
document.getElementById(‘modal-title’).textContent = ‘Novo Pedido’;
document.getElementById(‘order-form’).reset();
document.getElementById(‘order-id’).value = ‘’;
document.getElementById(‘field-data-pedido’).value = todayDate();
hideModalMessage();
document.getElementById(‘order-modal’).classList.remove(‘hidden’);
}

function openEditModal(id) {
const order = allOrders.find(p => p.id === id);
if (!order) return;

document.getElementById(‘modal-title’).textContent = ‘Editar Pedido’;
document.getElementById(‘order-id’).value = order.id;
document.getElementById(‘field-cliente’).value = order.cliente;
document.getElementById(‘field-descricao’).value = order.descricao;
document.getElementById(‘field-valor’).value = order.valor;
document.getElementById(‘field-status’).value = order.status;
document.getElementById(‘field-data-pedido’).value = order.data_pedido || ‘’;
document.getElementById(‘field-data-entrega’).value = order.data_entrega || ‘’;
hideModalMessage();
document.getElementById(‘order-modal’).classList.remove(‘hidden’);
}

function closeModal() {
document.getElementById(‘order-modal’).classList.add(‘hidden’);
}

function closeModalOnOverlay(event) {
if (event.target === document.getElementById(‘order-modal’)) {
closeModal();
}
}

// ────────────────────────────────────────────────────────────
// ⑦ FILTROS
// ────────────────────────────────────────────────────────────

function setFilter(filter, btn) {
currentFilter = filter;
document.querySelectorAll(’.filter-btn’).forEach(b => b.classList.remove(‘active’));
btn.classList.add(‘active’);
renderOrders();
}

// ────────────────────────────────────────────────────────────
// ⑧ HELPERS DE UI
// ────────────────────────────────────────────────────────────

function showLoadingState(show) {
document.getElementById(‘loading-state’).classList.toggle(‘hidden’, !show);
document.getElementById(‘orders-list’).classList.toggle(‘hidden’, show);
}

function showAuthMessage(msg, type) {
const el = document.getElementById(‘auth-message’);
el.textContent = msg;
el.className = `auth-message ${type}`;
}

function hideAuthMessage() {
const el = document.getElementById(‘auth-message’);
if (el) el.className = ‘auth-message hidden’;
}

function showModalMessage(msg, type) {
const el = document.getElementById(‘modal-message’);
el.textContent = msg;
el.className = `auth-message ${type}`;
}

function hideModalMessage() {
const el = document.getElementById(‘modal-message’);
if (el) el.className = ‘auth-message hidden’;
}

function setButtonLoading(btnId, loading) {
const btn = document.getElementById(btnId);
if (!btn) return;
btn.disabled = loading;
btn.querySelector(’.btn-text’).classList.toggle(‘hidden’, loading);
btn.querySelector(’.btn-loader’).classList.toggle(‘hidden’, !loading);
}

// ────────────────────────────────────────────────────────────
// ⑨ UTILITÁRIOS
// ────────────────────────────────────────────────────────────

function formatCurrency(value) {
return Number(value).toLocaleString(‘pt-BR’, {
minimumFractionDigits: 2,
maximumFractionDigits: 2
});
}

function formatDate(dateStr) {
if (!dateStr) return ‘’;
const [y, m, d] = dateStr.split(’-’);
return `${d}/${m}/${y}`;
}

function todayDate() {
return new Date().toISOString().split(‘T’)[0];
}

function escapeHtml(str) {
const div = document.createElement(‘div’);
div.appendChild(document.createTextNode(str || ‘’));
return div.innerHTML;
}

function translateError(msg) {
if (msg.includes(‘Invalid login credentials’)) return ‘E-mail ou senha incorretos.’;
if (msg.includes(‘Email not confirmed’)) return ‘Confirme seu e-mail antes de entrar.’;
if (msg.includes(‘User already registered’)) return ‘Este e-mail já está cadastrado.’;
if (msg.includes(‘Password should be’)) return ‘A senha deve ter pelo menos 6 caracteres.’;
return ‘Ocorreu um erro. Tente novamente.’;
}