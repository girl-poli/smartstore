const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');

let XLSX = null;
try { XLSX = require('xlsx'); } catch { XLSX = null; }

const app = express();
const PORT = process.env.PORT || 3001;
const ROOT = __dirname;

// ===== PASTAS =====
const IMPORT_DIR = path.resolve(ROOT, 'data_external');
const DATA_DIR = path.join(ROOT, 'data');
const LOG_DIR = path.join(DATA_DIR, 'logs-processamento');
const META_PATH = path.join(DATA_DIR, 'processamento-meta.json');
const USERS_PATH = path.join(DATA_DIR, 'users.json');
const OTP_PATH = path.join(DATA_DIR, 'otp-celular.json');

fs.mkdirSync(IMPORT_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(LOG_DIR, { recursive: true });

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ===== AUTH COM TOKEN, SEM DEPENDÊNCIA EXTERNA =====
const AUTH_SECRET = process.env.AUTH_SECRET || 'troque-este-segredo-em-producao-smart-cosmeticos';
const TOKEN_TTL_MS = 1000 * 60 * 60 * 12;

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function sign(payload) {
  return crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
}

function gerarToken(user) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify({
    sub: user.id,
    email: user.email || '',
    celular: user.celular || '',
    nome: user.nome,
    seller: user.seller,
    role: user.role || 'SELLER',
    exp: Date.now() + TOKEN_TTL_MS
  }));
  const signature = sign(`${header}.${body}`);
  return `${header}.${body}.${signature}`;
}

