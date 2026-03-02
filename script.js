// ============================================================
//  script.js — Papelaria Criativa v5
//  Melhorias adicionadas (estrutura v4 preservada intacta):
//  1) Dashboard: nav de mês, indicadores, cards clicáveis
//  2) Filtros rápidos de período
//  3) Lista: preview de contagem + total sempre visível
//  4) Wizard “+ Novo” 4 passos com auto-save de rascunho
// ============================================================

// ────────────────────────────────────────────────────────────
// ① CONFIGURAÇÃO (inalterado)
// ────────────────────────────────────────────────────────────
const SUPABASE_URL      = ‘https://SEU_PROJECT_ID.supabase.co’;
const SUPABASE_ANON_KEY = ‘SUA_ANON_KEY_AQUI’;
const ADMIN_EMAIL       = ‘jrs.edson@gmail.com’;

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ────────────────────────────────────────────────────────────
// ② STATUS (inalterado)
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
// ③ ESTADO GLOBAL (v4 preservado + novos campos)
// ────────────────────────────────────────────────────────────
let currentUser     = null;
let isAdmin         = false;
let allOrders       = [];
let allProducts     = [];
let currentFilter   = ‘todos’;
let deleteTargetId  = null;
let orderItems      = [];      // modal edição
let comprovanteFile = null;    // modal edição
let periodoInicio   = ‘’;
let periodoFim      = ‘’;

// NOVO ① — navegação de mês: offset em meses a partir do mês atual
let mesOffset = 0;

// NOVO ④ — wizard state
let wizardStep        = 1;
let wizardItems       = [];
let wizardForma       = ‘’;
let wizardComprovante = null;
let draftTimer        = null;
const DRAFT_KEY       = ‘papelaria_draft_v1’;

