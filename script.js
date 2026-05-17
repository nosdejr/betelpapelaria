// ============================================================
//  script.js — Papelaria BETEL v4
//  Correções: pedidos compartilhados, bug botão salvar,
//  datas com calendário, filtro de período automático
// ============================================================

// ────────────────────────────────────────────────────────────
// ① CONFIGURAÇÃO
// ────────────────────────────────────────────────────────────
const SUPABASE_URL      = 'https://ltnokzhupzqpuvirgzut.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0bm9remh1cHpxcHV2aXJnenV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzNTU5MTQsImV4cCI6MjA4NzkzMTkxNH0.kEkdULzmxIfNX5hKlUoHpPs9Gnfgfxfj8qjfzGvvAoE';

// [LAYOUT SIDEBAR IMAGEM1] — abrir/fechar sidebar mobile
function openSidebar() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebar-overlay');
  if (sb) sb.classList.add('open');
  if (ov) ov.classList.add('active');
  document.body.style.overflow = 'hidden';
}
function closeSidebar() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebar-overlay');
  if (sb) sb.classList.remove('open');
  if (ov) ov.classList.remove('active');
  document.body.style.overflow = '';
}
const ADMIN_EMAIL       = 'jrs.edson@gmail.com';
const NAYARA_EMAIL      = 'nayaraa_garciaa@hotmail.com'; // [MELHORIA PERMISSÕES NAYARA]

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ────────────────────────────────────────────────────────────
// ② STATUS
// ────────────────────────────────────────────────────────────
// [MELHORIA FLUXO PRODUÇÃO] — fluxo simplificado: 4 etapas de produção
// Pagamento é campo booleano SEPARADO (pago: true/false)
const STATUS = {
  RECEBIDO:   'recebido',    // 1. Pedido recebido, aguardando início
  PRODUCAO:   'em_producao', // 2. Em produção
  PRONTO:     'pronto',      // 3. Pronto para entrega
  ENTREGUE:   'entregue',    // 4. Entregue ao cliente
  // aliases legados para compatibilidade com dados no banco
  PENDENTE:       'pendente',
  EM_ARTE:        'em_arte',
  ENTREGUE_NPAGO: 'entregue_nao_pago',
  ENTREGUE_PAGO:  'entregue_pago',
};

const STATUS_LABEL = {
  recebido:          'Recebido',
  em_producao:       'Em Produção',
  pronto:            'Pronto',
  entregue:          'Entregue',
  // legados — mapeados para exibição coerente
  pendente:          'Recebido',
  em_arte:           'Em Produção',
  entregue_nao_pago: 'Entregue',
  entregue_pago:     'Entregue',
};

const STATUS_BADGE_CLASS = {
  recebido:          'badge-recebido',
  em_producao:       'badge-producao',
  pronto:            'badge-pronto',
  entregue:          'badge-entregue',
  pendente:          'badge-recebido',
  em_arte:           'badge-producao',
  entregue_nao_pago: 'badge-entregue',
  entregue_pago:     'badge-entregue',
};

// [MELHORIA FLUXO PRODUÇÃO] — fluxo de 4 etapas
const STATUS_FLUXO      = ['recebido','em_producao','pronto','entregue'];
const STATUS_ATIVOS      = new Set(['recebido','em_producao','pronto','pendente','em_arte']);
const STATUS_FINALIZADOS = new Set(['entregue','entregue_nao_pago','entregue_pago']);

function proximoStatus(atual) {
  const legado = { pendente:'recebido', em_arte:'em_producao',
                   entregue_nao_pago:'entregue', entregue_pago:'entregue' };
  const norm = legado[atual] ?? atual;
  const idx = STATUS_FLUXO.indexOf(norm);
  if (idx < 0 || idx >= STATUS_FLUXO.length - 1) return null;
  return STATUS_FLUXO[idx + 1];
}

function labelBtnAvancar(statusAtual) {
  const prox = proximoStatus(statusAtual);
  const map = { em_producao:'Produção', pronto:'Pronto', entregue:'Entregar' };
  return prox ? (map[prox] ?? null) : null;
}

// UI simplificada — exibição (backend mantém status completos)
function isOrderEntregue(order) {
  return STATUS_FINALIZADOS.has(order.status);
}
function getUIStatusLabel(order) {
  return isOrderEntregue(order) ? 'Entregue' : 'Em andamento';
}
function getUIStatusBadgeClass(order) {
  return isOrderEntregue(order) ? 'badge-entregue-ui' : 'badge-andamento';
}
function getFinBadge(order) {
  if (order.pago === true) return { label: 'Pago', cls: 'badge-fin--pago' };
  if (isPagamentoAtrasado(order)) return { label: 'Vencido', cls: 'badge-fin--vencido' };
  return { label: 'A receber', cls: 'badge-fin--receber' };
}
function statusToFormValue(status) {
  return isOrderEntregue({ status }) ? 'entregue' : 'em_andamento';
}
function formValueToDbStatus(formVal, currentStatus) {
  if (formVal === 'entregue') return STATUS.ENTREGUE;
  if (STATUS_ATIVOS.has(currentStatus)) return currentStatus;
  return STATUS.RECEBIDO;
}

let periodShortcutAtivo = 'mes-atual';
let sheetPeriodDraft    = 'mes-atual';

// ────────────────────────────────────────────────────────────
// ③ ESTADO GLOBAL
// ────────────────────────────────────────────────────────────
let currentUser        = null;
let isAdmin            = false;
let canManageProducts  = false; // [MELHORIA PERMISSÕES NAYARA]
let allOrders          = [];
let allProducts        = [];
let allExpenses        = []; // [MELHORIA DESPESAS]
let currentPage        = 'pedidos'; // [MELHORIA DESPESAS] pedidos|despesas|financeiro
let currentFilter      = 'todos';
let deleteTargetId     = null;
let deleteTargetType   = 'pedido'; // [MELHORIA DESPESAS]
let orderItems         = [];
let comprovanteFile    = null;
let periodoInicio      = '';
let periodoFim         = '';

// ────────────────────────────────────────────────────────────
// ④ INICIALIZAÇÃO
// ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const page = window.location.pathname.includes('dashboard') ? 'dashboard' : 'auth';
  const { data: { session } } = await db.auth.getSession();

  if (page === 'auth') {
    if (session) window.location.href = 'dashboard.html';
    return;
  }

  if (!session) { window.location.href = 'index.html'; return; }

  currentUser       = session.user;
  // Nayara tem exatamente os mesmos poderes que Edson — ambos são admin
  isAdmin           = currentUser.email === ADMIN_EMAIL || currentUser.email === NAYARA_EMAIL;
  canManageProducts = isAdmin;

  // [FIX 1] Sem avatar no header — só sidebar user info
  const uname = currentUser.email.split('@')[0];
  // Sidebar user
  const sbName = document.getElementById('sidebar-user-name');
  const sbRole = document.getElementById('sidebar-user-role');
  const sbAvatar = document.getElementById('sidebar-avatar');
  if (sbName)   sbName.textContent   = uname;
  if (sbRole)   sbRole.textContent   = isAdmin ? 'Administrador' : 'Operador';
  if (sbAvatar) sbAvatar.textContent = uname[0].toUpperCase();
  const hdrAv = document.getElementById('header-avatar');
  if (hdrAv) hdrAv.textContent = uname[0].toUpperCase();

  // [MELHORIA PERMISSÕES NAYARA] — botão de produtos para ambos os usuários
  if (canManageProducts) {
    document.getElementById('btn-products-nav').style.display = 'flex';
    const mobileBtn = document.getElementById('btn-products-nav-mobile');
    if (mobileBtn) mobileBtn.style.display = 'flex';
  }

  // Período padrão = mês atual
  const range = periodRangeForShortcut('mes-atual');
  periodoInicio = range.ini;
  periodoFim    = range.fim;
  ['periodo-inicio','periodo-inicio-pedidos','sheet-periodo-inicio'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = periodoInicio;
  });
  ['periodo-fim','periodo-fim-pedidos','sheet-periodo-fim'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = periodoFim;
  });
  syncPeriodPills('mes-atual');
  updatePeriodLabel();

  await loadProducts();
  await loadOrders();
  await loadExpenses();
  const despMes = document.querySelector('.desp-shortcut[data-period="mes-atual"]');
  if (despMes) setDespesaShortcut('mes-atual', despMes);
  const finMes = document.querySelector('.fin-shortcut[data-period="mes-atual"]');
  if (finMes) setFinShortcut('mes-atual', finMes);
  setupNavTabs();
});

// ────────────────────────────────────────────────────────────
// ⑤ AUTH
// ────────────────────────────────────────────────────────────
async function handleLogin(event) {
  event.preventDefault();
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  setButtonLoading('btn-login', true);
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) {
    showAuthMessage(translateError(error.message), 'error');
    setButtonLoading('btn-login', false);
    return;
  }
  window.location.href = 'dashboard.html';
}

async function handleLogout() {
  await db.auth.signOut();
  window.location.href = 'index.html';
}

// ────────────────────────────────────────────────────────────
// ⑥ FILTRO DE PERÍODO — aplica automaticamente ao mudar as datas
// ────────────────────────────────────────────────────────────
function applyPeriod() {
  const elIni = document.getElementById('periodo-inicio') || document.getElementById('periodo-inicio-pedidos') || document.getElementById('sheet-periodo-inicio');
  const elFim = document.getElementById('periodo-fim')    || document.getElementById('periodo-fim-pedidos')    || document.getElementById('sheet-periodo-fim');
  const ini = elIni?.value;
  const fim = elFim?.value;
  if (!ini || !fim) return;
  if (ini > fim) { periodoInicio = fim; periodoFim = ini; }
  else { periodoInicio = ini; periodoFim = fim; }
  ['periodo-inicio','periodo-inicio-pedidos','sheet-periodo-inicio'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = periodoInicio;
  });
  ['periodo-fim','periodo-fim-pedidos','sheet-periodo-fim'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = periodoFim;
  });
  periodShortcutAtivo = 'custom';
  syncPeriodPills('custom');
  updatePeriodLabel();
  renderOrders();
  updateSummaryCards();
  if (currentPage === 'dashboard') renderDashFilteredList();
}

