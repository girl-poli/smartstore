// scripts/auth.js - proteção simples das páginas e utilitário de fetch com token
(function(){
  const publicPages = ['login.html','cadastro.html'];
  const page = location.pathname.split('/').pop() || 'processamento.html';
  const token = localStorage.getItem('smart_token') || localStorage.getItem('token');

  function setCookie(name, value, maxAgeSeconds){
    document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax`;
  }

  function clearCookie(name){
    document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
  }

  if (token) {
    setCookie('auth_token', token, 60 * 60 * 12);
  }

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
      clearCookie('auth_token');
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