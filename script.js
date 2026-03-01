// ============================================================
//  script.js — Papelaria BETEL v5 (2026 Design Update)
//  Melhorias: dark mode, toast notifications, ripple effect,
//  FAB, skeleton loading, cards clicáveis com filtro rápido
// ============================================================

// ────────────────────────────────────────────────────────────
// ① CONFIGURAÇÃO
// ────────────────────────────────────────────────────────────
const SUPABASE_URL      = ‘https://ltnokzhupzqpuvirgzut.supabase.co’;
const SUPABASE_ANON_KEY = ‘eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0bm9remh1cHpxcHV2aXJnenV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzNTU5MTQsImV4cCI6MjA4NzkzMTkxNH0.kEkdULzmxIfNX5hKlUoHpPs9Gnfgfxfj8qjfzGvvAoE’;
const ADMIN_EMAIL       = ‘jrs.edson@gmail.com’;

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ────────────────────────────────────────────────────────────
// ② STATUS CONSTANTS
// ────────────────────────────────────────────────────────────
const STATUS = {
PENDENTE:       ‘pendente’,
ENTREGUE_NPAGO: ‘entregue_nao_pago’,
ENTREGUE_PAGO:  ‘entregue_pago’,
};

const STATUS_LABEL = {
pendente:          ‘⏳ Pendente’,
entregue_nao_pago: ‘📦 Aguard. Pgto’,
entregue_pago:     ‘✅ Pago’,
};

const STATUS_BADGE_CLASS = {
pendente:          ‘badge-pending’,
entregue_nao_pago: ‘badge-delivered’,
entregue_pago:     ‘badge-done’,
};

// ────────────────────────────────────────────────────────────
// ③ ESTADO GLOBAL
// ────────────────────────────────────────────────────────────
let currentUser     = null;
let isAdmin         = false;
let allOrders       = [];
let allProducts     = [];
let currentFilter   = ‘todos’;
let deleteTargetId  = null;
let orderItems      = [];
let comprovanteFile = null;
let periodoInicio   = ‘’;
let periodoFim      = ‘’;

// ────────────────────────────────────────────────────────────
// ④ DARK MODE TOGGLE — NOVO 2026
// ────────────────────────────────────────────────────────────
function initDarkMode() {
// Lê preferência salva ou usa prefers-color-scheme
const saved = localStorage.getItem(‘betel-theme’);
const prefersDark = window.matchMedia(’(prefers-color-scheme: dark)’).matches;
const theme = saved || (prefersDark ? ‘dark’ : ‘light’);
applyTheme(theme);
}

function applyTheme(theme) {
document.documentElement.setAttribute(‘data-theme’, theme);
localStorage.setItem(‘betel-theme’, theme);
const btn = document.getElementById(‘btn-dark-toggle’);
if (btn) btn.textContent = theme === ‘dark’ ? ‘☀️’ : ‘🌙’;
}

function toggleDarkMode() {
const current = document.documentElement.getAttribute(‘data-theme’) || ‘light’;
applyTheme(current === ‘dark’ ? ‘light’ : ‘dark’);
}

// ────────────────────────────────────────────────────────────
// ⑤ TOAST NOTIFICATIONS — NOVO 2026
// ────────────────────────────────────────────────────────────
function showToast(message, type = ‘success’, duration = 3000) {
const container = document.getElementById(‘toast-container’);
if (!container) return;

const toast = document.createElement(‘div’);
toast.className = `toast ${type}`;
toast.textContent = message;
container.appendChild(toast);

// Remove após animação
setTimeout(() => {
toast.remove();
}, duration);
}

// ────────────────────────────────────────────────────────────
// ⑥ RIPPLE EFFECT — NOVO 2026
//    Usado nos cards clicáveis do painel financeiro
// ────────────────────────────────────────────────────────────
function addRipple(element, event) {
const ripple = document.createElement(‘span’);
ripple.className = ‘ripple’;
const rect = element.getBoundingClientRect();
const size = Math.max(rect.width, rect.height);
const x = (event?.clientX || rect.left + rect.width / 2) - rect.left - size / 2;
const y = (event?.clientY || rect.top + rect.height / 2) - rect.top - size / 2;
ripple.style.cssText = `width:${size}px;height:${size}px;left:${x}px;top:${y}px;`;
element.appendChild(ripple);
setTimeout(() => ripple.remove(), 700);
}

// Card financeiro clicável: aplica filtro + ripple
function setFilterAndRipple(filter, element, event) {
addRipple(element, event);
// Encontra o botão de filtro correspondente
const filterBtns = document.querySelectorAll(’.filter-btn’);
filterBtns.forEach(btn => {
const onclick = btn.getAttribute(‘onclick’) || ‘’;
if (onclick.includes(`'${filter}'`)) {
setFilter(filter, btn);
}
});
}