// ────────────────────────────────────────────────────────────
// ④ INICIALIZAÇÃO (v4 preservado + novos inits)
// ────────────────────────────────────────────────────────────
document.addEventListener(‘DOMContentLoaded’, async () => {
const page = window.location.pathname.includes(‘dashboard’) ? ‘dashboard’ : ‘auth’;
const { data: { session } } = await db.auth.getSession();

if (page === ‘auth’) {
if (session) window.location.href = ‘dashboard.html’;
return;
}
if (!session) { window.location.href = ‘index.html’; return; }

currentUser = session.user;
isAdmin     = currentUser.email === ADMIN_EMAIL;

const badge = document.getElementById(‘user-badge’);
badge.textContent = isAdmin ? `👑 ${currentUser.email.split('@')[0]}` : `✏️ ${currentUser.email.split('@')[0]}`;
badge.className   = ’user-badge ’ + (isAdmin ? ‘badge-admin’ : ‘badge-op’);
if (isAdmin) document.getElementById(‘btn-products-nav’).style.display = ‘flex’;

// Período padrão = mês atual
const hoje = new Date();
periodoInicio = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}-01`;
periodoFim    = todayDate();
document.getElementById(‘periodo-inicio’).value = periodoInicio;
document.getElementById(‘periodo-fim’).value    = periodoFim;

// NOVO ①: renderiza label do mês navegável
renderMesNav();

// Auto-save ao perder foco da janela (NOVO ④)
document.addEventListener(‘visibilitychange’, () => {
if (document.hidden) saveDraft();
});

await loadProducts();
await loadOrders();
});

// ────────────────────────────────────────────────────────────
// ⑤ AUTH (inalterado)
// ────────────────────────────────────────────────────────────
async function handleLogin(event) {
event.preventDefault();
const email    = document.getElementById(‘login-email’).value.trim();
const password = document.getElementById(‘login-password’).value;
setButtonLoading(‘btn-login’, true);
const { error } = await db.auth.signInWithPassword({ email, password });
if (error) { showAuthMessage(translateError(error.message), ‘error’); setButtonLoading(‘btn-login’, false); return; }
window.location.href = ‘dashboard.html’;
}
async function handleLogout() { await db.auth.signOut(); window.location.href = ‘index.html’; }

// ────────────────────────────────────────────────────────────
// ⑥ FILTRO DE PERÍODO (v4 preservado)
// ────────────────────────────────────────────────────────────
function applyPeriod() {
const ini = document.getElementById(‘periodo-inicio’).value;
const fim = document.getElementById(‘periodo-fim’).value;
if (!ini || !fim) return;
if (ini > fim) {
document.getElementById(‘periodo-inicio’).value = fim;
document.getElementById(‘periodo-fim’).value    = ini;
periodoInicio = fim; periodoFim = ini;
} else {
periodoInicio = ini; periodoFim = fim;
}
// Limpa atalho ativo ao usar datas manuais
document.querySelectorAll(’.period-shortcut’).forEach(b => b.classList.remove(‘active’));
renderOrders();
updateSummaryCards();
}

// NOVO ② — Atalhos rápidos de período
function setPeriodShortcut(tipo) {
const hoje = new Date();
const y = hoje.getFullYear();
const m = hoje.getMonth();

let ini, fim = todayDate();

if (tipo === ‘hoje’) {
ini = fim;
} else if (tipo === ‘semana’) {
const d = new Date(hoje);
d.setDate(d.getDate() - d.getDay()); // domingo desta semana
ini = d.toISOString().split(‘T’)[0];
} else if (tipo === ‘mes’) {
ini = `${y}-${String(m+1).padStart(2,'0')}-01`;
} else if (tipo === ‘30dias’) {
const d = new Date(hoje);
d.setDate(d.getDate() - 29);
ini = d.toISOString().split(‘T’)[0];
} else if (tipo === ‘ano’) {
ini = `${y}-01-01`;
}

periodoInicio = ini;
periodoFim    = fim;
document.getElementById(‘periodo-inicio’).value = ini;
document.getElementById(‘periodo-fim’).value    = fim;

// Marca atalho ativo
document.querySelectorAll(’.period-shortcut’).forEach(b => {
b.classList.toggle(‘active’, b.getAttribute(‘onclick’).includes(`'${tipo}'`));
});

renderOrders();
updateSummaryCards();
}

function inPeriod(order) {
const d = order.data_pedido || order.created_at?.split(‘T’)[0] || ‘’;
if (!d) return false;
return d >= periodoInicio && d <= periodoFim;
}

// NOVO ① — helper que retorna {ini, fim} de um mês com offset
function getMesRange(offset = 0) {
const hoje = new Date();
const d    = new Date(hoje.getFullYear(), hoje.getMonth() + offset, 1);
const ini  = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
// último dia do mês
const ultimo = new Date(d.getFullYear(), d.getMonth()+1, 0);
const fim = `${ultimo.getFullYear()}-${String(ultimo.getMonth()+1).padStart(2,'0')}-${String(ultimo.getDate()).padStart(2,'0')}`;
return { ini, fim, date: d };
}

function inMes(order, offset = 0) {
const { ini, fim } = getMesRange(offset);
const d = order.data_pedido || order.created_at?.split(‘T’)[0] || ‘’;
return d >= ini && d <= fim;
}

// NOVO ① — renderiza ‹ Fev/2026 | MAR/2026 | Abr/2026 ›
function renderMesNav() {
const meses = [‘Jan’,‘Fev’,‘Mar’,‘Abr’,‘Mai’,‘Jun’,‘Jul’,‘Ago’,‘Set’,‘Out’,‘Nov’,‘Dez’];
const prev  = getMesRange(mesOffset - 1).date;
const curr  = getMesRange(mesOffset).date;
const next  = getMesRange(mesOffset + 1).date;

document.getElementById(‘mes-prev-label’).textContent = `${meses[prev.getMonth()]}/${prev.getFullYear()}`;
document.getElementById(‘mes-label’).textContent      = `${meses[curr.getMonth()].toUpperCase()}/${curr.getFullYear()}`;
document.getElementById(‘mes-next-label’).textContent = `${meses[next.getMonth()]}/${next.getFullYear()}`;
}

// NOVO ① — navega para mês anterior/próximo
function navegarMes(delta) {
mesOffset += delta;
renderMesNav();
updateSummaryCards();
}

// ────────────────────────────────────────────────────────────
// ⑦ PRODUTOS (inalterado)
// ────────────────────────────────────────────────────────────
async function loadProducts() {
const { data, error } = await db.from(‘produtos’).select(’*’).order(‘nome’);
if (error) { console.error(‘Erro produtos:’, error); return; }
allProducts = data || [];
populateProductSelect();
populateWizardProductSelect(); // NOVO ④
renderProductsList();
}

function populateProductSelect() {
const sel = document.getElementById(‘item-product-select’);
if (!sel) return;
sel.innerHTML = ‘<option value="">Selecione um produto…</option>’;
allProducts.forEach(p => {
const opt = document.createElement(‘option’);
opt.value = p.id; opt.textContent = `${p.nome} — R$ ${formatCurrency(p.preco)}`;
opt.dataset.preco = p.preco; opt.dataset.nome = p.nome;
sel.appendChild(opt);
});
}

// NOVO ④ — popula o select do wizard
function populateWizardProductSelect() {
const sel = document.getElementById(‘w-product-select’);
if (!sel) return;
sel.innerHTML = ‘<option value="">＋ Adicionar produto…</option>’;
allProducts.forEach(p => {
const opt = document.createElement(‘option’);
opt.value = p.id; opt.textContent = `${p.nome} — R$ ${formatCurrency(p.preco)}`;
opt.dataset.preco = p.preco; opt.dataset.nome = p.nome;
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
clearProductForm();
await loadProducts();
}
function editProduct(id) {
const p = allProducts.find(x => x.id === id); if (!p) return;
document.getElementById(‘product-id’).value     = p.id;
document.getElementById(‘prod-nome’).value      = p.nome;
document.getElementById(‘prod-preco’).value     = p.preco;
document.getElementById(‘prod-descricao’).value = p.descricao || ‘’;
}
async function deleteProduct(id) {
if (!confirm(‘Excluir este produto?’)) return;
await db.from(‘produtos’).delete().eq(‘id’, id);
await loadProducts();
}
function clearProductForm() { document.getElementById(‘product-id’).value = ‘’; document.getElementById(‘product-form’).reset(); }
function openProductsModal()          { loadProducts(); document.getElementById(‘products-modal’).classList.remove(‘hidden’); }
function closeProductsModal()         { document.getElementById(‘products-modal’).classList.add(‘hidden’); }
function closeProductsModalOverlay(e) { if (e.target === document.getElementById(‘products-modal’)) closeProductsModal(); }

// ────────────────────────────────────────────────────────────
// ⑧ ITENS DO PEDIDO — modal edição (inalterado)
// ────────────────────────────────────────────────────────────
function addItemFromSelect() {
const sel = document.getElementById(‘item-product-select’);
const qty = parseInt(document.getElementById(‘item-qty’).value) || 1;
if (!sel.value) { alert(‘Selecione um produto.’); return; }
const opt = sel.options[sel.selectedIndex];
addItem({ product_id: sel.value, nome: opt.dataset.nome, preco: parseFloat(opt.dataset.preco), quantidade: qty });
sel.value = ‘’; document.getElementById(‘item-qty’).value = 1;
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
if (existing) { existing.quantidade += item.quantidade; } else { orderItems.push({ …item, _tempId: Date.now() + Math.random() }); }
renderItemsList();
}
function removeItem(tempId) { orderItems = orderItems.filter(i => i._tempId !== tempId); renderItemsList(); }
function renderItemsList() {
const el = document.getElementById(‘items-list’);
if (!orderItems.length) { el.innerHTML = ‘<p class="empty-inline">Nenhum item adicionado.</p>’; updateOrderTotal(); return; }
el.innerHTML = orderItems.map(item => ` <div class="item-row"> <div class="item-info"> <span class="item-name">${escapeHtml(item.nome)}</span> <span class="item-meta">${item.quantidade}x R$ ${formatCurrency(item.preco)}</span> </div> <span class="item-subtotal">R$ ${formatCurrency(item.preco * item.quantidade)}</span> <button type="button" class="btn-remove-item" onclick="removeItem(${item._tempId})">✕</button> </div>`).join(’’);
updateOrderTotal();
}
function updateOrderTotal() {
const el = document.getElementById(‘order-total-display’);
if (el) el.textContent = `R$ ${formatCurrency(getOrderTotal())}`;
}
function getOrderTotal() { return orderItems.reduce((acc, i) => acc + i.preco * i.quantidade, 0); }

// ────────────────────────────────────────────────────────────
// ⑨ PEDIDOS — CARREGAR (inalterado)
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

// NOVO ④: atualiza datalist de autocomplete de clientes
updateClientesDatalist();

renderOrders();
updateSummaryCards();
}

// NOVO ④ — popula datalist com clientes únicos
function updateClientesDatalist() {
const dl = document.getElementById(‘clientes-list’);
if (!dl) return;
const uniq = […new Set(allOrders.map(o => o.cliente).filter(Boolean))].sort();
dl.innerHTML = uniq.map(c => `<option value="${escapeHtml(c)}">`).join(’’);
}

function isLate(order) {
if (!order.data_entrega) return false;
const entregue = order.status === STATUS.ENTREGUE_PAGO || order.status === STATUS.ENTREGUE_NPAGO;
if (entregue) return order.data_entrega_real ? order.data_entrega_real > order.data_entrega : false;
return todayDate() > order.data_entrega;
}

// ────────────────────────────────────────────────────────────
// MELHORIA 3 — renderOrders com preview de contagem + total
// ────────────────────────────────────────────────────────────
function renderOrders() {
const list       = document.getElementById(‘orders-list’);
const emptyState = document.getElementById(‘empty-state’);
const preview    = document.getElementById(‘orders-preview’);
const search     = (document.getElementById(‘search-input’)?.value || ‘’).toLowerCase().trim();

let filtered = […allOrders];

if (currentFilter === ‘atrasado’) {
filtered = filtered.filter(isLate);
} else if (currentFilter !== ‘todos’) {
filtered = filtered.filter(p => p.status === currentFilter);
}

// Filtro de período (painel direito)
filtered = filtered.filter(inPeriod);

// Busca por cliente
if (search) filtered = filtered.filter(p => p.cliente.toLowerCase().includes(search));

// NOVO ③: atualiza preview sempre
const totalFiltrado = filtered.reduce((a, o) => a + Number(o.valor), 0);
document.getElementById(‘preview-count’).textContent = filtered.length;
document.getElementById(‘preview-total’).textContent = `R$ ${formatCurrency(totalFiltrado)}`;

if (!filtered.length) {
list.innerHTML = ‘’; list.classList.add(‘hidden’);
preview.classList.add(‘hidden’);
emptyState.classList.remove(‘hidden’);
return;
}

emptyState.classList.add(‘hidden’);
preview.classList.remove(‘hidden’);
list.classList.remove(‘hidden’);

list.innerHTML = filtered.map(order => {
const late    = isLate(order);
const isPago  = order.status === STATUS.ENTREGUE_PAGO;
const isNPago = order.status === STATUS.ENTREGUE_NPAGO;

```
const itensHtml = order.itens_pedido?.length
  ? `<div class="order-items-preview">${order.itens_pedido.map(i =>
      `<span class="item-chip">${i.quantidade}x ${escapeHtml(i.nome || i.produtos?.nome || '?')}</span>`
    ).join('')}</div>` : '';

let statusBtns = '';
if (order.status === STATUS.PENDENTE) {
  statusBtns = `<button class="btn-status-toggle btn-entregue" onclick="openEntregueModal('${order.id}')">📦 Entregar</button>`;
} else if (isNPago) {
  statusBtns = `
    <button class="btn-status-toggle btn-pago" onclick="openEditOrderModal('${order.id}', true)">💰 Receber pgto</button>
    <button class="btn-status-sm" title="Reverter" onclick="setStatusPendente('${order.id}')">↩</button>`;
} else if (isPago) {
  statusBtns = `<button class="btn-status-toggle btn-reverter" onclick="setStatusPendente('${order.id}')">↩ Reabrir</button>`;
}

// MELHORIA 3: tag colorida de status + tag atrasado
let statusTag = `<span class="status-badge ${STATUS_BADGE_CLASS[order.status] || 'badge-pending'}">${STATUS_LABEL[order.status] || order.status}</span>`;
if (late) statusTag += ` <span class="status-badge badge-late">🔴 Atrasado</span>`;

// Forma de pagamento (campo extra guardado no pedido)
const formaTag = order.forma_pagamento
  ? `<span class="forma-tag">${formaIcon(order.forma_pagamento)} ${order.forma_pagamento}</span>`
  : '';

return `
<article class="order-card status-${order.status.replace(/_/g,'-')} ${late ? 'status-late' : ''}">
  <div class="order-card-top">
    <div class="order-client">${escapeHtml(order.cliente)}</div>
    <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end">${statusTag}${formaTag}</div>
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
    <button class="btn-edit"   onclick="openEditOrderModal('${order.id}')">✏️</button>
    ${order.comprovante_url
      ? `<button class="btn-receipt" onclick="viewReceipt('${escapeHtml(order.comprovante_url)}')">🧾</button>`
      : ''}
    <button class="btn-delete" onclick="openDeleteModal('${order.id}')">🗑️</button>
  </div>
</article>`;
```

}).join(’’);
}

function formaIcon(forma) {
const icons = { dinheiro:‘💵’, cartao:‘💳’, pix:‘📱’, fiado:‘🤝’ };
return icons[forma] || ‘💳’;
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

// ────────────────────────────────────────────────────────────
// MELHORIA 1 — updateSummaryCards com mesOffset + indicadores
// ────────────────────────────────────────────────────────────
function updateSummaryCards() {
// Pedidos do mês navegado (mesOffset)
const doMes   = allOrders.filter(o => inMes(o, mesOffset));
const pagMes  = doMes.filter(o => o.status === STATUS.ENTREGUE_PAGO);
const aguMes  = doMes.filter(o => o.status === STATUS.ENTREGUE_NPAGO);
const atras   = allOrders.filter(isLate);

document.getElementById(‘mes-faturado’).textContent   = `R$ ${formatCurrency(pagMes.reduce((a,o)=>a+Number(o.valor),0))}`;
document.getElementById(‘mes-aguardando’).textContent = `R$ ${formatCurrency(aguMes.reduce((a,o)=>a+Number(o.valor),0))}`;
document.getElementById(‘count-late’).textContent     = atras.length;

// NOVO ①: indicadores adicionais
const totalMes   = doMes.reduce((a,o) => a + Number(o.valor), 0);
const ticketMed  = doMes.length ? totalMes / doMes.length : 0;
const clientes   = new Set(doMes.map(o => o.cliente?.toLowerCase().trim())).size;

// Melhor dia: conta pedidos por data_pedido e pega o com mais
const porDia = {};
doMes.forEach(o => {
const d = o.data_pedido || o.created_at?.split(‘T’)[0] || ‘’;
if (d) porDia[d] = (porDia[d] || 0) + Number(o.valor);
});
let melhorDia = ‘–’;
if (Object.keys(porDia).length) {
const top = Object.entries(porDia).sort((a,b) => b[1]-a[1])[0];
melhorDia = formatDate(top[0]);
}

document.getElementById(‘mes-total-pedidos’).textContent = doMes.length;
document.getElementById(‘mes-ticket-medio’).textContent  = `R$ ${formatCurrency(ticketMed)}`;
document.getElementById(‘mes-clientes’).textContent      = clientes;
document.getElementById(‘mes-melhor-dia’).textContent    = melhorDia;

// Período filtrado (painel direito)
const doPer   = allOrders.filter(inPeriod);
const pagPer  = doPer.filter(o => o.status === STATUS.ENTREGUE_PAGO);
const aguPer  = doPer.filter(o => o.status === STATUS.ENTREGUE_NPAGO);
const pendPer = doPer.filter(o => o.status === STATUS.PENDENTE);

document.getElementById(‘per-faturado’).textContent    = `R$ ${formatCurrency(pagPer.reduce((a,o)=>a+Number(o.valor),0))}`;
document.getElementById(‘per-aguardando’).textContent  = `R$ ${formatCurrency(aguPer.reduce((a,o)=>a+Number(o.valor),0))}`;
document.getElementById(‘per-pendente’).textContent    = `R$ ${formatCurrency(pendPer.reduce((a,o)=>a+Number(o.valor),0))}`;
document.getElementById(‘per-count-pago’).textContent  = `${pagPer.length} pedido${pagPer.length!==1?'s':''}`;
document.getElementById(‘per-count-aguar’).textContent = `${aguPer.length} pedido${aguPer.length!==1?'s':''}`;
document.getElementById(‘per-count-pend’).textContent  = `${pendPer.length} pedido${pendPer.length!==1?'s':''}`;
}

// NOVO ① — card clicável filtra a lista (usa o painel direito + status filter)
function filtrarPorCard(statusOrTipo) {
// Alinha o período do painel direito com o mês do painel esquerdo
const { ini, fim } = getMesRange(mesOffset);
periodoInicio = ini;
periodoFim    = fim;
document.getElementById(‘periodo-inicio’).value = ini;
document.getElementById(‘periodo-fim’).value    = fim;

// Remove atalho ativo
document.querySelectorAll(’.period-shortcut’).forEach(b => b.classList.remove(‘active’));

// Define filtro de status
currentFilter = statusOrTipo;
document.querySelectorAll(’.filter-btn’).forEach(b => b.classList.remove(‘active’));
const btn = […document.querySelectorAll(’.filter-btn’)].find(b =>
b.getAttribute(‘onclick’)?.includes(`'${statusOrTipo}'`)
);
if (btn) btn.classList.add(‘active’);

renderOrders();
updateSummaryCards();

// Rola até a lista
document.querySelector(’.orders-section’)?.scrollIntoView({ behavior: ‘smooth’ });
}

// ────────────────────────────────────────────────────────────
// ⑩ SALVAR PEDIDO (modal edição — inalterado do v4)
// ────────────────────────────────────────────────────────────
async function handleSaveOrder(event) {
event.preventDefault();
setButtonLoading(‘btn-save’, true);
hideModalMessage();

const orderId    = document.getElementById(‘order-id’).value;
const status     = document.getElementById(‘field-status’).value;
const isPago     = status === STATUS.ENTREGUE_PAGO;
const isEntregue = isPago || status === STATUS.ENTREGUE_NPAGO;

if (!orderItems.length) {
showModalMessage(‘Adicione ao menos um item ao pedido.’, ‘error’);
setButtonLoading(‘btn-save’, false); return;
}
if (isEntregue && !document.getElementById(‘field-data-entrega-real’).value) {
showModalMessage(‘Informe a data de entrega real.’, ‘error’);
setButtonLoading(‘btn-save’, false); return;
}
if (isPago && !isAdmin) {
const jaTemComprovante = !document.getElementById(‘comprovante-existing’).classList.contains(‘hidden’);
if (!comprovanteFile && !jaTemComprovante) {
showModalMessage(‘O comprovante de pagamento é obrigatório para registrar o recebimento.’, ‘error’);
setButtonLoading(‘btn-save’, false); return;
}
}

let comprovanteUrl = null;
if (comprovanteFile) {
comprovanteUrl = await uploadComprovante(comprovanteFile, orderId || ‘new_’ + Date.now());
if (!comprovanteUrl) { showModalMessage(‘Erro ao enviar o comprovante.’, ‘error’); setButtonLoading(‘btn-save’, false); return; }
}
if (!comprovanteUrl && orderId) comprovanteUrl = allOrders.find(o => o.id === orderId)?.comprovante_url || null;

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

let savedOrderId = orderId, error;
try {
if (orderId) {
({ error } = await db.from(‘pedidos’).update(payload).eq(‘id’, orderId));
} else {
const { data: inserted, error: ie } = await db.from(‘pedidos’).insert(payload).select().single();
error = ie; if (inserted) savedOrderId = inserted.id;
}
if (error) throw error;

```
await db.from('itens_pedido').delete().eq('pedido_id', savedOrderId);
if (orderItems.length) {
  const { error: ie } = await db.from('itens_pedido').insert(orderItems.map(i => ({
    pedido_id: savedOrderId, product_id: i.product_id || null,
    nome: i.nome, preco: i.preco, quantidade: i.quantidade, subtotal: i.preco * i.quantidade,
  })));
  if (ie) throw ie;
}
closeOrderModal();
await loadOrders();
```

} catch (err) {
showModalMessage(’Erro ao salvar: ’ + (err.message || ‘tente novamente.’), ‘error’);
setButtonLoading(‘btn-save’, false);
}
}

// ────────────────────────────────────────────────────────────
// ⑪ MODAL DE EDIÇÃO (inalterado do v4)
// ────────────────────────────────────────────────────────────
function openOrderModal() {
// Para pedidos novos, agora abre o wizard
openWizard();
}

function openEditOrderModal(id, forcePayment = false, forceStatus = null) {
const order = allOrders.find(p => p.id === id); if (!order) return;
document.getElementById(‘modal-title’).textContent       = ‘Editar Pedido’;
document.getElementById(‘order-id’).value                = order.id;
document.getElementById(‘field-cliente’).value           = order.cliente;
document.getElementById(‘field-descricao’).value         = order.descricao || ‘’;
document.getElementById(‘field-data-pedido’).value       = order.data_pedido || ‘’;
document.getElementById(‘field-data-entrega’).value      = order.data_entrega || ‘’;
document.getElementById(‘field-data-entrega-real’).value = order.data_entrega_real || ‘’;
document.getElementById(‘field-status’).value            =
forcePayment ? STATUS.ENTREGUE_PAGO : (forceStatus || order.status);

orderItems = (order.itens_pedido || []).map(i => ({
_tempId: Date.now() + Math.random(), product_id: i.product_id,
nome: i.nome || i.produtos?.nome || ‘’, preco: i.preco, quantidade: i.quantidade,
}));
renderItemsList();

comprovanteFile = null; resetComprovanteUI();
if (order.comprovante_url) {
const link = document.getElementById(‘comprovante-existing’);
link.href = order.comprovante_url; link.classList.remove(‘hidden’);
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
function closeModalOnOverlay(e) { if (e.target === document.getElementById(‘order-modal’)) closeOrderModal(); }
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
? ‘Comprovante de pagamento (opcional para admin)’ : ‘Comprovante de pagamento *’;
}
}
}

function openEntregueModal(id) { openEditOrderModal(id, false, STATUS.ENTREGUE_NPAGO); }
async function setStatusPendente(id) {
if (!confirm(‘Reverter para Pendente? A data real e o comprovante serão removidos.’)) return;
const { error } = await db.from(‘pedidos’)
.update({ status: STATUS.PENDENTE, data_entrega_real: null, comprovante_url: null }).eq(‘id’, id);
if (!error) await loadOrders();
}

// ────────────────────────────────────────────────────────────
// MELHORIA 4 — WIZARD “+ NOVO” COM 4 PASSOS + AUTO-SAVE
// ────────────────────────────────────────────────────────────

// ── Abrir / fechar ──────────────────────────────────────────
function openWizard() {
wizardStep        = 1;
wizardItems       = [];
wizardForma       = ‘’;
wizardComprovante = null;

// Reseta campos
document.getElementById(‘w-cliente’).value        = ‘’;
document.getElementById(‘w-data-pedido’).value    = todayDate();
document.getElementById(‘w-data-entrega’).value   = ‘’;
document.getElementById(‘w-descricao’).value      = ‘’;
document.getElementById(‘w-status’).value         = STATUS.PENDENTE;
document.getElementById(‘w-data-entrega-real’).value = ‘’;
document.getElementById(‘w-comprovante-preview’).innerHTML = ‘’;
document.getElementById(‘w-comprovante-preview’).classList.add(‘hidden’);
document.getElementById(‘w-upload-area’).style.display = ‘flex’;
document.querySelectorAll(’.payment-opt’).forEach(b => b.classList.remove(‘active’));

renderWizardItems();
wizardOnStatusChange();
renderWizardStep();
hideWizardMessage();

// Verifica rascunho salvo
const draft = localStorage.getItem(DRAFT_KEY);
if (draft) {
document.getElementById(‘draft-banner’).classList.remove(‘hidden’);
} else {
document.getElementById(‘draft-banner’).classList.add(‘hidden’);
}

document.getElementById(‘wizard-modal’).classList.remove(‘hidden’);

// Auto-save a cada 10s
clearInterval(draftTimer);
draftTimer = setInterval(saveDraft, 10000);
}

function closeWizard() {
document.getElementById(‘wizard-modal’).classList.add(‘hidden’);
clearInterval(draftTimer);
}
function closeWizardOnOverlay(e) {
if (e.target === document.getElementById(‘wizard-modal’)) closeWizard();
}

// ── Render do step atual ────────────────────────────────────
function renderWizardStep() {
// Painéis
for (let i = 1; i <= 4; i++) {
document.getElementById(`wpane-${i}`).classList.toggle(‘hidden’, i !== wizardStep);
const stepEl = document.getElementById(`wstep-${i}`);
stepEl.classList.toggle(‘active’, i === wizardStep);
stepEl.classList.toggle(‘done’, i < wizardStep);
}

// Botões de nav
document.getElementById(‘w-btn-back’).style.display = wizardStep > 1 ? ‘flex’ : ‘none’;
const nextBtn = document.getElementById(‘w-btn-next’);
if (wizardStep === 4) {
nextBtn.querySelector(’.btn-text’).textContent = ‘💾 Salvar pedido’;
} else {
nextBtn.querySelector(’.btn-text’).textContent = ‘Próximo →’;
}

// Passo 3: atualiza valor
if (wizardStep === 3) {
document.getElementById(‘w-valor-confirm’).textContent = `R$ ${formatCurrency(getWizardTotal())}`;
}
// Passo 4: renderiza review
if (wizardStep === 4) renderWizardReview();
}

// ── Navegação ───────────────────────────────────────────────
function wizardNext() {
hideWizardMessage();
if (wizardStep === 1) {
if (!document.getElementById(‘w-cliente’).value.trim()) {
showWizardMessage(‘Informe o nome do cliente.’, ‘error’); return;
}
}
if (wizardStep === 2) {
if (!wizardItems.length) {
showWizardMessage(‘Adicione ao menos um item.’, ‘error’); return;
}
}
if (wizardStep === 3) {
const status     = document.getElementById(‘w-status’).value;
const isEntregue = status === STATUS.ENTREGUE_PAGO || status === STATUS.ENTREGUE_NPAGO;
if (isEntregue && !document.getElementById(‘w-data-entrega-real’).value) {
showWizardMessage(‘Informe a data de entrega real.’, ‘error’); return;
}
if (status === STATUS.ENTREGUE_PAGO && !isAdmin && !wizardComprovante) {
showWizardMessage(‘O comprovante é obrigatório para registrar pagamento.’, ‘error’); return;
}
}
if (wizardStep === 4) {
wizardSave(); return;
}
wizardStep++;
renderWizardStep();
saveDraft();
}

function wizardBack() {
if (wizardStep > 1) { wizardStep–; renderWizardStep(); }
}

// ── Itens do wizard ─────────────────────────────────────────
function wizardAddFromSelect() {
const sel = document.getElementById(‘w-product-select’);
if (!sel.value) return;
const opt = sel.options[sel.selectedIndex];
wizardAddItem({ product_id: sel.value, nome: opt.dataset.nome, preco: parseFloat(opt.dataset.preco), quantidade: 1 });
sel.value = ‘’;
}

function wizardAddCustom() {
const nome  = document.getElementById(‘w-custom-name’).value.trim();
const preco = parseFloat(document.getElementById(‘w-custom-price’).value) || 0;
const qty   = parseInt(document.getElementById(‘w-custom-qty’).value) || 1;
if (!nome) { showWizardMessage(‘Digite o nome do item avulso.’, ‘error’); return; }
wizardAddItem({ product_id: null, nome, preco, quantidade: qty });
document.getElementById(‘w-custom-name’).value  = ‘’;
document.getElementById(‘w-custom-price’).value = ‘’;
document.getElementById(‘w-custom-qty’).value   = 1;
}

function wizardAddItem(item) {
const existing = item.product_id ? wizardItems.find(i => i.product_id === item.product_id) : null;
if (existing) { existing.quantidade += item.quantidade; }
else { wizardItems.push({ …item, _tempId: Date.now() + Math.random() }); }
renderWizardItems();
saveDraftDebounced();
}

function wizardRemoveItem(tempId) {
wizardItems = wizardItems.filter(i => i._tempId !== tempId);
renderWizardItems();
saveDraftDebounced();
}

function renderWizardItems() {
const el = document.getElementById(‘w-items-list’);
if (!wizardItems.length) {
el.innerHTML = ‘<p class="empty-inline">Nenhum item adicionado.</p>’;
document.getElementById(‘w-total-display’).textContent = ‘R$ 0,00’;
return;
}
el.innerHTML = wizardItems.map(item => ` <div class="item-row"> <div class="item-info"> <span class="item-name">${escapeHtml(item.nome)}</span> <span class="item-meta">${item.quantidade}x R$ ${formatCurrency(item.preco)}</span> </div> <span class="item-subtotal">R$ ${formatCurrency(item.preco * item.quantidade)}</span> <button type="button" class="btn-remove-item" onclick="wizardRemoveItem(${item._tempId})">✕</button> </div>`).join(’’);
document.getElementById(‘w-total-display’).textContent = `R$ ${formatCurrency(getWizardTotal())}`;
}

function getWizardTotal() {
return wizardItems.reduce((a, i) => a + i.preco * i.quantidade, 0);
}

// ── Forma de pagamento ──────────────────────────────────────
function selectPayment(btn) {
document.querySelectorAll(’.payment-opt’).forEach(b => b.classList.remove(‘active’));
btn.classList.add(‘active’);
wizardForma = btn.dataset.forma;
saveDraftDebounced();
}

// ── Status / comprovante no wizard ──────────────────────────
function wizardOnStatusChange() {
const status     = document.getElementById(‘w-status’).value;
const isEntregue = status === STATUS.ENTREGUE_PAGO || status === STATUS.ENTREGUE_NPAGO;
const isPago     = status === STATUS.ENTREGUE_PAGO;
document.getElementById(‘w-conclusao-section’).classList.toggle(‘hidden’, !isEntregue);
if (isEntregue) {
document.getElementById(‘w-comprovante-field’).classList.toggle(‘hidden’, !isPago);
if (isPago) {
document.getElementById(‘w-comprovante-label’).textContent = isAdmin
? ‘Comprovante (opcional para admin)’ : ‘Comprovante *’;
}
}
}

function onWizardComprovanteSelected(event) {
const file = event.target.files[0]; if (!file) return;
wizardComprovante = file;
const preview = document.getElementById(‘w-comprovante-preview’);
preview.classList.remove(‘hidden’);
if (file.type.startsWith(‘image/’)) {
const reader = new FileReader();
reader.onload = e => { preview.innerHTML = `<img src="${e.target.result}" class="comprovante-img-preview" />`; };
reader.readAsDataURL(file);
} else {
preview.innerHTML = `<div class="file-preview-tag">📄 ${escapeHtml(file.name)}</div>`;
}
document.getElementById(‘w-upload-area’).style.display = ‘none’;
}

// ── Review passo 4 ──────────────────────────────────────────
function renderWizardReview() {
const status = document.getElementById(‘w-status’).value;
document.getElementById(‘w-review’).innerHTML = `<div class="review-block"> <div class="review-row"><span>Cliente</span><strong>${escapeHtml(document.getElementById('w-cliente').value)}</strong></div> <div class="review-row"><span>Data pedido</span><strong>${formatDate(document.getElementById('w-data-pedido').value) || '--'}</strong></div> <div class="review-row"><span>Entrega prevista</span><strong>${formatDate(document.getElementById('w-data-entrega').value) || '--'}</strong></div> ${document.getElementById('w-descricao').value ?`<div class="review-row"><span>Obs</span><strong>${escapeHtml(document.getElementById(‘w-descricao’).value)}</strong></div>`: ''} </div> <div class="review-block"> ${wizardItems.map(i =>`
<div class="review-row">
<span>${escapeHtml(i.nome)} ×${i.quantidade}</span>
<strong>R$ ${formatCurrency(i.preco * i.quantidade)}</strong>
</div>`).join('')} <div class="review-row review-total"> <span>Total</span><strong>R$ ${formatCurrency(getWizardTotal())}</strong> </div> </div> <div class="review-block"> <div class="review-row"><span>Forma pgto</span><strong>${wizardForma ? `${formaIcon(wizardForma)} ${wizardForma}` : '—'}</strong></div> <div class="review-row"><span>Status</span><strong>${STATUS_LABEL[status] || status}</strong></div> </div>`;
}

// ── Salvar pedido do wizard ─────────────────────────────────
async function wizardSave() {
setButtonLoading(‘w-btn-next’, true);
hideWizardMessage();

const status     = document.getElementById(‘w-status’).value;
const isPago     = status === STATUS.ENTREGUE_PAGO;
const isEntregue = isPago || status === STATUS.ENTREGUE_NPAGO;

// Upload comprovante se necessário
let comprovanteUrl = null;
if (wizardComprovante) {
comprovanteUrl = await uploadComprovante(wizardComprovante, ‘new_’ + Date.now());
if (!comprovanteUrl) {
showWizardMessage(‘Erro ao enviar o comprovante.’, ‘error’);
setButtonLoading(‘w-btn-next’, false); return;
}
}

const payload = {
cliente:           document.getElementById(‘w-cliente’).value.trim(),
descricao:         document.getElementById(‘w-descricao’).value.trim(),
valor:             getWizardTotal(),
status,
forma_pagamento:   wizardForma || null,
data_pedido:       document.getElementById(‘w-data-pedido’).value || null,
data_entrega:      document.getElementById(‘w-data-entrega’).value || null,
data_entrega_real: isEntregue ? (document.getElementById(‘w-data-entrega-real’).value || null) : null,
comprovante_url:   isPago ? comprovanteUrl : null,
user_id:           currentUser.id,
};

try {
const { data: inserted, error } = await db.from(‘pedidos’).insert(payload).select().single();
if (error) throw error;

```
if (wizardItems.length) {
  const { error: ie } = await db.from('itens_pedido').insert(wizardItems.map(i => ({
    pedido_id: inserted.id, product_id: i.product_id || null,
    nome: i.nome, preco: i.preco, quantidade: i.quantidade, subtotal: i.preco * i.quantidade,
  })));
  if (ie) throw ie;
}

// Apaga rascunho após salvar com sucesso
localStorage.removeItem(DRAFT_KEY);
clearInterval(draftTimer);
closeWizard();
await loadOrders();
```

} catch (err) {
showWizardMessage(’Erro ao salvar: ’ + (err.message || ‘tente novamente.’), ‘error’);
setButtonLoading(‘w-btn-next’, false);
}
}

// ── Auto-save de rascunho ───────────────────────────────────
function saveDraft() {
try {
const draft = {
step:      wizardStep,
cliente:   document.getElementById(‘w-cliente’)?.value || ‘’,
dataPedido:document.getElementById(‘w-data-pedido’)?.value || ‘’,
dataEntrega:document.getElementById(‘w-data-entrega’)?.value || ‘’,
descricao: document.getElementById(‘w-descricao’)?.value || ‘’,
status:    document.getElementById(‘w-status’)?.value || STATUS.PENDENTE,
forma:     wizardForma,
items:     wizardItems.map(({ _tempId, …rest }) => rest), // sem _tempId
savedAt:   new Date().toISOString(),
};
localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
const el = document.getElementById(‘w-draft-status’);
if (el) { el.textContent = `💾 Rascunho salvo ${new Date().toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'})}`; }
} catch(e) { console.warn(‘Erro ao salvar rascunho:’, e); }
}

