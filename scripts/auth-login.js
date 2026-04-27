// scripts/auth-login.js
// Login por celular com fallback de endpoints.
// Fluxo:
// 1) envia código
// 2) mostra campo código
// 3) valida código
// Salva sessão em smart_token/smart_user e token/user.
document.addEventListener('DOMContentLoaded', () => {
  const $ = (sel) => document.querySelector(sel);

  const form =
    $('#formLogin') ||
    $('form');

  const celularInput =
    $('#celular') ||
    $('#telefone') ||
    $('#phone') ||
    $('input[type="tel"]') ||
    $('input[name="celular"]') ||
    $('input[name="telefone"]');

  const canalSelect =
    $('#canal') ||
    $('#tipoEnvio') ||
    $('#metodo') ||
    $('select');

  let codigoInput =
    $('#codigo') ||
    $('#code') ||
    $('input[name="codigo"]') ||
    $('input[name="code"]');

  const submitBtn =
    $('#btnEnviarCodigo') ||
    $('#btnLogin') ||
    $('button[type="submit"]');

  let etapa = codigoInput ? 'codigo' : 'celular';

  function onlyDigits(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function showMsg(text, type = 'info') {
    let el = $('#loginMsg');
    if (!el) {
      el = document.createElement('div');
      el.id = 'loginMsg';
      el.style.marginTop = '12px';
      el.style.fontWeight = '800';
      el.style.fontSize = '13px';
      form?.appendChild(el);
    }

    el.textContent = text;
    el.style.color = type === 'error' ? '#b42318' : '#027a48';
  }

  function saveSession(data) {
    const token =
      data.token ||
      data.accessToken ||
      data.jwt ||
      data.smart_token ||
      data?.data?.token ||
      '';

    const user =
      data.user ||
      data.usuario ||
      data.me ||
      data?.data?.user ||
      data?.data?.usuario ||
      null;

    if (token) {
      localStorage.setItem('smart_token', token);
      localStorage.setItem('token', token);
    }

    if (user) {
      localStorage.setItem('smart_user', JSON.stringify(user));
      localStorage.setItem('user', JSON.stringify(user));
    }

    return { token, user };
  }

  async function tryEndpoints(endpoints, payload) {
    let lastError = null;

    for (const url of endpoints) {
      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await resp.json().catch(() => ({}));

        if (resp.ok && (data.ok !== false)) {
          return { url, data };
        }

        lastError = data.erro || data.error || data.message || `Falha em ${url}`;
      } catch (err) {
        lastError = err.message;
      }
    }

    throw new Error(lastError || 'Não foi possível concluir o login.');
  }

  function ensureCodigoField() {
    if (codigoInput) {
      codigoInput.closest('.field, .form-group, .input-group')?.style?.removeProperty('display');
      codigoInput.style.display = '';
      return codigoInput;
    }

    const wrap = document.createElement('div');
    wrap.className = 'input-group';
    wrap.style.marginTop = '12px';

    wrap.innerHTML = `
      <label style="display:block;margin-bottom:6px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;font-weight:900;color:#a88a85;">Código</label>
      <input id="codigo" name="codigo" inputmode="numeric" placeholder="Digite o código recebido" style="width:100%;height:42px;border:1px solid #ecd6d1;border-radius:12px;padding:0 12px;" />
    `;

    form.insertBefore(wrap, submitBtn || null);
    codigoInput = wrap.querySelector('#codigo');
    return codigoInput;
  }

  async function enviarCodigo() {
    const celular = onlyDigits(celularInput?.value);

    if (!celular || celular.length < 10) {
      showMsg('Digite um celular válido com DDD.', 'error');
      return;
    }

    const canal = canalSelect?.value || 'sms';

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Enviando...';
    }

    const payload = { celular, telefone: celular, phone: celular, canal, metodo: canal };

    const { data } = await tryEndpoints(
      [
        '/api/auth/request-code',
        '/api/auth/send-code',
        '/api/auth/login/request',
        '/api/auth/otp/send',
        '/api/auth/login'
      ],
      payload
    );

    const session = saveSession(data);

    if (session.token) {
      showMsg('Login realizado com sucesso.');
      location.href = '/index.html';
      return;
    }

    const codeFromDev =
      data.codigo ||
      data.code ||
      data.otp ||
      data.devCode ||
      data?.data?.codigo ||
      data?.data?.code ||
      '';

    ensureCodigoField();

    if (codeFromDev && codigoInput) {
      codigoInput.value = codeFromDev;
      showMsg(`Código gerado: ${codeFromDev}`);
    } else {
      showMsg('Código enviado. Digite o código recebido.');
    }

    etapa = 'codigo';

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Entrar no painel →';
    }
  }

  async function validarCodigo() {
    const celular = onlyDigits(celularInput?.value);
    const codigo = onlyDigits(codigoInput?.value);

    if (!codigo) {
      showMsg('Digite o código de acesso.', 'error');
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Validando...';
    }

    const payload = {
      celular,
      telefone: celular,
      phone: celular,
      codigo,
      code: codigo,
      otp: codigo
    };

    const { data } = await tryEndpoints(
      [
        '/api/auth/verify-code',
        '/api/auth/verify',
        '/api/auth/login/verify',
        '/api/auth/otp/verify',
        '/api/auth/login'
      ],
      payload
    );

    const session = saveSession(data);

    if (!session.token) {
      throw new Error('Código validado, mas a API não retornou token.');
    }

    showMsg('Login realizado com sucesso.');
    location.href = '/index.html';
  }

  if (!form || !celularInput) {
    console.warn('[auth-login] Não encontrei form/celular no login.html');
    return;
  }

  // Se já está logado, botão "Ir ao painel" pode funcionar.
  document.querySelectorAll('a, button').forEach((el) => {
    const txt = (el.textContent || '').toLowerCase();
    if (txt.includes('ir ao painel')) {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        location.href = localStorage.getItem('smart_token') || localStorage.getItem('token')
          ? '/index.html'
          : '/login.html';
      });
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    try {
      if (etapa === 'celular') {
        await enviarCodigo();
      } else {
        await validarCodigo();
      }
    } catch (err) {
      showMsg(err.message || 'Erro no login.', 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = etapa === 'celular'
          ? 'Enviar código de acesso →'
          : 'Entrar no painel →';
      }
    }
  });
});