function periodRangeForShortcut(tipo) {
  const hoje = new Date();
  const y = hoje.getFullYear();
  const m = hoje.getMonth();
  let ini, fim = todayDate();
  if (tipo === 'hoje') { ini = fim; }
  else if (tipo === '7dias') {
    const d = new Date(hoje); d.setDate(d.getDate() - 6);
    ini = d.toISOString().split('T')[0];
  }
  else if (tipo === '30dias') {
    const d = new Date(hoje); d.setDate(d.getDate() - 29);
    ini = d.toISOString().split('T')[0];
  }
  else if (tipo === 'mes-atual') { ini = `${y}-${String(m+1).padStart(2,'0')}-01`; }
  else if (tipo === 'mes-anterior') {
    ini = new Date(y, m - 1, 1).toISOString().split('T')[0];
    fim = new Date(y, m, 0).toISOString().split('T')[0];
  }
  else if (tipo === 'ano') { ini = `${y}-01-01`; }
  else if (tipo === 'todos') { ini = '2020-01-01'; fim = `${y + 1}-12-31`; }
  else return null;
  return { ini, fim };
}

function syncPeriodPills(tipo) {
  document.querySelectorAll('.period-pill').forEach(b => {
    b.classList.toggle('active', b.dataset.period === tipo);
  });
  document.querySelectorAll('.sheet-option').forEach(b => {
    b.classList.toggle('active', b.dataset.period === tipo);
  });
}

function updatePeriodLabel() {
  const labels = {
    'mes-atual': 'Mês Atual', 'mes-anterior': 'Mês Anterior', todos: 'Todos', custom: 'Personalizado',
    hoje: 'Hoje', '7dias': '7 dias', '30dias': '30 dias',
  };
  let text = labels[periodShortcutAtivo] || 'Personalizado';
  if (periodShortcutAtivo === 'custom' && periodoInicio && periodoFim) {
    text = `${formatDate(periodoInicio)} – ${formatDate(periodoFim)}`;
  }
  const el = document.getElementById('period-label-mobile');
  if (el) el.textContent = text;
  document.querySelectorAll('.period-label-mobile-sync').forEach(n => { n.textContent = text; });
}

function togglePeriodCustom(section) {
  const id = section === 'pedidos' ? 'period-custom-pedidos' : 'period-custom-dash';
  const box = document.getElementById(id);
  if (box) box.classList.toggle('hidden');
  periodShortcutAtivo = 'custom';
  syncPeriodPills('custom');
  updatePeriodLabel();
}

function openPeriodSheet() {
  sheetPeriodDraft = periodShortcutAtivo;
  ['sheet-periodo-inicio','periodo-inicio','periodo-inicio-pedidos'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = periodoInicio;
  });
  ['sheet-periodo-fim','periodo-fim','periodo-fim-pedidos'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = periodoFim;
  });
  syncPeriodPills(sheetPeriodDraft);
  document.getElementById('period-sheet')?.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closePeriodSheet() {
  document.getElementById('period-sheet')?.classList.add('hidden');
  document.body.style.overflow = '';
}

function closePeriodSheetOnOverlay(e) {
  if (e.target?.id === 'period-sheet') closePeriodSheet();
}

function pickPeriodFromSheet(tipo) {
  sheetPeriodDraft = tipo;
  document.querySelectorAll('.sheet-option').forEach(b => {
    b.classList.toggle('active', b.dataset.period === tipo);
  });
  if (tipo !== 'custom') {
    const range = periodRangeForShortcut(tipo);
    if (range) {
      document.getElementById('sheet-periodo-inicio').value = range.ini;
      document.getElementById('sheet-periodo-fim').value    = range.fim;
    }
  }
}

function applyPeriodFromSheet() {
  const draft = sheetPeriodDraft;
  if (draft && draft !== 'custom') {
    const btn = document.querySelector(`.period-pill[data-period="${draft}"]`);
    setPeriodShortcut(draft, btn);
  } else {
    applyPeriod();
  }
  closePeriodSheet();
}

function setPeriodShortcut(tipo, btn) {
  if (tipo === 'custom') { togglePeriodCustom(currentPage === 'pedidos' ? 'pedidos' : 'dash'); return; }
  const range = periodRangeForShortcut(tipo);
  if (!range) return;
  periodShortcutAtivo = tipo;
  periodoInicio = range.ini;
  periodoFim    = range.fim;
  ['periodo-inicio','periodo-inicio-pedidos','sheet-periodo-inicio'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = range.ini;
  });
  ['periodo-fim','periodo-fim-pedidos','sheet-periodo-fim'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = range.fim;
  });
  document.getElementById('period-custom-dash')?.classList.add('hidden');
  document.getElementById('period-custom-pedidos')?.classList.add('hidden');
  syncPeriodPills(tipo);
  if (btn) btn.classList.add('active');
  updatePeriodLabel();
  renderOrders();
  updateSummaryCards();
  if (currentPage === 'dashboard') renderDashFilteredList();
}

function orderDateKey(order) {
  const raw = order.data_pedido || order.created_at || '';
  if (!raw) return '';
  return String(raw).slice(0, 10);
}

function inPeriod(order) {
  if (!periodoInicio || !periodoFim) return true;
  const d = orderDateKey(order);
  if (!d) return periodShortcutAtivo === 'todos';
  return d >= periodoInicio && d <= periodoFim;
}

