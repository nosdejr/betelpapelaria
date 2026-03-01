// ============================================================
//  script.js — Papelaria BETEL v2
//  Funcionalidades: Auth, Pedidos com Itens, Produtos,
//  Upload de Comprovante, Perfis Admin/Usuário, PDF Orçamento
// ============================================================

// ────────────────────────────────────────────────────────────
// ① CONFIGURAÇÃO — substitua com suas credenciais do Supabase
//    Supabase Dashboard → Settings → API
// ────────────────────────────────────────────────────────────
const SUPABASE_URL      = 'https://ltnokzhupzqpuvirgzut.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0bm9remh1cHpxcHV2aXJnenV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzNTU5MTQsImV4cCI6MjA4NzkzMTkxNH0.kEkdULzmxIfNX5hKlUoHpPs9Gnfgfxfj8qjfzGvvAoE';

// E-mail do administrador (pode concluir sem comprovante)
const ADMIN_EMAIL = 'jrs.edson@gmail.com';

// Inicializa cliente com nome diferente do global 'supabase'
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ────────────────────────────────────────────────────────────
// ② ESTADO GLOBAL
// ────────────────────────────────────────────────────────────
let currentUser    = null;   // usuário logado
let isAdmin        = false;  // flag de admin
let allOrders      = [];     // cache de pedidos
let allProducts    = [];     // cache de produtos
let currentFilter  = 'todos';
let deleteTargetId = null;
let orderItems     = [];     // itens do pedido em edição
let comprovanteFile = null;  // arquivo de comprovante selecionado

// ────────────────────────────────────────────────────────────
// ③ INICIALIZAÇÃO
// ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const page = window.location.pathname.includes('dashboard') ? 'dashboard' : 'auth';

  const { data: { session } } = await db.auth.getSession();

  if (page === 'auth') {
    if (session) window.location.href = 'dashboard.html';
    return;
  }

  // Dashboard: exige sessão
  if (!session) { window.location.href = 'index.html'; return; }

  currentUser = session.user;
  isAdmin     = currentUser.email === ADMIN_EMAIL;

  // UI de perfil
  document.getElementById('user-email-display').textContent = currentUser.email;
  const badge = document.getElementById('user-badge');
  badge.textContent  = isAdmin ? '👑 Admin' : 'Owner';
  badge.className    = 'user-badge ' + (isAdmin ? 'badge-admin' : 'badge-op');

  // Botão de produtos só para admin
  if (isAdmin) document.getElementById('btn-products-nav').style.display = 'flex';

  await loadProducts();
  await loadOrders();
});

// ────────────────────────────────────────────────────────────
// ④ AUTENTICAÇÃO
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
// ⑤ PRODUTOS — CRUD
// ────────────────────────────────────────────────────────────
async function loadProducts() {
  const { data, error } = await db.from('produtos').select('*').order('nome');
  if (error) { console.error('Erro produtos:', error); return; }
  allProducts = data || [];
  populateProductSelect();
  renderProductsList();
}

// Popula o <select> de produtos no form de pedido
function populateProductSelect() {
  const sel = document.getElementById('item-product-select');
  if (!sel) return;
  sel.innerHTML = '<option value="">Selecione um produto…</option>';
  allProducts.forEach(p => {
    const opt = document.createElement('option');
    opt.value       = p.id;
    opt.textContent = `${p.nome} — R$ ${formatCurrency(p.preco)}`;
    opt.dataset.preco = p.preco;
    opt.dataset.nome  = p.nome;
    sel.appendChild(opt);
  });
}

// Renderiza lista de produtos no modal de gestão
function renderProductsList() {
  const el = document.getElementById('products-list');
  if (!el) return;
  if (allProducts.length === 0) {
    el.innerHTML = '<p class="empty-inline">Nenhum produto cadastrado ainda.</p>';
    return;
  }
  el.innerHTML = allProducts.map(p => `
    <div class="product-item">
      <div class="product-info">
        <span class="product-name">${escapeHtml(p.nome)}</span>
        ${p.descricao ? `<span class="product-desc">${escapeHtml(p.descricao)}</span>` : ''}
      </div>
      <span class="product-price">R$ ${formatCurrency(p.preco)}</span>
      <div class="product-actions">
        <button class="btn-icon-sm" onclick="editProduct('${p.id}')" title="Editar">✏️</button>
        <button class="btn-icon-sm btn-icon-del" onclick="deleteProduct('${p.id}')" title="Excluir">🗑️</button>
      </div>
    </div>
  `).join('');
}