// ────────────────────────────────────────────────────────────
// ⑦ INICIALIZAÇÃO
// ────────────────────────────────────────────────────────────
document.addEventListener(‘DOMContentLoaded’, async () => {
// Inicializa dark mode primeiro (evita flash)
initDarkMode();

const page = window.location.pathname.includes(‘dashboard’) ? ‘dashboard’ : ‘auth’;
const { data: { session } } = await db.auth.getSession();

if (page === ‘auth’) {
if (session) window.location.href = ‘dashboard.html’;
return;
}

if (!session) { window.location.href = ‘index.html’; return; }

currentUser = session.user;
isAdmin     = currentUser.email === ADMIN_EMAIL;

// Badge de perfil
const badge = document.getElementById(‘user-badge’);
badge.textContent = isAdmin ? `👑 ${currentUser.email.split('@')[0]}` : `✏️ ${currentUser.email.split('@')[0]}`;
badge.className   = ’user-badge ’ + (isAdmin ? ‘badge-admin’ : ‘badge-op’);

// Botão de produtos só para admin
if (isAdmin) document.getElementById(‘btn-products-nav’).style.display = ‘flex’;

// Período padrão = mês atual
const hoje = new Date();
periodoInicio = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}-01`;
periodoFim    = todayDate();
document.getElementById(‘periodo-inicio’).value = periodoInicio;
document.getElementById(‘periodo-fim’).value    = periodoFim;

await loadProducts();
await loadOrders();
});

// ────────────────────────────────────────────────────────────
// ⑧ AUTH
// ────────────────────────────────────────────────────────────
async function handleLogin(event) {
event.preventDefault();
const email    = document.getElementById(‘login-email’).value.trim();
const password = document.getElementById(‘login-password’).value;
setButtonLoading(‘btn-login’, true);
const { error } = await db.auth.signInWithPassword({ email, password });
if (error) {
showAuthMessage(translateError(error.message), ‘error’);
setButtonLoading(‘btn-login’, false);
return;
}
window.location.href = ‘dashboard.html’;
}

async function handleLogout() {
await db.auth.signOut();
window.location.href = ‘index.html’;
}

// ────────────────────────────────────────────────────────────
// ⑨ FILTRO DE PERÍODO
// ────────────────────────────────────────────────────────────
function applyPeriod() {
const ini = document.getElementById(‘periodo-inicio’).value;
const fim = document.getElementById(‘periodo-fim’).value;
if (!ini || !fim) return;
if (ini > fim) {
document.getElementById(‘periodo-inicio’).value = fim;
document.getElementById(‘periodo-fim’).value    = ini;
periodoInicio = fim;
periodoFim    = ini;
} else {
periodoInicio = ini;
periodoFim    = fim;
}
renderOrders();
updateSummaryCards();
}

function inPeriod(order) {
const d = order.data_pedido || order.created_at?.split(‘T’)[0] || ‘’;
if (!d) return false;
return d >= periodoInicio && d <= periodoFim;
}

function inCurrentMonth(order) {
const hoje = new Date();
const ini  = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}-01`;
const d    = order.data_pedido || order.created_at?.split(‘T’)[0] || ‘’;
return d >= ini && d <= todayDate();
}

// ────────────────────────────────────────────────────────────
// ⑩ PRODUTOS
// ────────────────────────────────────────────────────────────
async function loadProducts() {
const { data, error } = await db.from(‘produtos’).select(’*’).order(‘nome’);
if (error) { console.error(‘Erro produtos:’, error); return; }
allProducts = data || [];
populateProductSelect();
renderProductsList();
}

function populateProductSelect() {
const sel = document.getElementById(‘item-product-select’);
if (!sel) return;
sel.innerHTML = ‘<option value="">Selecione um produto…</option>’;
allProducts.forEach(p => {
const opt = document.createElement(‘option’);
opt.value = p.id;
opt.textContent   = `${p.nome} — R$ ${formatCurrency(p.preco)}`;
opt.dataset.preco = p.preco;
opt.dataset.nome  = p.nome;
sel.appendChild(opt);
});
}

function renderProductsList() {
const el = document.getElementById(‘products-list’);
if (!el) return;
if (!allProducts.length) { el.innerHTML = ‘<p class="empty-inline">Nenhum produto cadastrado ainda.</p>’; return; }
el.innerHTML = allProducts.map(p => `<div class="product-item"> <div class="product-info"> <span class="product-name">${escapeHtml(p.nome)}</span> ${p.descricao ?`<span class="product-desc">${escapeHtml(p.descricao)}</span>` : ''} </div> <span class="product-price">R$ ${formatCurrency(p.preco)}</span> <div class="product-actions"> <button class="btn-icon-sm" onclick="editProduct('${p.id}')">✏️</button> <button class="btn-icon-sm btn-icon-del" onclick="deleteProduct('${p.id}')">🗑️</button> </div> </div>`).join(’’);
}