function inCurrentMonth(order) {
  const hoje = new Date();
  const ini  = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}-01`;
  const d    = order.data_pedido || order.created_at?.split('T')[0] || '';
  return d >= ini && d <= todayDate();
}

// ────────────────────────────────────────────────────────────
// ⑦ PRODUTOS
// ────────────────────────────────────────────────────────────
async function loadProducts() {
  const { data, error } = await db.from('produtos').select('*').order('nome');
  if (error) { console.error('Erro produtos:', error); return; }
  allProducts = data || [];
  populateProductSelect();
  renderProductsList();
}

function populateProductSelect() {
  const sel = document.getElementById('item-product-select');
  if (!sel) return;
  sel.innerHTML = '<option value="">Selecione um produto…</option>';
  allProducts.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent   = `${p.nome} — R$ ${formatCurrency(p.preco)}`;
    opt.dataset.preco = p.preco;
    opt.dataset.nome  = p.nome;
    sel.appendChild(opt);
  });
}

function renderProductsList() {
  const el = document.getElementById('products-list');
  if (!el) return;
  if (!allProducts.length) { el.innerHTML = '<p class="empty-inline">Nenhum produto cadastrado ainda.</p>'; return; }
  el.innerHTML = allProducts.map(p => `
    <div class="product-item">
      <div class="product-item__icon" aria-hidden="true">◇</div>
      <div class="product-item__info">
        <span class="product-name">${escapeHtml(p.nome)}</span>
        ${p.descricao ? `<span class="product-desc">${escapeHtml(p.descricao)}</span>` : ''}
      </div>
      <span class="product-price valor-monetario">R$ ${formatCurrency(p.preco)}</span>
      <div class="product-actions">
        <button type="button" class="btn-icon-sm" onclick="editProduct('${p.id}')" title="Editar">✏️</button>
        <button type="button" class="btn-icon-sm btn-icon-del" onclick="deleteProduct('${p.id}')" title="Excluir">🗑️</button>
      </div>
    </div>`).join('');
}

async function handleSaveProduct(event) {
  event.preventDefault();
  setButtonLoading('btn-save-product', true);
  const id = document.getElementById('product-id').value;
  const payload = {
    nome:      document.getElementById('prod-nome').value.trim(),
    preco:     parseFloat(document.getElementById('prod-preco').value) || 0,
    descricao: document.getElementById('prod-descricao').value.trim(),
  };
  let error;
  if (id) { ({ error } = await db.from('produtos').update(payload).eq('id', id)); }
  else    { ({ error } = await db.from('produtos').insert(payload)); }
  setButtonLoading('btn-save-product', false);
  if (error) { alert('Erro ao salvar produto: ' + error.message); return; }
  clearProductForm();
  await loadProducts();
}

function editProduct(id) {
  const p = allProducts.find(x => x.id === id);
  if (!p) return;
  document.getElementById('product-id').value     = p.id;
  document.getElementById('prod-nome').value      = p.nome;
  document.getElementById('prod-preco').value     = p.preco;
  document.getElementById('prod-descricao').value = p.descricao || '';
}

async function deleteProduct(id) {
  if (!confirm('Excluir este produto?')) return;
  await db.from('produtos').delete().eq('id', id);
  await loadProducts();
}

function clearProductForm() {
  document.getElementById('product-id').value = '';
  document.getElementById('product-form').reset();
}

function openProductsModal()          { loadProducts(); document.getElementById('products-modal').classList.remove('hidden'); }
function closeProductsModal()         { document.getElementById('products-modal').classList.add('hidden'); }
function closeProductsModalOverlay(e) { if (e.target === document.getElementById('products-modal')) closeProductsModal(); }

function toggleDespesaMobilePanel(btn) {
  const panel = document.getElementById('desp-period-mobile-panel');
  if (!panel) return;
  panel.classList.toggle('hidden');
}

function toggleFinMobilePanel(btn) {
  const panel = document.getElementById('fin-period-mobile-panel');
  if (!panel) return;
  panel.classList.toggle('hidden');
}

// ────────────────────────────────────────────────────────────
// ⑧ ITENS DO PEDIDO
// ────────────────────────────────────────────────────────────
function addItemFromSelect() {
  const sel = document.getElementById('item-product-select');
  const qty = parseInt(document.getElementById('item-qty').value) || 1;
  if (!sel.value) { alert('Selecione um produto.'); return; }
  const opt = sel.options[sel.selectedIndex];
  addItem({ product_id: sel.value, nome: opt.dataset.nome, preco: parseFloat(opt.dataset.preco), quantidade: qty });
  sel.value = '';
  document.getElementById('item-qty').value = 1;
}

function addCustomItem() {
  const nome  = document.getElementById('item-custom-name').value.trim();
  const preco = parseFloat(document.getElementById('item-custom-price').value) || 0;
  const qty   = parseInt(document.getElementById('item-custom-qty').value) || 1;
  if (!nome) { alert('Digite o nome do item avulso.'); return; }
  addItem({ product_id: null, nome, preco, quantidade: qty });
  document.getElementById('item-custom-name').value  = '';
  document.getElementById('item-custom-price').value = '';
  document.getElementById('item-custom-qty').value   = 1;
}

function addItem(item) {
  const existing = item.product_id ? orderItems.find(i => i.product_id === item.product_id) : null;
  if (existing) { existing.quantidade += item.quantidade; }
  else { orderItems.push({ ...item, _tempId: Date.now() + Math.random() }); }
  renderItemsList();
}

function removeItem(tempId) {
  orderItems = orderItems.filter(i => i._tempId !== tempId);
  renderItemsList();
}

function renderItemsList() {
  const el = document.getElementById('items-list');
  if (!orderItems.length) {
    el.innerHTML = '<p class="empty-inline">Nenhum item adicionado.</p>';
    updateOrderTotal(); return;
  }
  el.innerHTML = orderItems.map(item => `
    <div class="item-row">
      <div class="item-info">
        <span class="item-name">${escapeHtml(item.nome)}</span>
        <span class="item-meta">${item.quantidade}x R$ ${formatCurrency(item.preco)}</span>
      </div>
      <span class="item-subtotal">R$ ${formatCurrency(item.preco * item.quantidade)}</span>
      <button type="button" class="btn-remove-item" onclick="removeItem(${item._tempId})">✕</button>
    </div>`).join('');
  updateOrderTotal();
}

function updateOrderTotal() {
  const el = document.getElementById('order-total-display');
  if (el) el.textContent = `R$ ${formatCurrency(getOrderTotal())}`;
}

function getOrderTotal() {
  return orderItems.reduce((acc, i) => acc + i.preco * i.quantidade, 0);
}

// ────────────────────────────────────────────────────────────
// ⑨ PEDIDOS — CARREGAR (SEM filtro por user_id = todos os pedidos)
// ────────────────────────────────────────────────────────────
async function loadOrders() {
  showLoadingState(true);

  // ⚠️ Remove o .eq('user_id', ...) para buscar TODOS os pedidos
  // A RLS no Supabase precisa permitir isso — veja o SQL abaixo
  const { data, error } = await db
    .from('pedidos')
    .select(`*, itens_pedido(*, produtos(nome, preco))`)
    .order('created_at', { ascending: false });

  showLoadingState(false);
  if (error) { console.error('Erro pedidos:', error); return; }
  allOrders = data || [];
  renderOrders();
  updateSummaryCards();
  if (document.getElementById('dash-filtered-list')) renderDashFilteredList();
}

// [MELHORIA FLUXO PRODUÇÃO] — isLate com novos status
function isLate(order) {
  if (!order.data_entrega) return false;
  const entregue = STATUS_FINALIZADOS.has(order.status) && order.status !== 'pronto';
  if (entregue) return order.data_entrega_real ? order.data_entrega_real > order.data_entrega : false;
  return todayDate() > order.data_entrega;
}

// [MELHORIA PAGAMENTOS ATRASADOS] — pedido entregue, não pago, e vencido
function isPagamentoAtrasado(order) {
  const entregue = STATUS_FINALIZADOS.has(order.status) && order.status !== 'pronto';
  if (!entregue) return false;
  if (order.pago === true) return false;
  // considera a data de entrega como vencimento do pagamento
  const venc = order.data_entrega_real || order.data_entrega || '';
  return venc ? todayDate() > venc : false;
}


// Card compacto — lista de pedidos
function buildOrderCard(order) {
  return buildCompactOrderRow(order, { showWorkflow: true });
}

function verComprovantePagamento(id) {
  const order = allOrders.find(o => o.id === id);
  if (!order) return;
  if (order.comprovante_url) viewReceipt(order.comprovante_url);
  else alert('Nenhum comprovante de pagamento anexado a este pedido.');
}

function onSearchInput() {
  renderOrders();
  if (currentPage === 'dashboard') renderDashFilteredList();
}

function buildCompactOrderRow(order, opts = {}) {
  const showWorkflow = opts.showWorkflow !== false;
  const late       = isLate(order);
  const pgtoAtraso = isPagamentoAtrasado(order);
  const jaPago     = order.pago === true;
  const fin        = getFinBadge(order);
  const entregaTxt = order.data_entrega
    ? `Entrega ${formatDate(order.data_entrega)}${late && !isOrderEntregue(order) ? ' · Atrasado' : ''}`
    : 'Sem data de entrega';

  let workflowHtml = '';
  if (showWorkflow) {
    if (pgtoAtraso && !jaPago) {
      workflowHtml = `<button type="button" class="btn-compact btn-compact--danger" onclick="event.stopPropagation();abrirModalPagamento('${order.id}',false)">Receber</button>`;
    } else if (order.status === 'pronto') {
      workflowHtml = `<button type="button" class="btn-compact btn-compact--primary" onclick="event.stopPropagation();openEntregueModal('${order.id}')">Entregar</button>`;
    }
  }

  const actionsHtml = workflowHtml
    ? '<div class="order-card-compact__actions"><div class="order-card-compact__actions-main">' + workflowHtml + '</div></div>'
    : '';

  const cardClass = ['order-card-compact', late && !isOrderEntregue(order) ? 'order-card-compact--late' : '', pgtoAtraso ? 'order-card-compact--pgto-late' : ''].filter(Boolean).join(' ');

  const itens = order.itens_pedido || [];
  const itensResumo = itens.length
    ? itens.map(i => (i.nome || (i.produtos && i.produtos.nome) || 'Item')).join(', ')
    : '';
  const itensHtml = itensResumo
    ? '  <div class="order-card-compact__items">' + escapeHtml(itensResumo) + '</div>'
    : '';

  return [
    '<article class="' + cardClass + '" onclick="abrirDetalhe(\'' + order.id + '\')" role="button" tabindex="0">',
    '  <div class="order-card-compact__row">',
    '    <h3 class="order-card-compact__name">' + escapeHtml(order.cliente) + '</h3>',
    '    <span class="order-card-compact__valor">R$ ' + formatCurrency(order.valor) + '</span>',
    '  </div>',
    itensHtml,
    '  <div class="order-card-compact__meta">',
    '    <span class="order-card-compact__date">' + entregaTxt + '</span>',
    '    <div class="order-card-compact__badges">',
    '      <span class="badge-status ' + getUIStatusBadgeClass(order) + '">' + getUIStatusLabel(order) + '</span>',
    '      <span class="badge-fin ' + fin.cls + '">' + fin.label + '</span>',
    '    </div>',
    '  </div>',
    actionsHtml,
    '</article>',
  ].join('\n');
}

function renderOrders() {
  const list       = document.getElementById('orders-list');
  const emptyState = document.getElementById('empty-state');
  const search     = (document.getElementById('search-input')?.value || '').toLowerCase().trim();

  let filtered = [...allOrders];

  if (currentFilter === 'em-andamento' || currentFilter === 'ativos') {
    filtered = filtered.filter(p => !isOrderEntregue(p));
  } else if (currentFilter === 'entregue' || currentFilter === 'finalizados') {
    filtered = filtered.filter(p => isOrderEntregue(p));
  } else if (currentFilter === 'atrasado') {
    filtered = filtered.filter(isLate);
  } else if (currentFilter === 'pgto-atrasado' || currentFilter === 'a-receber') {
    filtered = filtered.filter(p => p.pago !== true);
  }
  // 'todos' — sem filtro de status

  // Filtro de período
  filtered = filtered.filter(inPeriod);

  // Busca por cliente
  if (search) filtered = filtered.filter(p => {
    const s = search.toLowerCase();
    return (
      (p.cliente || '').toLowerCase().includes(s) ||
      String(p.id || '').toLowerCase().includes(s) ||
      String(p.valor || '').includes(s) ||
      (p.status || '').toLowerCase().includes(s) ||
      (p.descricao || '').toLowerCase().includes(s) ||
      (p.itens_pedido || []).some(i =>
        (i.nome || i.produtos?.nome || '').toLowerCase().includes(s)
      )
    );
  });

  if (!filtered.length) {
    list.innerHTML = ''; list.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  list.classList.remove('hidden');

  list.innerHTML = filtered.map(order => buildOrderCard(order)).join('');
}

function gerarLinkWhatsApp(order) {
  const valor = formatCurrency(order.valor || 0);
  const msg =
    `Agradecemos pela sua compra!\n` +
    `Para concluir o pagamento via Pix, utilize os dados abaixo:\n` +
    `- Chave PIX (CPF): 367.427.448-55\n` +
    `- Nome: Nayara Pereira Mendes Garcia\n` +
    `- Valor R$: R$ ${valor}`;
  return `https://wa.me/?text=${encodeURIComponent(msg)}`;
}

// [CORREÇÃO STATUS ATRASO] — mostra APENAS quando atrasado (sem "No prazo")
function buildPrazoLabel(order) {
  if (!order.data_entrega) return '';
  const entregue = STATUS_FINALIZADOS.has(order.status);
  // Se entregue com atraso: mostra badge vermelho
  if (entregue && order.data_entrega_real && order.data_entrega_real > order.data_entrega) {
    return `<span class="prazo-tag prazo-atraso">Entregue com atraso</span>`;
  }
  // Se ainda não entregue e prazo venceu: mostra badge vermelho
  if (!entregue && todayDate() > order.data_entrega) {
    return `<span class="prazo-tag prazo-atraso">Prazo vencido</span>`;
  }
  // Sem atraso → nada
  return '';
}

// [MELHORIA CARDS DASHBOARD] + [MELHORIA PAGAMENTOS ATRASADOS]
function updateSummaryCards() {
  const doPer     = allOrders.filter(inPeriod);
  const pagPer    = doPer.filter(o => o.pago === true);
  const areceber  = doPer.filter(o => o.pago !== true);
  const atras     = allOrders.filter(isLate);
  const pgtoAtras = allOrders.filter(isPagamentoAtrasado);

  const perFatVal = pagPer.reduce((a, o) => a + Number(o.valor), 0);
  const perAguVal = areceber.reduce((a, o) => a + Number(o.valor), 0);
  const totalDash = doPer.reduce((s, o) => s + Number(o.valor || 0), 0);

  const el = (id) => document.getElementById(id);
  if (el('per-faturado'))    el('per-faturado').textContent    = `R$ ${formatCurrency(perFatVal)}`;
  if (el('per-aguardando'))  el('per-aguardando').textContent  = `R$ ${formatCurrency(perAguVal)}`;
  if (el('per-total-dash'))  el('per-total-dash').textContent  = `R$ ${formatCurrency(totalDash)}`;
  if (el('per-total'))       el('per-total').textContent       = `R$ ${formatCurrency(totalDash)}`;
  if (el('per-count-pago'))  el('per-count-pago').textContent  = `${pagPer.length} pedido${pagPer.length !== 1 ? 's' : ''}`;
  if (el('per-count-aguar')) el('per-count-aguar').textContent = `${areceber.length} pedido${areceber.length !== 1 ? 's' : ''}`;
  if (el('per-count-total')) el('per-count-total').textContent = `${doPer.length} pedido${doPer.length !== 1 ? 's' : ''}`;
  if (el('count-late'))       el('count-late').textContent       = atras.length;
  if (el('count-pgto-atras')) el('count-pgto-atras').textContent = pgtoAtras.length;

  const alertEl = document.getElementById('dash-late-alert');
  const lateTxt = document.getElementById('dash-late-text');
  if (alertEl) {
    if (atras.length) {
      alertEl.classList.remove('hidden');
      if (lateTxt) lateTxt.textContent = `${atras.length} pedido${atras.length !== 1 ? 's' : ''} com entrega atrasada`;
    } else {
      alertEl.classList.add('hidden');
    }
  }

  const grid = document.querySelector('.summary-grid--dash');
  if (grid) grid.classList.toggle('has-active-filter', dashFiltroAtivo !== 'todos');
}