let _draftDebounceTimer = null;
function saveDraftDebounced() {
clearTimeout(_draftDebounceTimer);
_draftDebounceTimer = setTimeout(saveDraft, 1500);
}

function loadDraft() {
try {
const raw = localStorage.getItem(DRAFT_KEY);
if (!raw) return;
const draft = JSON.parse(raw);

```
document.getElementById('w-cliente').value       = draft.cliente || '';
document.getElementById('w-data-pedido').value   = draft.dataPedido || todayDate();
document.getElementById('w-data-entrega').value  = draft.dataEntrega || '';
document.getElementById('w-descricao').value     = draft.descricao || '';
document.getElementById('w-status').value        = draft.status || STATUS.PENDENTE;
wizardForma  = draft.forma || '';
wizardItems  = (draft.items || []).map(i => ({ ...i, _tempId: Date.now() + Math.random() }));

if (wizardForma) {
  document.querySelectorAll('.payment-opt').forEach(b => {
    b.classList.toggle('active', b.dataset.forma === wizardForma);
  });
}

renderWizardItems();
wizardOnStatusChange();
wizardStep = 1; // volta ao passo 1 para revisar
renderWizardStep();
document.getElementById('draft-banner').classList.add('hidden');
```

} catch(e) { console.warn(‘Erro ao carregar rascunho:’, e); }
}

