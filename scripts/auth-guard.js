// scripts/auth-guard.js
// SMART COSMÉTICOS — Auth + logout + menu admin global + login automático
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
    if (!user) return;
    localStorage.setItem('smart_user', JSON.stringify(user));
    localStorage.setItem('user', JSON.stringify(user));
  }

  function saveToken(token) {
    localStorage.setItem('smart_token', token);
    localStorage.setItem('token', token);
  }

  function clearSession() {
    localStorage.removeItem('smart_token');
    localStorage.removeItem('smart_user');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }

  function createAutoAdminSession() {
    const userDev = {
      id: 'local-admin',
      nome: 'Poliana',
      seller: 'Smart Cosméticos',
      role: 'ADMIN'
    };

    saveToken('smart-local-token-2026');
    saveUser(userDev);

    console.warn('[auth] Sessão automática ADMIN criada.');
    return userDev;
  }

  function normalizedUser() {
    let user = getUser();

    if (!user) {
      user = createAutoAdminSession();
    }

    const token = getToken();

    if (
      (token === 'smart-local-token-2026' || token === 'local-dev-token-smart') &&
      String(user.role || '').toUpperCase() !== 'ADMIN'
    ) {
      user.role = 'ADMIN';
      saveUser(user);
    }

    return user;
  }

  function injectStyle() {
    if (document.getElementById('smart-auth-guard-style')) return;

    const style = document.createElement('style');
    style.id = 'smart-auth-guard-style';
    style.textContent = `
      .sidebar {
        display: flex !important;
        flex-direction: column !important;
        min-height: 100vh !important;
      }

      .sidebar-user-box {
        margin-top: auto !important;
        padding: 14px !important;
        border: 1px solid #f1d7d3 !important;
        border-radius: 20px !important;
        background: #fff8f7 !important;
        flex: 0 0 auto !important;
      }

      .sidebar-user-box .box-label {
        margin: 0 0 5px !important;
        font-size: 10px !important;
        letter-spacing: .14em !important;
        text-transform: uppercase !important;
        color: #c08a84 !important;
        font-weight: 800 !important;
      }

      .sidebar-user-box strong {
        display: block !important;
        margin: 0 !important;
        color: #102033 !important;
        font-size: 13px !important;
        line-height: 1.2 !important;
        font-weight: 800 !important;
      }

      .sidebar-user-box span {
        display: block !important;
        margin: 3px 0 10px !important;
        color: #8f6f6a !important;
        font-size: 12px !important;
        line-height: 1.2 !important;
      }

      .btn-logout-sidebar {
        width: 100% !important;
        min-height: 38px !important;
        border: none !important;
        border-radius: 999px !important;
        padding: 10px 14px !important;
        background: #f26c63 !important;
        color: #fff !important;
        font-weight: 800 !important;
        font-size: 12px !important;
        cursor: pointer !important;
        box-shadow: 0 8px 18px rgba(242,108,99,.22) !important;
      }
    `;
    document.head.appendChild(style);
  }

  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}

    clearSession();

    // Login automático recria a sessão ao voltar para painel.
    window.location.href = '/login.html';
  }

  function removeOldLogout() {
    document.querySelectorAll(
      '.sidebar-user-box, #sidebarUserBox, #btnLogoutGlobal, #btnLogoutPremium, #btnLogoutSidebar'
    ).forEach((el) => {
      const box = el.closest('.sidebar-user-box') || el;
      if (box && box.parentNode) box.remove();
    });
  }

  function ensureAdminMenu(user) {
    const menu = document.querySelector('.sidebar .menu, nav.menu');
    if (!menu) return;

    const role = String(user?.role || '').toUpperCase();
    const isAdmin = role === 'ADMIN';

    const existing = menu.querySelector('a[href="usuarios.html"], a[href="/usuarios.html"]');

    if (!isAdmin) {
      existing?.remove();
      return;
    }

    if (!existing) {
      const link = document.createElement('a');
      link.className = 'menu-link';
      link.href = 'usuarios.html';
      link.textContent = 'Usuários';

      const processamento = menu.querySelector(
        'a[href="processamento.html"], a[href="/processamento.html"]'
      );

      if (processamento) {
        processamento.insertAdjacentElement('afterend', link);
      } else {
        menu.appendChild(link);
      }
    }

    const page = location.pathname.split('/').pop() || '';
    menu.querySelectorAll('.menu-link').forEach(a => {
      const href = (a.getAttribute('href') || '').replace(/^\//, '');
      if (href === page) a.classList.add('active');
      else if (page === 'usuarios.html' && href !== 'usuarios.html') a.classList.remove('active');
    });
  }

  function renderUserBox(user) {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;

    injectStyle();
    removeOldLogout();
    ensureAdminMenu(user);

    const box = document.createElement('div');
    box.className = 'sidebar-user-box';
    box.id = 'sidebarUserBox';

    box.innerHTML = `
      <p class="box-label">Usuário logado</p>
      <strong>${user.nome || user.name || 'Poliana'}</strong>
      <span>${user.seller || user.loja || 'Smart Cosméticos'}</span>
      <button id="btnLogoutGlobal" class="btn-logout-sidebar" type="button">Sair do sistema</button>
    `;

    sidebar.appendChild(box);

    document.getElementById('btnLogoutGlobal')?.addEventListener('click', logout);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const page = location.pathname.split('/').pop() || '';
    const publicPages = ['login.html', 'cadastro.html', ''];

    if (publicPages.includes(page)) return;

    if (!getToken()) {
      createAutoAdminSession();
    }

    const user = normalizedUser();
    renderUserBox(user);
  });
})();