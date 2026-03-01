// ============================================================
//  script.js — Integração Supabase
//  Papelaria Criativa — Sistema de Pedidos
// ============================================================

// ──────────────────────────────────────────────────────────
//  ⚙️  CONFIGURAÇÃO
//  Substitua os valores abaixo pelas suas credenciais do Supabase.
//  Veja as instruções no README.md para saber onde encontrá-las.
// ──────────────────────────────────────────────────────────

const SUPABASE_URL  = 'https://SEU_PROJECT_ID.supabase.co';  // ← troque aqui
const SUPABASE_ANON = 'SUA_ANON_KEY_AQUI';                  // ← troque aqui

// ──────────────────────────────────────────────────────────
//  Inicialização do cliente Supabase
// ──────────────────────────────────────────────────────────
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);


// ============================================================
//  FUNÇÕES DE PEDIDOS (CRUD)
// ============================================================

/**
 * Busca todos os pedidos do usuário logado,
 * ordenados do mais recente para o mais antigo.
 */
async function getOrders() {
  const { data: { user } } = await supabase.auth.getUser();

  return supabase
    .from('pedidos')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
}

/**
 * Cria um novo pedido associado ao usuário logado.
 * @param {{ cliente: string, descricao: string, valor: number, data_entrega: string }} pedido
 */
async function addOrder(pedido) {
  const { data: { user } } = await supabase.auth.getUser();

  return supabase
    .from('pedidos')
    .insert([{
      user_id:      user.id,
      cliente:      pedido.cliente,
      descricao:    pedido.descricao,
      valor:        pedido.valor,
      data_entrega: pedido.data_entrega,
      status:       'pendente',
    }])
    .select();
}

/**
 * Atualiza o status de um pedido.
 * @param {string} id     - UUID do pedido
 * @param {string} status - 'pendente' | 'concluido'
 */
async function updateOrderStatus(id, status) {
  return supabase
    .from('pedidos')
    .update({ status })
    .eq('id', id);
}

/**
 * Remove um pedido pelo ID.
 * @param {string} id - UUID do pedido
 */
async function removeOrder(id) {
  return supabase
    .from('pedidos')
    .delete()
    .eq('id', id);
}