async function handleSaveProduct(event) {
  event.preventDefault();
  setButtonLoading('btn-save-product', true);

  const id      = document.getElementById('product-id').value;
  const payload = {
    nome:      document.getElementById('prod-nome').value.trim(),
    preco:     parseFloat(document.getElementById('prod-preco').value) || 0,
    descricao: document.getElementById('prod-descricao').value.trim(),
  };

  let error;
  if (id) {
    ({ error } = await db.from('produtos').update(payload).eq('id', id));
  } else {
    ({ error } = await db.from('produtos').insert(payload));
  }

  setButtonLoading('btn-save-product', false);
  if (error) { alert('Erro ao salvar produto.'); return; }

  clearProductForm();
  await loadProducts();
}

function editProduct(id) {
  const p = allProducts.find(x => x.id === id);
  if (!p) return;
  document.getElementById('product-id').value       = p.id;
  document.getElementById('prod-nome').value        = p.nome;
  document.getElementById('prod-preco').value       = p.preco;
  document.getElementById('prod-descricao').value   = p.descricao || '';
}

async function deleteProduct(id) {
  if (!confirm('Excluir este produto?')) return;
  await db.from('produtos').delete().eq('id', id);
  await loadProducts();
}

function clearProductForm() {
  document.getElementById('product-id').value     = '';
  document.getElementById('product-form').reset();
}

// Modais de produtos
function openProductsModal()          { loadProducts(); document.getElementById('products-modal').classList.remove('hidden'); }
function closeProductsModal()         { document.getElementById('products-modal').classList.add('hidden'); }
function closeProductsModalOverlay(e) { if (e.target === document.getElementById('products-modal')) closeProductsModal(); }

// ────────────────────────────────────────────────────────────
// ⑥ ITENS DO PEDIDO
// ────────────────────────────────────────────────────────────
function addItemFromSelect() {
  const sel = document.getElementById('item-product-select');
  const qty = parseInt(document.getElementById('item-qty').value) || 1;
  if (!sel.value) { alert('Selecione um produto.'); return; }

  const opt = sel.options[sel.selectedIndex];
  addItem({
    product_id: sel.value,
    nome:       opt.dataset.nome,
    preco:      parseFloat(opt.dataset.preco),
    quantidade: qty,
  });

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
  // Se produto já existe, soma quantidade
  const existing = item.product_id
    ? orderItems.find(i => i.product_id === item.product_id)
    : null;
  if (existing) {
    existing.quantidade += item.quantidade;
  } else {
    orderItems.push({ ...item, _tempId: Date.now() + Math.random() });
  }
  renderItemsList();
}

function removeItem(tempId) {
  orderItems = orderItems.filter(i => i._tempId !== tempId);
  renderItemsList();
}

function renderItemsList() {
  const el = document.getElementById('items-list');
  if (orderItems.length === 0) {
    el.innerHTML = '<p class="empty-inline">Nenhum item adicionado.</p>';
    updateOrderTotal();
    return;
  }
  el.innerHTML = orderItems.map(item => `
    <div class="item-row">
      <div class="item-info">
        <span class="item-name">${escapeHtml(item.nome)}</span>
        <span class="item-meta">${item.quantidade}x R$ ${formatCurrency(item.preco)}</span>
      </div>
      <span class="item-subtotal">R$ ${formatCurrency(item.preco * item.quantidade)}</span>
      <button type="button" class="btn-remove-item" onclick="removeItem(${item._tempId})">✕</button>
    </div>
  `).join('');
  updateOrderTotal();
}

function updateOrderTotal() {
  const total = orderItems.reduce((acc, i) => acc + i.preco * i.quantidade, 0);
  const el = document.getElementById('order-total-display');
  if (el) el.textContent = `R$ ${formatCurrency(total)}`;
}

function getOrderTotal() {
  return orderItems.reduce((acc, i) => acc + i.preco * i.quantidade, 0);
}

