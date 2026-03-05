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
const ADMIN_EMAIL       = 'jrs.edson@gmail.com';
const NAYARA_EMAIL      = 'nayaraa_garciaa@hotmail.com'; // [MELHORIA PERMISSÕES NAYARA]

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ────────────────────────────────────────────────────────────
// ② STATUS
// ────────────────────────────────────────────────────────────
// [MELHORIA FLUXO STATUS] — 5 etapas de produção/entrega
// Pagamento é campo booleano SEPARADO (pago: true/false)
const STATUS = {
  RECEBIDO:   'recebido',
  CRIANDO:    'criando',
  PRODUZINDO: 'produzindo',
  PRONTO:     'pronto',
  ENTREGUE:   'entregue',
  // aliases legados para compatibilidade
  PENDENTE:       'pendente',
  EM_ARTE:        'em_arte',
  EM_PRODUCAO:    'em_producao',
  ENTREGUE_NPAGO: 'entregue_nao_pago',
  ENTREGUE_PAGO:  'entregue_pago',
};

const STATUS_LABEL = {
  recebido:          'Ped. Recebido',
  criando:           'Criando',
  produzindo:        'Produzindo',
  pronto:            'Pronto P/ Entrega',
  entregue:          'Entregue',
  pendente:          'Ped. Recebido',
  em_arte:           'Criando',
  em_producao:       'Produzindo',
  entregue_nao_pago: 'Entregue',
  entregue_pago:     'Entregue',
};

const STATUS_BADGE_CLASS = {
  recebido:          'badge-recebido',
  criando:           'badge-arte',
  produzindo:        'badge-producao',
  pronto:            'badge-pronto',
  entregue:          'badge-entregue',
  pendente:          'badge-recebido',
  em_arte:           'badge-arte',
  em_producao:       'badge-producao',
  entregue_nao_pago: 'badge-entregue',
  entregue_pago:     'badge-entregue',
};

// [MELHORIA FLUXO STATUS] — fluxo de produção com 5 etapas
const STATUS_FLUXO = ['recebido','criando','produzindo','pronto','entregue'];
const STATUS_PENDENTES   = new Set(['recebido','criando','produzindo','pendente','em_arte','em_producao']);
const STATUS_FINALIZADOS = new Set(['pronto','entregue','entregue_nao_pago','entregue_pago']);

function proximoStatus(atual) {
  const legado = { pendente:'recebido', em_arte:'criando', em_producao:'produzindo',
                   entregue_nao_pago:'entregue', entregue_pago:'entregue' };
  const norm = legado[atual] ?? atual;
  const idx = STATUS_FLUXO.indexOf(norm);
  if (idx < 0 || idx >= STATUS_FLUXO.length - 1) return null;
  return STATUS_FLUXO[idx + 1];
}

