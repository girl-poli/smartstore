// scripts/auth-guard-admin.js
// Admin guard corrigido: normaliza usuário local e não bloqueia indevidamente.
(function () {
  function getToken() {
    return localStorage.getItem('smart_token') || localStorage.getItem('token') || '';
  }

  function getUser() {
    try {
      return JSON.parse(localStorage.getItem('smart_user') || localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  }

  function saveUser(user) {
    localStorage.setItem('smart_user', JSON.stringify(user));
    localStorage.setItem('user', JSON.stringify(user));
  }

  function clearSession() {
    localStorage.removeItem('smart_token');
    localStorage.removeItem('smart_user');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }

  async function logout() {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
    clearSession();
    window.location.href = '/login.html';
  }

  function injectStyle() {
    if (document.getElementById('smart-auth-admin-style')) return;

    const style = document.createElement('style');
    style.id = 'smart-auth-admin-style';
    style.textContent = `
      .sidebar {
        display:flex !important;
        flex-direction:column !important;
        min-height:100vh !important;
      }
      .sidebar-user-box {
        margin-top:auto !important;
        padding:14px !important;
        border:1px solid #f1d7d3 !important;
        border-radius:20px !important;
        background:#fff8f7 !important;
      }
      .sidebar-user-box .box-label {
        margin:0 0 5px !important;
        font-size:10px !important;
        letter-spacing:.14em !important;
        text-transform:uppercase !important;
        color:#c08a84 !important;
        font-weight:800 !important;
      }
      .sidebar-user-box strong {
        display:block !important;
        color:#102033 !important;
        font-size:13px !important;
      }
      .sidebar-user-box span {
        display:block !important;
        color:#8f6f6a !important;
        font-size:12px !important;
        margin:3px 0 10px !important;
      }
      .btn-logout-sidebar {
        width:100% !important;
        min-height:38px !important;
        border:none !important;
        border-radius:999px !important;
        padding:10px 14px !important;
        background:#f26c63 !important;
        color:white !important;
        font-weight:800 !important;
        font-size:12px !important;
        cursor:pointer !important;
      }
    `;
    document.head.appendChild(style);
  }

  function renderUserBox(user) {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;

    injectStyle();

    document.querySelectorAll('.sidebar-user-box, #sidebarUserBox, #btnLogoutGlobal, #btnLogoutPremium')
      .forEach(el => {
        const box = el.closest('.sidebar-user-box') || el;
        if (box && box.parentNode) box.remove();
      });

    const box = document.createElement('div');
    box.className = 'sidebar-user-box';
    box.id = 'sidebarUserBox';
    box.innerHTML = `
      <p class="box-label">Usuário logado</p>
      <strong>${user.nome || 'Admin Smart'}</strong>
      <span>${user.seller || user.loja || 'Smart Cosméticos'}</span>
      <button id="btnLogoutGlobal" class="btn-logout-sidebar" type="button">Sair do sistema</button>
    `;

    sidebar.appendChild(box);
    document.getElementById('btnLogoutGlobal')?.addEventListener('click', logout);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const token = getToken();

    if (!token) {
      window.location.href = '/login.html';
      return;
    }

    let user = getUser();

    // Se veio sem role, normaliza como ADMIN para o ambiente local.
    if (!user || !user.role) {
      user = {
        id: 'local-admin',
        nome: 'Seller Smart Cosméticos',
        seller: 'Smart Cosméticos',
        role: 'ADMIN'
      };
      saveUser(user);
    }

    // Aceita ADMIN em maiúsculo/minúsculo.
    const role = String(user.role || '').toUpperCase();

    if (role !== 'ADMIN') {
      // Corrige sessão local antiga que ficou como SELLER por versões anteriores.
      if (token === 'smart-local-token-2026' || token === 'local-dev-token-smart') {
        user.role = 'ADMIN';
        saveUser(user);
      } else {
        alert('Acesso restrito para ADMIN.');
        window.location.href = '/index.html';
        return;
      }
    }

    renderUserBox(user);
  });
})();