// ────────────────────────────────────────────────────────────
// ⑦ PEDIDOS — CRUD
// ────────────────────────────────────────────────────────────
async function loadOrders() {
  showLoadingState(true);

  const { data, error } = await db
    .from('pedidos')
    .select(`*, itens_pedido(*, produtos(nome, preco))`)
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });

  showLoadingState(false);
  if (error) { console.error('Erro pedidos:', error); return; }

  allOrders = data || [];
  renderOrders();
  updateSummaryCards();
}

// Verifica se um pedido está atrasado
function isLate(order) {
  if (!order.data_entrega) return false;
  if (order.status === 'concluído') {
    // Atrasado se entregou depois do previsto
    if (!order.data_entrega_real) return false;
    return order.data_entrega_real > order.data_entrega;
  }
  // Pendente e passou da data prevista
  return todayDate() > order.data_entrega;
}

function renderOrders() {
  const list       = document.getElementById('orders-list');
  const emptyState = document.getElementById('empty-state');
  const search     = (document.getElementById('search-input')?.value || '').toLowerCase();

  let filtered = allOrders;

  // Filtro de status
  if (currentFilter === 'atrasado') {
    filtered = filtered.filter(isLate);
  } else if (currentFilter !== 'todos') {
    filtered = filtered.filter(p => p.status === currentFilter);
  }

  // Busca por cliente
  if (search) {
    filtered = filtered.filter(p => p.cliente.toLowerCase().includes(search));
  }

  if (filtered.length === 0) {
    list.innerHTML = '';
    list.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  list.classList.remove('hidden');

  list.innerHTML = filtered.map(order => {
    const late       = isLate(order);
    const isConcluido = order.status === 'concluído';
    const prazoLabel  = buildPrazoLabel(order);

    // Resumo de itens
    const itensHtml = order.itens_pedido && order.itens_pedido.length > 0
      ? `<div class="order-items-preview">${order.itens_pedido.map(i =>
          `<span class="item-chip">${i.quantidade}x ${escapeHtml(i.nome || (i.produtos && i.produtos.nome) || '?')}</span>`
        ).join('')}</div>`
      : '';

    return `
    <article class="order-card ${isConcluido ? 'status-concluido' : 'status-pendente'} ${late ? 'status-late' : ''}" data-id="${order.id}">
      <div class="order-card-top">
        <div class="order-client">${escapeHtml(order.cliente)}</div>
        <span class="status-badge ${isConcluido ? 'badge-done' : 'badge-pending'}">
          ${isConcluido ? '✅ Concluído' : '⏳ Pendente'}
        </span>
      </div>

      ${itensHtml}
      ${order.descricao ? `<div class="order-desc">${escapeHtml(order.descricao)}</div>` : ''}

      <div class="order-card-meta">
        <span class="order-value">R$ ${formatCurrency(order.valor)}</span>
        <div class="order-dates-block">
          ${order.data_pedido ? `<span class="date-tag">📅 ${formatDate(order.data_pedido)}</span>` : ''}
          ${order.data_entrega ? `<span class="date-tag ${late ? 'date-late' : ''}">🚚 ${formatDate(order.data_entrega)}</span>` : ''}
          ${order.data_entrega_real ? `<span class="date-tag date-real">🏁 ${formatDate(order.data_entrega_real)}</span>` : ''}
        </div>
      </div>

      ${prazoLabel}

      <div class="order-card-actions">
        <button class="btn-status-toggle" onclick="toggleStatus('${order.id}', '${order.status}')">
          ${isConcluido ? '↩ Pendente' : '✓ Concluir'}
        </button>
        <button class="btn-edit" onclick="openEditOrderModal('${order.id}')">✏️</button>
        ${order.comprovante_url
          ? `<button class="btn-receipt" onclick="viewReceipt('${escapeHtml(order.comprovante_url)}')" title="Ver comprovante">🧾</button>`
          : ''}
        <button class="btn-delete" onclick="openDeleteModal('${order.id}')">🗑️</button>
      </div>
    </article>`;
  }).join('');
}

function buildPrazoLabel(order) {
  if (!order.data_entrega) return '';
  if (order.status === 'concluído' && order.data_entrega_real) {
    const ok = order.data_entrega_real <= order.data_entrega;
    return `<div class="prazo-tag ${ok ? 'prazo-ok' : 'prazo-atraso'}">${ok ? '✅ Entregue no prazo' : '⚠️ Entregue com atraso'}</div>`;
  }
  if (order.status === 'pendente' && todayDate() > order.data_entrega) {
    return `<div class="prazo-tag prazo-atraso">🚨 Prazo vencido</div>`;
  }
  return '';
}

function updateSummaryCards() {
  const pending = allOrders.filter(p => p.status === 'pendente');
  const done    = allOrders.filter(p => p.status === 'concluído');
  const late    = allOrders.filter(isLate);

  document.getElementById('total-pending').textContent = `R$ ${formatCurrency(pending.reduce((a, p) => a + Number(p.valor), 0))}`;
  document.getElementById('total-done').textContent    = `R$ ${formatCurrency(done.reduce((a, p) => a + Number(p.valor), 0))}`;
  document.getElementById('count-pending').textContent = `${pending.length} pedido${pending.length !== 1 ? 's' : ''}`;
  document.getElementById('count-done').textContent    = `${done.length} pedido${done.length !== 1 ? 's' : ''}`;
  document.getElementById('count-late').textContent    = late.length;
}

// Salva pedido (insert ou update)
async function handleSaveOrder(event) {
  event.preventDefault();
  setButtonLoading('btn-save', true);
  hideModalMessage();

  const orderId    = document.getElementById('order-id').value;
  const status     = document.getElementById('field-status').value;
  const isConcluido = status === 'concluído';

  // Validação de itens
  if (orderItems.length === 0) {
    showModalMessage('Adicione ao menos um item ao pedido.', 'error');
    setButtonLoading('btn-save', false);
    return;
  }

  // Validação de conclusão
  if (isConcluido) {
    const dataReal = document.getElementById('field-data-entrega-real').value;
    if (!dataReal) {
      showModalMessage('Informe a data de entrega real.', 'error');
      setButtonLoading('btn-save', false);
      return;
    }
    // Nayara precisa de comprovante obrigatório
    const jaTemComprovante = !document.getElementById('comprovante-existing').classList.contains('hidden');
    if (!isAdmin && !comprovanteFile && !jaTemComprovante) {
      showModalMessage('O comprovante de pagamento é obrigatório para concluir o pedido.', 'error');
      setButtonLoading('btn-save', false);
      return;
    }
  }

  // Upload do comprovante (se selecionado)
  let comprovanteUrl = null;
  if (comprovanteFile) {
    comprovanteUrl = await uploadComprovante(comprovanteFile, orderId || 'new_' + Date.now());
    if (!comprovanteUrl) {
      showModalMessage('Erro ao enviar comprovante. Tente novamente.', 'error');
      setButtonLoading('btn-save', false);
      return;
    }
  }

  // Busca URL existente se estiver editando e não enviou novo
  if (!comprovanteUrl && orderId) {
    const existingOrder = allOrders.find(o => o.id === orderId);
    comprovanteUrl = existingOrder?.comprovante_url || null;
  }

  const total = getOrderTotal();

  const payload = {
    cliente:            document.getElementById('field-cliente').value.trim(),
    descricao:          document.getElementById('field-descricao').value.trim(),
    valor:              total,
    status,
    data_pedido:        document.getElementById('field-data-pedido').value || null,
    data_entrega:       document.getElementById('field-data-entrega').value || null,
    data_entrega_real:  isConcluido ? (document.getElementById('field-data-entrega-real').value || null) : null,
    comprovante_url:    isConcluido ? comprovanteUrl : null,
    user_id:            currentUser.id,
  };

  let savedOrderId = orderId;
  let error;

  if (orderId) {
    ({ error } = await db.from('pedidos').update(payload).eq('id', orderId).eq('user_id', currentUser.id));
  } else {
    const { data: inserted, error: insertError } = await db.from('pedidos').insert(payload).select().single();
    error = insertError;
    if (inserted) savedOrderId = inserted.id;
  }

  if (error) {
    showModalMessage('Erro ao salvar pedido.', 'error');
    setButtonLoading('btn-save', false);
    return;
  }

  // Salva itens: remove os antigos e reinsere
  await db.from('itens_pedido').delete().eq('pedido_id', savedOrderId);
  const itensPayload = orderItems.map(i => ({
    pedido_id:  savedOrderId,
    product_id: i.product_id || null,
    nome:       i.nome,
    preco:      i.preco,
    quantidade: i.quantidade,
    subtotal:   i.preco * i.quantidade,
  }));
  if (itensPayload.length > 0) {
    await db.from('itens_pedido').insert(itensPayload);
  }

  closeOrderModal();
  await loadOrders();
}

// Alterna status (com validações)
async function toggleStatus(id, currentStatus) {
  const newStatus = currentStatus === 'concluído' ? 'pendente' : 'concluído';

  // Se for concluir, abre o modal de edição para preencher dados obrigatórios
  if (newStatus === 'concluído') {
    openEditOrderModal(id, true);
    return;
  }

  // Revertendo para pendente: limpa dados de conclusão
  const { error } = await db.from('pedidos')
    .update({ status: 'pendente', data_entrega_real: null, comprovante_url: null })
    .eq('id', id).eq('user_id', currentUser.id);

  if (!error) await loadOrders();
}

// ────────────────────────────────────────────────────────────
// ⑧ MODAL DE PEDIDO
// ────────────────────────────────────────────────────────────
function openOrderModal() {
  document.getElementById('modal-title').textContent = 'Novo Pedido';
  document.getElementById('order-form').reset();
  document.getElementById('order-id').value = '';
  document.getElementById('field-data-pedido').value = todayDate();
  orderItems     = [];
  comprovanteFile = null;
  renderItemsList();
  hideConclusaoSection();
  hideModalMessage();
  resetComprovanteUI();
  document.getElementById('order-modal').classList.remove('hidden');
}

function openEditOrderModal(id, forceConclusion = false) {
  const order = allOrders.find(p => p.id === id);
  if (!order) return;

  document.getElementById('modal-title').textContent = 'Editar Pedido';
  document.getElementById('order-id').value          = order.id;
  document.getElementById('field-cliente').value     = order.cliente;
  document.getElementById('field-descricao').value   = order.descricao || '';
  document.getElementById('field-status').value      = forceConclusion ? 'concluído' : order.status;
  document.getElementById('field-data-pedido').value = order.data_pedido || '';
  document.getElementById('field-data-entrega').value = order.data_entrega || '';
  document.getElementById('field-data-entrega-real').value = order.data_entrega_real || '';

  // Itens
  orderItems = (order.itens_pedido || []).map(i => ({
    _tempId:    Date.now() + Math.random(),
    product_id: i.product_id,
    nome:       i.nome || (i.produtos && i.produtos.nome) || '',
    preco:      i.preco,
    quantidade: i.quantidade,
  }));
  renderItemsList();

  // Comprovante existente
  comprovanteFile = null;
  resetComprovanteUI();
  if (order.comprovante_url) {
    const existingLink = document.getElementById('comprovante-existing');
    existingLink.href = order.comprovante_url;
    existingLink.classList.remove('hidden');
  }

  // Seção de conclusão
  if (forceConclusion || order.status === 'concluído') {
    showConclusaoSection();
  } else {
    hideConclusaoSection();
  }

  hideModalMessage();
  document.getElementById('order-modal').classList.remove('hidden');
}

function closeOrderModal() {
  document.getElementById('order-modal').classList.add('hidden');
  comprovanteFile = null;
}

function closeModalOnOverlay(event) {
  if (event.target === document.getElementById('order-modal')) closeOrderModal();
}

// Mostra/esconde seção de conclusão conforme status selecionado
function onStatusChange() {
  const status = document.getElementById('field-status').value;
  if (status === 'concluído') showConclusaoSection();
  else hideConclusaoSection();
}

function showConclusaoSection() {
  document.getElementById('conclusao-section').classList.remove('hidden');
  // Ajusta obrigatoriedade do comprovante
  const label = document.getElementById('comprovante-label');
  if (isAdmin) {
    label.textContent = 'Comprovante de pagamento (opcional para admin)';
  } else {
    label.textContent = 'Comprovante de pagamento *';
  }
}

function hideConclusaoSection() {
  document.getElementById('conclusao-section').classList.add('hidden');
}

// ────────────────────────────────────────────────────────────
// ⑨ UPLOAD DE COMPROVANTE
// ────────────────────────────────────────────────────────────
function onComprovanteSelected(event) {
  const file = event.target.files[0];
  if (!file) return;
  comprovanteFile = file;

  const preview = document.getElementById('comprovante-preview');
  preview.classList.remove('hidden');

  if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = e => {
      preview.innerHTML = `<img src="${e.target.result}" class="comprovante-img-preview" alt="Comprovante" />`;
    };
    reader.readAsDataURL(file);
  } else {
    preview.innerHTML = `<div class="file-preview-tag">📄 ${escapeHtml(file.name)}</div>`;
  }

  // Esconde área de upload e mostra preview
  document.getElementById('upload-area').style.display = 'none';
}