async function handleSaveProduct(event) {
event.preventDefault();
setButtonLoading(‘btn-save-product’, true);
const id = document.getElementById(‘product-id’).value;
const payload = {
nome:      document.getElementById(‘prod-nome’).value.trim(),
preco:     parseFloat(document.getElementById(‘prod-preco’).value) || 0,
descricao: document.getElementById(‘prod-descricao’).value.trim(),
};
let error;
if (id) { ({ error } = await db.from(‘produtos’).update(payload).eq(‘id’, id)); }
else    { ({ error } = await db.from(‘produtos’).insert(payload)); }
setButtonLoading(‘btn-save-product’, false);
if (error) { alert(’Erro ao salvar produto: ’ + error.message); return; }
// Toast de sucesso ao salvar produto
showToast(‘✅ Produto salvo com sucesso!’, ‘success’);
clearProductForm();
await loadProducts();
}

function editProduct(id) {
const p = allProducts.find(x => x.id === id);
if (!p) return;
document.getElementById(‘product-id’).value     = p.id;
document.getElementById(‘prod-nome’).value      = p.nome;
document.getElementById(‘prod-preco’).value     = p.preco;
document.getElementById(‘prod-descricao’).value = p.descricao || ‘’;
}

async function deleteProduct(id) {
if (!confirm(‘Excluir este produto?’)) return;
await db.from(‘produtos’).delete().eq(‘id’, id);
showToast(‘🗑️ Produto removido’, ‘info’);
await loadProducts();
}

function clearProductForm() {
document.getElementById(‘product-id’).value = ‘’;
document.getElementById(‘product-form’).reset();
}

function openProductsModal()          { loadProducts(); document.getElementById(‘products-modal’).classList.remove(‘hidden’); }
function closeProductsModal()         { document.getElementById(‘products-modal’).classList.add(‘hidden’); }
function closeProductsModalOverlay(e) { if (e.target === document.getElementById(‘products-modal’)) closeProductsModal(); }

// ────────────────────────────────────────────────────────────
// ⑪ ITENS DO PEDIDO
// ────────────────────────────────────────────────────────────
function addItemFromSelect() {
const sel = document.getElementById(‘item-product-select’);
const qty = parseInt(document.getElementById(‘item-qty’).value) || 1;
if (!sel.value) { alert(‘Selecione um produto.’); return; }
const opt = sel.options[sel.selectedIndex];
addItem({ product_id: sel.value, nome: opt.dataset.nome, preco: parseFloat(opt.dataset.preco), quantidade: qty });
sel.value = ‘’;
document.getElementById(‘item-qty’).value = 1;
}

function addCustomItem() {
const nome  = document.getElementById(‘item-custom-name’).value.trim();
const preco = parseFloat(document.getElementById(‘item-custom-price’).value) || 0;
const qty   = parseInt(document.getElementById(‘item-custom-qty’).value) || 1;
if (!nome) { alert(‘Digite o nome do item avulso.’); return; }
addItem({ product_id: null, nome, preco, quantidade: qty });
document.getElementById(‘item-custom-name’).value  = ‘’;
document.getElementById(‘item-custom-price’).value = ‘’;
document.getElementById(‘item-custom-qty’).value   = 1;
}

function addItem(item) {
const existing = item.product_id ? orderItems.find(i => i.product_id === item.product_id) : null;
if (existing) { existing.quantidade += item.quantidade; }
else { orderItems.push({ …item, _tempId: Date.now() + Math.random() }); }
renderItemsList();
}

function removeItem(tempId) {
orderItems = orderItems.filter(i => i._tempId !== tempId);
renderItemsList();
}

function renderItemsList() {
const el = document.getElementById(‘items-list’);
if (!orderItems.length) {
el.innerHTML = ‘<p class="empty-inline">Nenhum item adicionado.</p>’;
updateOrderTotal(); return;
}
el.innerHTML = orderItems.map(item => ` <div class="item-row"> <div class="item-info"> <span class="item-name">${escapeHtml(item.nome)}</span> <span class="item-meta">${item.quantidade}x R$ ${formatCurrency(item.preco)}</span> </div> <span class="item-subtotal">R$ ${formatCurrency(item.preco * item.quantidade)}</span> <button type="button" class="btn-remove-item" onclick="removeItem(${item._tempId})">✕</button> </div>`).join(’’);
updateOrderTotal();
}

function updateOrderTotal() {
const el = document.getElementById(‘order-total-display’);
if (el) el.textContent = `R$ ${formatCurrency(getOrderTotal())}`;
}

function getOrderTotal() {
return orderItems.reduce((acc, i) => acc + i.preco * i.quantidade, 0);
}

// ────────────────────────────────────────────────────────────
// ⑫ PEDIDOS — CARREGAR (todos os pedidos, sem filtro user_id)
// ────────────────────────────────────────────────────────────
async function loadOrders() {
showLoadingState(true);

const { data, error } = await db
.from(‘pedidos’)
.select(`*, itens_pedido(*, produtos(nome, preco))`)
.order(‘created_at’, { ascending: false });

showLoadingState(false);
if (error) { console.error(‘Erro pedidos:’, error); return; }
allOrders = data || [];
renderOrders();
updateSummaryCards();
}