function verificarToken(token) {
  try {
    if (!token || !token.includes('.')) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;
    const expected = sign(`${header}.${body}`);
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function hashSenha(senha, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(String(senha), salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function senhaConfere(senha, senhaHash) {
  const [salt] = String(senhaHash || '').split(':');
  if (!salt) return false;
  return hashSenha(senha, salt) === senhaHash;
}

function lerUsuarios() {
  try { return JSON.parse(fs.readFileSync(USERS_PATH, 'utf8')); } catch { return []; }
}

function salvarUsuarios(users) {
  fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2), 'utf8');
}

function criarAdminPadraoSeNaoExistir() {
  const users = lerUsuarios();
  if (users.length) return;

  users.push({
    id: crypto.randomUUID(),
    nome: 'Admin',
    email: 'admin@smart.local',
    seller: 'Smart Cosméticos',
    role: 'ADMIN',
    senhaHash: hashSenha('123456'),
    criadoEm: new Date().toISOString(),
    ativo: true
  });

  salvarUsuarios(users);
  console.log('✅ Usuário inicial criado: admin@smart.local / 123456');
}

criarAdminPadraoSeNaoExistir();

function extrairToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);

  const cookie = req.headers.cookie || '';
  const match = cookie.match(/(?:^|; )auth_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

function authObrigatorio(req, res, next) {
  const payload = verificarToken(extrairToken(req));

  if (!payload) {
    if (req.path.endsWith('.html') || req.path === '/') return res.redirect('/login.html');
    return res.status(401).json({ ok: false, erro: 'Não autenticado. Faça login novamente.' });
  }

  req.user = payload;
  next();
}

function setAuthCookie(res, token) {
  res.setHeader('Set-Cookie', `auth_token=${encodeURIComponent(token)}; Path=/; Max-Age=${TOKEN_TTL_MS / 1000}; SameSite=Lax`);
}

// ===== ROTAS PÚBLICAS =====
app.get('/login.html', (req, res) => res.sendFile(path.join(ROOT, 'login.html')));
app.get('/cadastro.html', (req, res) => res.sendFile(path.join(ROOT, 'cadastro.html')));
app.get('/auth.js', (req, res) => res.sendFile(path.join(ROOT, 'auth.js')));

app.use('/assets', express.static(path.join(ROOT, 'assets')));
app.use('/styles', express.static(path.join(ROOT, 'styles')));
app.use('/scripts', express.static(path.join(ROOT, 'scripts')));

// ===== AUTH POR CÓDIGO NO CELULAR (SMS / WHATSAPP) =====
function normalizarCelular(celular) {
  return String(celular || '').replace(/\D/g, '');
}

function lerOtpStore() {
  try { return JSON.parse(fs.readFileSync(OTP_PATH, 'utf8')); } catch { return {}; }
}

function salvarOtpStore(store) {
  fs.writeFileSync(OTP_PATH, JSON.stringify(store, null, 2), 'utf8');
}

function gerarCodigoOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function enviarCodigoOtp({ celular, codigo, canal }) {
  const canalNormalizado = String(canal || 'sms').toLowerCase();
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const fromSms = process.env.TWILIO_FROM_SMS;
  const fromWhatsapp = process.env.TWILIO_FROM_WHATSAPP;
  const usarTwilio = sid && token && (fromSms || fromWhatsapp);

  console.log('🔐 Código ' + canalNormalizado.toUpperCase() + ' para ' + celular + ': ' + codigo);

  if (!usarTwilio) return { enviado: false, modoDev: true };

  try {
    const twilio = require('twilio');
    const client = twilio(sid, token);
    const destino = canalNormalizado === 'whatsapp' ? 'whatsapp:+55' + celular : '+55' + celular;
    const origem = canalNormalizado === 'whatsapp' ? fromWhatsapp : fromSms;

    await client.messages.create({
      from: origem,
      to: destino,
      body: 'Seu código Smart Cosméticos é: ' + codigo
    });

    return { enviado: true, modoDev: false };
  } catch (erro) {
    console.warn('⚠️ Falha ao enviar via Twilio. Mantendo modo DEV.', erro.message);
    return { enviado: false, modoDev: true, erro: erro.message };
  }
}

async function rotaSolicitarCodigo(req, res) {
  try {
    const celular = normalizarCelular(req.body.celular);
    const canal = String(req.body.canal || req.body.metodo || 'sms').toLowerCase();

    if (!celular || celular.length < 10 || celular.length > 11) {
      return res.status(400).json({ ok: false, erro: 'Informe um celular válido com DDD.' });
    }

    const codigo = gerarCodigoOtp();
    const store = lerOtpStore();

    store[celular] = {
      codigo,
      canal,
      criadoEm: new Date().toISOString(),
      expiraEm: Date.now() + (5 * 60 * 1000),
      tentativas: 0
    };

    salvarOtpStore(store);
    const envio = await enviarCodigoOtp({ celular, codigo, canal });

    res.json({
      ok: true,
      mensagem: envio.modoDev ? 'Código gerado em modo teste. Veja o código abaixo e também no terminal.' : 'Código enviado por ' + (canal === 'whatsapp' ? 'WhatsApp' : 'SMS') + '.',
      modoDev: envio.modoDev,
      codigoDev: envio.modoDev ? codigo : undefined
    });
  } catch (erro) {
    res.status(500).json({ ok: false, erro: erro.message });
  }
}

function rotaValidarCodigo(req, res) {
  const celular = normalizarCelular(req.body.celular);
  const codigo = String(req.body.codigo || req.body.code || '').replace(/\D/g, '');
  const nome = String(req.body.nome || '').trim();
  const seller = String(req.body.seller || req.body.loja || 'Smart Cosméticos').trim();
  const email = String(req.body.email || '').trim().toLowerCase();

  if (!celular || !codigo) return res.status(400).json({ ok: false, erro: 'Informe celular e código.' });

  const store = lerOtpStore();
  const registro = store[celular];

  if (!registro) return res.status(400).json({ ok: false, erro: 'Código não solicitado ou expirado.' });

  if (Date.now() > Number(registro.expiraEm || 0)) {
    delete store[celular];
    salvarOtpStore(store);
    return res.status(400).json({ ok: false, erro: 'Código expirado. Solicite um novo.' });
  }

  registro.tentativas = Number(registro.tentativas || 0) + 1;

  if (registro.tentativas > 5) {
    delete store[celular];
    salvarOtpStore(store);
    return res.status(429).json({ ok: false, erro: 'Muitas tentativas. Solicite um novo código.' });
  }

  if (String(registro.codigo) !== codigo) {
    store[celular] = registro;
    salvarOtpStore(store);
    return res.status(401).json({ ok: false, erro: 'Código inválido.' });
  }

  const users = lerUsuarios();
  let user = users.find(u => normalizarCelular(u.celular) === celular && u.ativo !== false);

  if (!user) {
    user = {
      id: crypto.randomUUID(),
      nome: nome || 'Seller',
      seller,
      celular,
      email,
      role: 'SELLER',
      criadoEm: new Date().toISOString(),
      ativo: true
    };
    users.push(user);
  } else {
    if (nome) user.nome = nome;
    if (seller) user.seller = seller;
    if (email) user.email = email;
    user.ultimoLoginEm = new Date().toISOString();
  }

  salvarUsuarios(users);
  delete store[celular];
  salvarOtpStore(store);

  const token = gerarToken(user);
  setAuthCookie(res, token);

  res.json({
    ok: true,
    token,
    user: {
      id: user.id,
      nome: user.nome,
      seller: user.seller,
      celular: user.celular,
      email: user.email || '',
      role: user.role || 'SELLER'
    }
  });
}

// Rotas novas + aliases para corrigir Cannot POST /api/auth/request
app.post('/api/auth/request', rotaSolicitarCodigo);
app.post('/api/auth/otp/request', rotaSolicitarCodigo);
app.post('/api/auth/verify', rotaValidarCodigo);
app.post('/api/auth/otp/verify', rotaValidarCodigo);

app.post('/api/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'auth_token=; Path=/; Max-Age=0; SameSite=Lax');
  res.json({ ok: true });
});

app.get('/api/auth/me', authObrigatorio, (req, res) => {
  res.json({ ok: true, user: req.user });
});


// ===== ADMIN USUÁRIOS - SINERGIA COM LOGIN POR CELULAR =====
// ADMIN acessa /usuarios.html e APIs de usuários.
// SELLER acessa o restante do sistema, mas não acessa usuários.

function adminObrigatorio(req, res, next) {
  const payload = verificarToken(extrairToken(req));

  if (!payload) {
    return res.status(401).json({ ok: false, erro: 'Não autenticado.' });
  }

  if (payload.role !== 'ADMIN') {
    return res.status(403).json({ ok: false, erro: 'Acesso restrito ao administrador.' });
  }

  req.user = payload;
  next();
}

function normalizarCelularAdmin(celular) {
  return String(celular || '').replace(/\D/g, '');
}

function usuarioPublicoAdmin(u) {
  return {
    id: u.id,
    nome: u.nome || u.name || 'Sem nome',
    celular: u.celular || u.phone || '',
    email: u.email || '',
    seller: u.seller || u.loja || 'Smart Cosméticos',
    role: u.role || 'SELLER',
    ativo: u.ativo !== false,
    criadoEm: u.criadoEm || u.createdAt || null,
    ultimoLoginEm: u.ultimoLoginEm || null
  };
}

app.get('/api/admin/users', adminObrigatorio, (req, res) => {
  const users = lerUsuarios().map(usuarioPublicoAdmin);
  res.json({ ok: true, users });
});

app.post('/api/admin/users', adminObrigatorio, (req, res) => {
  const nome = String(req.body.nome || req.body.name || '').trim();
  const celular = normalizarCelularAdmin(req.body.celular || req.body.phone);
  const email = String(req.body.email || '').trim().toLowerCase();
  const seller = String(req.body.seller || req.body.loja || 'Smart Cosméticos').trim();
  const role = req.body.role === 'ADMIN' ? 'ADMIN' : 'SELLER';

  if (!nome || celular.length < 10) {
    return res.status(400).json({ ok: false, erro: 'Informe nome e celular válido.' });
  }

  const users = lerUsuarios();

  if (users.some(u => normalizarCelularAdmin(u.celular || u.phone) === celular)) {
    return res.status(409).json({ ok: false, erro: 'Celular já cadastrado.' });
  }

  if (email && users.some(u => String(u.email || '').toLowerCase() === email)) {
    return res.status(409).json({ ok: false, erro: 'E-mail já cadastrado.' });
  }

  const user = {
    id: crypto.randomUUID(),
    nome,
    celular,
    email,
    seller,
    role,
    criadoEm: new Date().toISOString(),
    ativo: true
  };

  users.push(user);
  salvarUsuarios(users);

  res.json({ ok: true, user: usuarioPublicoAdmin(user) });
});

app.patch('/api/admin/users/:id', adminObrigatorio, (req, res) => {
  const users = lerUsuarios();
  const user = users.find(u => u.id === req.params.id);

  if (!user) {
    return res.status(404).json({ ok: false, erro: 'Usuário não encontrado.' });
  }

  if (req.body.nome !== undefined) user.nome = String(req.body.nome || '').trim();
  if (req.body.seller !== undefined) user.seller = String(req.body.seller || '').trim();
  if (req.body.email !== undefined) user.email = String(req.body.email || '').trim().toLowerCase();

  if (req.body.role) {
    user.role = req.body.role === 'ADMIN' ? 'ADMIN' : 'SELLER';
  }

  if (typeof req.body.ativo === 'boolean') {
    user.ativo = req.body.ativo;
  }

  salvarUsuarios(users);

  res.json({ ok: true, user: usuarioPublicoAdmin(user) });
});

app.delete('/api/admin/users/:id', adminObrigatorio, (req, res) => {
  const users = lerUsuarios();
  const user = users.find(u => u.id === req.params.id);

  if (!user) {
    return res.status(404).json({ ok: false, erro: 'Usuário não encontrado.' });
  }

  user.ativo = false;
  salvarUsuarios(users);

  res.json({ ok: true, user: usuarioPublicoAdmin(user) });
});

// Aliases para compatibilidade com telas antigas/novas.
// Mantém um único motor de OTP: /api/auth/request e /api/auth/verify.
app.post('/api/auth/request-code', rotaSolicitarCodigo);
app.post('/api/auth/verify-code', rotaValidarCodigo);


// Daqui pra baixo, tudo é protegido.
app.use(authObrigatorio);

app.get('/', (req, res) => res.redirect('/processamento.html'));

app.use('/data_external', express.static(IMPORT_DIR));
app.use('/data', express.static(DATA_DIR));

app.get('/api/estoque-tiktok', (req, res) => {
  const file = path.join(DATA_DIR, 'estoque-tiktok-cruzado.json');
  if (!fs.existsSync(file)) return res.status(404).json({ erro: 'Rode npm run estoque primeiro' });
  res.json(JSON.parse(fs.readFileSync(file, 'utf8')));
});

const PIPELINES = [
  // PRODUTOS / CATÁLOGOS
  { id: 'dropstok_mapeamento', grupo: 'core', titulo: 'Dropstok Mapeamento', arquivo: 'relatorio-dropstok-mapeamento.json', tipo: 'Base Produto/Custo', script: 'gerar-produtos-json.js' },
  { id: 'catalogo_ml', grupo: 'marketplace', titulo: 'Catálogo ML', arquivo: 'catalogo-ml.xlsx', tipo: 'Produtos', script: 'gerar-produtos-json.js' },
  { id: 'catalogo_shopee', grupo: 'marketplace', titulo: 'Catálogo Shopee', arquivo: 'catalogo-shopee.xlsx', tipo: 'Produtos', script: 'gerar-produtos-json.js' },
  { id: 'catalogo_tiktok', grupo: 'marketplace', titulo: 'Catálogo TikTok', arquivo: 'catalogo-tiktok.xlsx', tipo: 'Produtos', script: 'gerar-produtos-json.js' },

  // VENDAS
  { id: 'vendas_ml', grupo: 'marketplace', titulo: 'Vendas ML', arquivo: 'vendas-ml.xlsx', tipo: 'Vendas', script: 'gerar-vendas-json.js' },
  { id: 'vendas_shopee', grupo: 'marketplace', titulo: 'Vendas Shopee', arquivo: 'vendas-shopee.xlsx', tipo: 'Vendas', script: 'gerar-vendas-json.js' },
  { id: 'vendas_tiktok', grupo: 'marketplace', titulo: 'Vendas TikTok', arquivo: 'vendas-tiktok.xlsx', tipo: 'Vendas', script: 'gerar-vendas-json.js' },

  // CUSTOS / COMPRAS
  { id: 'custos', grupo: 'core', titulo: 'Custos / Compras', arquivo: 'relatorio-dropstok-vendas.json', tipo: 'Compras/Custo', script: 'gerar-custos-json.js' },

  // MOTORES INTELIGENTES
  { id: 'estoque_tiktok', grupo: 'inteligencia', titulo: 'Estoque TikTok', arquivo: 'catalogo-tiktok.xlsx', tipo: 'Estoque / TikTok', script: 'motor-estoque-tiktok.js' },
  { id: 'repricing_ml', grupo: 'inteligencia', titulo: 'Repricing ML', arquivo: 'repricing-ml-lista-completa.json', tipo: 'Preço / Concorrência', script: 'motor_repricing_ml.js' }
];

function readMeta() {
  try { return JSON.parse(fs.readFileSync(META_PATH, 'utf8')); } catch { return {}; }
}

function writeMeta(meta) {
  fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2));
}