function resetComprovanteUI() {
  document.getElementById('field-comprovante').value   = '';
  document.getElementById('comprovante-preview').innerHTML = '';
  document.getElementById('comprovante-preview').classList.add('hidden');
  document.getElementById('comprovante-existing').classList.add('hidden');
  document.getElementById('comprovante-existing').href = '';
  document.getElementById('upload-area').style.display = 'flex';
  comprovanteFile = null;
}

async function uploadComprovante(file, pedidoId) {
  const ext      = file.name.split('.').pop();
  const fileName = `comprovantes/${pedidoId}_${Date.now()}.${ext}`;

  const { data, error } = await db.storage
    .from('comprovantes')
    .upload(fileName, file, { upsert: true });

  if (error) { console.error('Upload error:', error); return null; }

  const { data: urlData } = db.storage.from('comprovantes').getPublicUrl(fileName);
  return urlData.publicUrl;
}

// Visualiza comprovante
function viewReceipt(url) {
  const modal   = document.getElementById('receipt-modal');
  const content = document.getElementById('receipt-content');
  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(url);

  content.innerHTML = isImage
    ? `<img src="${escapeHtml(url)}" class="receipt-full-img" alt="Comprovante" />`
    : `<div class="receipt-pdf-link"><a href="${escapeHtml(url)}" target="_blank" class="btn-primary" style="display:inline-block;text-decoration:none">📄 Abrir PDF</a></div>`;

  modal.classList.remove('hidden');
}