// [MELHORIA BOTÕES FLUXO] — rótulos compactos
function labelBtnAvancar(statusAtual) {
  const prox = proximoStatus(statusAtual);
  const map = { criando:'→ Criação', produzindo:'→ Produção', pronto:'→ Pronto', entregue:'→ Entregar' };
  return prox ? (map[prox] ?? null) : null;
}

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

  // Badge de perfil
  const badge = document.getElementById('user-badge');
  badge.textContent = isAdmin ? `${currentUser.email.split('@')[0]}` : `${currentUser.email.split('@')[0]}`;
  badge.className   = 'user-badge ' + (isAdmin ? 'badge-admin' : 'badge-op');

  // [MELHORIA PERMISSÕES NAYARA] — botão de produtos para ambos os usuários
  if (canManageProducts) document.getElementById('btn-products-nav').style.display = 'flex';

  // Período padrão = mês atual
  const hoje = new Date();
  periodoInicio = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}-01`;
  periodoFim    = todayDate();
  document.getElementById('periodo-inicio').value = periodoInicio;
  document.getElementById('periodo-fim').value    = periodoFim;

  await loadProducts();
  await loadOrders();
  await loadExpenses(); // [MELHORIA DESPESAS]
  setupNavTabs();       // [MELHORIA DESPESAS]
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
  const ini = document.getElementById('periodo-inicio').value;
  const fim = document.getElementById('periodo-fim').value;
  if (!ini || !fim) return;
  if (ini > fim) {
    // Corrige automaticamente invertendo
    document.getElementById('periodo-inicio').value = fim;
    document.getElementById('periodo-fim').value    = ini;
    periodoInicio = fim;
    periodoFim    = ini;
  } else {
    periodoInicio = ini;
    periodoFim    = fim;
  }
  renderOrders();
  updateSummaryCards();
}
// ── Atalhos rápidos de período (NOVO) ────────────────────────
function setPeriodShortcut(tipo, btn) {
  const hoje = new Date();
  const y = hoje.getFullYear();
  const m = hoje.getMonth();
  let ini, fim = todayDate();

  if (tipo === 'hoje') {
    ini = fim;
  } else if (tipo === 'mes-anterior') {
    ini = new Date(y, m - 1, 1).toISOString().split('T')[0];
    fim = new Date(y, m, 0).toISOString().split('T')[0];
  } else if (tipo === 'ano') {
    ini = `${y}-01-01`;
  } else if (tipo === 'todos') {
    ini = '2020-01-01';
    fim = `${y + 1}-12-31`;
  }

  if (!ini) return;

  document.getElementById('periodo-inicio').value = ini;
  document.getElementById('periodo-fim').value    = fim;
  periodoInicio = ini;
  periodoFim    = fim;

  document.querySelectorAll('.period-shortcut').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  renderOrders();
  updateSummaryCards();
}

function inPeriod(order) {
  const d = order.data_pedido || order.created_at?.split('T')[0] || '';
  if (!d) return false;
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
      <div class="product-info">
        <span class="product-name">${escapeHtml(p.nome)}</span>
        ${p.descricao ? `<span class="product-desc">${escapeHtml(p.descricao)}</span>` : ''}
      </div>
      <span class="product-price">R$ ${formatCurrency(p.preco)}</span>
      <div class="product-actions">
        <button class="btn-icon-sm" onclick="editProduct('${p.id}')">✏️</button>
        <button class="btn-icon-sm btn-icon-del" onclick="deleteProduct('${p.id}')">🗑️</button>
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
}

// [MELHORIA FLUXO STATUS] — isLate com novos status
function isLate(order) {
  if (!order.data_entrega) return false;
  const jaEntregue = order.status === 'entregue' || order.status === 'entregue_nao_pago' || order.status === 'entregue_pago';
  if (jaEntregue) return order.data_entrega_real ? order.data_entrega_real > order.data_entrega : false;
  return todayDate() > order.data_entrega;
}

function renderOrders() {
  const list       = document.getElementById('orders-list');
  const emptyState = document.getElementById('empty-state');
  const search     = (document.getElementById('search-input')?.value || '').toLowerCase().trim();

  let filtered = [...allOrders];

  // [MELHORIA FILTROS PEDIDOS] — 4 filtros: todos / pendentes / finalizados / atrasados
  if (currentFilter === 'atrasado') {
    filtered = filtered.filter(isLate);
  } else if (currentFilter === 'pendentes') {
    filtered = filtered.filter(p => STATUS_PENDENTES.has(p.status));
  } else if (currentFilter === 'finalizados') {
    filtered = filtered.filter(p => STATUS_FINALIZADOS.has(p.status));
  }
  // 'todos' — sem filtro

  // Filtro de período
  filtered = filtered.filter(inPeriod);

  // Busca por cliente
  if (search) filtered = filtered.filter(p => p.cliente.toLowerCase().includes(search));

  if (!filtered.length) {
    list.innerHTML = ''; list.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  list.classList.remove('hidden');

  list.innerHTML = filtered.map(order => {
    const late = isLate(order);

    const itensHtml = order.itens_pedido?.length
      ? `<div class="order-items-preview">${order.itens_pedido.map(i =>
          `<span class="item-chip">${i.quantidade}x ${escapeHtml(i.nome || i.produtos?.nome || '?')}</span>`
        ).join('')}</div>` : '';

    // [MELHORIA FLUXO STATUS] — botão de avanço de produção
    let btnFluxo = '';
    const labelAvancar = labelBtnAvancar(order.status);
    const ePendente  = STATUS_PENDENTES.has(order.status);
    const ePronte    = order.status === 'pronto';
    const jaEntregue = order.status === 'entregue' || order.status === 'entregue_nao_pago' || order.status === 'entregue_pago';

    if (ePendente && labelAvancar) {
      btnFluxo = `<button class="btn-status-toggle btn-avancar" onclick="avancarStatus('${order.id}','${order.status}')">${labelAvancar}</button>`;
    } else if (ePronte) {
      btnFluxo = `<button class="btn-status-toggle btn-entregue" onclick="openEntregueModal('${order.id}')">→ Entregar</button>`;
    } else if (jaEntregue) {
      btnFluxo = `<button class="btn-status-toggle btn-reverter" onclick="setStatusRecebido('${order.id}')">Reabrir</button>`;
    }

    // [CORREÇÃO COMPROVANTE] — botão pagamento: abre modal de comprovante ao marcar como pago
    const jaPago = order.pago === true;
    const btnPagamento = `<button
      class="btn-pagamento ${jaPago ? 'btn-pago-sim' : 'btn-pago-nao'}"
      onclick="abrirModalPagamento('${order.id}', ${jaPago})"
      title="${jaPago ? 'Clique para desmarcar pagamento' : 'Clique para registrar pagamento'}"
    >${jaPago ? '✓ Pago' : 'Conf. Pgto.'}</button>`;

    return `
    <article class="order-card status-${order.status.replace(/_/g,'-')} ${late ? 'status-late' : ''}">
      <div class="order-card-top">
        <div class="order-client">${escapeHtml(order.cliente)}</div>
        <div class="order-badges">
          <span class="status-badge ${STATUS_BADGE_CLASS[order.status] || 'badge-pending'}">${STATUS_LABEL[order.status] || order.status}</span>
          ${order.pago
            ? '<span class="badge-pgto badge-pgto-pago">Pago ✓</span>'
            : '<span class="badge-pgto badge-pgto-aberto">A Receber</span>'}
        </div>
      </div>
      ${itensHtml}
      ${order.descricao ? `<div class="order-desc">${escapeHtml(order.descricao)}</div>` : ''}
      <div class="order-card-meta">
        <span class="order-value valor-monetario">R$ ${formatCurrency(order.valor)}</span>
        <div class="order-dates-block">
          ${order.data_pedido       ? `<span class="date-tag">📅 ${formatDate(order.data_pedido)}</span>` : ''}
          ${order.data_entrega      ? `<span class="date-tag ${late?'date-late':''}">🚚 ${formatDate(order.data_entrega)}</span>` : ''}
          ${order.data_entrega_real ? `<span class="date-tag date-real">🏁 ${formatDate(order.data_entrega_real)}</span>` : ''}
        </div>
      </div>
      ${buildPrazoLabel(order)}
      <div class="order-card-actions">
        ${btnFluxo}
        ${btnPagamento}
        ${order.comprovante_url
          ? `<button class="btn-receipt" onclick="viewReceipt('${escapeHtml(order.comprovante_url)}')" title="Ver comprovante de pagamento">📄</button>`
          : ''}
        <a class="btn-whatsapp" href="${gerarLinkWhatsApp(order)}" target="_blank" rel="noopener">PIX</a>
        <button class="btn-edit" onclick="openEditOrderModal('${order.id}')">✏️</button>
        <button class="btn-delete" onclick="openDeleteModal('${order.id}')">🗑️</button>
      </div>
    </article>`;
  }).join('');
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

// [MELHORIA FLUXO STATUS] — prazo com novos status
function buildPrazoLabel(order) {
  if (!order.data_entrega) return '';
  const jaEntregue = order.status === 'entregue' || order.status === 'entregue_nao_pago' || order.status === 'entregue_pago';
  if (jaEntregue && order.data_entrega_real) {
    const ok = order.data_entrega_real <= order.data_entrega;
    return `<div class="prazo-tag ${ok?'prazo-ok':'prazo-atraso'}">${ok ? 'Entregue no prazo' : 'Entregue com atraso'}</div>`;
  }
  if (!jaEntregue && todayDate() > order.data_entrega) {
    return `<div class="prazo-tag prazo-atraso">Prazo vencido</div>`;
  }
  return '';
}

function updateSummaryCards() {
  // [FIX SOMA] — usa campo pago (boolean) separado do fluxo de produção
  const doMes  = allOrders.filter(inCurrentMonth);
  const pagMes = doMes.filter(o => o.pago === true);
  const aguMes = doMes.filter(o => !o.pago);
  const atras  = allOrders.filter(isLate);

  const mesFatVal = pagMes.reduce((a,o)=>a+Number(o.valor),0);
  const mesAguVal = aguMes.reduce((a,o)=>a+Number(o.valor),0);

  document.getElementById('mes-faturado').textContent   = `R$ ${formatCurrency(mesFatVal)}`;
  document.getElementById('mes-aguardando').textContent = `R$ ${formatCurrency(mesAguVal)}`;
  document.getElementById('count-late').textContent     = atras.length;
  document.getElementById('mes-label').textContent      = labelMesAtual();
  const elMesTot = document.getElementById('mes-total');
  if (elMesTot) elMesTot.textContent = `R$ ${formatCurrency(mesFatVal + mesAguVal)}`;

  // Período filtrado
  const doPer   = allOrders.filter(inPeriod);
  // [FIX SOMA] — pago=true / a receber=entregue sem pago / pendente=em produção
  const pagPer  = doPer.filter(o => o.pago === true);
  const aguPer  = doPer.filter(o => !o.pago && STATUS_FINALIZADOS.has(o.status));
  const pendPer = doPer.filter(o => STATUS_PENDENTES.has(o.status));

  const perFatVal  = pagPer.reduce((a,o)=>a+Number(o.valor),0);
  const perAguVal  = aguPer.reduce((a,o)=>a+Number(o.valor),0);
  const perPendVal = pendPer.reduce((a,o)=>a+Number(o.valor),0);

  document.getElementById('per-faturado').textContent   = `R$ ${formatCurrency(perFatVal)}`;
  document.getElementById('per-aguardando').textContent = `R$ ${formatCurrency(perAguVal)}`;
  document.getElementById('per-pendente').textContent   = `R$ ${formatCurrency(perPendVal)}`;
  document.getElementById('per-count-pago').textContent  = `${pagPer.length} pedido${pagPer.length!==1?'s':''}`;
  document.getElementById('per-count-aguar').textContent = `${aguPer.length} pedido${aguPer.length!==1?'s':''}`;
  document.getElementById('per-count-pend').textContent  = `${pendPer.length} pedido${pendPer.length!==1?'s':''}`;
  const elPerTot = document.getElementById('per-total');
  if (elPerTot) elPerTot.textContent = `R$ ${formatCurrency(perFatVal + perAguVal + perPendVal)}`;
}

function labelMesAtual() {
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const h = new Date();
  return `${meses[h.getMonth()]}/${h.getFullYear()}`;
}

// [MELHORIA FLUXO STATUS] — abre modal para registrar data de entrega real
function openEntregueModal(id) {
  openEditOrderModal(id, false, STATUS.ENTREGUE);
}

// [MELHORIA FLUXO STATUS] — avança etapa de produção sem modal
async function avancarStatus(id, statusAtual) {
  const prox = proximoStatus(statusAtual);
  if (!prox || prox === 'entregue') return; // 'entregue' sempre via openEntregueModal
  const { error } = await db.from('pedidos').update({ status: prox }).eq('id', id);
  if (error) {
    if (error.message?.includes('check constraint')) {
      alert('Execute o SQL de migração "migracao_novos_status.sql" no Supabase para liberar os novos status.');
    } else {
      alert('Erro ao atualizar status: ' + error.message);
    }
    return;
  }
  await loadOrders();
}

// [MELHORIA FLUXO STATUS] — reabrir pedido para início do fluxo
async function setStatusRecebido(id) {
  if (!confirm('Reabrir pedido para o início do fluxo?')) return;
  await db.from('pedidos').update({ status: 'recebido', data_entrega_real: null }).eq('id', id);
  await loadOrders();
}
async function setStatusPendente(id) { return setStatusRecebido(id); }

// [CORREÇÃO COMPROVANTE] — abre modal de pagamento com upload de comprovante
let pagamentoTargetId  = null;
let pagamentoFile      = null;

function abrirModalPagamento(id, jaEstaPago) {
  pagamentoTargetId = id;
  pagamentoFile     = null;

  if (jaEstaPago) {
    // Já está pago: confirmar desmarcação
    if (confirm('Desmarcar pagamento deste pedido?')) {
      salvarPagamento(id, false, null, true);
    }
    return;
  }

  // Não está pago: abre modal para confirmar + upload comprovante
  const order = allOrders.find(o => o.id === id);
  document.getElementById('pgto-modal-cliente').textContent = order?.cliente || '';
  document.getElementById('pgto-modal-valor').textContent   = `R$ ${formatCurrency(order?.valor || 0)}`;

  // Reseta UI do upload
  document.getElementById('pgto-upload-area').style.display  = 'flex';
  document.getElementById('pgto-comprovante-preview').classList.add('hidden');
  document.getElementById('pgto-comprovante-preview').innerHTML = '';
  document.getElementById('pgto-field-comprovante').value    = '';

  // Se já tem comprovante salvo, mostrar link
  const linkExistente = document.getElementById('pgto-comprovante-existing');
  if (order?.comprovante_url) {
    linkExistente.href = order.comprovante_url;
    linkExistente.classList.remove('hidden');
  } else {
    linkExistente.classList.add('hidden');
  }

  document.getElementById('pgto-modal').classList.remove('hidden');
}

function closePgtoModal() {
  document.getElementById('pgto-modal').classList.add('hidden');
  pagamentoTargetId = null;
  pagamentoFile     = null;
}

function closePgtoModalOnOverlay(e) {
  if (e.target === document.getElementById('pgto-modal')) closePgtoModal();
}

function onPgtoComprovanteSelected(event) {
  const file = event.target.files[0];
  if (!file) return;
  pagamentoFile = file;
  const preview = document.getElementById('pgto-comprovante-preview');
  preview.classList.remove('hidden');
  document.getElementById('pgto-upload-area').style.display = 'none';
  if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = e => { preview.innerHTML = `<img src="${e.target.result}" class="comprovante-img-preview" />`; };
    reader.readAsDataURL(file);
  } else {
    preview.innerHTML = `<div class="file-preview-tag">📄 ${escapeHtml(file.name)}</div>`;
  }
}

async function confirmarPagamento() {
  if (!pagamentoTargetId) return;
  const btnConfirmar = document.getElementById('btn-confirmar-pgto');
  btnConfirmar.disabled = true;
  btnConfirmar.textContent = '⟳ Salvando...';

  let comprovanteUrl = null;

  // Upload do comprovante se selecionado
  if (pagamentoFile) {
    comprovanteUrl = await uploadComprovante(pagamentoFile, pagamentoTargetId);
    if (!comprovanteUrl) {
      alert('Erro ao enviar comprovante. Tente novamente.');
      btnConfirmar.disabled = false;
      btnConfirmar.textContent = 'Confirmar Pagamento';
      return;
    }
  } else {
    // Mantém comprovante existente
    comprovanteUrl = allOrders.find(o => o.id === pagamentoTargetId)?.comprovante_url || null;
  }

  await salvarPagamento(pagamentoTargetId, true, comprovanteUrl, false);
  btnConfirmar.disabled = false;
  btnConfirmar.textContent = 'Confirmar Pagamento';
  closePgtoModal();
}

async function salvarPagamento(id, pago, comprovanteUrl, semComprovante) {
  const update = { pago };
  if (!semComprovante) update.comprovante_url = comprovanteUrl;
  const { error } = await db.from('pedidos').update(update).eq('id', id);
  if (error) { alert('Erro ao salvar pagamento: ' + error.message); return; }
  await loadOrders();
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

  // [MELHORIA FLUXO STATUS] — status é produção; pago é campo separado
  const orderId    = document.getElementById('order-id').value;
  const status     = document.getElementById('field-status').value;
  const isEntregue = status === STATUS.ENTREGUE || status === 'entregue_nao_pago' || status === 'entregue_pago';

  // --- Validações ---
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

  const payload = {
    cliente:           document.getElementById('field-cliente').value.trim(),
    descricao:         document.getElementById('field-descricao').value.trim(),
    valor:             getOrderTotal(),
    status,
    data_pedido:       document.getElementById('field-data-pedido').value || null,
    data_entrega:      document.getElementById('field-data-entrega').value || null,
    data_entrega_real: isEntregue ? (document.getElementById('field-data-entrega-real').value || null) : null,
    // pago: false só em novos pedidos; gerenciado pelo modal de pagamento
    ...(orderId ? {} : { user_id: currentUser.id, pago: false }),
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
  document.getElementById('field-status').value      = 'recebido'; // [MELHORIA FLUXO STATUS]
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

  // [MELHORIA FLUXO STATUS] — força status se veio de openEntregueModal
  if (forceStatus) {
    document.getElementById('field-status').value = forceStatus;
  } else {
    document.getElementById('field-status').value = order.status;
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

// [MELHORIA FLUXO STATUS] — seção de entrega: só data real (comprovante via modal de pagamento)
function updateConclusaoSection() {
  const status     = document.getElementById('field-status').value;
  const isEntregue = status === STATUS.ENTREGUE || status === 'entregue_nao_pago' || status === 'entregue_pago';
  document.getElementById('conclusao-section').classList.toggle('hidden', !isEntregue);
  // Campo comprovante oculto no modal de edição — gerenciado pelo modal de pagamento
  if (isEntregue) {
    document.getElementById('comprovante-field').classList.add('hidden');
  }
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
  const coral = [232,99,74], tinta = [44,35,24], suave = [107,94,82];

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
function setFilter(filter, btn) {
  currentFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderOrders();
  updateSummaryCards();
}

// ════════════════════════════════════════════════════════════
// [MELHORIA DESPESAS] — NAVEGAÇÃO POR ABAS
// ════════════════════════════════════════════════════════════
function setupNavTabs() {
  showPage('pedidos');
}

function showPage(page) {
  currentPage = page;
  const pages = ['pedidos','despesas','financeiro'];
  pages.forEach(p => {
    const el = document.getElementById('section-' + p);
    if (el) el.classList.toggle('hidden', p !== page);
  });
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.page === page));
  // FAB: pedidos = + pedido, despesas = + despesa
  const fabPedido  = document.querySelector('.fab-new:not(.fab-despesa)');
  const fabDespesa = document.querySelector('.fab-despesa');
  if (fabPedido)  fabPedido.style.display  = page === 'pedidos'   ? 'flex' : 'none';
  if (fabDespesa) fabDespesa.style.display = page === 'despesas'  ? 'flex' : 'none';
  if (page === 'financeiro') updateFinanceiro();
  if (page === 'despesas')   renderExpenses();
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
  const hoje = new Date(), y = hoje.getFullYear(), m = hoje.getMonth();
  let ini, fim = todayDate();
  if      (tipo === 'hoje')         { ini = fim; }
  else if (tipo === 'mes-atual')    { ini = `${y}-${String(m+1).padStart(2,'0')}-01`; }
  else if (tipo === 'mes-anterior') { ini = new Date(y,m-1,1).toISOString().split('T')[0]; fim = new Date(y,m,0).toISOString().split('T')[0]; }
  else                              { ini = '2020-01-01'; fim = `${y+1}-12-31`; }
  document.getElementById('desp-ini').value = ini;
  document.getElementById('desp-fim').value = fim;
  despesaFiltroIni = ini; despesaFiltroFim = fim;
  document.querySelectorAll('.desp-shortcut').forEach(b => b.classList.toggle('active', b === btn));
  renderExpenses();
}

function applyDespesaPeriod() {
  const ini = document.getElementById('desp-ini').value;
  const fim = document.getElementById('desp-fim').value;
  if (!ini || !fim) return;
  despesaFiltroIni = ini <= fim ? ini : fim;
  despesaFiltroFim = ini <= fim ? fim : ini;
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
      <div class="expense-body">
        <span class="expense-desc">${escapeHtml(d.descricao)}</span>
        <span class="expense-date">📅 ${formatDate(d.data)}</span>
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
  const hoje = new Date(), y = hoje.getFullYear(), m = hoje.getMonth();
  let ini, fim = todayDate();
  if      (tipo === 'hoje')         { ini = fim; }
  else if (tipo === 'mes-atual')    { ini = `${y}-${String(m+1).padStart(2,'0')}-01`; }
  else if (tipo === 'mes-anterior') { ini = new Date(y,m-1,1).toISOString().split('T')[0]; fim = new Date(y,m,0).toISOString().split('T')[0]; }
  else if (tipo === 'ano')          { ini = `${y}-01-01`; }
  else                              { ini = '2020-01-01'; fim = `${y+1}-12-31`; }
  document.getElementById('fin-ini').value = ini;
  document.getElementById('fin-fim').value = fim;
  finIni = ini; finFim = fim;
  document.querySelectorAll('.fin-shortcut').forEach(b => b.classList.toggle('active', b === btn));
  updateFinanceiro();
}

function applyFinPeriod() {
  const ini = document.getElementById('fin-ini').value;
  const fim = document.getElementById('fin-fim').value;
  if (!ini || !fim) return;
  finIni = ini <= fim ? ini : fim;
  finFim = ini <= fim ? fim : ini;
  document.querySelectorAll('.fin-shortcut').forEach(b => b.classList.remove('active'));
  updateFinanceiro();
}

function updateFinanceiro() {
  // usa período da aba financeiro, senão cai pro período geral
  const ini = finIni || periodoInicio;
  const fim = finFim || periodoFim;
  if (!ini || !fim) return;

  const entradas = allOrders
    .filter(o => { const d = o.data_pedido || (o.created_at||'').split('T')[0]; return d >= ini && d <= fim; })
    .filter(o => o.pago === true)  // [FIX SOMA] campo pago boolean
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

  if (elRc) elRc.className = 'fin-card ' + (resultado >= 0 ? 'fin-lucro' : 'fin-prejuizo');
  if (elRl) elRl.textContent = resultado >= 0 ? '📈 Lucro no período' : '📉 Prejuízo no período';

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
