// scripts/auth-login.js
// Login Smart Cosméticos — celular + senha, sem SMS e sem custo.
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('formLoginSenha') || document.querySelector('form');
  const celularInput = document.getElementById('celular');
  const senhaInput = document.getElementById('senha');
  const btnEntrar = document.getElementById('btnEntrarSenha') || document.querySelector('button[type="submit"]');
  const authMessage = document.getElementById('authMessage');
  const tokenBox = document.getElementById('tokenBox');
  const tokenValue = document.getElementById('tokenValue');
  const btnCopiarToken = document.getElementById('btnCopiarToken');

  function limparCelular(valor) {
    return String(valor || '').replace(/\D/g, '');
  }

  function msg(texto, ok = false) {
    if (!authMessage) return;
    authMessage.textContent = texto || '';
    authMessage.classList.toggle('ok', !!ok);
  }

  function setLoading(loading) {
    if (!btnEntrar) return;
    if (loading) {
      btnEntrar.dataset.oldText = btnEntrar.textContent;
      btnEntrar.textContent = 'Entrando...';
      btnEntrar.disabled = true;
    } else {
      btnEntrar.textContent = btnEntrar.dataset.oldText || 'Entrar no painel →';
      btnEntrar.disabled = false;
    }
  }

  function setCookie(name, value, maxAgeSeconds) {
    document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax`;
  }

  function salvarSessao(token, user) {
    localStorage.setItem('smart_token', token);
    localStorage.setItem('token', token);
    localStorage.setItem('smart_user', JSON.stringify(user || {}));
    localStorage.setItem('user', JSON.stringify(user || {}));

    // O servidor lê cookie; o frontend lê localStorage.
    setCookie('auth_token', token, 60 * 60 * 12);

    if (tokenValue) tokenValue.value = token;
    if (tokenBox) tokenBox.classList.add('show');
  }

  async function loginComSenha(e) {
    e.preventDefault();

    const celular = limparCelular(celularInput?.value);
    const senha = String(senhaInput?.value || '');

    if (!celular || celular.length < 10) {
      msg('Informe um celular válido com DDD.');
      return;
    }

    if (!senha) {
      msg('Informe sua senha.');
      return;
    }

    try {
      msg('');
      setLoading(true);

      const resp = await fetch('/api/auth/login-senha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ celular, senha })
      });

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok || data.ok === false) {
        throw new Error(data.erro || data.message || 'Não foi possível fazer login.');
      }

      if (!data.token) {
        throw new Error('Login validado, mas a API não retornou token.');
      }

      salvarSessao(data.token, data.user);
      msg('Login realizado com sucesso. Entrando no painel...', true);

      setTimeout(() => {
        window.location.href = '/processamento.html';
      }, 350);
    } catch (erro) {
      msg(erro.message || 'Erro ao fazer login.');
    } finally {
      setLoading(false);
    }
  }

  if (form) {
    form.addEventListener('submit', loginComSenha);
  }

  btnCopiarToken?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(tokenValue?.value || '');
      msg('Token copiado.', true);
    } catch {
      msg('Não consegui copiar automaticamente.');
    }
  });

  document.querySelectorAll('a.auth-link').forEach((a) => {
    if ((a.textContent || '').toLowerCase().includes('ir ao painel')) {
      a.addEventListener('click', (e) => {
        const token = localStorage.getItem('smart_token') || localStorage.getItem('token');
        if (!token) {
          e.preventDefault();
          msg('Faça login com celular e senha para entrar.');
          return;
        }

        setCookie('auth_token', token, 60 * 60 * 12);
      });
    }
  });

  console.log('[auth-login] login por celular + senha carregado');
});