function closeReceiptModal() {
  document.getElementById('receipt-modal').classList.add('hidden');
}

// ────────────────────────────────────────────────────────────
// ⑩ EXCLUSÃO DE PEDIDO
// ────────────────────────────────────────────────────────────
function openDeleteModal(id) {
  deleteTargetId = id;
  document.getElementById('delete-modal').classList.remove('hidden');
}
function closeDeleteModal() {
  deleteTargetId = null;
  document.getElementById('delete-modal').classList.add('hidden');
}
function closeDeleteModalOnOverlay(e) {
  if (e.target === document.getElementById('delete-modal')) closeDeleteModal();
}
async function confirmDelete() {
  if (!deleteTargetId) return;
  await db.from('itens_pedido').delete().eq('pedido_id', deleteTargetId);
  await db.from('pedidos').delete().eq('id', deleteTargetId).eq('user_id', currentUser.id);
  closeDeleteModal();
  await loadOrders();
}

// ────────────────────────────────────────────────────────────
// ⑪ GERAÇÃO DE ORÇAMENTO EM PDF
// ────────────────────────────────────────────────────────────
function gerarOrcamentoPDF() {
  const cliente  = document.getElementById('field-cliente').value.trim() || 'Cliente';
  const obs      = document.getElementById('field-descricao').value.trim();
  const dataHoje = formatDate(todayDate());

  if (orderItems.length === 0) {
    alert('Adicione itens ao pedido antes de gerar o orçamento.');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const corPrincipal = [232, 99, 74];   // coral
  const corTexto     = [44, 35, 24];    // ink
  const corSuave     = [107, 94, 82];   // ink-soft

  // Cabeçalho
  doc.setFillColor(...corPrincipal);
  doc.rect(0, 0, 210, 35, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('Papelaria BETEL', 15, 16);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Orçamento de Pedido', 15, 24);
  doc.text(`Data: ${dataHoje}`, 15, 30);

  // Dados do cliente
  doc.setTextColor(...corTexto);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Cliente', 15, 48);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(cliente, 15, 55);

  // Linha divisória
  doc.setDrawColor(...corPrincipal);
  doc.setLineWidth(0.5);
  doc.line(15, 60, 195, 60);

  // Tabela de itens
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...corTexto);
  doc.text('Item', 15, 68);
  doc.text('Qtd', 120, 68, { align: 'center' });
  doc.text('Unit.', 150, 68, { align: 'right' });
  doc.text('Subtotal', 195, 68, { align: 'right' });

  doc.setLineWidth(0.2);
  doc.setDrawColor(200, 200, 200);
  doc.line(15, 70, 195, 70);

  let y = 77;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...corSuave);

  orderItems.forEach(item => {
    if (y > 260) { doc.addPage(); y = 20; }
    doc.text(item.nome.substring(0, 45), 15, y);
    doc.text(String(item.quantidade), 120, y, { align: 'center' });
    doc.text(`R$ ${formatCurrency(item.preco)}`, 150, y, { align: 'right' });
    doc.text(`R$ ${formatCurrency(item.preco * item.quantidade)}`, 195, y, { align: 'right' });
    y += 8;
    doc.line(15, y - 2, 195, y - 2);
  });

  // Total
  y += 4;
  doc.setFillColor(250, 247, 242);
  doc.rect(120, y - 5, 75, 12, 'F');
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...corPrincipal);
  doc.text('TOTAL', 125, y + 2);
  doc.text(`R$ ${formatCurrency(getOrderTotal())}`, 195, y + 2, { align: 'right' });

  // Observações
  if (obs) {
    y += 20;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...corTexto);
    doc.text('Observações:', 15, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...corSuave);
    const lines = doc.splitTextToSize(obs, 170);
    doc.text(lines, 15, y + 7);
  }

  // Rodapé
  doc.setFontSize(9);
  doc.setTextColor(180, 180, 180);
  doc.text('Orçamento gerado por Papelaria BETEL — sujeito a alterações.', 105, 285, { align: 'center' });

  doc.save(`orcamento_${cliente.replace(/\s+/g, '_')}_${todayDate()}.pdf`);
}