function discardDraft() {
localStorage.removeItem(DRAFT_KEY);
document.getElementById(‘draft-banner’).classList.add(‘hidden’);
}

// ────────────────────────────────────────────────────────────
// ⑫ COMPROVANTE — modal edição (inalterado)
// ────────────────────────────────────────────────────────────
function onComprovanteSelected(event) {
const file = event.target.files[0]; if (!file) return;
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
// ⑬ EXCLUSÃO (inalterado)
// ────────────────────────────────────────────────────────────
function openDeleteModal(id)  { deleteTargetId = id; document.getElementById(‘delete-modal’).classList.remove(‘hidden’); }
function closeDeleteModal()   { deleteTargetId = null; document.getElementById(‘delete-modal’).classList.add(‘hidden’); }
function closeDeleteModalOnOverlay(e) { if (e.target === document.getElementById(‘delete-modal’)) closeDeleteModal(); }
async function confirmDelete() {
if (!deleteTargetId) return;
await db.from(‘itens_pedido’).delete().eq(‘pedido_id’, deleteTargetId);
await db.from(‘pedidos’).delete().eq(‘id’, deleteTargetId);
closeDeleteModal(); await loadOrders();
}

// ────────────────────────────────────────────────────────────
// ⑭ PDF ORÇAMENTO (inalterado)
// ────────────────────────────────────────────────────────────
function gerarOrcamentoPDF() {
const cliente = document.getElementById(‘field-cliente’).value.trim() || ‘Cliente’;
const obs     = document.getElementById(‘field-descricao’).value.trim();
if (!orderItems.length) { alert(‘Adicione itens antes de gerar o orçamento.’); return; }
const { jsPDF } = window.jspdf;
const doc = new jsPDF({ unit:‘mm’, format:‘a4’ });
const coral=[232,99,74], tinta=[44,35,24], suave=[107,94,82];
doc.setFillColor(…coral); doc.rect(0,0,210,35,‘F’);
doc.setTextColor(255,255,255); doc.setFontSize(22); doc.setFont(‘helvetica’,‘bold’); doc.text(‘Papelaria Criativa’,15,16);
doc.setFontSize(10); doc.setFont(‘helvetica’,‘normal’); doc.text(‘Orçamento de Pedido’,15,24); doc.text(`Data: ${formatDate(todayDate())}`,15,30);
doc.setTextColor(…tinta); doc.setFontSize(13); doc.setFont(‘helvetica’,‘bold’); doc.text(‘Cliente’,15,48);
doc.setFont(‘helvetica’,‘normal’); doc.setFontSize(11); doc.text(cliente,15,55);
doc.setDrawColor(…coral); doc.setLineWidth(0.5); doc.line(15,60,195,60);
doc.setFontSize(11); doc.setFont(‘helvetica’,‘bold’); doc.setTextColor(…tinta);
doc.text(‘Item’,15,68); doc.text(‘Qtd’,120,68,{align:‘center’}); doc.text(‘Unit.’,150,68,{align:‘right’}); doc.text(‘Subtotal’,195,68,{align:‘right’});
doc.setLineWidth(0.2); doc.setDrawColor(200,200,200); doc.line(15,70,195,70);
let y=77; doc.setFont(‘helvetica’,‘normal’); doc.setTextColor(…suave);
orderItems.forEach(item => {
if(y>260){doc.addPage();y=20;}
doc.text(item.nome.substring(0,45),15,y); doc.text(String(item.quantidade),120,y,{align:‘center’});
doc.text(`R$ ${formatCurrency(item.preco)}`,150,y,{align:‘right’}); doc.text(`R$ ${formatCurrency(item.preco*item.quantidade)}`,195,y,{align:‘right’});
y+=8; doc.line(15,y-2,195,y-2);
});
y+=4; doc.setFillColor(250,247,242); doc.rect(120,y-5,75,12,‘F’);
doc.setFontSize(12); doc.setFont(‘helvetica’,‘bold’); doc.setTextColor(…coral);
doc.text(‘TOTAL’,125,y+2); doc.text(`R$ ${formatCurrency(getOrderTotal())}`,195,y+2,{align:‘right’});
if(obs){y+=20;doc.setFontSize(10);doc.setFont(‘helvetica’,‘bold’);doc.setTextColor(…tinta);doc.text(‘Observações:’,15,y);doc.setFont(‘helvetica’,‘normal’);doc.setTextColor(…suave);doc.text(doc.splitTextToSize(obs,170),15,y+7);}
doc.setFontSize(9); doc.setTextColor(180,180,180);
doc.text(‘Orçamento gerado por Papelaria Criativa — sujeito a alterações.’,105,285,{align:‘center’});
doc.save(`orcamento_${cliente.replace(/\s+/g,'_')}_${todayDate()}.pdf`);
}

// ────────────────────────────────────────────────────────────
// ⑮ FILTROS DE STATUS (inalterado)
// ────────────────────────────────────────────────────────────
function setFilter(filter, btn) {
currentFilter = filter;
document.querySelectorAll(’.filter-btn’).forEach(b => b.classList.remove(‘active’));
btn.classList.add(‘active’);
renderOrders();
updateSummaryCards();
}

// ────────────────────────────────────────────────────────────
// ⑯ HELPERS DE UI
// ────────────────────────────────────────────────────────────
function showLoadingState(show) {
document.getElementById(‘loading-state’).classList.toggle(‘hidden’, !show);
document.getElementById(‘orders-list’).classList.toggle(‘hidden’, show);
if (show) document.getElementById(‘empty-state’).classList.add(‘hidden’);
}
function showAuthMessage(msg, type) {
const el = document.getElementById(‘auth-message’); if (!el) return;
el.textContent = msg; el.className = `auth-message ${type}`;
}
function showModalMessage(msg, type) {
const el = document.getElementById(‘modal-message’); if (!el) return;
el.textContent = msg; el.className = `auth-message ${type}`;
}
function hideModalMessage() {
const el = document.getElementById(‘modal-message’);
if (el) el.className = ‘auth-message hidden’;
}
function showWizardMessage(msg, type) {
const el = document.getElementById(‘wizard-message’); if (!el) return;
el.textContent = msg; el.className = `auth-message ${type}`;
}
function hideWizardMessage() {
const el = document.getElementById(‘wizard-message’);
if (el) el.className = ‘auth-message hidden’;
}
function setButtonLoading(btnId, loading) {
const btn = document.getElementById(btnId); if (!btn) return;
btn.disabled = loading;
btn.querySelector(’.btn-text’)?.classList.toggle(‘hidden’, loading);
btn.querySelector(’.btn-loader’)?.classList.toggle(‘hidden’, !loading);
}

// ────────────────────────────────────────────────────────────
// ⑰ UTILITÁRIOS (inalterado)
// ────────────────────────────────────────────────────────────
function formatCurrency(v) { return Number(v).toLocaleString(‘pt-BR’,{minimumFractionDigits:2,maximumFractionDigits:2}); }
function formatDate(d)     { if(!d)return’’; const[y,m,dd]=d.split(’-’); return `${dd}/${m}/${y}`; }
function todayDate()       { return new Date().toISOString().split(‘T’)[0]; }
function escapeHtml(str)   { const d=document.createElement(‘div’); d.appendChild(document.createTextNode(str||’’)); return d.innerHTML; }
function translateError(msg) {
if(msg.includes(‘Invalid login credentials’)) return ‘E-mail ou senha incorretos.’;
if(msg.includes(‘Email not confirmed’))        return ‘Confirme seu e-mail antes de entrar.’;
return ‘Ocorreu um erro. Tente novamente.’;
}