function labelMesAtual() {
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const h = new Date();
  return `${meses[h.getMonth()]}/${h.getFullYear()}`;
}

// [MELHORIA STATUS PEDIDO] — abre modal para registrar entrega real
function openEntregueModal(id) {
  openEditOrderModal(id, false, STATUS.ENTREGUE); // [MELHORIA FLUXO PRODUÇÃO]
}

// [MELHORIA FLUXO PRODUÇÃO] — avança etapa diretamente (sem modal)
async function avancarStatus(id, statusAtual) {
  const prox = proximoStatus(statusAtual);
  if (!prox || prox === 'entregue') return; // 'entregue' sempre via openEntregueModal
  const { error } = await db.from('pedidos').update({ status: prox }).eq('id', id);
  if (error) { alert('Erro ao atualizar status: ' + error.message); return; }
  await loadOrders();
}

// [MELHORIA FLUXO PRODUÇÃO] — reabrir pedido para início do fluxo
async function setStatusRecebido(id) {
  if (!confirm('Reabrir pedido?')) return;
  await db.from('pedidos').update({ status: 'recebido', data_entrega_real: null }).eq('id', id);
  await loadOrders();
}

// alias de compatibilidade
async function setStatusPendente(id) { return setStatusRecebido(id); }

// [MELHORIA PAGAMENTOS ATRASADOS] + [MELHORIA CUPOM PAGAMENTO] — modal de pagamento
let pagamentoTargetId = null;
let pagamentoFile     = null;

// [CORREÇÃO TIPO PAGAMENTO] — modal com select PIX/Dinheiro
function abrirModalPagamento(id, jaEstaPago) {
  if (jaEstaPago) {
    if (confirm('Desmarcar recebimento deste pedido?')) salvarPagamento(id, false, null, null, true);
    return;
  }
  pagamentoTargetId = id;
  pagamentoFile     = null;
  const order = allOrders.find(o => o.id === id);
  document.getElementById('pgto-modal-cliente').textContent = order?.cliente || '';
  document.getElementById('pgto-modal-valor').textContent   = `R$ ${formatCurrency(order?.valor || 0)}`;

  // Reset select tipo
  const sel = document.getElementById('pgto-tipo-select');
  sel.value = order?.tipo_pagamento || 'pix';
  togglePgtoComprovante(); // mostra/oculta upload conforme tipo inicial

  // Reset preview
  document.getElementById('pgto-comp-preview').classList.add('hidden');
  document.getElementById('pgto-comp-preview').innerHTML = '';
  document.getElementById('pgto-field-comp').value       = '';
  const linkEx = document.getElementById('pgto-comp-existing');
  if (order?.comprovante_url) { linkEx.href = order.comprovante_url; linkEx.classList.remove('hidden'); }
  else linkEx.classList.add('hidden');
  document.getElementById('pgto-modal').classList.remove('hidden');
}

// [CORREÇÃO TIPO PAGAMENTO] — mostra upload só quando PIX
function togglePgtoComprovante() {
  const tipo = document.getElementById('pgto-tipo-select').value;
  const wrap = document.getElementById('pgto-comp-wrap');
  if (wrap) wrap.style.display = tipo === 'pix' ? 'block' : 'none';
}

// [CORREÇÃO TIPO PAGAMENTO] — botões PIX / Dinheiro no modal
function setPgtoTipo(tipo, btn) {
  document.getElementById('pgto-tipo-select').value = tipo;
  // Toggle visual active nos botões
  document.querySelectorAll('.pgto-tipo-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  togglePgtoComprovante();
  // Limpa preview se mudar para Dinheiro
  if (tipo === 'dinheiro') {
    pagamentoFile = null;
    const prev = document.getElementById('pgto-comp-preview');
    if (prev) { prev.classList.add('hidden'); prev.innerHTML = ''; }
    const area = document.getElementById('pgto-upload-area');
    if (area) area.style.display = 'flex';
    const inp = document.getElementById('pgto-field-comp');
    if (inp) inp.value = '';
  }
}

function closePgtoModal() {
  document.getElementById('pgto-modal').classList.add('hidden');
  pagamentoTargetId = null; pagamentoFile = null;
}
function closePgtoModalOverlay(e) { if (e.target === document.getElementById('pgto-modal')) closePgtoModal(); }

function onPgtoCompSelected(event) {
  const file = event.target.files[0]; if (!file) return;
  pagamentoFile = file;
  const preview = document.getElementById('pgto-comp-preview');
  preview.classList.remove('hidden');
  document.getElementById('pgto-upload-area').style.display = 'none';
  if (file.type.startsWith('image/')) {
    const r = new FileReader();
    r.onload = e => { preview.innerHTML = `<img src="${e.target.result}" class="comprovante-img-preview"/>`; };
    r.readAsDataURL(file);
  } else {
    preview.innerHTML = `<div class="file-preview-tag">📄 ${escapeHtml(file.name)}</div>`;
  }
}

// [CORREÇÃO TIPO PAGAMENTO] — lê tipo do select; PIX exige comprovante
async function confirmarPagamento() {
  if (!pagamentoTargetId) return;
  const tipo = document.getElementById('pgto-tipo-select').value; // 'pix' | 'dinheiro'
  const btn  = document.getElementById('btn-confirmar-pgto');

  // PIX: precisa de comprovante (novo ou já salvo)
  const jaTemComp = allOrders.find(o => o.id === pagamentoTargetId)?.comprovante_url;
  if (tipo === 'pix' && !pagamentoFile && !jaTemComp) {
    alert('Para pagamento PIX, anexe o comprovante.');
    return;
  }

  btn.disabled = true; btn.textContent = 'Salvando...';
  let compUrl = jaTemComp || null;
  if (pagamentoFile && tipo === 'pix') {
    compUrl = await uploadComprovante(pagamentoFile, pagamentoTargetId);
    if (!compUrl) { alert('Erro ao enviar comprovante.'); btn.disabled = false; btn.textContent = 'Confirmar Recebimento'; return; }
  }
  // Dinheiro: não salva comprovante
  if (tipo === 'dinheiro') compUrl = null;

  await salvarPagamento(pagamentoTargetId, true, compUrl, tipo, false);
  btn.disabled = false; btn.textContent = 'Confirmar Recebimento';
  closePgtoModal();
}

// [CORREÇÃO TIPO PAGAMENTO] — salva tipo_pagamento ('pix'|'dinheiro') + comprovante
async function salvarPagamento(id, pago, comprovanteUrl, tipoPagamento, semComp) {
  const upd = { pago };
  if (!semComp) {
    upd.comprovante_url  = comprovanteUrl;
    upd.tipo_pagamento   = tipoPagamento || null;
  }
  const { error } = await db.from('pedidos').update(upd).eq('id', id);
  if (error) { alert('Erro ao salvar pagamento: ' + error.message); return; }
  await loadOrders();
}

// [CORREÇÃO RECIBO IMAGEM] — gera recibo como imagem PNG (canvas) compartilhável por WhatsApp
function emitirCupomPagamento(id) {
  const order = allOrders.find(o => o.id === id);
  if (!order) return;

  const idCurto    = order.id.slice(-6).toUpperCase();
  const dataPgto   = order.data_entrega_real || order.updated_at?.split('T')[0] || todayDate();
  // [CORREÇÃO TIPO PAGAMENTO] — usa tipo_pagamento real do pedido
  const tipoPgto   = order.tipo_pagamento === 'dinheiro' ? 'Dinheiro' : 'PIX';

  // ── Canvas: 480×600 @2x para alta resolução ──────────────
  const W = 480, H = 600, SCALE = 2;
  const canvas = document.createElement('canvas');
  canvas.width  = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);

  // Fundo branco
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);

  // Header roxo
  ctx.fillStyle = '#7C3AED';
  ctx.fillRect(0, 0, W, 100);

  // Texto header
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 11px Arial';
  ctx.letterSpacing = '3px';
  ctx.textAlign = 'center';
  ctx.fillText('PAPELARIA BETEL', W/2, 32);
  ctx.letterSpacing = '0px';
  ctx.font = 'bold 22px Arial';
  ctx.fillText('Comprovante de Recebimento', W/2, 62);
  ctx.font = '11px Arial';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText('Documento não fiscal', W/2, 84);

  // Linha separadora roxa suave
  ctx.fillStyle = '#EDE9FE';
  ctx.fillRect(24, 112, W - 48, 1);

  // Função auxiliar: linha de dado
  function drawRow(label, value, y, highlight) {
    ctx.textAlign = 'left';
    ctx.font = '500 12px Arial';
    ctx.fillStyle = '#9590A8';
    ctx.fillText(label, 36, y);
    ctx.textAlign = 'right';
    ctx.font = highlight ? 'bold 15px Arial' : '600 13px Arial';
    ctx.fillStyle = highlight ? '#7C3AED' : '#1E1B2E';
    ctx.fillText(value, W - 36, y);
    // divisor
    ctx.strokeStyle = '#F0EDF8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(36, y + 10);
    ctx.lineTo(W - 36, y + 10);
    ctx.stroke();
  }

  let y = 148;
  const gap = 40;
  drawRow('N° do pedido',      '#' + idCurto,                        y); y += gap;
  drawRow('Cliente',           order.cliente,                         y); y += gap;
  drawRow('Data de recebimento', formatDate(dataPgto),               y); y += gap;
  if (order.data_entrega_real) {
    drawRow('Data de entrega', formatDate(order.data_entrega_real),   y); y += gap;
  }

  // Bloco de valor destacado
  ctx.fillStyle = '#F5F0FF';
  ctx.beginPath();
  ctx.roundRect(24, y, W - 48, 58, 10);
  ctx.fill();
  ctx.textAlign = 'left';
  ctx.font = 'bold 11px Arial';
  ctx.fillStyle = '#7C3AED';
  ctx.fillText('VALOR RECEBIDO', 40, y + 22);
  ctx.textAlign = 'right';
  ctx.font = 'bold 28px Arial';
  ctx.fillStyle = '#7C3AED';
  ctx.fillText('R$ ' + formatCurrency(order.valor), W - 36, y + 46);
  y += 72;

  // Bloco forma de pagamento
  ctx.fillStyle = '#F9FAFB';
  ctx.beginPath();
  ctx.roundRect(24, y, W - 48, 70, 10);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.font = 'bold 13px Arial';
  ctx.fillStyle = '#1E1B2E';
  ctx.fillText('Forma de pagamento: ' + tipoPgto, W/2, y + 22);
  ctx.font = '12px Arial';
  ctx.fillStyle = '#4B4563';
  ctx.fillText('CPF: 367.427.448-55', W/2, y + 42);
  ctx.fillText('Nayara Pereira Mendes Garcia', W/2, y + 60);
  y += 86;

  // Rodapé
  ctx.strokeStyle = '#E4DFEF';
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(24, y);
  ctx.lineTo(W - 24, y);
  ctx.stroke();
  ctx.setLineDash([]);
  y += 18;
  ctx.textAlign = 'center';
  ctx.font = '11px Arial';
  ctx.fillStyle = '#9590A8';
  ctx.fillText('Papelaria BETEL', W/2, y);
  ctx.fillText('Emitido em ' + formatDate(todayDate()), W/2, y + 16);
  ctx.fillText('Este documento não tem validade fiscal', W/2, y + 32);

  // ── Exporta PNG e oferece download + WhatsApp ─────────────
  canvas.toBlob(blob => {
    // 1) Download automático
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href     = url;
    link.download = `recibo_${order.cliente.replace(/\s+/g,'_')}_${idCurto}.png`;
    link.click();

    // 2) Modal de compartilhamento WhatsApp
    const msg = encodeURIComponent(
      `Olá ${order.cliente}! Segue o recibo do seu pedido #${idCurto}.\n` +
      `Valor: R$ ${formatCurrency(order.valor)}\n` +
      `Forma: ${tipoPgto}\n` +
      `Papelaria BETEL`
    );
    setTimeout(() => {
      if (confirm('Recibo baixado! Abrir WhatsApp para compartilhar?')) {
        window.open(`https://wa.me/?text=${msg}`, '_blank');
      }
      URL.revokeObjectURL(url);
    }, 400);
  }, 'image/png');
}

