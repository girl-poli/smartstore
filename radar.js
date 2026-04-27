document.addEventListener('DOMContentLoaded', () => {
  const $ = (id) => document.getElementById(id);

  let produtos = [];
  let vendas = [];

  function numero(valor) {
    if (valor === null || valor === undefined || valor === '') return 0;
    if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;

    let texto = String(valor).replace(/BRL|R\$/gi, '').replace(/\s+/g, '').trim();
    if (!texto) return 0;

    if (texto.includes('.') && texto.includes(',')) texto = texto.replace(/\./g, '').replace(',', '.');
    else if (texto.includes(',')) texto = texto.replace(',', '.');

    const n = Number(texto);
    return Number.isFinite(n) ? n : 0;
  }

  function moeda(valor) {
    const n = numero(valor);
    if (!n) return '-';
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function mult(valor) {
    const n = Number(valor || 0);
    if (!Number.isFinite(n)) return '0,00x';
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + 'x';
  }

  function normalizarTexto(valor) {
    return String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  function skuBase(valor) {
    return String(valor || '')
      .trim()
      .replace(/_var_[a-z0-9]+$/i, '')
      .replace(/\s*[-_]?\s*var\s*[a-z0-9]+$/i, '')
      .replace(/\s*[-_]?\s*v\s*\d+$/i, '')
      .toUpperCase();
  }

  function temPreco(valor) {
    return numero(valor) > 0;
  }

  function markupPreco(preco, custo) {
    const p = numero(preco);
    const c = numero(custo);
    if (!p || !c) return 0;
    return p / c;
  }

  function menorMarkupProduto(p) {
    const markups = [
      markupPreco(p.ml, p.custo),
      markupPreco(p.shopee, p.custo),
      markupPreco(p.tiktok, p.custo)
    ].filter(v => v > 0);

    return markups.length ? Math.min(...markups) : 0;
  }

  function farolProduto(p) {
    const menor = menorMarkupProduto(p);

    if (!menor) return { texto: 'S/P', classe: 'cinza', nivel: 'cinza' };
    if (menor < 2) return { texto: '<2x', classe: 'vermelho', nivel: 'vermelho' };
    if (menor < 3) return { texto: '<3x', classe: 'amarelo', nivel: 'amarelo' };
    return { texto: '≥3x', classe: 'verde', nivel: 'verde' };
  }

  function obterSkuVenda(item) {
    return item?.sku || item?.SKU || item?.seller_sku || item?.codigo_sku || item?.produto_sku || item?.sky || item?.SKY || '';
  }

  function obterCanalVenda(item) {
    const bruto = item?.canal_normalizado || item?.canal || item?.marketplace || item?.plataforma || item?.loja || '';
    const txt = normalizarTexto(bruto).replace(/[^a-z0-9]/g, '');

    if (txt === 'ml' || txt.includes('mercadolivre') || txt.includes('smartml')) return 'ml';
    if (txt.includes('shopee')) return 'shopee';
    if (txt.includes('tiktok') || txt === 'tt') return 'tiktok';
    return 'outros';
  }

  function obterQuantidadeVenda(item) {
    const qtd = numero(item?.quantidade || item?.qtd || item?.qty || item?.quantity || item?.itens || item?.unidades || 1);
    return qtd > 0 ? qtd : 1;
  }

  function obterValorVenda(item) {
    const campos = ['preco_venda_normalizado','preco_venda','valor_venda','valor','total','valor_total','gross_amount','order_amount','amount','paid_amount','sale_amount'];
    for (const c of campos) {
      const v = numero(item?.[c]);
      if (v > 0) return v;
    }
    return 0;
  }

  function vendaEhCancelada(item) {
    const st = normalizarTexto(item?.status_harmonizado || item?.status_final || item?.status || item?.status_original || '');
    return st.includes('cancelado') || st.includes('cancelada');
  }

  async function carregarJson(path) {
    const resp = await fetch(path + '?v=' + Date.now());
    if (!resp.ok) throw new Error('Arquivo não encontrado: ' + path);
    return await resp.json();
  }

  function enriquecerProdutosComVendas() {
    const mapaVendas = new Map();

    (Array.isArray(vendas) ? vendas : [])
      .filter(v => !vendaEhCancelada(v))
      .forEach(v => {
        const sku = skuBase(obterSkuVenda(v));
        if (!sku) return;

        if (!mapaVendas.has(sku)) {
          mapaVendas.set(sku, {
            total: 0,
            faturamento: 0,
            ml: { qtd: 0, faturamento: 0 },
            shopee: { qtd: 0, faturamento: 0 },
            tiktok: { qtd: 0, faturamento: 0 }
          });
        }

        const item = mapaVendas.get(sku);
        const qtd = obterQuantidadeVenda(v);
        const valor = obterValorVenda(v);
        const canal = obterCanalVenda(v);

        item.total += qtd;
        item.faturamento += valor;

        if (canal === 'ml' || canal === 'shopee' || canal === 'tiktok') {
          item[canal].qtd += qtd;
          item[canal].faturamento += valor;
        }
      });

    produtos = produtos.map(p => {
      const sku = skuBase(p.sku || p.skuBase || p.SKU || p.sky || '');
      const vend = mapaVendas.get(sku) || {
        total: 0,
        faturamento: 0,
        ml: { qtd: 0, faturamento: 0 },
        shopee: { qtd: 0, faturamento: 0 },
        tiktok: { qtd: 0, faturamento: 0 }
      };

      return {
        ...p,
        sku,
        vendasQtd: vend.total,
        faturamentoVendas: vend.faturamento,
        vendasML: vend.ml.qtd,
        vendasShopee: vend.shopee.qtd,
        vendasTikTok: vend.tiktok.qtd
      };
    });
  }

  function classeCard(p) {
    return farolProduto(p).classe;
  }

  function filtrar() {
    const busca = normalizarTexto($('busca')?.value || '');
    const venda = $('filtroVenda')?.value || 'todos';
    const farol = $('filtroMargem')?.value || 'todos';

    return produtos.filter(p => {
      const matchBusca =
        normalizarTexto(p.sku || p.skuBase).includes(busca) ||
        normalizarTexto(p.nome).includes(busca);

      const vendeu = Number(p.vendasQtd || 0) > 0;

      const matchVenda =
        venda === 'todos' ||
        (venda === 'comVenda' && vendeu) ||
        (venda === 'semVenda' && !vendeu);

      const matchFarol =
        farol === 'todos' ||
        farolProduto(p).nivel === farol;

      return matchBusca && matchVenda && matchFarol;
    });
  }

  function renderCard(p) {
    const farol = farolProduto(p);
    const total = Number(p.vendasQtd || 0);
    const mk = menorMarkupProduto(p);
    const textoMarkup = mk ? mult(mk) : 'S/P';

    const el = document.createElement('article');
    el.className = 'product-card';
    el.innerHTML = `
      <div class="product-top">
        <div class="product-sku">${p.sku || p.skuBase || '-'}</div>
        <div class="product-name">${p.nome || '-'}</div>
      </div>

      <div class="product-middle ${classeCard(p)}">
        <span>${total}</span><span>|</span><span>${textoMarkup}</span>
      </div>

      <div class="product-bottom">
        <div class="market ${p.vendasML > 0 ? 'vendeu' : 'nao-vendeu'}">ML</div>
        <div class="market ${p.vendasShopee > 0 ? 'vendeu' : 'nao-vendeu'}">Shopee</div>
        <div class="market ${p.vendasTikTok > 0 ? 'vendeu' : 'nao-vendeu'}">TikTok</div>
      </div>
    `;

    el.addEventListener('click', () => abrirModal(p));
    return el;
  }

  function render() {
    const lista = filtrar();
    const grid = $('radarGrid');
    grid.innerHTML = '';
    lista.forEach(p => grid.appendChild(renderCard(p)));

    $('emptyState').style.display = lista.length ? 'none' : 'block';

    const comVenda = lista.filter(p => Number(p.vendasQtd || 0) > 0).length;
    const semVenda = lista.length - comVenda;
    const markups = lista.map(menorMarkupProduto).filter(v => v > 0);
    const mediaMarkup = markups.length ? markups.reduce((a,b)=>a+b,0) / markups.length : 0;

    $('kpiTotal').textContent = lista.length;
    $('kpiComVenda').textContent = comVenda;
    $('kpiSemVenda').textContent = semVenda;
    $('kpiMargem').textContent = mult(mediaMarkup);
    $('badgeFonteRadar').textContent = `${produtos.length} produtos base`;
  }

  function abrirModal(p) {
    const mkML = markupPreco(p.ml, p.custo);
    const mkShopee = markupPreco(p.shopee, p.custo);
    const mkTikTok = markupPreco(p.tiktok, p.custo);

    $('modalSku').textContent = p.sku || p.skuBase || '-';
    $('modalNome').textContent = p.nome || '-';

    $('modalResumo').innerHTML = `
      <div><strong>Custo</strong><br>${moeda(p.custo)}</div>
      <div><strong>Total vendido</strong><br>${Number(p.vendasQtd || 0).toLocaleString('pt-BR')}</div>
      <div><strong>ML</strong><br>Preço: ${moeda(p.ml)}<br>Markup: ${mkML ? mult(mkML) : '-'}<br>Vendas: ${p.vendasML || 0}</div>
      <div><strong>Shopee</strong><br>Preço: ${moeda(p.shopee)}<br>Markup: ${mkShopee ? mult(mkShopee) : '-'}<br>Vendas: ${p.vendasShopee || 0}</div>
      <div><strong>TikTok</strong><br>Preço: ${moeda(p.tiktok)}<br>Markup: ${mkTikTok ? mult(mkTikTok) : '-'}<br>Vendas: ${p.vendasTikTok || 0}</div>
      <div><strong>Faturamento vendas</strong><br>${moeda(p.faturamentoVendas)}</div>
    `;

    $('modal').classList.remove('hidden');
  }

  function setAuditoria(linhas) {
    $('radarAuditoriaSidebar').innerHTML = linhas.map(l => `<div>• ${l}</div>`).join('');
  }

  async function init() {
    const auditoria = [];

    try {
      produtos = await carregarJson('data/produtos.json');
      auditoria.push(`Produtos: ${Array.isArray(produtos) ? produtos.length : 0} registros em data/produtos.json`);
    } catch (e) {
      produtos = [];
      auditoria.push('Erro ao ler data/produtos.json');
      console.error(e);
    }

    try {
      vendas = await carregarJson('data/vendas.json');
      auditoria.push(`Vendas: ${Array.isArray(vendas) ? vendas.length : 0} registros em data/vendas.json`);
    } catch (e) {
      vendas = [];
      auditoria.push('Erro ao ler data/vendas.json');
      console.error(e);
    }

    enriquecerProdutosComVendas();
    setAuditoria(auditoria);
    render();
  }

  $('fecharModal')?.addEventListener('click', () => $('modal').classList.add('hidden'));
  $('modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal') $('modal').classList.add('hidden');
  });

  $('btnLimparRadar')?.addEventListener('click', () => {
    $('busca').value = '';
    $('filtroVenda').value = 'todos';
    $('filtroMargem').value = 'todos';
    render();
  });

  ['busca', 'filtroVenda', 'filtroMargem'].forEach(id => {
    $(id)?.addEventListener('input', render);
    $(id)?.addEventListener('change', render);
  });

  init();
});
