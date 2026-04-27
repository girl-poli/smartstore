document.addEventListener('DOMContentLoaded', () => {
  const $ = (id) => document.getElementById(id);

  const tbody = $('tbodyProdutos');
  const auditoria = $('auditoriaResumo');

  const filtroSku = $('filtroSku');
  const filtroNome = $('filtroNome');
  const filtroCanal = $('filtroCanal');
  const filtroFarol = $('filtroFarol');
  const organizarPor = $('organizarPor');
  const btnLimparFiltros = $('btnLimparFiltros');
  const btnProcessar = $('btnProcessar');
  const btnExportar = $('btnExportar');

  let produtos = [];
  let vendas = [];
  let resumo = null;
  let tabRapida = 'todos';
  let decisaoAtiva = 'todos';

  function setText(id, valor) {
    const el = $(id);
    if (el) el.textContent = valor;
  }

  function numero(valor) {
    if (valor === null || valor === undefined || valor === '') return 0;
    if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;

    let texto = String(valor)
      .replace(/BRL|R\$/gi, '')
      .replace(/\s+/g, '')
      .trim();

    if (!texto) return 0;

    if (texto.includes('.') && texto.includes(',')) {
      texto = texto.replace(/\./g, '').replace(',', '.');
    } else if (texto.includes(',')) {
      texto = texto.replace(',', '.');
    }

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
    return String(valor || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
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

  function precosProduto(p) {
    return [numero(p.ml), numero(p.shopee), numero(p.tiktok)].filter(v => v > 0);
  }

  function menorPreco(p) {
    const precos = precosProduto(p);
    return precos.length ? Math.min(...precos) : 0;
  }

  function maiorPreco(p) {
    const precos = precosProduto(p);
    return precos.length ? Math.max(...precos) : 0;
  }

  function media(lista) {
    const validos = lista.map(numero).filter(v => v > 0);
    return validos.length ? validos.reduce((a, b) => a + b, 0) / validos.length : 0;
  }

  function mediaMarkup(lista, campo) {
    const valores = lista
      .map(p => {
        const custo = numero(p.custo);
        const preco = numero(p[campo]);
        return custo > 0 && preco > 0 ? preco / custo : 0;
      })
      .filter(v => v > 0);

    return valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : 0;
  }

  function pctPreco(preco, custo) {
    const p = numero(preco);
    const c = numero(custo);
    if (!p || !c) return '-';
    return mult(p / c);
  }


  function precoMinimo3x(p) {
    return numero(p.custo) * 3;
  }

  function markupPreco(preco, custo) {
    const p = numero(preco);
    const c = numero(custo);
    if (!p || !c) return 0;
    return p / c;
  }

  function classePrecoFarol(preco, custo) {
    const m = markupPreco(preco, custo);
    if (!m) return '';
    if (m < 2) return 'preco-critico-2 preco-abaixo-2';
    if (m < 3) return 'preco-alerta-3 preco-abaixo-3';
    return 'preco-ok-3';
  }

  function farolProduto(p) {
    const markups = [
      markupPreco(p.ml, p.custo),
      markupPreco(p.shopee, p.custo),
      markupPreco(p.tiktok, p.custo)
    ].filter(v => v > 0);

    if (!markups.length) {
      return { texto: 'Sem preço', classe: 'farol-vermelho farol-critico', nivel: 'sem_preco' };
    }

    const menor = Math.min(...markups);

    if (menor < 2) {
      return { texto: 'Crítico <2x', classe: 'farol-vermelho farol-critico', nivel: 'critico' };
    }

    if (menor < 3) {
      return { texto: 'Alerta <3x', classe: 'farol-amarelo farol-alerta', nivel: 'alerta' };
    }

    return { texto: 'OK ≥3x', classe: 'farol-verde farol-ok', nivel: 'ok' };
  }

  function statusProduto(p) {
    const ml = temPreco(p.ml);
    const shopee = temPreco(p.shopee);
    const tiktok = temPreco(p.tiktok);

    if (ml && shopee && tiktok) return { texto: 'Completo', classe: 'status-completo' };
    if (!ml && !shopee && !tiktok) return { texto: 'Sem MKT', classe: 'status-sem-mkt' };
    return { texto: 'Parcial', classe: 'status-parcial' };
  }

  function classeCard(id, classe) {
    const card = $(id)?.closest('.mini-card');
    if (!card) return;
    card.classList.remove('bi-ok', 'bi-alerta', 'bi-ruim');
    if (classe) card.classList.add(classe);
  }


  function produtoTemVenda(p) {
    const chave = skuBase(p.sku || p.skuBase || '');
    if (!chave) return false;

    return (Array.isArray(vendas) ? vendas : []).some(v => {
      const skuVenda = skuBase(obterSkuVenda(v));
      if (skuVenda !== chave) return false;
      return !vendaEhCanceladaRanking(v);
    });
  }

  function acaoDecisaoProduto(p) {
    const farol = farolProduto(p);
    const vendeu = produtoTemVenda(p);
    const status = statusProduto(p).texto;

    if (vendeu && farol.nivel === 'critico') {
      return { nivel: 'urgente', texto: 'Aumentar preço urgente' };
    }

    if (farol.nivel === 'alerta') {
      return { nivel: 'revisar', texto: 'Revisar margem' };
    }

    if (farol.nivel === 'sem_preco') {
      return { nivel: 'sem_preco', texto: 'Cadastrar preço' };
    }

    if (vendeu && farol.nivel === 'ok') {
      return { nivel: 'oportunidade', texto: 'Manter e escalar' };
    }

    if (!vendeu) {
      return { nivel: 'sem_venda', texto: status === 'Completo' ? 'Avaliar demanda' : 'Publicar/completar canais' };
    }

    return { nivel: 'todos', texto: 'Monitorar' };
  }

  function pctDecisao(parte, total) {
    if (!total) return '0%';
    return ((parte / total) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
  }

  function atualizarPainelDecisao() {
    const base = Array.isArray(produtos) ? produtos : [];

    const cont = {
      todos: base.length,
      urgente: 0,
      revisar: 0,
      oportunidade: 0,
      sem_preco: 0,
      sem_venda: 0
    };

    base.forEach(p => {
      const acao = acaoDecisaoProduto(p);
      if (cont[acao.nivel] !== undefined) cont[acao.nivel]++;
    });

    setText('decisaoTodos', cont.todos);
    setText('decisaoUrgente', cont.urgente);
    setText('decisaoRevisar', cont.revisar);
    setText('decisaoOportunidade', cont.oportunidade);
    setText('decisaoSemPreco', cont.sem_preco);
    setText('decisaoSemVenda', cont.sem_venda);

    setText('decisaoTodosPct', '100%');
    setText('decisaoUrgentePct', pctDecisao(cont.urgente, cont.todos));
    setText('decisaoRevisarPct', pctDecisao(cont.revisar, cont.todos));
    setText('decisaoOportunidadePct', pctDecisao(cont.oportunidade, cont.todos));
    setText('decisaoSemPrecoPct', pctDecisao(cont.sem_preco, cont.todos));
    setText('decisaoSemVendaPct', pctDecisao(cont.sem_venda, cont.todos));

    setText('decisaoResumo', `Urgentes: ${cont.urgente} | Revisar: ${cont.revisar} | Sem preço: ${cont.sem_preco}`);
  }

  function aplicarFiltros() {
    let lista = [...produtos];

    const sku = normalizarTexto(filtroSku?.value || '');
    const nome = normalizarTexto(filtroNome?.value || '');
    const canal = filtroCanal?.value || 'todos';

    if (sku) {
      lista = lista.filter(p => normalizarTexto(p.sku || p.skuBase).includes(sku));
    }

    if (nome) {
      lista = lista.filter(p => normalizarTexto(p.nome).includes(nome));
    }

    if (canal === 'ml') lista = lista.filter(p => temPreco(p.ml));
    if (canal === 'shopee') lista = lista.filter(p => temPreco(p.shopee));
    if (canal === 'tiktok') lista = lista.filter(p => temPreco(p.tiktok));
    if (canal === 'todos_canais') lista = lista.filter(p => temPreco(p.ml) && temPreco(p.shopee) && temPreco(p.tiktok));
    if (canal === 'sem_mkt') lista = lista.filter(p => !temPreco(p.ml) && !temPreco(p.shopee) && !temPreco(p.tiktok));

    if (tabRapida === 'sem_mkt') lista = lista.filter(p => !temPreco(p.ml) && !temPreco(p.shopee) && !temPreco(p.tiktok));
    if (tabRapida === 'todos_canais') lista = lista.filter(p => temPreco(p.ml) && temPreco(p.shopee) && temPreco(p.tiktok));
    if (tabRapida === 'pendencias') lista = lista.filter(p => {
      const status = statusProduto(p).texto;
      return status !== 'Completo';
    });

    const farolFiltro = filtroFarol?.value || 'todos';

    if (farolFiltro !== 'todos') {
      lista = lista.filter(p => farolProduto(p).nivel === farolFiltro);
    }

    if (decisaoAtiva && decisaoAtiva !== 'todos') {
      lista = lista.filter(p => acaoDecisaoProduto(p).nivel === decisaoAtiva);
    }

    const ordem = organizarPor?.value || 'nome_asc';

    lista.sort((a, b) => {
      if (ordem === 'nome_asc') return String(a.nome || '').localeCompare(String(b.nome || ''));
      if (ordem === 'nome_desc') return String(b.nome || '').localeCompare(String(a.nome || ''));
      if (ordem === 'sku_asc') return String(a.sku || '').localeCompare(String(b.sku || ''));
      if (ordem === 'sku_desc') return String(b.sku || '').localeCompare(String(a.sku || ''));
      if (ordem === 'custo_desc') return numero(b.custo) - numero(a.custo);
      if (ordem === 'custo_asc') return numero(a.custo) - numero(b.custo);
      if (ordem === 'preco_desc') return maiorPreco(b) - maiorPreco(a);
      if (ordem === 'preco_asc') return maiorPreco(a) - maiorPreco(b);
      return 0;
    });

    return lista;
  }

  function faixaMarkupProduto(p) {
    const markups = [
      markupPreco(p.ml, p.custo),
      markupPreco(p.shopee, p.custo),
      markupPreco(p.tiktok, p.custo)
    ].filter(v => v > 0);

    if (!markups.length) return 'sem_preco';

    const menor = Math.min(...markups);

    if (menor < 2) return 'ate2';
    if (menor < 2.5) return 'ate25';
    if (menor < 3) return 'ate3';
    return 'maior3';
  }

  function percentual(parte, total) {
    if (!total) return '0%';
    return ((parte / total) * 100).toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }) + '%';
  }

  function atualizarDiretoria({ ate2, ate25, ate3, maior3, totalComPreco }) {
    const riscoCard = $('cardRiscoDiretoria');
    const criticos = ate2 + ate25 + ate3;
    const pctCritico = totalComPreco ? (criticos / totalComPreco) * 100 : 0;

    let risco = 'BAIXO';
    let classe = 'risco-baixo';
    let descricao = 'A maior parte dos produtos está acima da política mínima de 3x.';

    if (pctCritico >= 40) {
      risco = 'ALTO';
      classe = 'risco-alto';
      descricao = 'Muitos produtos estão abaixo de 3x. Priorize revisão de preço.';
    } else if (pctCritico >= 15) {
      risco = 'MÉDIO';
      classe = 'risco-medio';
      descricao = 'Existe volume relevante abaixo da política mínima. Revisar antes de campanhas.';
    }

    setText('kpiRiscoPricing', risco);
    setText('kpiRiscoDescricao', `${descricao} Produtos em risco: ${criticos} de ${totalComPreco}.`);

    if (riscoCard) {
      riscoCard.classList.remove('risco-baixo', 'risco-medio', 'risco-alto');
      riscoCard.classList.add(classe);
    }

    setText('pctAte2', `Até 2x: ${percentual(ate2, totalComPreco)}`);
    setText('pctAte25', `Até 2,5x: ${percentual(ate25, totalComPreco)}`);
    setText('pctAte3', `Até 3x: ${percentual(ate3, totalComPreco)}`);
    setText('pctMaior3', `> 3x: ${percentual(maior3, totalComPreco)}`);

    const barra = $('barraMarkup');
    if (barra) {
      const spans = barra.querySelectorAll('span');
      const valores = [ate2, ate25, ate3, maior3];
      valores.forEach((v, i) => {
        if (spans[i]) spans[i].style.width = percentual(v, totalComPreco);
      });
    }

    if (ate2 > 0) {
      setText('kpiAcaoRecomendada', 'Corrigir críticos');
      setText('kpiAcaoDescricao', `${ate2} produto(s) abaixo de 2x. Prioridade máxima.`);
    } else if (ate25 + ate3 > 0) {
      setText('kpiAcaoRecomendada', 'Revisar margem');
      setText('kpiAcaoDescricao', `${ate25 + ate3} produto(s) abaixo de 3x. Ajustar preço antes de escalar venda.`);
    } else {
      setText('kpiAcaoRecomendada', 'Manter estratégia');
      setText('kpiAcaoDescricao', 'Todos os produtos com preço cadastrado estão acima de 3x.');
    }
  }


  function dadosMarketplacePricing() {
    const mercados = [
      { chave: 'ml', nome: 'ML' },
      { chave: 'shopee', nome: 'Shopee' },
      { chave: 'tiktok', nome: 'TikTok' }
    ];

    return mercados.map(m => {
      const cont = { nome: m.nome, ate2: 0, ate25: 0, ate3: 0, maior3: 0, total: 0 };

      produtos.forEach(p => {
        const mk = markupPreco(p[m.chave], p.custo);
        if (!mk) return;
        cont.total++;
        if (mk < 2) cont.ate2++;
        else if (mk < 2.5) cont.ate25++;
        else if (mk < 3) cont.ate3++;
        else cont.maior3++;
      });

      cont.risco = cont.ate2 + cont.ate25 + cont.ate3;
      cont.pctAte2 = cont.total ? (cont.ate2 / cont.total) * 100 : 0;
      cont.pctAte25 = cont.total ? (cont.ate25 / cont.total) * 100 : 0;
      cont.pctAte3 = cont.total ? (cont.ate3 / cont.total) * 100 : 0;
      cont.pctMaior3 = cont.total ? (cont.maior3 / cont.total) * 100 : 0;
      cont.pctRisco = cont.total ? (cont.risco / cont.total) * 100 : 0;
      return cont;
    });
  }

  function formatPctNumero(valor) {
    return Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
  }

  function larguraPct(valor) {
    const n = Number(valor || 0);
    if (!Number.isFinite(n) || n <= 0) return '0%';
    return Math.max(0, Math.min(100, n)).toFixed(4) + '%';
  }

  function atualizarReguaPricing() {
    const dados = dadosMarketplacePricing().sort((a, b) => b.pctRisco - a.pctRisco);
    const pior = dados[0];
    const regua = $('reguaPricingMarketplaces');
    const lista = $('radarListaMarketplaces');

    if (!pior || !pior.total) {
      setText('radarInsightPrincipal', 'Ainda não há preços suficientes para calcular a régua.');
      if (regua) regua.innerHTML = '';
      if (lista) lista.innerHTML = '';
      return;
    }

    setText('radarInsightPrincipal', `🔥 Marketplace mais crítico: ${pior.nome} (${formatPctNumero(pior.pctRisco)} abaixo de 3x).`);

    if (regua) {
      regua.innerHTML = dados.map(d => `
        <div class="regua-market-item">
          <div class="regua-market-top">
            <div>
              <div class="regua-market-name">${d.nome}</div>
              <div class="pricing-sub" style="margin:3px 0 0;">${d.risco} de ${d.total} produtos abaixo de 3x</div>
            </div>
            <div class="regua-market-risk">${formatPctNumero(d.pctRisco)}<small>em risco</small></div>
          </div>
          <div class="regua-bar" title="${d.nome}: ${formatPctNumero(d.pctRisco)} em risco">
            <span class="regua-seg regua-seg-ate2" style="width:${larguraPct(d.pctAte2)}"></span>
            <span class="regua-seg regua-seg-ate25" style="width:${larguraPct(d.pctAte25)}"></span>
            <span class="regua-seg regua-seg-ate3" style="width:${larguraPct(d.pctAte3)}"></span>
            <span class="regua-seg regua-seg-maior3" style="width:${larguraPct(d.pctMaior3)}"></span>
          </div>
          <div class="regua-numeros">
            <div class="regua-num"><strong>${d.ate2}</strong><span>Até 2x</span></div>
            <div class="regua-num"><strong>${d.ate25}</strong><span>2x até 2,5x</span></div>
            <div class="regua-num"><strong>${d.ate3}</strong><span>2,5x até 3x</span></div>
            <div class="regua-num"><strong>${d.maior3}</strong><span>Maior que 3x</span></div>
          </div>
        </div>
      `).join('');
    }

    if (lista) {
      lista.innerHTML = dados.map(d => `
        <div class="market-critical-item">
          <div class="market-critical-top"><span>${d.nome}</span><span>${formatPctNumero(d.pctRisco)} em risco</span></div>
          <div class="pricing-sub" style="margin:6px 0 0;">Até 2x: ${d.ate2} · Até 2,5x: ${d.ate25} · Até 3x: ${d.ate3} · >3x: ${d.maior3}</div>
          <div class="market-critical-bar"><span style="width:${larguraPct(d.pctRisco)}"></span></div>
        </div>
      `).join('');
    }
  }

  function atualizarCards() {
    const base = produtos;
    const totalBase = base.length;
    const comML = base.filter(p => temPreco(p.ml)).length;
    const comShopee = base.filter(p => temPreco(p.shopee)).length;
    const comTikTok = base.filter(p => temPreco(p.tiktok)).length;
    const todosCanais = base.filter(p => temPreco(p.ml) && temPreco(p.shopee) && temPreco(p.tiktok)).length;
    const semMkt = base.filter(p => !temPreco(p.ml) && !temPreco(p.shopee) && !temPreco(p.tiktok)).length;

    let ate2 = 0;
    let ate25 = 0;
    let ate3 = 0;
    let maior3 = 0;
    let semPreco = 0;

    base.forEach(p => {
      const faixa = faixaMarkupProduto(p);
      if (faixa === 'ate2') ate2++;
      else if (faixa === 'ate25') ate25++;
      else if (faixa === 'ate3') ate3++;
      else if (faixa === 'maior3') maior3++;
      else semPreco++;
    });

    const totalComPreco = ate2 + ate25 + ate3 + maior3;

    const mediaCusto = media(base.map(p => p.custo));
    const mediaPreco = media(base.map(p => maiorPreco(p)).filter(v => v > 0));
    const mediaGeralMarkup = mediaCusto > 0 && mediaPreco > 0 ? mediaPreco / mediaCusto : 0;

    setText('cardTotalBase', totalBase);
    setText('cardTotalML', comML);
    setText('cardTotalShopee', comShopee);
    setText('cardTotalTikTok', comTikTok);
    setText('cardTodosCanais', todosCanais);
    setText('cardSemNenhumMkt', semMkt);

    setText('cardAte2', ate2);
    setText('cardAte25', ate25);
    setText('cardAte3', ate3);
    setText('cardMaior3', maior3);

    setText('cardMediaML', mult(mediaMarkup(base, 'ml')));
    setText('cardMediaShopee', mult(mediaMarkup(base, 'shopee')));
    setText('cardMediaTikTok', mult(mediaMarkup(base, 'tiktok')));

    setText('cardMediaCusto', moeda(mediaCusto));
    setText('cardMediaPreco', moeda(mediaPreco));
    setText('cardMediaPercentual', mult(mediaGeralMarkup));

    classeCard('cardTodosCanais', todosCanais > 0 ? 'bi-ok' : 'bi-alerta');
    classeCard('cardSemNenhumMkt', semMkt > 0 ? 'bi-ruim' : 'bi-ok');
    classeCard('cardAte2', ate2 > 0 ? 'bi-ruim' : 'bi-ok');
    classeCard('cardAte25', ate25 > 0 ? 'bi-alerta' : 'bi-ok');
    classeCard('cardAte3', ate3 > 0 ? 'bi-alerta' : 'bi-ok');
    classeCard('cardMaior3', maior3 > 0 ? 'bi-ok' : 'bi-alerta');

    atualizarDiretoria({ ate2, ate25, ate3, maior3, semPreco, totalComPreco });
    atualizarPainelDecisao();
  }

  function renderTabela() {
    const lista = aplicarFiltros();

    if (!tbody) return;

    if (!lista.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="15" style="text-align:center; padding:18px;">
            Nenhum produto encontrado.
          </td>
        </tr>
      `;
      setText('resultadoResumo', '0 item(ns)');
      return;
    }

    tbody.innerHTML = lista.map(p => {
      const menor = menorPreco(p);
      const maior = maiorPreco(p);
      const status = statusProduto(p);

      const farol = farolProduto(p);
      const precoMinimo = precoMinimo3x(p);

      return `
        <tr class="${'linha-decisao-' + acaoDecisaoProduto(p).nivel + ' ' + (farol.nivel === 'critico' || farol.nivel === 'sem_preco' ? 'linha-farol-critico' : farol.nivel === 'alerta' ? 'linha-farol-alerta' : '')}">
          <td>${p.sku || p.skuBase || '-'}</td>
          <td>${p.nome || '-'}</td>
          <td>${moeda(p.custo)}</td>
          <td>${moeda(precoMinimo)}</td>
          <td class="${classePrecoFarol(p.ml, p.custo)}">${moeda(p.ml)}</td>
          <td class="${classePrecoFarol(p.shopee, p.custo)}">${moeda(p.shopee)}</td>
          <td class="${classePrecoFarol(p.tiktok, p.custo)}">${moeda(p.tiktok)}</td>
          <td>${moeda(menor)}</td>
          <td>${moeda(maior)}</td>
          <td>${pctPreco(p.ml, p.custo)}</td>
          <td>${pctPreco(p.shopee, p.custo)}</td>
          <td>${pctPreco(p.tiktok, p.custo)}</td>
          <td><span class="farol-preco ${farol.classe}">${farol.texto}</span></td>
          <td><span class="status-produto ${status.classe}">${status.texto}</span></td>
          <td class="acao-cell">${acaoDecisaoProduto(p).texto}</td>
        </tr>
      `;
    }).join('');

    setText('resultadoResumo', `${lista.length} item(ns)`);
  }

  function renderAuditoria() {
    const base = produtos;
    const totalBase = base.length;
    const comML = base.filter(p => temPreco(p.ml)).length;
    const comShopee = base.filter(p => temPreco(p.shopee)).length;
    const comTikTok = base.filter(p => temPreco(p.tiktok)).length;
    const todosCanais = base.filter(p => temPreco(p.ml) && temPreco(p.shopee) && temPreco(p.tiktok)).length;
    const semMkt = base.filter(p => !temPreco(p.ml) && !temPreco(p.shopee) && !temPreco(p.tiktok)).length;

    const linhas = [
      'AUDITORIA DE PRODUTOS',
      '======================',
      `Produtos carregados em data/produtos.json: ${totalBase}`,
      `Produtos com ML: ${comML}`,
      `Produtos com Shopee: ${comShopee}`,
      `Produtos com TikTok: ${comTikTok}`,
      `Em todos os canais: ${todosCanais}`,
      `Sem nenhum marketplace: ${semMkt}`,
      `Até 2x: ${base.filter(p => faixaMarkupProduto(p) === 'ate2').length}`,
      `Até 2,5x: ${base.filter(p => faixaMarkupProduto(p) === 'ate25').length}`,
      `Até 3x: ${base.filter(p => faixaMarkupProduto(p) === 'ate3').length}`,
      `Maior que 3x: ${base.filter(p => faixaMarkupProduto(p) === 'maior3').length}`,
      '',
      'Resumo gerado:',
      JSON.stringify(resumo || {}, null, 2)
    ];

    if (auditoria) auditoria.textContent = linhas.join('\n');
  }


  // =====================================================
  // RANKING ULTRA PRO: produtos vendidos + preço por MKT
  // Fonte: data/vendas.json + data/produtos.json
  // =====================================================
  function obterSkuVenda(item) {
    return item?.sku || item?.SKU || item?.seller_sku || item?.codigo_sku || item?.produto_sku || item?.sky || item?.SKY || '';
  }

  function obterNomeVenda(item) {
    return item?.nome || item?.produto || item?.nome_produto || item?.titulo || item?.title || item?.product_name || '';
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

  function obterPrecoVendaRanking(item) {
    const campos = [
      'preco_venda_normalizado', 'preco_venda', 'valor_venda', 'valor', 'total', 'valor_total',
      'gross_amount', 'order_amount', 'amount', 'paid_amount', 'sale_amount'
    ];

    for (const campo of campos) {
      const valor = numero(item?.[campo]);
      if (valor > 0) return valor;
    }
    return 0;
  }

  function vendaEhCanceladaRanking(item) {
    const st = normalizarTexto(item?.status_harmonizado || item?.status || item?.status_original || '');
    return st.includes('cancelado') || st.includes('cancelada');
  }

  function produtoPorSkuBase(sku) {
    const chave = skuBase(sku);
    return produtos.find(p => skuBase(p.sku || p.skuBase || '') === chave) || null;
  }

  function canalDominanteRanking(p) {
    const canais = [
      { chave: 'ml', nome: 'ML', qtd: p.ml.qtd },
      { chave: 'shopee', nome: 'Shopee', qtd: p.shopee.qtd },
      { chave: 'tiktok', nome: 'TikTok', qtd: p.tiktok.qtd }
    ].sort((a, b) => b.qtd - a.qtd);

    return canais[0]?.qtd > 0 ? canais[0] : { chave: '-', nome: '-', qtd: 0 };
  }

  function insightRankingProduto(p) {
    if (!p.total) return 'Sem venda';

    const dominante = canalDominanteRanking(p);
    const share = p.total ? (dominante.qtd / p.total) * 100 : 0;
    const margem = p.faturamento > 0 ? ((p.repasse - p.custoTotal) / p.faturamento) * 100 : 0;

    if (margem < 10 && p.total >= 3) return '🔥 Vende bem, margem crítica';
    if (margem < 20 && p.total >= 3) return '⚠️ Revisar margem';
    if (share >= 80 && p.total >= 3) return `⚠️ Dependência alta de ${dominante.nome}`;
    if (p.ml.qtd === 0 || p.shopee.qtd === 0 || p.tiktok.qtd === 0) return '💡 Oportunidade em canal sem venda';
    return '✅ Saudável';
  }

  function gerarRankingUltraPro() {
    const mapa = new Map();

    (Array.isArray(vendas) ? vendas : [])
      .filter(v => !vendaEhCanceladaRanking(v))
      .forEach(v => {
        const skuRaw = obterSkuVenda(v);
        const sku = skuBase(skuRaw);
        if (!sku) return;

        const canal = obterCanalVenda(v);
        const qtd = obterQuantidadeVenda(v);
        const valor = obterPrecoVendaRanking(v);
        const prod = produtoPorSkuBase(sku);
        const custoUnit = numero(prod?.custo || v?.custo || v?.custo_normalizado || 0);
        const repasseUnit = numero(v?.repasse_normalizado || v?.repasse || v?.valor_repasse || v?.receita_liquida || 0);

        if (!mapa.has(sku)) {
          mapa.set(sku, {
            sku,
            nome: prod?.nome || obterNomeVenda(v) || sku,
            total: 0,
            faturamento: 0,
            repasse: 0,
            custoTotal: 0,
            ml: { qtd: 0, faturamento: 0 },
            shopee: { qtd: 0, faturamento: 0 },
            tiktok: { qtd: 0, faturamento: 0 },
            precoML: numero(prod?.ml),
            precoShopee: numero(prod?.shopee),
            precoTikTok: numero(prod?.tiktok),
            custo: custoUnit
          });
        }

        const item = mapa.get(sku);
        item.total += qtd;
        item.faturamento += valor;
        item.repasse += repasseUnit > 0 ? repasseUnit : valor;
        item.custoTotal += custoUnit * qtd;
        if (!item.nome || item.nome === sku) item.nome = prod?.nome || obterNomeVenda(v) || sku;

        if (canal === 'ml' || canal === 'shopee' || canal === 'tiktok') {
          item[canal].qtd += qtd;
          item[canal].faturamento += valor;
        }
      });

    return Array.from(mapa.values()).map(item => {
      const dominante = canalDominanteRanking(item);
      const margem = item.faturamento > 0 ? ((item.repasse - item.custoTotal) / item.faturamento) * 100 : 0;
      const share = item.total > 0 ? (dominante.qtd / item.total) * 100 : 0;
      return {
        ...item,
        dominante,
        margem,
        share,
        insight: insightRankingProduto({ ...item, dominante, margem, share })
      };
    });
  }

  function aplicarFiltrosRanking(lista) {
    let saida = [...lista];
    const limite = $('rankingLimite')?.value || 'todos';
    const ordem = $('rankingOrdenar')?.value || 'volume_desc';
    const canal = $('rankingCanal')?.value || 'todos';
    const busca = normalizarTexto($('rankingBusca')?.value || '');

    if (busca) {
      saida = saida.filter(p => normalizarTexto(p.sku).includes(busca) || normalizarTexto(p.nome).includes(busca));
    }

    if (canal === 'ml') saida = saida.filter(p => p.ml.qtd > 0);
    if (canal === 'shopee') saida = saida.filter(p => p.shopee.qtd > 0);
    if (canal === 'tiktok') saida = saida.filter(p => p.tiktok.qtd > 0);
    if (canal === 'sem_venda_canal') saida = saida.filter(p => p.ml.qtd === 0 || p.shopee.qtd === 0 || p.tiktok.qtd === 0);

    saida.sort((a, b) => {
      if (ordem === 'faturamento_desc') return b.faturamento - a.faturamento;
      if (ordem === 'margem_asc') return a.margem - b.margem;
      if (ordem === 'dependencia_desc') return b.share - a.share;
      return b.total - a.total;
    });

    if (limite !== 'todos') saida = saida.slice(0, Number(limite));
    return saida;
  }

  function renderCanalRanking(canal, precoCatalogo) {
    return `
      <div class="ranking-canal-box">
        <b>${Number(canal.qtd || 0).toLocaleString('pt-BR')} venda(s)</b>
        <span>Catálogo: ${moeda(precoCatalogo)}</span>
        <span>Fat.: ${moeda(canal.faturamento)}</span>
      </div>
    `;
  }

  function renderRankingUltraPro() {
    const tbodyRanking = $('tbodyRankingProdutos');
    const vazio = $('rankingProdutosVazio');
    if (!tbodyRanking) return;

    const rankingBase = gerarRankingUltraPro();
    const ranking = aplicarFiltrosRanking(rankingBase);
    const totalUnidades = ranking.reduce((acc, p) => acc + Number(p.total || 0), 0);
    const faturamentoTop = ranking.reduce((acc, p) => acc + Number(p.faturamento || 0), 0);
    const lider = ranking[0];

    setText('rankingResultadoResumo', `${ranking.length} produto(s)`);
    setText('rkProdutosVendidos', ranking.length.toLocaleString('pt-BR'));
    setText('rkUnidadesVendidas', totalUnidades.toLocaleString('pt-BR'));
    setText('rkFaturamentoTop', moeda(faturamentoTop));
    setText('rkProdutoLider', lider ? `${lider.sku}` : '-');

    if (!ranking.length) {
      if (vazio) vazio.style.display = 'block';
      tbodyRanking.innerHTML = '';
      return;
    }

    if (vazio) vazio.style.display = 'none';

    tbodyRanking.innerHTML = ranking.map((p, index) => {
      const margemClasse = p.margem >= 20 ? 'status-completo' : p.margem >= 10 ? 'status-parcial' : 'status-sem-mkt';
      const shareClasse = p.share >= 80 ? 'status-sem-mkt' : p.share >= 60 ? 'status-parcial' : 'status-completo';

      return `
        <tr>
          <td><strong>#${index + 1}</strong></td>
          <td class="ranking-produto-cell"><strong>${p.nome || '-'}</strong><small>${p.sku}</small></td>
          <td><strong>${Number(p.total || 0).toLocaleString('pt-BR')}</strong></td>
          <td>${renderCanalRanking(p.ml, p.precoML)}</td>
          <td>${renderCanalRanking(p.shopee, p.precoShopee)}</td>
          <td>${renderCanalRanking(p.tiktok, p.precoTikTok)}</td>
          <td>${p.dominante.nome}</td>
          <td><span class="status-produto ${shareClasse}">${p.share.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</span></td>
          <td>${moeda(p.faturamento)}</td>
          <td><span class="status-produto ${margemClasse}">${p.margem.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</span></td>
          <td>${p.insight}</td>
        </tr>
      `;
    }).join('');
  }

  function atualizarTela() {
    atualizarCards();
    renderTabela();
    renderAuditoria();
    atualizarReguaPricing();
    renderRankingUltraPro();
  }

  async function carregarProdutos() {
    try {
      if (auditoria) auditoria.textContent = 'Carregando data/produtos.json...';

      const cache = Date.now();
      const [respProdutos, respResumo, respVendas] = await Promise.all([
        fetch('./data/produtos.json?v=' + cache),
        fetch('./data/conferencia-resumo.json?v=' + cache).catch(() => null),
        fetch('./data/vendas.json?v=' + cache).catch(() => null)
      ]);

      if (!respProdutos.ok) {
        throw new Error(`Não encontrei data/produtos.json. Rode: node gerar-produtos-json.js`);
      }

      const data = await respProdutos.json();
      produtos = Array.isArray(data) ? data : [];

      if (respResumo && respResumo.ok) {
        resumo = await respResumo.json();
      }

      if (respVendas && respVendas.ok) {
        const vendasJson = await respVendas.json();
        vendas = Array.isArray(vendasJson) ? vendasJson : [];
      } else {
        vendas = [];
      }

      console.log('[PRODUTOS BI] carregados:', produtos.length, produtos.slice(0, 3));
      console.log('[PRODUTOS BI] vendas carregadas:', vendas.length, vendas.slice(0, 3));
      atualizarTela();
    } catch (e) {
      console.error('[PRODUTOS BI] erro:', e);
      if (auditoria) {
        auditoria.textContent = `Erro ao carregar produtos: ${e.message}\n\nPasso 1: rode no terminal:\nnode gerar-produtos-json.js\n\nPasso 2: confira se existe:\ndata/produtos.json`;
      }
    }
  }

  async function processarCatalogo() {
    try {
      if (auditoria) auditoria.textContent = 'Processamento iniciado. Rode pelo terminal se o servidor não tiver rota de processamento.';
      // Mantém compatível com seu servidor, quando existir.
      await fetch('/api/processamento/processar/dropstok_mapeamento', { method: 'POST' }).catch(() => null);
      await carregarProdutos();
    } catch (e) {
      if (auditoria) auditoria.textContent = 'Não consegui processar pelo botão. Rode no terminal: node gerar-produtos-json.js';
    }
  }

  function limparFiltros() {
    if (filtroSku) filtroSku.value = '';
    if (filtroNome) filtroNome.value = '';
    if (filtroCanal) filtroCanal.value = 'todos';
    if (filtroFarol) filtroFarol.value = 'todos';
    if (organizarPor) organizarPor.value = 'nome_asc';
    tabRapida = 'todos';
    decisaoAtiva = 'todos';
    if (filtroFarol) filtroFarol.value = 'todos';
    document.querySelectorAll('.chip-decisao').forEach(btn => btn.classList.toggle('active', (btn.dataset.decisao || 'todos') === 'todos'));
    document.querySelectorAll('.tab-farol').forEach(btn => {
      btn.classList.toggle('active', (btn.dataset.farolChip || 'todos') === 'todos');
    });
  
  document.querySelectorAll('.tab-farol').forEach(btn => {
    btn.addEventListener('click', () => {
      const valor = btn.dataset.farolChip || 'todos';
      if (filtroFarol) filtroFarol.value = valor;

      document.querySelectorAll('.tab-farol').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      renderTabela();
    });
  });

  filtroFarol?.addEventListener('change', () => {
    const valor = filtroFarol.value || 'todos';
    document.querySelectorAll('.tab-farol').forEach(btn => {
      btn.classList.toggle('active', (btn.dataset.farolChip || 'todos') === valor);
    });
  });


  document.querySelectorAll('.chip-decisao').forEach(btn => {
    btn.addEventListener('click', () => {
      decisaoAtiva = btn.dataset.decisao || 'todos';
      document.querySelectorAll('.chip-decisao').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderTabela();
    });
  });

  document.querySelectorAll('.tab-filtro').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === 'todos');
    });
    renderTabela();
  }

  function exportarCsv() {
    const lista = aplicarFiltros();

    const cabecalho = [
      'SKU', 'Nome', 'Custo', 'Preço mínimo 3x', 'Preço ML', 'Preço Shopee', 'Preço TikTok',
      'Menor preço', 'Maior preço', '% ML', '% Shopee', '% TikTok', 'Farol 3x', 'Status'
    ];

    const linhas = lista.map(p => {
      const status = statusProduto(p);
      return [
        p.sku || p.skuBase || '',
        p.nome || '',
        numero(p.custo),
        precoMinimo3x(p),
        numero(p.ml),
        numero(p.shopee),
        numero(p.tiktok),
        menorPreco(p),
        maiorPreco(p),
        pctPreco(p.ml, p.custo),
        pctPreco(p.shopee, p.custo),
        pctPreco(p.tiktok, p.custo),
        farolProduto(p).texto,
        status.texto
      ];
    });

    const csv = [cabecalho, ...linhas]
      .map(row => row.map(col => `"${String(col ?? '').replace(/"/g, '""')}"`).join(';'))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.href = url;
    a.download = 'produtos-bi.csv';
    a.click();

    URL.revokeObjectURL(url);
  }



  function produtoParaCalculadora() {
    const busca = normalizarTexto($('calcBusca')?.value || '');
    if (!busca) return null;

    return produtos.find(p => {
      const sku = normalizarTexto(p.sku || p.skuBase || '');
      const skuRaiz = normalizarTexto(skuBase(p.sku || p.skuBase || ''));
      const nome = normalizarTexto(p.nome || '');
      return sku.includes(busca) || skuRaiz.includes(busca) || nome.includes(busca);
    }) || null;
  }

  function preencherCalculadoraPorProduto() {
    const produto = produtoParaCalculadora();
    if (!produto) return;

    const custo = numero(produto.custo);
    const marketplace = $('calcMarketplace')?.value || 'manual';
    let preco = 0;

    if (marketplace === 'ml') preco = numero(produto.ml);
    if (marketplace === 'shopee') preco = numero(produto.shopee);
    if (marketplace === 'tiktok') preco = numero(produto.tiktok);
    if (marketplace === 'manual') preco = maiorPreco(produto);

    if ($('calcCusto') && custo > 0) $('calcCusto').value = custo.toFixed(2);
    if ($('calcPreco') && preco > 0) $('calcPreco').value = preco.toFixed(2);
  }

  function atualizarResultadoCalculadora({ titulo, detalhe, classe }) {
    const box = $('calcResultado');
    if (!box) return;
    box.classList.remove('calc-ok', 'calc-alerta', 'calc-ruim');
    if (classe) box.classList.add(classe);
    box.innerHTML = `
      <p class="label">Margem simulada</p>
      <p class="valor">${titulo}</p>
      <div class="detalhe">${detalhe}</div>
    `;
  }

  function calcularMargemSimulada() {
    preencherCalculadoraPorProduto();

    const custo = numero($('calcCusto')?.value || 0);
    const preco = numero($('calcPreco')?.value || 0);
    const desconto = numero($('calcDesconto')?.value || 0);
    const frete = numero($('calcFrete')?.value || 0);
    const taxaPct = numero($('calcTaxa')?.value || 0);
    const repasseManualTxt = $('calcRepasse')?.value;
    const repasseManual = repasseManualTxt === '' || repasseManualTxt === null || repasseManualTxt === undefined ? 0 : numero(repasseManualTxt);

    if (!custo || !preco) {
      atualizarResultadoCalculadora({
        titulo: 'Preencha os campos',
        detalhe: 'Informe custo e preço de venda. Se digitar um SKU existente, eu puxo o custo automaticamente.',
        classe: ''
      });
      return;
    }

    const taxaValor = preco * (taxaPct / 100);
    const repasse = repasseManual > 0 ? repasseManual : (preco - desconto - frete - taxaValor);
    const lucro = repasse - custo;
    const margem = preco > 0 ? (lucro / preco) * 100 : 0;
    const markup = custo > 0 ? preco / custo : 0;

    let classe = 'calc-ok';
    let status = 'Saudável';
    if (margem < 10) { classe = 'calc-ruim'; status = 'Crítica'; }
    else if (margem < 20) { classe = 'calc-alerta'; status = 'Atenção'; }

    atualizarResultadoCalculadora({
      titulo: `${margem.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% • ${status}`,
      detalhe: `Repasse: ${moeda(repasse)} | Custo: ${moeda(custo)} | Lucro: ${moeda(lucro)} | Markup: ${mult(markup)}`,
      classe
    });
  }

  function limparCalculadora() {
    ['calcBusca', 'calcCusto', 'calcPreco', 'calcRepasse'].forEach(id => { if ($(id)) $(id).value = ''; });
    if ($('calcMarketplace')) $('calcMarketplace').value = 'manual';
    if ($('calcDesconto')) $('calcDesconto').value = '0';
    if ($('calcFrete')) $('calcFrete').value = '0';
    if ($('calcTaxa')) $('calcTaxa').value = '25';
    atualizarResultadoCalculadora({
      titulo: 'Preencha os campos',
      detalhe: 'Digite um SKU para buscar o custo automaticamente.',
      classe: ''
    });
  }

    filtroSku?.addEventListener('input', renderTabela);
  filtroNome?.addEventListener('input', renderTabela);
  filtroCanal?.addEventListener('change', renderTabela);
  filtroFarol?.addEventListener('change', renderTabela);
  organizarPor?.addEventListener('change', renderTabela);
  btnLimparFiltros?.addEventListener('click', limparFiltros);
  btnExportar?.addEventListener('click', exportarCsv);
  btnProcessar?.addEventListener('click', processarCatalogo);
  $('btnCalcMargem')?.addEventListener('click', calcularMargemSimulada);
  $('btnCalcLimpar')?.addEventListener('click', limparCalculadora);
  $('calcBusca')?.addEventListener('change', preencherCalculadoraPorProduto);
  $('calcMarketplace')?.addEventListener('change', preencherCalculadoraPorProduto);


  document.querySelectorAll('.tab-farol').forEach(btn => {
    btn.addEventListener('click', () => {
      const valor = btn.dataset.farolChip || 'todos';
      if (filtroFarol) filtroFarol.value = valor;

      document.querySelectorAll('.tab-farol').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      renderTabela();
    });
  });

  filtroFarol?.addEventListener('change', () => {
    const valor = filtroFarol.value || 'todos';
    document.querySelectorAll('.tab-farol').forEach(btn => {
      btn.classList.toggle('active', (btn.dataset.farolChip || 'todos') === valor);
    });
  });


  document.querySelectorAll('.chip-decisao').forEach(btn => {
    btn.addEventListener('click', () => {
      decisaoAtiva = btn.dataset.decisao || 'todos';
      document.querySelectorAll('.chip-decisao').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderTabela();
    });
  });

  document.querySelectorAll('.tab-filtro').forEach(btn => {
    btn.addEventListener('click', () => {
      tabRapida = btn.dataset.tab || 'todos';
      document.querySelectorAll('.tab-filtro').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderTabela();
    });
  });

  ['rankingLimite', 'rankingOrdenar', 'rankingCanal'].forEach(id => {
    $(id)?.addEventListener('change', renderRankingUltraPro);
  });
  $('rankingBusca')?.addEventListener('input', renderRankingUltraPro);

  carregarProdutos();
});