// ────────────────────────────────────────────────────────────
// ⑫ FILTROS E BUSCA
// ────────────────────────────────────────────────────────────
function setFilter(filter, btn) {
  currentFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderOrders();
}

// ────────────────────────────────────────────────────────────
// ⑬ HELPERS DE UI
// ────────────────────────────────────────────────────────────
function showLoadingState(show) {
  document.getElementById('loading-state').classList.toggle('hidden', !show);
  document.getElementById('orders-list').classList.toggle('hidden', show);
  if (show) document.getElementById('empty-state').classList.add('hidden');
}

function showAuthMessage(msg, type) {
  const el = document.getElementById('auth-message');
  if (!el) return;
  el.textContent = msg;
  el.className   = `auth-message ${type}`;
}

function showModalMessage(msg, type) {
  const el = document.getElementById('modal-message');
  if (!el) return;
  el.textContent = msg;
  el.className   = `auth-message ${type}`;
}

function hideModalMessage() {
  const el = document.getElementById('modal-message');
  if (el) el.className = 'auth-message hidden';
}

function setButtonLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  const t = btn.querySelector('.btn-text');
  const l = btn.querySelector('.btn-loader');
  if (t) t.classList.toggle('hidden', loading);
  if (l) l.classList.toggle('hidden', !loading);
}

// ────────────────────────────────────────────────────────────
// ⑭ UTILITÁRIOS
// ────────────────────────────────────────────────────────────
function formatCurrency(value) {
  return Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function todayDate() {
  return new Date().toISOString().split('T')[0];
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str || ''));
  return div.innerHTML;
}

function translateError(msg) {
  if (msg.includes('Invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (msg.includes('Email not confirmed'))        return 'Confirme seu e-mail antes de entrar.';
  return 'Ocorreu um erro. Tente novamente.';
}