function isLate(order) {
if (!order.data_entrega) return false;
const entregue = order.status === STATUS.ENTREGUE_PAGO || order.status === STATUS.ENTREGUE_NPAGO;
if (entregue) return order.data_entrega_real ? order.data_entrega_real > order.data_entrega : false;
return todayDate() > order.data_entrega;
}

function renderOrders() {
const list       = document.getElementById(‘orders-list’);
const emptyState = document.getElementById(‘empty-state’);
const search     = (document.getElementById(‘search-input’)?.value || ‘’).toLowerCase().trim();

let filtered = […allOrders];

if (currentFilter === ‘atrasado’) {
filtered = filtered.filter(isLate);
} else if (currentFilter !== ‘todos’) {
filtered = filtered.filter(p => p.status === currentFilter);
}

// Filtro de período
filtered = filtered.filter(inPeriod);

// Busca por cliente
if (search) filtered = filtered.filter(p => p.cliente.toLowerCase().includes(search));

if (!filtered.length) {
list.innerHTML = ‘’; list.classList.add(‘hidden’);
emptyState.classList.remove(‘hidden’);
return;
}

emptyState.classList.add(‘hidden’);
list.classList.remove(‘hidden’);

list.innerHTML = filtered.map(order => {
const late       = isLate(order);
const isPago     = order.status === STATUS.ENTREGUE_PAGO;
const isPendente = order.status === STATUS.PENDENTE;
const isNPago    = order.status === STATUS.ENTREGUE_NPAGO;

```
const itensHtml = order.itens_pedido?.length
  ? `<div class="order-items-preview">${order.itens_pedido.map(i =>
      `<span class="item-chip">${i.quantidade}x ${escapeHtml(i.nome || i.produtos?.nome || '?')}</span>`
    ).join('')}</div>` : '';

let statusBtns = '';
if (isPendente) {
  statusBtns = `<button class="btn-status-toggle btn-entregue" onclick="openEntregueModal('${order.id}')">📦 Entregar</button>`;
} else if (isNPago) {
  statusBtns = `
    <button class="btn-status-toggle btn-pago" onclick="openEditOrderModal('${order.id}', true)">💰 Receber pgto</button>
    <button class="btn-status-sm" title="Reverter para pendente" onclick="setStatusPendente('${order.id}')">↩</button>`;
} else if (isPago) {
  statusBtns = `<button class="btn-status-toggle btn-reverter" onclick="setStatusPendente('${order.id}')">↩ Reabrir</button>`;
}

return `
<article class="order-card status-${order.status.replace(/_/g,'-')} ${late ? 'status-late' : ''}">
  <div class="order-card-top">
    <div class="order-client">${escapeHtml(order.cliente)}</div>
    <span class="status-badge ${STATUS_BADGE_CLASS[order.status] || 'badge-pending'}">${STATUS_LABEL[order.status] || order.status}</span>
  </div>
  ${itensHtml}
  ${order.descricao ? `<div class="order-desc">${escapeHtml(order.descricao)}</div>` : ''}
  <div class="order-card-meta">
    <span class="order-value">R$ ${formatCurrency(order.valor)}</span>
    <div class="order-dates-block">
      ${order.data_pedido       ? `<span class="date-tag">📅 ${formatDate(order.data_pedido)}</span>` : ''}
      ${order.data_entrega      ? `<span class="date-tag ${late?'date-late':''}">🚚 ${formatDate(order.data_entrega)}</span>` : ''}
      ${order.data_entrega_real ? `<span class="date-tag date-real">🏁 ${formatDate(order.data_entrega_real)}</span>` : ''}
    </div>
  </div>
  ${buildPrazoLabel(order)}
  <div class="order-card-actions">
    ${statusBtns}
    <button class="btn-edit" onclick="openEditOrderModal('${order.id}')">✏️</button>
    ${order.comprovante_url
      ? `<button class="btn-receipt" onclick="viewReceipt('${escapeHtml(order.comprovante_url)}')" title="Ver comprovante">🧾</button>`
      : ''}
    <button class="btn-delete" onclick="openDeleteModal('${order.id}')">🗑️</button>
  </div>
</article>`;
```

}).join(’’);
}

function buildPrazoLabel(order) {
if (!order.data_entrega) return ‘’;
const entregue = order.status === STATUS.ENTREGUE_PAGO || order.status === STATUS.ENTREGUE_NPAGO;
if (entregue && order.data_entrega_real) {
const ok = order.data_entrega_real <= order.data_entrega;
return `<div class="prazo-tag ${ok?'prazo-ok':'prazo-atraso'}">${ok?'✅ Entregue no prazo':'⚠️ Entregue com atraso'}</div>`;
}
if (order.status === STATUS.PENDENTE && todayDate() > order.data_entrega) {
return `<div class="prazo-tag prazo-atraso">🚨 Prazo vencido</div>`;
}
return ‘’;
}