// ────────────────────────────────────────────────────────────
// ⑩ SALVAR PEDIDO
//    BUG CORRIGIDO: o setButtonLoading(false) estava faltando
//    em alguns caminhos de erro, deixando o spinner travado
// ────────────────────────────────────────────────────────────
async function handleSaveOrder(event) {
  event.preventDefault();

  // Desativa o botão e mostra spinner
  setButtonLoading('btn-save', true);
  hideModalMessage();

  // [MELHORIA FLUXO PRODUÇÃO] — status de produção separado de pagamento
  const orderId    = document.getElementById('order-id').value;
  const formStatus = document.getElementById('field-status').value;
  const existing   = orderId ? allOrders.find(o => o.id === orderId) : null;
  const status     = formValueToDbStatus(formStatus, existing?.status || STATUS.RECEBIDO);
  const isEntregue = formStatus === 'entregue' || status === STATUS.ENTREGUE || STATUS_FINALIZADOS.has(status);
  const isPago     = false; // pagamento gerenciado pelo modal de pagamento

  // --- Validações (sempre libera o botão ao sair com erro) ---
  if (!orderItems.length) {
    showModalMessage('Adicione ao menos um item ao pedido.', 'error');
    setButtonLoading('btn-save', false);
    return;
  }

  if (isEntregue && !document.getElementById('field-data-entrega-real').value) {
    showModalMessage('Informe a data de entrega real.', 'error');
    setButtonLoading('btn-save', false);
    return;
  }

  // [MELHORIA FLUXO PRODUÇÃO] — comprovante gerenciado pelo modal de pagamento

  // --- Upload de comprovante ---
  let comprovanteUrl = null;
  if (comprovanteFile) {
    comprovanteUrl = await uploadComprovante(comprovanteFile, orderId || 'new_' + Date.now());
    if (!comprovanteUrl) {
      showModalMessage('Erro ao enviar o comprovante. Tente novamente.', 'error');
      setButtonLoading('btn-save', false);
      return;
    }
  }
  // Mantém URL existente se não enviou novo arquivo
  if (!comprovanteUrl && orderId) {
    comprovanteUrl = allOrders.find(o => o.id === orderId)?.comprovante_url || null;
  }

  const payload = {
    cliente:           document.getElementById('field-cliente').value.trim(),
    descricao:         document.getElementById('field-descricao').value.trim(),
    valor:             getOrderTotal(),
    status,
    data_pedido:       document.getElementById('field-data-pedido').value || null,
    data_entrega:      document.getElementById('field-data-entrega').value || null,
    data_entrega_real: isEntregue ? (document.getElementById('field-data-entrega-real').value || null) : null,
    comprovante_url:   comprovanteUrl,
    // Mantém o user_id do criador original ao editar
    ...(orderId ? {} : { user_id: currentUser.id, pago: false }), // [MELHORIA FLUXO PRODUÇÃO]
  };

  let savedOrderId = orderId;
  let error;

  try {
    if (orderId) {
      ({ error } = await db.from('pedidos').update(payload).eq('id', orderId));
    } else {
      const { data: inserted, error: ie } = await db.from('pedidos').insert(payload).select().single();
      error = ie;
      if (inserted) savedOrderId = inserted.id;
    }

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

    // Sucesso!
    closeOrderModal();
    await loadOrders();

  } catch (err) {
    console.error('Erro ao salvar:', err);
    showModalMessage('Erro ao salvar o pedido: ' + (err.message || 'tente novamente.'), 'error');
    setButtonLoading('btn-save', false); // <-- garante liberação do botão mesmo com erro
  }
}

// ────────────────────────────────────────────────────────────
// ⑪ MODAL DE PEDIDO
// ────────────────────────────────────────────────────────────
function openOrderModal() {
  document.getElementById('modal-title').textContent = 'Novo Pedido';
  document.getElementById('order-form').reset();
  document.getElementById('order-id').value          = '';
  document.getElementById('field-data-pedido').value = todayDate();
  document.getElementById('field-status').value      = 'em_andamento';
  orderItems      = [];
  comprovanteFile = null;
  renderItemsList();
  updateConclusaoSection();
  hideModalMessage();
  resetComprovanteUI();
  document.getElementById('order-modal').classList.remove('hidden');
}

function openEditOrderModal(id, forcePayment = false, forceStatus = null) {
  const order = allOrders.find(p => p.id === id);
  if (!order) return;

  document.getElementById('modal-title').textContent           = 'Editar Pedido';
  document.getElementById('order-id').value                    = order.id;
  document.getElementById('field-cliente').value               = order.cliente;
  document.getElementById('field-descricao').value             = order.descricao || '';
  document.getElementById('field-data-pedido').value           = order.data_pedido || '';
  document.getElementById('field-data-entrega').value          = order.data_entrega || '';
  document.getElementById('field-data-entrega-real').value     = order.data_entrega_real || '';

  // Força status se veio de ação rápida
  if (forcePayment) {
    document.getElementById('field-status').value = 'entregue';
  } else if (forceStatus) {
    document.getElementById('field-status').value = STATUS_FINALIZADOS.has(forceStatus) ? 'entregue' : 'em_andamento';
  } else {
    document.getElementById('field-status').value = statusToFormValue(order.status);
  }

  // Itens
  orderItems = (order.itens_pedido || []).map(i => ({
    _tempId:    Date.now() + Math.random(),
    product_id: i.product_id,
    nome:       i.nome || i.produtos?.nome || '',
    preco:      i.preco,
    quantidade: i.quantidade,
  }));
  renderItemsList();

  comprovanteFile = null;
  resetComprovanteUI();
  if (order.comprovante_url) {
    const link = document.getElementById('comprovante-existing');
    link.href = order.comprovante_url;
    link.classList.remove('hidden');
  }

  updateConclusaoSection();
  hideModalMessage();
  document.getElementById('order-modal').classList.remove('hidden');
}

function closeOrderModal() {
  document.getElementById('order-modal').classList.add('hidden');
  comprovanteFile = null;
  // Garante que o botão seja liberado ao fechar o modal
  setButtonLoading('btn-save', false);
}

function closeModalOnOverlay(e) {
  if (e.target === document.getElementById('order-modal')) closeOrderModal();
}

function onStatusChange() { updateConclusaoSection(); }

// [MELHORIA FLUXO PRODUÇÃO] — seção de entrega: só data real
function updateConclusaoSection() {
  const status     = document.getElementById('field-status').value;
  const isEntregue = status === 'entregue';
  document.getElementById('conclusao-section').classList.toggle('hidden', !isEntregue);
  if (isEntregue) document.getElementById('comprovante-field').classList.add('hidden');
}

// ────────────────────────────────────────────────────────────
// ⑫ COMPROVANTE
// ────────────────────────────────────────────────────────────
function onComprovanteSelected(event) {
  const file = event.target.files[0];
  if (!file) return;
  comprovanteFile = file;
  const preview = document.getElementById('comprovante-preview');
  preview.classList.remove('hidden');
  if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = e => { preview.innerHTML = `<img src="${e.target.result}" class="comprovante-img-preview" />`; };
    reader.readAsDataURL(file);
  } else {
    preview.innerHTML = `<div class="file-preview-tag">📄 ${escapeHtml(file.name)}</div>`;
  }
  document.getElementById('upload-area').style.display = 'none';
}

