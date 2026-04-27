/* Estoque TikTok x Dropstok
   Correção:
   - "SKY" foi tratado como SKU Dropstok.
   - A tabela agora mostra duas colunas: SKU TikTok e SKU Dropstok.
   - A base TikTok continua 100% preservada, mesmo com SKU TikTok vazio.
*/

const DATA_URLS = [
  'data/estoque-tiktok-cruzado.json',
  './data/estoque-tiktok-cruzado.json',
  'estoque-tiktok-cruzado.json'
];

let BASE = [];
let VIEW = [];

const $ = (id) => document.getElementById(id);

function norm(v) {
  return String(v ?? '').trim();
}

function upper(v) {
  return norm(v).toUpperCase();
}

function num(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = String(v).replace(/[^\d,-.]/g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function pick(row, keys, fallback = '') {
  for (const k of keys) {
    if (row && row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') return row[k];
  }
  return fallback;
}

function getSkuTikTok(row) {
  const value = pick(row, [
    'sku_tiktok', 'skuTikTok', 'seller_sku', 'sellerSku', 'SKU TikTok',
    'sku_tk', 'tiktok_sku', 'sku'
  ], '');
  const v = norm(value);
  if (!v || upper(v) === 'SEM SKU' || upper(v) === 'N/A' || upper(v) === 'NULL') return '';
  return v;
}

function getSkuDropstok(row) {
  const value = pick(row, [
    'sku_dropstok', 'skuDropstok', 'sku_drop', 'dropstok_sku', 'dropstokSku',
    'sky', 'SKY', 'sku_sky', 'skuSky', 'sku_casado', 'sku_encontrado',
    'sku_base', 'skuFornecedor'
  ], '');
  const v = norm(value);
  if (!v || upper(v) === 'SEM SKU' || upper(v) === 'N/A' || upper(v) === 'NULL') return '';
  return v;
}

function getNome(row) {
  return norm(pick(row, [
    'nome_tiktok', 'nomeTikTok', 'product_name', 'Product Name', 'nome', 'titulo',
    'nome_produto_tiktok', 'nomeProdutoTikTok'
  ], ''));
}

function getLinha(row, idx) {
  return pick(row, ['linha', 'linha_tiktok', 'linhaTikTok', 'row', 'rowNumber'], idx + 1);
}

function getEstTikTok(row) {
  return num(pick(row, [
    'estoque_tiktok', 'estoqueTikTok', 'est_tiktok', 'Est. TikTok',
    'quantity', 'Quantity', 'estoque', 'qtd_tiktok'
  ], 0));
}

function getEstDropstok(row) {
  return num(pick(row, [
    'estoque_dropstok', 'estoqueDropstok', 'dropstok', 'Est. Dropstok',
    'estoque_sky', 'estoqueSky', 'estoque_fornecedor'
  ], 0));
}

function getSugerido(row) {
  const v = pick(row, ['sugerido', 'estoque_sugerido', 'estoqueSugerido', 'sugestao_estoque'], null);
  if (v !== null && v !== undefined && v !== '') return num(v);
  return Math.max(0, Math.min(getEstTikTok(row), Math.max(0, getEstDropstok(row) - 2)));
}

function getRisco(row) {
  const explicit = upper(pick(row, ['risco', 'status_risco', 'status'], ''));
  if (explicit) return explicit;

  const tt = getEstTikTok(row);
  const ds = getEstDropstok(row);
  const skuDrop = getSkuDropstok(row);

  if (!skuDrop) return 'SKU NÃO ENCONTRADO NO DROPSTOK';
  if (ds <= 2 || tt > ds) return 'CRÍTICO';
  if (tt > Math.max(0, ds - 2)) return 'TIKTOK ACIMA DO SEGURO';
  return 'OK';
}

function getAcao(row) {
  const explicit = norm(pick(row, ['acao', 'ação', 'acao_sugerida', 'acaoSugerida'], ''));
  if (explicit) return explicit;

  const risco = getRisco(row);
  const sugerido = getSugerido(row);

  if (risco.includes('SKU NÃO ENCONTRADO')) return 'REVISAR: produto existe no TikTok, mas não casou com SKU Dropstok';
  if (risco === 'CRÍTICO') return `REDUZIR TIKTOK PARA ${sugerido}`;
  if (risco === 'TIKTOK ACIMA DO SEGURO') return `REDUZIR TIKTOK PARA ${sugerido}`;
  return 'MANTER';
}

function riscoRank(row) {
  const r = getRisco(row);
  if (r === 'CRÍTICO') return 1;
  if (r === 'TIKTOK ACIMA DO SEGURO') return 2;
  if (r.includes('SKU NÃO ENCONTRADO')) return 3;
  if (r === 'OK') return 4;
  return 9;
}

function badgeRisco(risco) {
  if (risco === 'CRÍTICO') return `<span class="badge danger">CRÍTICO</span>`;
  if (risco === 'TIKTOK ACIMA DO SEGURO') return `<span class="badge warn">TIKTOK ACIMA DO SEGURO</span>`;
  if (risco === 'OK') return `<span class="badge ok">OK</span>`;
  return `<span class="badge neutral">${risco}</span>`;
}

async function loadJson() {
  let lastError = null;
  for (const url of DATA_URLS) {
    try {
      const res = await fetch(url + '?v=' + Date.now());
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();
      if (Array.isArray(data)) return data;
      if (Array.isArray(data.itens)) return data.itens;
      if (Array.isArray(data.rows)) return data.rows;
      if (Array.isArray(data.dados)) return data.dados;
      throw new Error('JSON encontrado, mas não veio em formato de lista.');
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('Arquivo data/estoque-tiktok-cruzado.json não encontrado.');
}

function aplicarFiltros() {
  const busca = upper($('fBusca').value);
  const riscoFiltro = upper($('fRisco').value);
  const sort = $('fSort').value;

  VIEW = BASE.filter((row, idx) => {
    const hay = upper([
      getLinha(row, idx),
      getSkuTikTok(row),
      getSkuDropstok(row),
      getNome(row),
      getRisco(row),
      getAcao(row)
    ].join(' '));
    const risco = getRisco(row);
    return (!busca || hay.includes(busca)) && (!riscoFiltro || risco.includes(riscoFiltro));
  });

  VIEW.sort((a, b) => {
    if (sort === 'linha') return num(getLinha(a, 0)) - num(getLinha(b, 0));
    if (sort === 'nome') return getNome(a).localeCompare(getNome(b), 'pt-BR');
    if (sort === 'estoque_tiktok') return getEstTikTok(b) - getEstTikTok(a);
    if (sort === 'dropstok') return getEstDropstok(a) - getEstDropstok(b);
    return riscoRank(a) - riscoRank(b);
  });

  renderTabela();
}

function renderKpis() {
  const total = BASE.length;
  const comSkuTikTok = BASE.filter(getSkuTikTok).length;
  const skuDrop = BASE.filter(getSkuDropstok).length;
  const criticos = BASE.filter(r => getRisco(r) === 'CRÍTICO').length;
  const acima = BASE.filter(r => getRisco(r) === 'TIKTOK ACIMA DO SEGURO').length;
  const ok = BASE.filter(r => getRisco(r) === 'OK').length;
  const semSkuTikTok = total - comSkuTikTok;

  $('kpiTotal').textContent = total;
  $('kpiComSku').textContent = comSkuTikTok;
  $('kpiSkuDrop').textContent = skuDrop;
  $('kpiCriticos').textContent = criticos;
  $('kpiAcima').textContent = acima;

  $('rCritico').textContent = criticos;
  $('rAcima').textContent = acima;
  $('rOk').textContent = ok;
  $('rSemSku').textContent = semSkuTikTok;

  $('txtResumo').textContent = `${total} linhas TikTok | ${comSkuTikTok} com SKU TikTok | ${skuDrop} com SKU Dropstok`;
}

function renderTabela() {
  const tbody = $('tbody');
  $('txtQtd').textContent = `Mostrando ${VIEW.length} de ${BASE.length} linhas TikTok.`;

  if (!VIEW.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="muted">Nenhum item encontrado para o filtro atual.</td></tr>`;
    return;
  }

  tbody.innerHTML = VIEW.map((row, i) => {
    const linha = getLinha(row, i);
    const skuTikTok = getSkuTikTok(row);
    const skuDropstok = getSkuDropstok(row);
    const nome = getNome(row);
    const risco = getRisco(row);
    const acao = getAcao(row);

    return `
      <tr>
        <td>${linha}</td>
        <td>${skuTikTok ? `<span class="sku-ok">${escapeHtml(skuTikTok)}</span>` : `<span class="sku-missing">sem SKU</span>`}</td>
        <td>${skuDropstok ? `<span class="sku-drop">${escapeHtml(skuDropstok)}</span>` : `<span class="sku-missing">não encontrado</span>`}</td>
        <td>${escapeHtml(nome)}</td>
        <td>${getEstTikTok(row)}</td>
        <td>${getEstDropstok(row)}</td>
        <td>${getSugerido(row)}</td>
        <td>${badgeRisco(risco)}</td>
        <td>${escapeHtml(acao)}</td>
      </tr>
    `;
  }).join('');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, s => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[s]));
}

function exportCsv() {
  const headers = ['linha', 'sku_tiktok', 'sku_dropstok', 'nome_tiktok', 'estoque_tiktok', 'estoque_dropstok', 'sugerido', 'risco', 'acao'];
  const lines = [headers.join(';')];

  for (const row of VIEW) {
    const vals = [
      getLinha(row, 0),
      getSkuTikTok(row),
      getSkuDropstok(row),
      getNome(row),
      getEstTikTok(row),
      getEstDropstok(row),
      getSugerido(row),
      getRisco(row),
      getAcao(row)
    ].map(v => {
      const s = String(v ?? '');
      return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    });
    lines.push(vals.join(';'));
  }

  const blob = new Blob(["\ufeff" + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'estoque-tiktok-cruzado-com-sku-dropstok.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

async function init() {
  try {
    BASE = await loadJson();
    renderKpis();
    aplicarFiltros();
  } catch (err) {
    $('tbody').innerHTML = `<tr><td colspan="9"><strong>Erro:</strong> ${escapeHtml(err.message)}<br>Rode primeiro: <code>node motor-estoque-tiktok.js</code></td></tr>`;
    $('txtResumo').textContent = 'Erro ao carregar dados';
  }
}

$('btnReload').addEventListener('click', init);
$('btnCsv').addEventListener('click', exportCsv);
$('btnLimpar').addEventListener('click', () => {
  $('fBusca').value = '';
  $('fRisco').value = '';
  $('fSort').value = 'risco';
  aplicarFiltros();
});
$('fBusca').addEventListener('input', aplicarFiltros);
$('fRisco').addEventListener('change', aplicarFiltros);
$('fSort').addEventListener('change', aplicarFiltros);

init();