function updateSummaryCards() {
// Mês atual
const doMes  = allOrders.filter(inCurrentMonth);
const pagMes = doMes.filter(o => o.status === STATUS.ENTREGUE_PAGO);
const aguMes = doMes.filter(o => o.status === STATUS.ENTREGUE_NPAGO);
const atras  = allOrders.filter(isLate);

document.getElementById(‘mes-faturado’).textContent   = `R$ ${formatCurrency(pagMes.reduce((a,o)=>a+Number(o.valor),0))}`;
document.getElementById(‘mes-aguardando’).textContent = `R$ ${formatCurrency(aguMes.reduce((a,o)=>a+Number(o.valor),0))}`;
document.getElementById(‘count-late’).textContent     = atras.length;
document.getElementById(‘mes-label’).textContent      = labelMesAtual();

// Período filtrado
const doPer   = allOrders.filter(inPeriod);
const pagPer  = doPer.filter(o => o.status === STATUS.ENTREGUE_PAGO);
const aguPer  = doPer.filter(o => o.status === STATUS.ENTREGUE_NPAGO);
const pendPer = doPer.filter(o => o.status === STATUS.PENDENTE);

document.getElementById(‘per-faturado’).textContent   = `R$ ${formatCurrency(pagPer.reduce((a,o)=>a+Number(o.valor),0))}`;
document.getElementById(‘per-aguardando’).textContent = `R$ ${formatCurrency(aguPer.reduce((a,o)=>a+Number(o.valor),0))}`;
document.getElementById(‘per-pendente’).textContent   = `R$ ${formatCurrency(pendPer.reduce((a,o)=>a+Number(o.valor),0))}`;
document.getElementById(‘per-count-pago’).textContent  = `${pagPer.length} pedido${pagPer.length!==1?'s':''}`;
document.getElementById(‘per-count-aguar’).textContent = `${aguPer.length} pedido${aguPer.length!==1?'s':''}`;
document.getElementById(‘per-count-pend’).textContent  = `${pendPer.length} pedido${pendPer.length!==1?'s':''}`;
}

function labelMesAtual() {
const meses = [‘Jan’,‘Fev’,‘Mar’,‘Abr’,‘Mai’,‘Jun’,‘Jul’,‘Ago’,‘Set’,‘Out’,‘Nov’,‘Dez’];
const h = new Date();
return `${meses[h.getMonth()]}/${h.getFullYear()}`;
}

// ── Ação: marcar como entregue ──
function openEntregueModal(id) {
openEditOrderModal(id, false, STATUS.ENTREGUE_NPAGO);
}

// ── Reverter para pendente ──
async function setStatusPendente(id) {
if (!confirm(‘Reverter para Pendente? A data real e o comprovante serão removidos.’)) return;
const { error } = await db.from(‘pedidos’)
.update({ status: STATUS.PENDENTE, data_entrega_real: null, comprovante_url: null })
.eq(‘id’, id);
if (!error) {
showToast(‘↩ Pedido reaberto como Pendente’, ‘info’);
await loadOrders();
}
}

// ────────────────────────────────────────────────────────────
// ⑬ SALVAR PEDIDO
// ────────────────────────────────────────────────────────────
async function handleSaveOrder(event) {
event.preventDefault();

setButtonLoading(‘btn-save’, true);
hideModalMessage();

const orderId    = document.getElementById(‘order-id’).value;
const status     = document.getElementById(‘field-status’).value;
const isPago     = status === STATUS.ENTREGUE_PAGO;
const isEntregue = isPago || status === STATUS.ENTREGUE_NPAGO;

// Validações
if (!orderItems.length) {
showModalMessage(‘Adicione ao menos um item ao pedido.’, ‘error’);
setButtonLoading(‘btn-save’, false);
return;
}

if (isEntregue && !document.getElementById(‘field-data-entrega-real’).value) {
showModalMessage(‘Informe a data de entrega real.’, ‘error’);
setButtonLoading(‘btn-save’, false);
return;
}

if (isPago && !isAdmin) {
const jaTemComprovante = !document.getElementById(‘comprovante-existing’).classList.contains(‘hidden’);
if (!comprovanteFile && !jaTemComprovante) {
showModalMessage(‘O comprovante de pagamento é obrigatório para registrar o recebimento.’, ‘error’);
setButtonLoading(‘btn-save’, false);
return;
}
}

// Upload de comprovante
let comprovanteUrl = null;
if (comprovanteFile) {
comprovanteUrl = await uploadComprovante(comprovanteFile, orderId || ‘new_’ + Date.now());
if (!comprovanteUrl) {
showModalMessage(‘Erro ao enviar o comprovante. Tente novamente.’, ‘error’);
setButtonLoading(‘btn-save’, false);
return;
}
}
if (!comprovanteUrl && orderId) {
comprovanteUrl = allOrders.find(o => o.id === orderId)?.comprovante_url || null;
}

const payload = {
cliente:           document.getElementById(‘field-cliente’).value.trim(),
descricao:         document.getElementById(‘field-descricao’).value.trim(),
valor:             getOrderTotal(),
status,
data_pedido:       document.getElementById(‘field-data-pedido’).value || null,
data_entrega:      document.getElementById(‘field-data-entrega’).value || null,
data_entrega_real: isEntregue ? (document.getElementById(‘field-data-entrega-real’).value || null) : null,
comprovante_url:   isPago ? comprovanteUrl : null,
…(orderId ? {} : { user_id: currentUser.id }),
};

let savedOrderId = orderId;
let error;

try {
if (orderId) {
({ error } = await db.from(‘pedidos’).update(payload).eq(‘id’, orderId));
} else {
const { data: inserted, error: ie } = await db.from(‘pedidos’).insert(payload).select().single();
error = ie;
if (inserted) savedOrderId = inserted.id;
}

```
if (error) throw error;

// Salva itens
await db.from('itens_pedido').delete().eq('pedido_id', savedOrderId);
if (orderItems.length) {
  const { error: itemsError } = await db.from('itens_pedido').insert(orderItems.map(i => ({
    pedido_id:  savedOrderId,
    product_id: i.product_id || null,
    nome:       i.nome,
    preco:      i.preco,
    quantidade: i.quantidade,
    subtotal:   i.preco * i.quantidade,
  })));
  if (itemsError) throw itemsError;
}

// Toast de sucesso
showToast(orderId ? '✅ Pedido atualizado!' : '✅ Pedido criado com sucesso!', 'success');
closeOrderModal();
await loadOrders();
```

} catch (err) {
console.error(‘Erro ao salvar:’, err);
showModalMessage(’Erro ao salvar o pedido: ’ + (err.message || ‘tente novamente.’), ‘error’);
setButtonLoading(‘btn-save’, false);
}
}