function resetComprovanteUI() {
  document.getElementById('field-comprovante').value       = '';
  document.getElementById('comprovante-preview').innerHTML = '';
  document.getElementById('comprovante-preview').classList.add('hidden');
  document.getElementById('comprovante-existing').classList.add('hidden');
  document.getElementById('comprovante-existing').href     = '';
  document.getElementById('upload-area').style.display    = 'flex';
  comprovanteFile = null;
}

async function uploadComprovante(file, pedidoId) {
  const ext      = file.name.split('.').pop();
  const fileName = `comprovantes/${pedidoId}_${Date.now()}.${ext}`;
  const { error } = await db.storage.from('comprovantes').upload(fileName, file, { upsert: true });
  if (error) { console.error('Upload error:', error); return null; }
  const { data: urlData } = db.storage.from('comprovantes').getPublicUrl(fileName);
  return urlData.publicUrl;
}

function viewReceipt(url) {
  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
  document.getElementById('receipt-content').innerHTML = isImage
    ? `<img src="${escapeHtml(url)}" class="receipt-full-img" />`
    : `<div class="receipt-pdf-link"><a href="${escapeHtml(url)}" target="_blank" class="btn-primary" style="display:inline-block;text-decoration:none;padding:14px 24px">📄 Abrir PDF</a></div>`;
  document.getElementById('receipt-modal').classList.remove('hidden');
}

function closeReceiptModal() { document.getElementById('receipt-modal').classList.add('hidden'); }

// ────────────────────────────────────────────────────────────
// ⑬ EXCLUSÃO
// ────────────────────────────────────────────────────────────
function openDeleteModal(id)  { deleteTargetId = id; document.getElementById('delete-modal').classList.remove('hidden'); }
function closeDeleteModal()   { deleteTargetId = null; document.getElementById('delete-modal').classList.add('hidden'); }
function closeDeleteModalOnOverlay(e) { if (e.target === document.getElementById('delete-modal')) closeDeleteModal(); }

async function confirmDelete() {
  if (!deleteTargetId) return;
  await db.from('itens_pedido').delete().eq('pedido_id', deleteTargetId);
  await db.from('pedidos').delete().eq('id', deleteTargetId);
  closeDeleteModal();
  await loadOrders();
}

// ────────────────────────────────────────────────────────────
// ⑭ PDF ORÇAMENTO
// ────────────────────────────────────────────────────────────
function gerarOrcamentoPDF() {
  const cliente = document.getElementById('field-cliente').value.trim() || 'Cliente';
  const obs     = document.getElementById('field-descricao').value.trim();
  if (!orderItems.length) { alert('Adicione itens antes de gerar o orçamento.'); return; }

  const { jsPDF } = window.jspdf;
  const doc   = new jsPDF({ unit: 'mm', format: 'a4' });
  const coral = [124,58,237], tinta = [44,35,24], suave = [107,94,82]; // [MELHORIA VISUAL ROXO]

  doc.setFillColor(...coral); doc.rect(0,0,210,35,'F');
  doc.setTextColor(255,255,255); doc.setFontSize(22); doc.setFont('helvetica','bold'); doc.text('Papelaria BETEL',15,16);
  doc.setFontSize(10); doc.setFont('helvetica','normal'); doc.text('Orçamento de Pedido',15,24); doc.text(`Data: ${formatDate(todayDate())}`,15,30);

  doc.setTextColor(...tinta); doc.setFontSize(13); doc.setFont('helvetica','bold'); doc.text('Cliente',15,48);
  doc.setFont('helvetica','normal'); doc.setFontSize(11); doc.text(cliente,15,55);
  doc.setDrawColor(...coral); doc.setLineWidth(0.5); doc.line(15,60,195,60);

  doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(...tinta);
  doc.text('Item',15,68); doc.text('Qtd',120,68,{align:'center'}); doc.text('Unit.',150,68,{align:'right'}); doc.text('Subtotal',195,68,{align:'right'});
  doc.setLineWidth(0.2); doc.setDrawColor(200,200,200); doc.line(15,70,195,70);

  let y = 77; doc.setFont('helvetica','normal'); doc.setTextColor(...suave);
  orderItems.forEach(item => {
    if (y > 260) { doc.addPage(); y = 20; }
    doc.text(item.nome.substring(0,45),15,y); doc.text(String(item.quantidade),120,y,{align:'center'});
    doc.text(`R$ ${formatCurrency(item.preco)}`,150,y,{align:'right'}); doc.text(`R$ ${formatCurrency(item.preco*item.quantidade)}`,195,y,{align:'right'});
    y += 8; doc.line(15,y-2,195,y-2);
  });

  y += 4; doc.setFillColor(250,247,242); doc.rect(120,y-5,75,12,'F');
  doc.setFontSize(12); doc.setFont('helvetica','bold'); doc.setTextColor(...coral);
  doc.text('TOTAL',125,y+2); doc.text(`R$ ${formatCurrency(getOrderTotal())}`,195,y+2,{align:'right'});

  if (obs) {
    y += 20; doc.setFontSize(10); doc.setFont('helvetica','bold'); doc.setTextColor(...tinta); doc.text('Observações:',15,y);
    doc.setFont('helvetica','normal'); doc.setTextColor(...suave); doc.text(doc.splitTextToSize(obs,170),15,y+7);
  }
  doc.setFontSize(9); doc.setTextColor(180,180,180);
  doc.text('Orçamento gerado por Papelaria BETEL - sujeito a alterações.',105,285,{align:'center'});
  doc.save(`orcamento_${cliente.replace(/\s+/g,'_')}_${todayDate()}.pdf`);
}

// ────────────────────────────────────────────────────────────
// ⑮ FILTROS
// ────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════
// [AJUSTE 3] MODAL DETALHE — 2 colunas
// ═══════════════════════════════════════════════
function abrirDetalhe(id) {
  const order = allOrders.find(o => o.id === id);
  if (!order) return;
  const modal = document.getElementById('order-detail-modal');
  if (!modal) return;
  // Título + badge status
  document.getElementById('detail-titulo').textContent = `Pedido · ${escapeHtml(order.cliente)}`;
  const badge = document.getElementById('detail-status-badge');
  badge.textContent = getUIStatusLabel(order);
  badge.className = 'badge-status ' + getUIStatusBadgeClass(order);
  // Avatar + cliente
  const letra = (order.cliente||'?')[0].toUpperCase();
  document.getElementById('detail-avatar').textContent = letra;
  document.getElementById('detail-client-name').textContent = order.cliente || '–';
  document.getElementById('detail-client-meta').textContent =
    [order.data_pedido ? `Pedido em ${formatDate(order.data_pedido)}` : '',
     order.valor ? `R$ ${formatCurrency(order.valor)}` : ''].filter(Boolean).join(' · ');
  // Itens
  const itensEl = document.getElementById('detail-itens-list');
  if (order.itens_pedido?.length) {
    itensEl.innerHTML = order.itens_pedido.map(i => {
      const nome = i.nome || i.produtos?.nome || '?';
      const sub = Number(i.preco||0) * Number(i.quantidade||1);
      return `<div class="detail-item-row">
        <div class="detail-item-info">
          ${escapeHtml(nome)}
          <span class="detail-item-qty">${i.quantidade}x · R$ ${formatCurrency(i.preco||0)} cada</span>
        </div>
        <span class="detail-item-price">R$ ${formatCurrency(sub)}</span>
      </div>`;
    }).join('');
  } else {
    itensEl.innerHTML = '<p style="font-size:12px;color:var(--ink-muted)">Nenhum item registrado</p>';
  }
  document.getElementById('detail-total').textContent = `R$ ${formatCurrency(order.valor||0)}`;
  // Observações
  const obsWrap = document.getElementById('detail-obs-wrap');
  if (order.descricao) {
    obsWrap.classList.remove('hidden');
    document.getElementById('detail-obs').textContent = order.descricao;
  } else { obsWrap.classList.add('hidden'); }
  // Datas
  const datasEl = document.getElementById('detail-datas-list');
  const late = isLate(order);
  datasEl.innerHTML = [
    { label:'📅 Criação',     val: order.data_pedido,      cls: '' },
    { label:'🚚 Entrega prev.',val: order.data_entrega,     cls: late ? 'detail-data-val--late' : '' },
    { label:'🏁 Entregue em', val: order.data_entrega_real, cls: 'detail-data-val' },
  ].filter(d => d.val).map(d => `
    <div class="detail-data-row">
      <span class="detail-data-label">${d.label}</span>
      <span class="detail-data-val ${d.cls}">${formatDate(d.val)}</span>
    </div>`).join('');
  // Histórico simplificado
  const HIST_STEPS = [
    { status:'recebido',    label:'Pedido recebido',     done: true },
    { status:'em_producao', label:'Entrou em produção',  done: STATUS_ATIVOS.has(order.status) && order.status !== 'recebido' || STATUS_FINALIZADOS.has(order.status) },
    { status:'pronto',      label:'Pronto para entrega', done: order.status === 'pronto' || STATUS_FINALIZADOS.has(order.status) },
    { status:'entregue',    label:'Entregue ao cliente', done: STATUS_FINALIZADOS.has(order.status) },
    { status:'pago',        label:'Pagamento confirmado',done: order.pago === true },
  ];
  const current = HIST_STEPS.findIndex(s => s.status === order.status);
  document.getElementById('detail-historico').innerHTML = HIST_STEPS.map((step, i) => {
    const cls = step.done ? 'hist-done' : (i === current ? 'hist-current' : '');
    return `<div class="detail-hist-item ${cls}">
      <div>
        <div class="detail-hist-label">${step.label}</div>
        ${step.done ? '<div class="detail-hist-sub">✓ Concluído</div>' : ''}
      </div>
    </div>`;
  }).join('');
  // Ações
  const jaPago    = order.pago === true;
  const eAtivo    = STATUS_ATIVOS.has(order.status);
  const ePronte   = order.status === 'pronto';
  const entregue  = STATUS_FINALIZADOS.has(order.status);
  const pgtoAtraso = isPagamentoAtrasado(order);
  const tipoPgtoLabel = order.tipo_pagamento === 'dinheiro' ? 'Dinheiro' : 'PIX';
  const labelAv = labelBtnAvancar(order.status);
  let acoes = '';
  if (eAtivo && !ePronte && labelAv) {
    acoes += `<button class="btn-action btn-avancar" onclick="closeDetailModal();avancarStatus('${order.id}','${order.status}')">${labelAv}</button>`;
  }
  if (ePronte) {
    acoes += `<button class="btn-action btn-entregar" onclick="closeDetailModal();openEntregueModal('${order.id}')">Entregar</button>`;
  }
  if (entregue) {
    acoes += `<button class="btn-action btn-reabrir" onclick="closeDetailModal();setStatusRecebido('${order.id}')">↩ Reabrir</button>`;
  }
  acoes += `<button class="btn-action btn-cupom" onclick="closeDetailModal();emitirCupomPagamento('${order.id}')">Emitir recibo</button>`;
  if (jaPago) {
    if (order.comprovante_url) {
      acoes += `<button class="btn-action btn-pago-sim" onclick="closeDetailModal();verComprovantePagamento('${order.id}')">Ver comprovante</button>`;
    }
    acoes += `<button class="btn-action btn-reabrir" onclick="closeDetailModal();abrirModalPagamento('${order.id}',true)" title="Desmarcar pagamento">Desmarcar pgto</button>`;
  } else {
    acoes += `<button class="btn-action ${pgtoAtraso ? 'btn-pago-atrasado' : 'btn-pago-nao'}"
      onclick="closeDetailModal();abrirModalPagamento('${order.id}',false)">
      ${pgtoAtraso ? '⚠ Receber' : 'Receber'}
    </button>`;
  }
  acoes += `<a class="btn-icone btn-whatsapp" href="${gerarLinkWhatsApp(order)}" target="_blank" rel="noopener" title="WhatsApp">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
  </a>`;
  acoes += `<button class="btn-icone btn-edit" onclick="closeDetailModal();openEditOrderModal('${order.id}')" title="Editar">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
  </button>`;
  document.getElementById('detail-acoes').innerHTML = acoes;
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}
function closeDetailModal() {
  const modal = document.getElementById('order-detail-modal');
  if (modal) modal.classList.add('hidden');
  document.body.style.overflow = '';
  // Recarrega dashboard se necessário
  if (currentPage === 'dashboard') renderDashFilteredList();
}
function closeDetailModalOverlay(e) {
  if (e.target === e.currentTarget) closeDetailModal();
}