function readLog(id = 'todos') {
  try { return fs.readFileSync(path.join(LOG_DIR, `${id}.log`), 'utf8').slice(-12000); } catch { return ''; }
}

function appendLog(id, texto) {
  const linha = `[${new Date().toLocaleString('pt-BR')}] ${texto}\n`;
  fs.appendFileSync(path.join(LOG_DIR, `${id}.log`), linha);
  fs.appendFileSync(path.join(LOG_DIR, `todos.log`), `[${id}] ${linha}`);
}

function countRecords(filePath) {
  if (!fs.existsSync(filePath)) return 0;

  const ext = path.extname(filePath).toLowerCase();

  try {
    if (ext === '.json') {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (Array.isArray(data)) return data.length;
      return Object.keys(data || {}).length;
    }

    if ((ext === '.xlsx' || ext === '.xls') && XLSX) {
      const wb = XLSX.readFile(filePath, { cellDates: false, raw: false });
      const nomeArquivo = path.basename(filePath).toLowerCase();

      let sheetName = wb.SheetNames[0];

      if (nomeArquivo === 'catalogo-ml.xlsx' && wb.Sheets['Anúncios']) {
        sheetName = 'Anúncios';
      }

      const sheet = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      return rows.filter(row => Array.isArray(row) && row.some(cell => String(cell ?? '').trim() !== '')).length;
    }

    return null;
  } catch {
    return 0;
  }
}