// ────────────────────────────────────────────────────────────
// ⑭ MODAL DE PEDIDO
// ────────────────────────────────────────────────────────────
function openOrderModal() {
document.getElementById(‘modal-title’).textContent = ‘Novo Pedido’;
document.getElementById(‘order-form’).reset();
document.getElementById(‘order-id’).value          = ‘’;
document.getElementById(‘field-data-pedido’).value = todayDate();
document.getElementById(‘field-status’).value      = STATUS.PENDENTE;
orderItems      = [];
comprovanteFile = null;
renderItemsList();
updateConclusaoSection();
hideModalMessage();
resetComprovanteUI();
document.getElementById(‘order-modal’).classList.remove(‘hidden’);
}

function openEditOrderModal(id, forcePayment = false, forceStatus = null) {
const order = allOrders.find(p => p.id === id);
if (!order) return;

document.getElementById(‘modal-title’).textContent           = ‘Editar Pedido’;
document.getElementById(‘order-id’).value                    = order.id;
document.getElementById(‘field-cliente’).value               = order.cliente;
document.getElementById(‘field-descricao’).value             = order.descricao || ‘’;
document.getElementById(‘field-data-pedido’).value           = order.data_pedido || ‘’;
document.getElementById(‘field-data-entrega’).value          = order.data_entrega || ‘’;
document.getElementById(‘field-data-entrega-real’).value     = order.data_entrega_real || ‘’;

if (forcePayment) {
document.getElementById(‘field-status’).value = STATUS.ENTREGUE_PAGO;
} else if (forceStatus) {
document.getElementById(‘field-status’).value = forceStatus;
} else {
document.getElementById(‘field-status’).value = order.status;
}

orderItems = (order.itens_pedido || []).map(i => ({
_tempId:    Date.now() + Math.random(),
product_id: i.product_id,
nome:       i.nome || i.produtos?.nome || ‘’,
preco:      i.preco,
quantidade: i.quantidade,
}));
renderItemsList();

comprovanteFile = null;
resetComprovanteUI();
if (order.comprovante_url) {
const link = document.getElementById(‘comprovante-existing’);
link.href = order.comprovante_url;
link.classList.remove(‘hidden’);
}

updateConclusaoSection();
hideModalMessage();
document.getElementById(‘order-modal’).classList.remove(‘hidden’);
}

function closeOrderModal() {
document.getElementById(‘order-modal’).classList.add(‘hidden’);
comprovanteFile = null;
setButtonLoading(‘btn-save’, false);
}

function closeModalOnOverlay(e) {
if (e.target === document.getElementById(‘order-modal’)) closeOrderModal();
}

function onStatusChange() { updateConclusaoSection(); }

function updateConclusaoSection() {
const status     = document.getElementById(‘field-status’).value;
const isEntregue = status === STATUS.ENTREGUE_PAGO || status === STATUS.ENTREGUE_NPAGO;
const isPago     = status === STATUS.ENTREGUE_PAGO;

document.getElementById(‘conclusao-section’).classList.toggle(‘hidden’, !isEntregue);

if (isEntregue) {
document.getElementById(‘comprovante-field’).classList.toggle(‘hidden’, !isPago);
if (isPago) {
document.getElementById(‘comprovante-label’).textContent = isAdmin
? ‘Comprovante de pagamento (opcional para admin)’
: ‘Comprovante de pagamento *’;
}
}
}