function setFilter(filter, btn) {
  currentFilter = filter;
  document.querySelectorAll('.filter-pill, .filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderOrders();
  updateSummaryCards();
}

// ════════════════════════════════════════════════════════════
// [MELHORIA DESPESAS] — NAVEGAÇÃO POR ABAS
// ════════════════════════════════════════════════════════════
function setupNavTabs() {
  showPage('dashboard'); // [AJUSTE 5] inicia no dashboard
}

// [AJUSTE 4+5+7] showPage conhece dashboard, pedidos, despesas, financeiro
function showPage(page) {
  closeSidebar();
  currentPage = page;
  const pages = ['dashboard','pedidos','despesas','financeiro','produtos'];
  pages.forEach(p => {
    const el = document.getElementById('section-' + p);
    if (el) el.classList.toggle('hidden', p !== page);
  });
  document.querySelectorAll('.nav-tab, .bottom-nav__item').forEach(t => {
    t.classList.toggle('active', t.dataset.page === page);
  });
  // FAB: só em pedidos = + pedido, despesas = + despesa
  const fabPedido  = document.querySelector('.fab-new:not(.fab-despesa)');
  const fabDespesa = document.querySelector('.fab-despesa');
  if (fabPedido)  fabPedido.style.display  = page === 'pedidos'  ? 'flex' : 'none';
  if (fabDespesa) fabDespesa.style.display = page === 'despesas' ? 'flex' : 'none';
  if (page === 'financeiro') updateFinanceiro();
  if (page === 'despesas')   renderExpenses();
  if (page === 'dashboard')  renderDashboard();
  if (page === 'produtos')   loadProducts();
}

// [AJUSTE 4] Variável do filtro ativo no dashboard
let dashFiltroAtivo = 'todos';

// [AJUSTE 4] dashFiltrar — filtra lista inline no dashboard sem mudar de página
function highlightDashCard(cardId) {
  document.querySelectorAll('.stat-card--clickable').forEach(c => c.classList.remove('card-active-filter'));
  const el = document.getElementById(cardId);
  if (el) el.classList.add('card-active-filter');
}

function dashFiltrar(filtro, clickedEl) {
  if (clickedEl && dashFiltroAtivo === filtro) {
    dashFiltroAtivo = 'todos';
    document.querySelectorAll('.stat-card--clickable').forEach(c => c.classList.remove('card-active-filter'));
    const cardTodos = document.getElementById('dash-card-total');
    if (cardTodos) cardTodos.classList.add('card-active-filter');
    const titulo = document.getElementById('dash-list-titulo');
    if (titulo) titulo.textContent = 'Pedidos recentes';
    renderDashFilteredList();
    updateSummaryCards();
    return;
  }

  dashFiltroAtivo = filtro;
  document.querySelectorAll('.stat-card--clickable').forEach(c => c.classList.remove('card-active-filter'));

  const cardMap = {
    finalizados: 'dash-card-recebidos',
    'a-receber': 'dash-card-areceber',
    'pgto-atrasado': 'dash-card-areceber',
    todos: 'dash-card-total',
  };
  const cardEl = document.getElementById(cardMap[filtro]) || (clickedEl?.id ? clickedEl : null);
  if (cardEl?.classList) cardEl.classList.add('card-active-filter');
  else if (clickedEl?.classList) clickedEl.classList.add('card-active-filter');

  const tituloMap = {
    todos: 'Pedidos recentes',
    finalizados: 'Recebidos',
    'a-receber': 'A receber',
    'pgto-atrasado': 'A receber',
    atrasado: 'Entrega atrasada',
  };
  const titulo = document.getElementById('dash-list-titulo');
  if (titulo) titulo.textContent = tituloMap[filtro] || 'Pedidos';

  renderDashFilteredList();
  updateSummaryCards();
}

// [AJUSTE 4] Renderiza lista filtrada no dashboard (rows clicáveis que abrem detalhe)
function renderDashFilteredList() {
  const container = document.getElementById('dash-filtered-list');
  if (!container) return;
  const search = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
  let lista = [...allOrders].filter(inPeriod);
  if (dashFiltroAtivo === 'atrasado') lista = lista.filter(isLate);
  else if (dashFiltroAtivo === 'pgto-atrasado' || dashFiltroAtivo === 'a-receber') lista = lista.filter(p => p.pago !== true);
  else if (dashFiltroAtivo === 'ativos')        lista = lista.filter(p => !isOrderEntregue(p));
  else if (dashFiltroAtivo === 'finalizados') lista = lista.filter(p => p.pago === true);
  if (search) {
    lista = lista.filter(p =>
      (p.cliente || '').toLowerCase().includes(search)
      || String(p.id || '').toLowerCase().includes(search)
      || String(p.valor || '').includes(search)
    );
  }
  lista.sort((a, b) => {
    const da = orderDateKey(a);
    const db = orderDateKey(b);
    return db > da ? 1 : db < da ? -1 : 0;
  });
  if (dashFiltroAtivo === 'todos') lista = lista.slice(0, 25);

  if (!lista.length) {
    container.innerHTML = `<div class="empty-state empty-state--compact">
      <p class="empty-title">Nenhum pedido neste período</p>
      <p class="empty-sub">Ajuste o filtro ou cadastre um novo pedido.</p>
    </div>`;
    return;
  }

  container.innerHTML = lista.map(order => buildCompactOrderRow(order, { showWorkflow: false })).join('');
}

// [AJUSTE 5] goToPedidosComFiltro mantido para compatibilidade mas agora vai p/ pedidos
function goToPedidosComFiltro(filtro) {
  showPage('pedidos');
  setTimeout(() => {
    const map = { ativos: 'em-andamento', finalizados: 'entregue' };
    const f = map[filtro] || filtro;
    const btn = document.querySelector(`.filter-pill[data-filter="${f}"]`);
    setFilter(f, btn || document.querySelector('.filter-pill'));
  }, 50);
}

// [AJUSTE 4] Renderiza dashboard completo
function renderDashboard() {
  ['periodo-inicio', 'periodo-inicio-pedidos', 'sheet-periodo-inicio'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = periodoInicio;
  });
  ['periodo-fim', 'periodo-fim-pedidos', 'sheet-periodo-fim'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = periodoFim;
  });
  dashFiltroAtivo = 'todos';
  const titulo = document.getElementById('dash-list-titulo');
  if (titulo) titulo.textContent = 'Pedidos recentes';
  highlightDashCard('dash-card-total');
  updateSummaryCards();
  renderDashFilteredList();
}

// ════════════════════════════════════════════════════════════
// [MELHORIA DESPESAS] — CRUD DESPESAS
// ════════════════════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────
// SQL Supabase — execute no SQL Editor do seu projeto:
//
// CREATE TABLE IF NOT EXISTS despesas (
//   id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//   data        DATE NOT NULL,
//   descricao   TEXT NOT NULL,
//   valor       NUMERIC(10,2) NOT NULL DEFAULT 0,
//   user_id     UUID REFERENCES auth.users(id),
//   created_at  TIMESTAMPTZ DEFAULT now()
// );
// ALTER TABLE despesas ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "despesas_select" ON despesas FOR SELECT USING (true);
// CREATE POLICY "despesas_insert" ON despesas FOR INSERT WITH CHECK (auth.uid() = user_id);
// CREATE POLICY "despesas_update" ON despesas FOR UPDATE USING (auth.uid() = user_id);
// CREATE POLICY "despesas_delete" ON despesas FOR DELETE USING (auth.uid() = user_id);
// ─────────────────────────────────────────────────────────────

let despesaEditId    = null;
let despesaFiltroIni = '';
let despesaFiltroFim = '';

async function loadExpenses() {
  const { data, error } = await db.from('despesas').select('*').order('data', { ascending: false });
  if (error) { console.warn('Tabela despesas não existe ainda — crie via SQL Editor.', error.message); allExpenses = []; return; }
  allExpenses = data || [];
  if (currentPage === 'despesas')   renderExpenses();
  if (currentPage === 'financeiro') updateFinanceiro();
}

function inPeriodDespesa(d) {
  if (!despesaFiltroIni || !despesaFiltroFim) return true;
  return d.data >= despesaFiltroIni && d.data <= despesaFiltroFim;
}

