async function init() {
  const resumo = await fetch('data/conferencia-resumo.json').then(r => r.json());

  // BASE
  set('cardBase', resumo.base.totalSkusBase);

  // ML
  set('cardMlArquivo', resumo.ml.totalArquivo);
  set('cardMlCasados', resumo.ml.totalCasados);
  set('cardMlPendentes', resumo.ml.totalPendentes);
  set('cardMlEsgotados', resumo.ml.totalEsgotados);
  set('cardMlVariacoes', resumo.ml.totalVariacoes);
  set('cardMlDuplicados', resumo.ml.totalDuplicados);

  // SHOPEE
  set('cardShopeeArquivo', resumo.shopee.totalArquivo);
  set('cardShopeeCasados', resumo.shopee.totalCasados);
  set('cardShopeePendentes', resumo.shopee.totalPendentes);
  set('cardShopeeEsgotados', resumo.shopee.totalEsgotados);
  set('cardShopeeVariacoes', resumo.shopee.totalVariacoes);
  set('cardShopeeDuplicados', resumo.shopee.totalDuplicados);

  // TIKTOK
  set('cardTikTokArquivo', resumo.tiktok.totalArquivo);
  set('cardTikTokCasados', resumo.tiktok.totalCasados);
  set('cardTikTokPendentes', resumo.tiktok.totalPendentes);
  set('cardTikTokEsgotados', resumo.tiktok.totalEsgotados);
  set('cardTikTokVariacoes', resumo.tiktok.totalVariacoes);
  set('cardTikTokDuplicados', resumo.tiktok.totalDuplicados);

  ativarTabs();
  carregarTabela('ml-pendentes');
}

function set(id, valor) {
  document.getElementById(id).innerText = valor || 0;
}

// =====================
// TABS
// =====================
function ativarTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const tipo = btn.dataset.tab;
      carregarTabela(tipo);
    });
  });
}

// =====================
// MAPA DE ARQUIVOS
// =====================
const MAPA = {
  'ml-pendentes': 'data/corrigir-ml.json',
  'ml-esgotados': 'data/esgotados-ml.json',
  'ml-variacoes': 'data/variacoes-ml.json',
  'ml-duplicados': 'data/duplicados-ml.json',

  'shopee-pendentes': 'data/corrigir-shopee.json',
  'shopee-esgotados': 'data/esgotados-shopee.json',
  'shopee-variacoes': 'data/variacoes-shopee.json',
  'shopee-duplicados': 'data/duplicados-shopee.json',

  'tiktok-pendentes': 'data/corrigir-tiktok.json',
  'tiktok-esgotados': 'data/esgotados-tiktok.json',
  'tiktok-variacoes': 'data/variacoes-tiktok.json',
  'tiktok-duplicados': 'data/duplicados-tiktok.json'
};

// =====================
// TABELA
// =====================
async function carregarTabela(tipo) {
  const url = MAPA[tipo];
  const dados = await fetch(url).then(r => r.json());

  const tbody = document.getElementById('tbodyConferencia');
  const titulo = document.getElementById('tituloTabela');

  tbody.innerHTML = '';
  titulo.innerText = tipo.replace('-', ' ').toUpperCase();

  if (!dados.length) {
    tbody.innerHTML = `<tr><td colspan="8">Sem dados</td></tr>`;
    return;
  }

  dados.forEach((item, i) => {
    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td>${item.linhaExcel || i + 1}</td>
      <td>${item.marketplace}</td>
      <td>${item.skuOriginal}</td>
      <td>${item.skuTratado}</td>
      <td>${item.nome || '-'}</td>
      <td>${item.preco || '-'}</td>
      <td>${item.estoque || '-'}</td>
      <td>${item.motivo}</td>
    `;

    tbody.appendChild(tr);
  });
}

// =====================
// FILTROS
// =====================
document.getElementById('filtroSku')?.addEventListener('input', filtrar);
document.getElementById('filtroNome')?.addEventListener('input', filtrar);

function filtrar() {
  const sku = document.getElementById('filtroSku').value.toLowerCase();
  const nome = document.getElementById('filtroNome').value.toLowerCase();

  document.querySelectorAll('#tbodyConferencia tr').forEach(tr => {
    const texto = tr.innerText.toLowerCase();
    tr.style.display =
      texto.includes(sku) && texto.includes(nome) ? '' : 'none';
  });
}

// =====================
// INIT
// =====================
init();