// ────────────────────────────────────────────────────────────
// ⑮ COMPROVANTE
// ────────────────────────────────────────────────────────────
function onComprovanteSelected(event) {
const file = event.target.files[0];
if (!file) return;
comprovanteFile = file;
const preview = document.getElementById(‘comprovante-preview’);
preview.classList.remove(‘hidden’);
if (file.type.startsWith(‘image/’)) {
const reader = new FileReader();
reader.onload = e => { preview.innerHTML = `<img src="${e.target.result}" class="comprovante-img-preview" />`; };
reader.readAsDataURL(file);
} else {
preview.innerHTML = `<div class="file-preview-tag">📄 ${escapeHtml(file.name)}</div>`;
}
document.getElementById(‘upload-area’).style.display = ‘none’;
}

function resetComprovanteUI() {
document.getElementById(‘field-comprovante’).value       = ‘’;
document.getElementById(‘comprovante-preview’).innerHTML = ‘’;
document.getElementById(‘comprovante-preview’).classList.add(‘hidden’);
document.getElementById(‘comprovante-existing’).classList.add(‘hidden’);
document.getElementById(‘comprovante-existing’).href     = ‘’;
document.getElementById(‘upload-area’).style.display    = ‘flex’;
comprovanteFile = null;
}

async function uploadComprovante(file, pedidoId) {
const ext      = file.name.split(’.’).pop();
const fileName = `comprovantes/${pedidoId}_${Date.now()}.${ext}`;
const { error } = await db.storage.from(‘comprovantes’).upload(fileName, file, { upsert: true });
if (error) { console.error(‘Upload error:’, error); return null; }
const { data: urlData } = db.storage.from(‘comprovantes’).getPublicUrl(fileName);
return urlData.publicUrl;
}

function viewReceipt(url) {
const isImage = /.(jpg|jpeg|png|gif|webp)$/i.test(url);
document.getElementById(‘receipt-content’).innerHTML = isImage
? `<img src="${escapeHtml(url)}" class="receipt-full-img" />`
: `<div class="receipt-pdf-link"><a href="${escapeHtml(url)}" target="_blank" class="btn-primary" style="display:inline-block;text-decoration:none;padding:14px 24px">📄 Abrir PDF</a></div>`;
document.getElementById(‘receipt-modal’).classList.remove(‘hidden’);
}

function closeReceiptModal() { document.getElementById(‘receipt-modal’).classList.add(‘hidden’); }

// ────────────────────────────────────────────────────────────
// ⑯ EXCLUSÃO
// ────────────────────────────────────────────────────────────
function openDeleteModal(id)  { deleteTargetId = id; document.getElementById(‘delete-modal’).classList.remove(‘hidden’); }
function closeDeleteModal()   { deleteTargetId = null; document.getElementById(‘delete-modal’).classList.add(‘hidden’); }
function closeDeleteModalOnOverlay(e) { if (e.target === document.getElementById(‘delete-modal’)) closeDeleteModal(); }

async function confirmDelete() {
if (!deleteTargetId) return;
await db.from(‘itens_pedido’).delete().eq(‘pedido_id’, deleteTargetId);
await db.from(‘pedidos’).delete().eq(‘id’, deleteTargetId);
showToast(‘🗑️ Pedido excluído’, ‘info’);
closeDeleteModal();
await loadOrders();
}