function montarStatusPipeline(p, meta) {
  const caminho = path.join(IMPORT_DIR, p.arquivo);
  const existe = fs.existsSync(caminho);
  const stat = existe ? fs.statSync(caminho) : null;
  const m = meta[p.id] || {};
  const registrosAgora = countRecords(caminho);
  const novaReferencia = stat ? stat.mtime.toISOString() : '';

  let incrementalTexto = 'Pronto';
  if (!existe) incrementalTexto = 'Arquivo ausente';
  else if (!m.ultimaReferencia) incrementalTexto = 'Primeira carga';
  else if (m.ultimaReferencia !== novaReferencia) incrementalTexto = 'Novo arquivo detectado';
  else incrementalTexto = 'Sem alteração';

  return {
    ...p,
    status: existe ? (m.ultimoErro ? 'erro' : 'ok') : 'pendente',
    caminho,
    modificadoEm: novaReferencia || null,
    tamanhoBytes: stat ? stat.size : 0,
    registros: registrosAgora ?? m.registros ?? null,
    ultimaReferencia: m.ultimaReferencia || '',
    ultimaExecucao: m.ultimaExecucao || null,
    ultimoErro: m.ultimoErro || '',
    incrementalTexto
  };
}

app.get('/api/processamento/status', (req, res) => {
  const meta = readMeta();
  const pipelines = PIPELINES.map(p => montarStatusPipeline(p, meta));

  const total = pipelines.length;
  const validos = pipelines.filter(p => p.status === 'ok').length;
  const pendentes = pipelines.filter(p => p.status !== 'ok').length;
  const ultimaExecucao = Object.values(meta).map(x => x.ultimaExecucao).filter(Boolean).sort().pop() || null;

  const registrosMkt = pipelines
    .filter(p => p.grupo === 'marketplace')
    .reduce((acc, p) => acc + (Number(p.registros) || 0), 0);

  const registrosCore = pipelines
    .filter(p => p.grupo === 'core')
    .reduce((acc, p) => acc + (Number(p.registros) || 0), 0);

  res.json({
    resumo: { total, validos, pendentes, ultimaExecucao, registrosMkt, registrosCore },
    pastaEntrada: IMPORT_DIR,
    pipelines,
    log: readLog('todos') || `Pasta de entrada monitorada: ${IMPORT_DIR}`
  });
});

