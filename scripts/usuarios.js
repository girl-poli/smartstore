async function api(url, options = {}) {
  const token = localStorage.getItem('smart_token') || localStorage.getItem('token') || '';

  const resp = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(options.headers || {})
    },
    ...options
  });

  const data = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    // Fallback local para teste quando backend admin não existe.
    if (url.includes('/api/admin/users')) {
      return window.__usuariosFallback(options);
    }
    throw new Error(data.erro || data.error || data.message || 'Erro na requisição');
  }

  return data;
}

function normalizarCelular(v) {
  return String(v || '').replace(/\D/g, '');
}

function getUsersLocal() {
  try {
    return JSON.parse(localStorage.getItem('smart_admin_users') || '[]');
  } catch {
    return [];
  }
}

function setUsersLocal(users) {
  localStorage.setItem('smart_admin_users', JSON.stringify(users));
}

window.__usuariosFallback = function(options = {}) {
  let users = getUsersLocal();

  if (!users.length) {
    users = [{
      id: 'local-admin',
      nome: 'Seller Smart Cosméticos',
      celular: '11999999999',
      email: 'admin@smart.local',
      seller: 'Smart Cosméticos',
      role: 'ADMIN',
      ativo: true
    }];
    setUsersLocal(users);
  }

  if ((options.method || 'GET').toUpperCase() === 'POST') {
    const body = JSON.parse(options.body || '{}');
    users.push({
      id: 'u_' + Date.now(),
      nome: body.nome,
      celular: body.celular,
      email: body.email,
      seller: body.seller || 'Smart Cosméticos',
      role: body.role || 'SELLER',
      ativo: true
    });
    setUsersLocal(users);
  }

  if ((options.method || '').toUpperCase() === 'PATCH') {
    const body = JSON.parse(options.body || '{}');
    const id = location.pathname.split('/').pop();
    users = users.map(u => u.id === id ? { ...u, ...body } : u);
    setUsersLocal(users);
  }

  return { users };
};

function renderUsuarios(users) {
  document.getElementById('kpiTotalUsuarios').textContent = users.length;
  document.getElementById('kpiAdmins').textContent = users.filter(u => String(u.role).toUpperCase() === 'ADMIN').length;
  document.getElementById('kpiSellers').textContent = users.filter(u => String(u.role).toUpperCase() !== 'ADMIN').length;
  document.getElementById('kpiAtivos').textContent = users.filter(u => u.ativo !== false).length;

  const tbody = document.getElementById('tbodyUsuarios');
  tbody.innerHTML = users.map(u => `
    <tr>
      <td><strong>${u.nome || '-'}</strong></td>
      <td>${u.celular || '-'}</td>
      <td>${u.email || '-'}</td>
      <td>${u.seller || u.loja || 'Smart Cosméticos'}</td>
      <td><span class="badge-role ${String(u.role).toUpperCase() === 'ADMIN' ? 'badge-admin' : 'badge-seller'}">${u.role || 'SELLER'}</span></td>
      <td>${u.ativo === false ? 'Inativo' : 'Ativo'}</td>
      <td>
        <button class="btn-mini" onclick="alterarPerfil('${u.id}', '${String(u.role).toUpperCase() === 'ADMIN' ? 'SELLER' : 'ADMIN'}')">Virar ${String(u.role).toUpperCase() === 'ADMIN' ? 'SELLER' : 'ADMIN'}</button>
        <button class="btn-mini btn-danger" onclick="alternarAtivo('${u.id}', ${u.ativo === false ? 'true' : 'false'})">${u.ativo === false ? 'Ativar' : 'Inativar'}</button>
      </td>
    </tr>
  `).join('');
}

async function carregarUsuarios() {
  const data = await api('/api/admin/users');
  renderUsuarios(data.users || data.usuarios || []);
}

async function alterarPerfil(id, role) {
  let users = getUsersLocal();
  if (users.length) {
    users = users.map(u => u.id === id ? { ...u, role } : u);
    setUsersLocal(users);
    renderUsuarios(users);
    return;
  }

  await api(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify({ role }) });
  await carregarUsuarios();
}

async function alternarAtivo(id, ativo) {
  let users = getUsersLocal();
  if (users.length) {
    users = users.map(u => u.id === id ? { ...u, ativo } : u);
    setUsersLocal(users);
    renderUsuarios(users);
    return;
  }

  await api(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify({ ativo }) });
  await carregarUsuarios();
}

document.getElementById('btnAtualizarUsuarios')?.addEventListener('click', carregarUsuarios);

document.getElementById('formNovoUsuario')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('msgUsuarios');
  msg.textContent = '';
  msg.style.color = '#027a48';

  try {
    const users = getUsersLocal();
    const novo = {
      id: 'u_' + Date.now(),
      nome: document.getElementById('novoNome').value.trim(),
      celular: normalizarCelular(document.getElementById('novoCelular').value),
      email: document.getElementById('novoEmail').value.trim(),
      role: document.getElementById('novoRole').value,
      seller: 'Smart Cosméticos',
      ativo: true
    };

    users.push(novo);
    setUsersLocal(users);

    e.target.reset();
    msg.textContent = 'Usuário cadastrado com sucesso.';
    renderUsuarios(users);
  } catch (err) {
    msg.style.color = '#b42318';
    msg.textContent = err.message;
  }
});

carregarUsuarios();