// ────────────────────────────────────────────────────────────
// ⑰ PDF ORÇAMENTO
// ────────────────────────────────────────────────────────────
function gerarOrcamentoPDF() {
const cliente = document.getElementById(‘field-cliente’).value.trim() || ‘Cliente’;
const obs     = document.getElementById(‘field-descricao’).value.trim();
if (!orderItems.length) { alert(‘Adicione itens antes de gerar o orçamento.’); return; }

const { jsPDF } = window.jspdf;
const doc   = new jsPDF({ unit: ‘mm’, format: ‘a4’ });
const green = [16,185,129], tinta = [17,24,39], suave = [107,114,128];

// Header com gradiente simulado
doc.setFillColor(…green); doc.rect(0,0,210,38,‘F’);
doc.setTextColor(255,255,255);
doc.setFontSize(24); doc.setFont(‘helvetica’,‘bold’); doc.text(‘Papelaria BETEL’,15,18);
doc.setFontSize(10); doc.setFont(‘helvetica’,‘normal’); doc.text(‘Orçamento de Pedido’,15,26); doc.text(`Data: ${formatDate(todayDate())}`,15,32);

doc.setTextColor(…tinta); doc.setFontSize(13); doc.setFont(‘helvetica’,‘bold’); doc.text(‘Cliente’,15,50);
doc.setFont(‘helvetica’,‘normal’); doc.setFontSize(11); doc.text(cliente,15,57);
doc.setDrawColor(…green); doc.setLineWidth(0.5); doc.line(15,62,195,62);

doc.setFontSize(11); doc.setFont(‘helvetica’,‘bold’); doc.setTextColor(…tinta);
doc.text(‘Item’,15,70); doc.text(‘Qtd’,120,70,{align:‘center’}); doc.text(‘Unit.’,150,70,{align:‘right’}); doc.text(‘Subtotal’,195,70,{align:‘right’});
doc.setLineWidth(0.2); doc.setDrawColor(200,200,200); doc.line(15,72,195,72);

let y = 80; doc.setFont(‘helvetica’,‘normal’); doc.setTextColor(…suave);
orderItems.forEach(item => {
if (y > 260) { doc.addPage(); y = 20; }
doc.text(item.nome.substring(0,45),15,y); doc.text(String(item.quantidade),120,y,{align:‘center’});
doc.text(`R$ ${formatCurrency(item.preco)}`,150,y,{align:‘right’}); doc.text(`R$ ${formatCurrency(item.preco*item.quantidade)}`,195,y,{align:‘right’});
y += 8; doc.line(15,y-2,195,y-2);
});

y += 6;
doc.setFillColor(209,250,229); doc.rect(120,y-5,75,14,‘F’);
doc.setFontSize(12); doc.setFont(‘helvetica’,‘bold’); doc.setTextColor(5,150,105);
doc.text(‘TOTAL’,125,y+3); doc.text(`R$ ${formatCurrency(getOrderTotal())}`,195,y+3,{align:‘right’});

if (obs) {
y += 22; doc.setFontSize(10); doc.setFont(‘helvetica’,‘bold’); doc.setTextColor(…tinta); doc.text(‘Observações:’,15,y);
doc.setFont(‘helvetica’,‘normal’); doc.setTextColor(…suave); doc.text(doc.splitTextToSize(obs,170),15,y+7);
}

doc.setFontSize(9); doc.setTextColor(180,180,180);
doc.text(‘Orçamento gerado por Papelaria BETEL - sujeito a alterações.’,105,285,{align:‘center’});
doc.save(`orcamento_${cliente.replace(/\s+/g,'_')}_${todayDate()}.pdf`);

showToast(‘📄 PDF gerado com sucesso!’, ‘success’);
}

// ────────────────────────────────────────────────────────────
// ⑱ FILTROS
// ────────────────────────────────────────────────────────────
function setFilter(filter, btn) {
currentFilter = filter;
document.querySelectorAll(’.filter-btn’).forEach(b => b.classList.remove(‘active’));
btn.classList.add(‘active’);
renderOrders();
updateSummaryCards();
}

// ────────────────────────────────────────────────────────────
// ⑲ UI HELPERS
// ────────────────────────────────────────────────────────────
function showLoadingState(show) {
const loadingEl = document.getElementById(‘loading-state’);
const listEl    = document.getElementById(‘orders-list’);
const emptyEl   = document.getElementById(‘empty-state’);

if (loadingEl) loadingEl.classList.toggle(‘hidden’, !show);
if (listEl)    listEl.classList.toggle(‘hidden’, show);
if (show && emptyEl) emptyEl.classList.add(‘hidden’);
}

function showAuthMessage(msg, type) {
const el = document.getElementById(‘auth-message’);
if (!el) return;
el.textContent = msg; el.className = `auth-message ${type}`;
}

function showModalMessage(msg, type) {
const el = document.getElementById(‘modal-message’);
if (!el) return;
el.textContent = msg; el.className = `auth-message ${type}`;
el.classList.remove(‘hidden’);
}

function hideModalMessage() {
const el = document.getElementById(‘modal-message’);
if (el) el.className = ‘auth-message hidden’;
}

function setButtonLoading(btnId, loading) {
const btn = document.getElementById(btnId);
if (!btn) return;
btn.disabled = loading;
btn.querySelector(’.btn-text’)?.classList.toggle(‘hidden’, loading);
btn.querySelector(’.btn-loader’)?.classList.toggle(‘hidden’, !loading);
}

// ────────────────────────────────────────────────────────────
// ⑳ UTILITÁRIOS
// ────────────────────────────────────────────────────────────
function formatCurrency(v) { return Number(v).toLocaleString(‘pt-BR’,{minimumFractionDigits:2,maximumFractionDigits:2}); }
function formatDate(d)     { if (!d) return ‘’; const [y,m,dd] = d.split(’-’); return `${dd}/${m}/${y}`; }
function todayDate()       { return new Date().toISOString().split(‘T’)[0]; }
function escapeHtml(str)   { const d = document.createElement(‘div’); d.appendChild(document.createTextNode(str||’’)); return d.innerHTML; }

function translateError(msg) {
if (msg.includes(‘Invalid login credentials’)) return ‘E-mail ou senha incorretos.’;
if (msg.includes(‘Email not confirmed’))        return ‘Confirme seu e-mail antes de entrar.’;
return ‘Ocorreu um erro. Tente novamente.’;
}