app.get('/api/processamento/log/:pipeline', (req, res) => {
  res.json({ log: readLog(req.params.pipeline) });
});

function executarComando(command, env = {}) {
  return new Promise(resolve => {
    exec(command, {
      cwd: ROOT,
      env: { ...process.env, ...env },
      maxBuffer: 1024 * 1024 * 10
    }, (error, stdout, stderr) => resolve({ ok: !error, error, stdout, stderr }));
  });
}

async function processarPipeline(id) {
  const pipeline = PIPELINES.find(p => p.id === id);
  if (!pipeline) return { ok: false, pipeline: id, erro: 'Pipeline inválido' };

  const meta = readMeta();
  const anterior = meta[id] || {};
  const caminho = path.join(IMPORT_DIR, pipeline.arquivo);

  if (!fs.existsSync(caminho)) {
    meta[id] = {
      ...anterior,
      arquivo: pipeline.arquivo,
      caminho,
      ultimaExecucao: new Date().toISOString(),
      ultimoErro: `Arquivo não encontrado: ${pipeline.arquivo}`
    };
    writeMeta(meta);
    appendLog(id, `ERRO - arquivo não encontrado: ${pipeline.arquivo}`);
    return { ok: false, pipeline: id, erro: `Arquivo não encontrado: ${pipeline.arquivo}`, log: readLog(id) };
  }

  const stat = fs.statSync(caminho);
  const scriptPath = path.join(ROOT, pipeline.script);

  appendLog(id, `Início | arquivo=${pipeline.arquivo} | caminho=${caminho} | ultimaReferencia=${anterior.ultimaReferencia || '-'}`);

  let resultado;
  if (fs.existsSync(scriptPath)) {
    resultado = await executarComando(`node ${pipeline.script}`, {
      PIPELINE_ID: id,
      PIPELINE_FILE: caminho,
      DATA_EXTERNAL_DIR: IMPORT_DIR,
      ULTIMA_DATA_REFERENCIA: anterior.ultimaReferencia || '',
      MODO_INCREMENTAL: 'true'
    });
  } else {
    resultado = {
      ok: true,
      stdout: `Script ${pipeline.script} não encontrado. Tracking atualizado sem executar transformação.`,
      stderr: ''
    };
  }

  const registros = countRecords(caminho);
  const agora = new Date().toISOString();

  meta[id] = {
    arquivo: pipeline.arquivo,
    caminho,
    ultimaExecucao: agora,
    ultimaReferencia: stat.mtime.toISOString(),
    modificadoEm: stat.mtime.toISOString(),
    tamanhoBytes: stat.size,
    registros,
    ultimoErro: resultado.ok ? '' : String(resultado.stderr || resultado.error?.message || 'Erro')
  };

  writeMeta(meta);

  appendLog(id, `${resultado.ok ? 'SUCESSO' : 'ERRO'} | registros=${registros ?? '-'} | novaReferencia=${stat.mtime.toISOString()}\nSTDOUT:\n${resultado.stdout}\nSTDERR:\n${resultado.stderr}`);

  return { ok: resultado.ok, pipeline: id, stdout: resultado.stdout, stderr: resultado.stderr, log: readLog(id) };
}

