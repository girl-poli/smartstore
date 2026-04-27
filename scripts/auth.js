
// scripts/auth.js - proteção simples das páginas e utilitário de fetch com token
(function(){
  const publicPages = ['login.html','cadastro.html'];
  const page = location.pathname.split('/').pop() || 'processamento.html';
  const token = localStorage.getItem('smart_token') || localStorage.getItem('token');

  if (!publicPages.includes(page) && !token) {
    location.href = '/login.html';
  }

  window.smartAuth = {
    token: () => localStorage.getItem('smart_token') || localStorage.getItem('token') || '',
    user: () => {
      try { return JSON.parse(localStorage.getItem('smart_user') || localStorage.getItem('user') || 'null'); }
      catch { return null; }
    },
    logout: async () => {
      try { await fetch('/api/auth/logout', { method:'POST' }); } catch {}
      localStorage.removeItem('smart_token');
      localStorage.removeItem('smart_user');
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      location.href = '/login.html';
    },
    fetch: (url, options={}) => {
      const headers = new Headers(options.headers || {});
      const t = localStorage.getItem('smart_token') || localStorage.getItem('token');
      if (t) headers.set('Authorization', 'Bearer ' + t);
      return fetch(url, { ...options, headers });
    }
  };
})();