function setDespesaShortcut(tipo, btn) {
  if (tipo === 'personalizado') {
    document.querySelectorAll('.desp-shortcut').forEach(b => b.classList.toggle('active', b === btn));
    document.getElementById('desp-period-custom')?.classList.remove('hidden');
    applyDespesaPeriod();
    return;
  }
  const range = periodRangeForShortcut(tipo);
  if (!range) return;
  document.getElementById('desp-ini').value = range.ini;
  document.getElementById('desp-fim').value = range.fim;
  despesaFiltroIni = range.ini;
  despesaFiltroFim = range.fim;
  document.getElementById('desp-period-custom')?.classList.add('hidden');
  document.getElementById('desp-period-mobile-panel')?.classList.add('hidden');
  document.querySelectorAll('.desp-shortcut').forEach(b => b.classList.toggle('active', b === btn));
  const labelMap = { 'mes-atual': 'Mês Atual', 'mes-anterior': 'Mês Anterior', 'todos': 'Todos' };
  const lbl = document.getElementById('desp-period-label-mobile');
  if (lbl && labelMap[tipo]) lbl.textContent = labelMap[tipo];
  renderExpenses();
}

function applyDespesaPeriod() {
  const ini = document.getElementById('desp-ini').value;
  const fim = document.getElementById('desp-fim').value;
  if (!ini || !fim) return;
  despesaFiltroIni = ini <= fim ? ini : fim;
  despesaFiltroFim = ini <= fim ? fim : ini;
  document.getElementById('desp-period-custom')?.classList.remove('hidden');
  document.querySelectorAll('.desp-shortcut').forEach(b => b.classList.remove('active'));
  renderExpenses();
}

function renderExpenses() {
  const el = document.getElementById('expenses-list');
  if (!el) return;
  const filtered = allExpenses.filter(inPeriodDespesa);
  const total    = filtered.reduce((a, d) => a + Number(d.valor), 0);
  const totEl    = document.getElementById('desp-total-val');
  if (totEl) totEl.textContent = `R$ ${formatCurrency(total)}`;
  if (!filtered.length) {
    el.innerHTML = '<div class="empty-state" style="padding:32px 0"><div class="empty-icon">💸</div><p class="empty-title">Nenhuma despesa no período</p></div>';
    return;
  }
  el.innerHTML = filtered.map(d => `
    <div class="expense-card">
      <div class="expense-card__icon" aria-hidden="true">↓</div>
      <div class="expense-card__body">
        <span class="expense-desc">${escapeHtml(d.descricao)}</span>
        <span class="expense-date">${formatDate(d.data)}</span>
      </div>
      <span class="expense-value valor-monetario">R$ ${formatCurrency(d.valor)}</span>
      <div class="expense-actions">
        <button class="btn-icon-sm" onclick="openEditExpense('${d.id}')" title="Editar">✏️</button>
        <button class="btn-icon-sm btn-icon-del" onclick="confirmDeleteExpense('${d.id}')" title="Excluir">🗑️</button>
      </div>
    </div>`).join('');
}

function openNewExpense() {
  despesaEditId = null;
  document.getElementById('desp-form-id').value    = '';
  document.getElementById('desp-form-data').value  = todayDate();
  document.getElementById('desp-form-desc').value  = '';
  document.getElementById('desp-form-valor').value = '';
  document.getElementById('desp-modal-title').textContent = 'Nova Despesa';
  document.getElementById('expense-modal').classList.remove('hidden');
}

function openEditExpense(id) {
  const d = allExpenses.find(x => x.id === id);
  if (!d) return;
  despesaEditId = id;
  document.getElementById('desp-form-id').value    = d.id;
  document.getElementById('desp-form-data').value  = d.data;
  document.getElementById('desp-form-desc').value  = d.descricao;
  document.getElementById('desp-form-valor').value = d.valor;
  document.getElementById('desp-modal-title').textContent = 'Editar Despesa';
  document.getElementById('expense-modal').classList.remove('hidden');
}

function closeExpenseModal() { document.getElementById('expense-modal').classList.add('hidden'); }
function closeExpenseModalOverlay(e) { if (e.target === document.getElementById('expense-modal')) closeExpenseModal(); }

async function handleSaveExpense(event) {
  event.preventDefault();
  setButtonLoading('btn-save-expense', true);
  const id = document.getElementById('desp-form-id').value;
  const payload = {
    data:      document.getElementById('desp-form-data').value,
    descricao: document.getElementById('desp-form-desc').value.trim(),
    valor:     parseFloat(document.getElementById('desp-form-valor').value) || 0,
    user_id:   currentUser.id,
  };
  let error;
  if (id) ({ error } = await db.from('despesas').update(payload).eq('id', id));
  else    ({ error } = await db.from('despesas').insert(payload));
  setButtonLoading('btn-save-expense', false);
  if (error) { alert('Erro ao salvar: ' + error.message); return; }
  closeExpenseModal();
  await loadExpenses();
}

async function confirmDeleteExpense(id) {
  if (!confirm('Excluir esta despesa?')) return;
  await db.from('despesas').delete().eq('id', id);
  await loadExpenses();
}

// ════════════════════════════════════════════════════════════
// [MELHORIA DASH ENTRADAS x SAÍDAS] — FINANCEIRO
// ════════════════════════════════════════════════════════════
let finIni = '';
let finFim = '';

function setFinShortcut(tipo, btn) {
  if (tipo === 'personalizado') {
    document.querySelectorAll('.fin-shortcut').forEach(b => b.classList.toggle('active', b === btn));
    document.getElementById('fin-period-custom')?.classList.remove('hidden');
    applyFinPeriod();
    return;
  }
  const range = periodRangeForShortcut(tipo);
  if (!range) return;
  document.getElementById('fin-ini').value = range.ini;
  document.getElementById('fin-fim').value = range.fim;
  finIni = range.ini;
  finFim = range.fim;
  document.getElementById('fin-period-custom')?.classList.add('hidden');
  document.getElementById('fin-period-mobile-panel')?.classList.add('hidden');
  document.querySelectorAll('.fin-shortcut').forEach(b => b.classList.toggle('active', b === btn));
  const labelMap = { 'mes-atual': 'Mês Atual', 'mes-anterior': 'Mês Anterior', 'todos': 'Todos' };
  const lbl = document.getElementById('fin-period-label-mobile');
  if (lbl && labelMap[tipo]) lbl.textContent = labelMap[tipo];
  updateFinanceiro();
}

function applyFinPeriod() {
  const ini = document.getElementById('fin-ini').value;
  const fim = document.getElementById('fin-fim').value;
  if (!ini || !fim) return;
  finIni = ini <= fim ? ini : fim;
  finFim = ini <= fim ? fim : ini;
  document.getElementById('fin-period-custom')?.classList.remove('hidden');
  document.querySelectorAll('.fin-shortcut').forEach(b => b.classList.remove('active'));
  updateFinanceiro();
}

function updateFinanceiro() {
  // usa período da aba financeiro, senão cai pro período geral
  const ini = finIni || periodoInicio;
  const fim = finFim || periodoFim;
  if (!ini || !fim) return;

  const entradas = allOrders
    .filter(o => { const d = orderDateKey(o); return d && d >= ini && d <= fim; })
    .filter(o => o.pago === true)  // [MELHORIA PAGAMENTOS ATRASADOS]
    .reduce((a, o) => a + Number(o.valor), 0);

  const saidas = allExpenses
    .filter(d => d.data >= ini && d.data <= fim)
    .reduce((a, d) => a + Number(d.valor), 0);

  const resultado = entradas - saidas;
  const total     = entradas + saidas;

  const elE  = document.getElementById('fin-entradas');
  const elS  = document.getElementById('fin-saidas');
  const elR  = document.getElementById('fin-resultado');
  const elRc = document.getElementById('fin-resultado-card');
  const elRl = document.getElementById('fin-resultado-label');
  const barE = document.getElementById('fin-bar-e');
  const barS = document.getElementById('fin-bar-s');

  if (elE) elE.textContent = `R$ ${formatCurrency(entradas)}`;
  if (elS) elS.textContent = `R$ ${formatCurrency(saidas)}`;
  if (elR) elR.textContent = `R$ ${formatCurrency(Math.abs(resultado))}`;

  if (elRc) {
    elRc.className = 'stat-card stat-card--accent ' + (resultado >= 0 ? 'stat-card--positive' : 'stat-card--negative');
  }
  if (elRl) elRl.textContent = resultado >= 0 ? 'Lucro no período' : 'Prejuízo no período';

  if (barE && barS && total > 0) {
    barE.style.width = Math.round((entradas / total) * 100) + '%';
    barS.style.width = Math.round((saidas   / total) * 100) + '%';
  } else if (barE && barS) {
    barE.style.width = '50%'; barS.style.width = '50%';
  }
}

// ────────────────────────────────────────────────────────────
// ⑯ HELPERS
// ────────────────────────────────────────────────────────────
function showLoadingState(show) {
  document.getElementById('loading-state').classList.toggle('hidden', !show);
  document.getElementById('orders-list').classList.toggle('hidden', show);
  if (show) document.getElementById('empty-state').classList.add('hidden');
}

function showAuthMessage(msg, type) {
  const el = document.getElementById('auth-message');
  if (!el) return;
  el.textContent = msg; el.className = `auth-message ${type}`;
}

function showModalMessage(msg, type) {
  const el = document.getElementById('modal-message');
  if (!el) return;
  el.textContent = msg; el.className = `auth-message ${type}`;
}

function hideModalMessage() {
  const el = document.getElementById('modal-message');
  if (el) el.className = 'auth-message hidden';
}

function setButtonLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  btn.querySelector('.btn-text')?.classList.toggle('hidden', loading);
  btn.querySelector('.btn-loader')?.classList.toggle('hidden', !loading);
}

// ────────────────────────────────────────────────────────────
// ⑰ UTILITÁRIOS
// ────────────────────────────────────────────────────────────
function formatCurrency(v) { return Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function formatDate(d)     { if (!d) return ''; const [y,m,dd] = d.split('-'); return `${dd}/${m}/${y}`; }
function todayDate()       { return new Date().toISOString().split('T')[0]; }
function escapeHtml(str)   { const d = document.createElement('div'); d.appendChild(document.createTextNode(str||'')); return d.innerHTML; }
function translateError(msg) {
  if (msg.includes('Invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (msg.includes('Email not confirmed'))        return 'Confirme seu e-mail antes de entrar.';
  return 'Ocorreu um erro. Tente novamente.';
}