app.post('/api/processamento/processar/:pipeline', async (req, res) => {
  try {
    const id = req.params.pipeline;

    if (id === 'todos') {
      const ordem = [
        // Ordem inteligente:
        // 1) Produtos / base
        // 2) Vendas
        // 3) Custos / compras
        // 4) Motores inteligentes independentes
        'dropstok_mapeamento',
        'vendas_ml',
        'vendas_shopee',
        'vendas_tiktok',
        'custos',
        'estoque_tiktok',
        'repricing_ml'
      ];

      const resultados = [];
      for (const pipelineId of ordem) resultados.push(await processarPipeline(pipelineId));

      return res.json({ ok: resultados.every(r => r.ok), resultados, log: readLog('todos') });
    }

    const resultado = await processarPipeline(id);
    res.json(resultado);
  } catch (erro) {
    res.status(500).json({ ok: false, erro: erro.message, log: erro.stack });
  }
});

// Arquivos HTML/JS/CSS restantes do painel.
app.use(express.static(ROOT));

app.listen(PORT, () => {
  console.log('🔥 SERVER FINAL ESTAVEL - PIPELINE + MOTORES');
  console.log(`Servidor em http://localhost:${PORT}`);
  console.log(`Login: http://localhost:${PORT}/login.html`);
  console.log(`Pasta de entrada monitorada: ${IMPORT_DIR}`);
});

const multer = require('multer');
const path = require('path');
const fs = require('fs');

// pasta upload
const uploadDir = path.join(__dirname, 'data_external');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// config multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  }
});

const upload = multer({ storage });

// rota upload
app.post('/api/upload', upload.array('files'), (req, res) => {
  res.json({ message: "Upload realizado com sucesso 🚀" });
});