document.addEventListener('DOMContentLoaded', () => {
  const tbodyVendas = document.getElementById('tbodyVendas');
  const tbodyStatus = document.getElementById('tbodyStatus');

  const filtroVisaoData = document.getElementById('filtroVisaoData');
  const filtroMarketplace = document.getElementById('filtroMarketplace');
  const filtroPedido = document.getElementById('filtroPedido');
  const filtroDataInicio = document.getElementById('filtroDataInicio');
  const filtroDataFim = document.getElementById('filtroDataFim');
  const btnLimparDatas = document.getElementById('btnLimparDatas');
  const btnAtualizar = document.getElementById('btnAtualizar');
  const btnExportar = document.getElementById('btnExportar');
  const btnAbrirCalculadora = document.getElementById('btnAbrirCalculadora');
  const boxCalculadoraMargem = document.getElementById('boxCalculadoraMargem');

  const calcProduto = document.getElementById('calcProduto');
  const calcMarketplace = document.getElementById('calcMarketplace');
  const calcCusto = document.getElementById('calcCusto');
  const calcPreco = document.getElementById('calcPreco');
  const calcDesconto = document.getElementById('calcDesconto');
  const calcFrete = document.getElementById('calcFrete');
  const calcRepasse = document.getElementById('calcRepasse');
  const calcTaxa = document.getElementById('calcTaxa');
  const btnCalcularMargem = document.getElementById('btnCalcularMargem');
  const resultadoCalculadoraMargem = document.getElementById('resultadoCalculadoraMargem');
  const listaSkuCatalogo = document.getElementById('listaSkuCatalogo');

  const painelVendas = document.getElementById('painelVendas');
  const painelStatus = document.getElementById('painelStatus');

  const ORDEM_STATUS = [
    'Concluído',
    'Em transito',
    'Envio Manual acompanhar',
    'Precisa enviar',
    'Esperando Emitir NF',
    'Emitir NF',
    'Cancelado',
    'Em avaliação',
    'Não efetivado',
    'Outros'
  ];

  let vendas = [];
  let catalogoCustos = [];
  let statusMapa = [];
  let statusAtivo = 'todos';
  let conciliacaoAtiva = 'todos';


  if (btnAbrirCalculadora && boxCalculadoraMargem) {
    btnAbrirCalculadora.addEventListener('click', () => {
      boxCalculadoraMargem.scrollIntoView({ behavior: 'smooth', block: 'start' });
      calcProduto?.focus();
    });
  }

  function normalizarTexto(valor) {
    return String(valor || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function corrigirStatusHarmonizado(statusOriginal, statusHarmonizado) {
    const original = normalizarTexto(statusOriginal);
    const harmonizado = normalizarTexto(statusHarmonizado);

    // Correção principal:
    // Quando o TikTok vem como "Em trânsito", "Em transito" ou variações,
    // ele NÃO pode cair em "Outros". Deve virar sempre "Em transito".
    if (
      original.includes('em transito') ||
      original.includes('transito') ||
      harmonizado.includes('em transito') ||
      harmonizado.includes('transito')
    ) {
      return 'Em transito';
    }

    if (harmonizado === 'concluido') return 'Concluído';
    if (harmonizado === 'cancelado') return 'Cancelado';
    if (harmonizado === 'em avaliacao') return 'Em avaliação';
    if (harmonizado === 'nao efetivado') return 'Não efetivado';

    return statusHarmonizado || 'Outros';
  }

  function aplicarCorrecaoStatusBase() {
    let corrigidosVendas = 0;
    let corrigidosMapa = 0;

    vendas = vendas.map(v => {
      const antes = v.status_harmonizado;
      const depois = corrigirStatusHarmonizado(
        v.status_original || v.status,
        v.status_harmonizado
      );

      if (normalizarTexto(antes) !== normalizarTexto(depois)) {
        corrigidosVendas += 1;
      }

      return {
        ...v,
        status_harmonizado: depois
      };
    });

    statusMapa = statusMapa.map(s => {
      const antes = s.status_harmonizado;
      const depois = corrigirStatusHarmonizado(
        s.status_original,
        s.status_harmonizado
      );

      if (normalizarTexto(antes) !== normalizarTexto(depois)) {
        corrigidosMapa += 1;
      }

      return {
        ...s,
        status_harmonizado: depois
      };
    });

    console.log('[VENDAS] Correção de status aplicada', {
      vendas_corrigidas: corrigidosVendas,
      mapa_status_corrigidos: corrigidosMapa
    });
  }

  function escapeHtml(valor) {
    return String(valor ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function setText(id, valor) {
    // Atualiza TODOS os elementos com o mesmo ID.
    // Isso resolve quando ficaram cards duplicados no HTML
    // e o JavaScript atualizava um card escondido, deixando o visível zerado.
    const elementos = document.querySelectorAll(`[id="${id}"]`);
    elementos.forEach(el => {
      el.textContent = valor;
    });
  }

  function setSmall(id, valor) {
    const elementos = document.querySelectorAll(`[id="${id}"]`);
    elementos.forEach(el => {
      el.textContent = valor;
    });
  }

  function alternarClasseCard(id, classe, ativo) {
    document.querySelectorAll(`[id="${id}"]`).forEach(el => {
      const card = el.closest('.mini-card');
      if (card) card.classList.toggle(classe, Boolean(ativo));
    });
  }

  function formatarMoeda(valor) {
    const numero = Number(valor || 0);
    return numero.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  }

  function formatarPercentual(valor) {
    const numero = Number(valor || 0);

    if (!Number.isFinite(numero)) return '0,0%';

    return numero.toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }) + '%';
  }


  function deveCalcularMargem(v) {
    const status = normalizarTexto(v.status_harmonizado || v.status_original || v.status || '');

    if (status === 'cancelado') return false;
    if (status === 'nao efetivado' || status === 'não efetivado') return false;

    const venda = Number(v.preco_venda || 0);
    const repasse = Number(v.repasse || 0);

    if (venda <= 0) return false;
    if (repasse <= 0) return false;

    return true;
  }


  function calcularMargemPedido(v) {
    const faturamento = Number(v.preco_venda || 0);
    const repasse = Number(v.repasse || 0);
    const custo = Number(v.custo_final ?? v.custo ?? 0);

    if (!faturamento) return 0;

    return ((repasse - custo) / faturamento) * 100;
  }

  function formatarData(valor) {
    if (!valor) return '-';

    if (valor instanceof Date && !isNaN(valor.getTime())) {
      const dia = String(valor.getDate()).padStart(2, '0');
      const mes = String(valor.getMonth() + 1).padStart(2, '0');
      const ano = valor.getFullYear();
      const hora = String(valor.getHours()).padStart(2, '0');
      const minuto = String(valor.getMinutes()).padStart(2, '0');
      const segundo = String(valor.getSeconds()).padStart(2, '0');
      return `${dia}/${mes}/${ano} ${hora}:${minuto}:${segundo}`;
    }

    let v = String(valor).trim();
    if (!v || v === '-' || v === '--') return '-';

    v = v.replace(/\s+/g, ' ').replace(/\s*hs\.?\s*$/i, '').trim();

    // Excel serial date
    if (typeof valor === 'number' || /^\d+(\.\d+)?$/.test(v)) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 20000 && n < 90000) {
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        const date = new Date(excelEpoch.getTime() + n * 86400000);
        const dia = String(date.getUTCDate()).padStart(2, '0');
        const mes = String(date.getUTCMonth() + 1).padStart(2, '0');
        const ano = date.getUTCFullYear();
        const hora = String(date.getUTCHours()).padStart(2, '0');
        const minuto = String(date.getUTCMinutes()).padStart(2, '0');
        const segundo = String(date.getUTCSeconds()).padStart(2, '0');
        return `${dia}/${mes}/${ano} ${hora}:${minuto}:${segundo}`;
      }
    }

    // YYYY-MM-DD sem hora
    let m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const [, ano, mes, dia] = m;
      return `${dia}/${mes}/${ano} 00:00:00`;
    }

    // YYYY-MM-DD HH:mm:ss
    m = v.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (m) {
      const [, ano, mes, dia, hora, minuto, segundo = '00'] = m;
      return `${dia}/${mes}/${ano} ${String(hora).padStart(2, '0')}:${minuto}:${segundo}`;
    }

    // DD/MM/YYYY sem hora
    m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
      let [, dia, mes, ano] = m;
      return `${dia.padStart(2, '0')}/${mes.padStart(2, '0')}/${ano} 00:00:00`;
    }

    // MM/DD/YYYY hh:mm:ss AM/PM ou DD/MM/YYYY HH:mm:ss
    m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
    if (m) {
      let [, p1, p2, ano, hora, minuto, segundo = '00', periodo] = m;
      let dia = p1;
      let mes = p2;
      let h = parseInt(hora, 10);

      if (periodo) {
        // TikTok exporta MM/DD/YYYY com AM/PM.
        mes = p1;
        dia = p2;

        const p = periodo.toUpperCase();
        if (p === 'PM' && h < 12) h += 12;
        if (p === 'AM' && h === 12) h = 0;
      } else if (Number(p2) > 12) {
        mes = p1;
        dia = p2;
      }

      return `${dia.padStart(2, '0')}/${mes.padStart(2, '0')}/${ano} ${String(h).padStart(2, '0')}:${minuto}:${segundo}`;
    }

    // Português: 13 de abril de 2026 16:14
    const meses = {
      janeiro: '01',
      fevereiro: '02',
      marco: '03',
      março: '03',
      abril: '04',
      maio: '05',
      junho: '06',
      julho: '07',
      agosto: '08',
      setembro: '09',
      outubro: '10',
      novembro: '11',
      dezembro: '12'
    };

    m = v.toLowerCase().match(/^(\d{1,2}) de ([a-zçã]+) de (\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/i);
    if (m) {
      let [, dia, mesTexto, ano, hora = '00', minuto = '00', segundo = '00'] = m;
      const mes = meses[mesTexto] || '01';
      return `${dia.padStart(2, '0')}/${mes}/${ano} ${String(hora).padStart(2, '0')}:${minuto}:${segundo}`;
    }

    return v;
  }

  function dataParaComparacao(valor) {
    if (!valor) return null;

    const f = formatarData(valor);
    if (!f || f === '-') return null;

    let m = f.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);

    if (m) {
      const [, dia, mes, ano, hora, minuto, segundo] = m;
      return new Date(
        Number(ano),
        Number(mes) - 1,
        Number(dia),
        Number(hora),
        Number(minuto),
        Number(segundo)
      );
    }

    m = f.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) {
      const [, dia, mes, ano] = m;
      return new Date(Number(ano), Number(mes) - 1, Number(dia), 0, 0, 0);
    }

    return null;
  }


  function obterDataDaVisao(venda) {
    const visao = filtroVisaoData?.value || 'pedido';

    if (visao === 'financeira') {
      return venda.data_financeira ||
        venda.data_liquidacao ||
        venda.data_pagamento ||
        venda.data_pagamento_compra ||
        venda.data_custo ||
        venda.paid_time ||
        venda.PaidTime ||
        venda.data_pedido ||
        venda.data_venda ||
        venda.data_criacao ||
        venda.created_time ||
        venda.CreatedTime ||
        venda.data_importacao ||
        venda.data;
    }

    return venda.data_pedido ||
      venda.data_venda ||
      venda.data_criacao ||
      venda.created_time ||
      venda.CreatedTime ||
      venda.data_importacao ||
      venda.data_pagamento ||
      venda.data_financeira ||
      venda.data;
  }


  function descreverCusto(v) {
    const origem = String(v.origem_custo_venda || '');
    const quantidade = Number(v.quantidade_custo_calculada || v.quantidade || 1) || 1;
    const unitario = Number(v.custo_catalogo_unitario || 0);

    if (origem.includes('catalogo_multi_produto')) {
      return `Catálogo: ${formatarMoeda(unitario)} x ${quantidade}`;
    }

    if (origem.includes('relatorio_dropstok_vendas')) {
      return 'Compra conciliada';
    }

    if (origem === 'catalogo') {
      return `Catálogo: ${formatarMoeda(unitario || v.custo_catalogo || 0)}`;
    }

    return '-';
  }


  function descreverCalculoRepasse(v) {
    const origem = String(v.origem_repasse || '');

    if (origem.includes('ml_rateio_pacote')) {
      return {
        classe: 'calc-rateio',
        titulo: 'Rateio ML',
        detalhe: 'Financeiro da linha cinza distribuído pelo preço dos produtos filhos.'
      };
    }

    if (origem.includes('shopee_rateio_multi')) {
      return {
        classe: 'calc-rateio',
        titulo: 'Rateio Shopee',
        detalhe: 'Repasse total do pedido distribuído pelo valor de cada item.'
      };
    }

    return {
      classe: 'calc-direto',
      titulo: 'Direto',
      detalhe: 'Valor financeiro veio direto na linha do item.'
    };
  }


  function classeBadgeMargem(valor) {
    const n = Number(valor || 0);
    if (n >= 20) return 'margem-badge margem-verde';
    if (n >= 10) return 'margem-badge margem-amarela';
    return 'margem-badge margem-vermelha';
  }

  function textoMetaMargem(valor) {
    const n = Number(valor || 0);
    if (n >= 20) return 'Meta OK';
    if (n >= 10) return 'Atenção';
    return 'Abaixo da meta';
  }


  function classeMargemPedido(valor) {
    const n = Number(valor || 0);
    if (n >= 20) return 'margem-ok';
    return 'margem-negativa';
  }


  function formatarDataInputISO(data) {
    if (!(data instanceof Date) || isNaN(data.getTime())) return '';
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
  }

  function aplicarMesAtualPadrao(force = false) {
    if (!filtroDataInicio || !filtroDataFim) return;

    const inicioAtual = String(filtroDataInicio.value || '').trim();
    const fimAtual = String(filtroDataFim.value || '').trim();

    if (!force && (inicioAtual || fimAtual)) return;

    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);

    filtroDataInicio.value = formatarDataInputISO(inicio);
    filtroDataFim.value = formatarDataInputISO(fim);
  }

  function dataInputInicio(valor) {
    if (!valor) return null;
    const [ano, mes, dia] = valor.split('-').map(Number);
    if (!ano || !mes || !dia) return null;
    return new Date(ano, mes - 1, dia, 0, 0, 0);
  }

  function dataInputFim(valor) {
    if (!valor) return null;
    const [ano, mes, dia] = valor.split('-').map(Number);
    if (!ano || !mes || !dia) return null;
    return new Date(ano, mes - 1, dia, 23, 59, 59);
  }


  function skuBaseCalc(valor) {
    return String(valor || '').trim().split(/\s+/)[0]
      .replace(/\s*[-_]?\s*var\s*\d+$/i, '')
      .replace(/\s*[-_]?\s*v\s*\d+$/i, '')
      .replace(/\s*_var_\d+$/i, '')
      .toUpperCase();
  }

  function buscarCustoPorSku(entrada) {
    const chave = skuBaseCalc(entrada);
    if (!chave) return null;

    const doCatalogo = catalogoCustos.find(item => skuBaseCalc(item.sku || item.sku_base) === chave);
    if (doCatalogo) {
      return {
        sku: doCatalogo.sku || doCatalogo.sku_base,
        produto: doCatalogo.produto || doCatalogo.nome_base || '',
        custo: Number(doCatalogo.custo_catalogo_unitario || doCatalogo.custo || 0),
        origem: 'catalogo'
      };
    }

    const daVenda = vendas.find(v => skuBaseCalc(v.sku) === chave);
    if (daVenda) {
      return {
        sku: daVenda.sku,
        produto: daVenda.produto || '',
        custo: Number(daVenda.custo_catalogo_unitario || daVenda.custo_catalogo || daVenda.custo_final || daVenda.custo || 0),
        origem: 'vendas'
      };
    }

    return null;
  }

  function preencherDatalistSku() {
    if (!listaSkuCatalogo) return;

    const itens = catalogoCustos.length
      ? catalogoCustos
      : vendas.map(v => ({ sku: v.sku, produto: v.produto, custo_catalogo_unitario: v.custo_catalogo_unitario || v.custo_final || v.custo }));

    const unicos = new Map();

    itens.forEach(item => {
      const sku = item.sku || item.sku_base;
      if (!sku) return;
      const chave = skuBaseCalc(sku);
      if (!unicos.has(chave)) unicos.set(chave, item);
    });

    listaSkuCatalogo.innerHTML = Array.from(unicos.values()).slice(0, 1200).map(item => `
      <option value="${escapeHtml(item.sku || item.sku_base || '')}">
        ${escapeHtml(item.produto || item.nome_base || '')}
      </option>
    `).join('');
  }

  function preencherCustoAutomatico() {
    const encontrado = buscarCustoPorSku(calcProduto?.value || '');
    if (!calcProduto || !calcCusto) return;

    calcProduto.classList.remove('calc-achou', 'calc-nao-achou');
    if (!calcProduto.value) return;

    if (encontrado && encontrado.custo > 0) {
      calcCusto.value = encontrado.custo.toFixed(2);
      calcProduto.classList.add('calc-achou');
      if (encontrado.produto) calcProduto.title = encontrado.produto;
    } else {
      calcProduto.classList.add('calc-nao-achou');
    }

    calcularSimulacaoMargem();
  }

  function taxaPadraoMarketplace(mkt) {
    if (mkt === 'TikTok') return 25;
    if (mkt === 'Shopee') return 28;
    if (mkt === 'ML') return 20;
    return Number(calcTaxa?.value || 25);
  }

  function classeResultadoMargem(margem) {
    const n = Number(margem || 0);
    if (n >= 20) return 'verde';
    if (n >= 10) return 'amarelo';
    return 'vermelho';
  }

  function textoResultadoMargem(margem) {
    const n = Number(margem || 0);
    if (n >= 20) return 'Dentro da meta';
    if (n >= 10) return 'Atenção';
    return 'Abaixo da meta';
  }

  function calcularSimulacaoMargem() {
    if (!resultadoCalculadoraMargem) return;

    const produto = String(calcProduto?.value || '').trim();
    const custo = Number(calcCusto?.value || 0);
    const preco = Number(calcPreco?.value || 0);
    const desconto = Number(calcDesconto?.value || 0);
    const frete = Number(calcFrete?.value || 0);
    const repasseInformado = Number(calcRepasse?.value || 0);
    const taxa = Number(calcTaxa?.value || 0);

    if (preco <= 0) {
      resultadoCalculadoraMargem.innerHTML = `
        <article class="resultado-card neutro">
          <p>Margem simulada</p>
          <h3>Informe o preço</h3>
          <small>O preço de venda é obrigatório para calcular a margem.</small>
        </article>
      `;
      return;
    }

    const taxaValor = preco * (taxa / 100);
    const repasse = repasseInformado > 0 ? repasseInformado : preco - desconto - frete - taxaValor;
    const lucro = repasse - custo;
    const margem = preco > 0 ? (lucro / preco) * 100 : 0;
    const classe = classeResultadoMargem(margem);
    const textoMeta = textoResultadoMargem(margem);
    const precoMinimoMeta20 = custo > 0 ? (custo + desconto + frete) / Math.max(0.0001, (0.8 - (taxa / 100))) : 0;

    resultadoCalculadoraMargem.innerHTML = `
      <article class="resultado-card ${classe}">
        <p>Margem simulada</p>
        <h3>${formatarPercentual(margem)}</h3>
        <small>${textoMeta} • Meta 20%</small>
      </article>
      <article class="resultado-card neutro">
        <p>Lucro estimado</p>
        <h3>${formatarMoeda(lucro)}</h3>
        <small>Repasse - custo</small>
      </article>
      <article class="resultado-card neutro">
        <p>Repasse usado</p>
        <h3>${formatarMoeda(repasse)}</h3>
        <small>${repasseInformado > 0 ? 'Repasse informado manualmente' : `Preço - desconto - frete - taxa (${formatarPercentual(taxa)})`}</small>
      </article>
      <article class="resultado-card neutro">
        <p>Preço mínimo meta</p>
        <h3>${precoMinimoMeta20 > 0 ? formatarMoeda(precoMinimoMeta20) : '-'}</h3>
        <small>${produto ? escapeHtml(produto) : 'Para margem de 20%'}</small>
      </article>
    `;
  }

  function preencherCalculadoraPorVenda(v) {
    if (!v) {
      alert('Não consegui localizar essa venda para enviar para a calculadora.');
      return;
    }

    if (calcProduto) calcProduto.value = `${v.sku || ''} ${v.produto || ''}`.trim();
    if (calcCusto) calcCusto.value = Number(v.custo_final ?? v.custo ?? 0).toFixed(2);
    if (calcPreco) calcPreco.value = Number(v.preco_venda || 0).toFixed(2);
    if (calcRepasse) calcRepasse.value = Number(v.repasse || 0).toFixed(2);
    if (calcFrete) calcFrete.value = Number(v.frete || 0).toFixed(2);
    if (calcDesconto) calcDesconto.value = Number(v.desconto_vendedor_shopee || 0).toFixed(2);
    if (calcMarketplace) calcMarketplace.value = ['ML', 'Shopee', 'TikTok'].includes(v.canal) ? v.canal : 'manual';
    if (calcTaxa) calcTaxa.value = taxaPadraoMarketplace(calcMarketplace?.value || v.canal || 'manual');

    calcularSimulacaoMargem();

    const boxCalc = document.querySelector('.calculadora-margem-box');
    boxCalc?.classList.add('calculadora-aberta');
    boxCalc?.classList.remove('calculadora-recolhida');
    if (btnAbrirCalculadora) btnAbrirCalculadora.textContent = 'Ocultar simulador';
    boxCalc?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function ativarBotoesCalculadora() {
    document.querySelectorAll('.btn-usar-calculadora').forEach(btn => {
      btn.addEventListener('click', () => {
        const pedido = btn.dataset.pedido || '';
        const sku = btn.dataset.sku || '';
        const listaAtual = aplicarFiltros();

        const venda =
          listaAtual.find(v => String(v.pedido || '') === pedido && String(v.sku || '') === sku) ||
          vendas.find(v => String(v.pedido || '') === pedido && String(v.sku || '') === sku) ||
          listaAtual.find(v => String(v.sku || '') === sku) ||
          vendas.find(v => String(v.sku || '') === sku);

        preencherCalculadoraPorVenda(venda);
      });
    });
  }


  function classeStatus(status) {
    const s = normalizarTexto(status);

    if (s === 'concluido' || s === 'concluído') return 'ok';

    if (
      s === 'em transito' ||
      s === 'envio manual acompanhar' ||
      s === 'precisa enviar' ||
      s === 'esperando emitir nf' ||
      s === 'emitir nf'
    ) {
      return 'warn';
    }

    if (
      s === 'cancelado' ||
      s === 'em avaliacao' ||
      s === 'em avaliação' ||
      s === 'nao efetivado' ||
      s === 'não efetivado'
    ) {
      return 'danger';
    }

    return 'neutral';
  }

  function aplicarFiltrosBase() {
    let lista = [...vendas];

    const marketplace = filtroMarketplace?.value || 'todos';
    if (marketplace !== 'todos') {
      lista = lista.filter(v => normalizarTexto(v.canal) === normalizarTexto(marketplace));
    }

    const pedido = normalizarTexto(filtroPedido?.value || '');
    if (pedido) {
      lista = lista.filter(v =>
        normalizarTexto(v.pedido).includes(pedido) ||
        normalizarTexto(v.sku).includes(pedido) ||
        normalizarTexto(v.produto).includes(pedido)
      );
    }

    const inicio = dataInputInicio(filtroDataInicio?.value || '');
    const fim = dataInputFim(filtroDataFim?.value || '');

    if (inicio || fim) {
      lista = lista.filter(v => {
        const data = dataParaComparacao(obterDataDaVisao(v));
        if (!data) return false;
        if (inicio && data < inicio) return false;
        if (fim && data > fim) return false;
        return true;
      });
    }

    return lista;
  }

  function aplicarFiltros() {
    let lista = aplicarFiltrosBase();

    if (statusAtivo !== 'todos') {
      lista = lista.filter(v => normalizarTexto(v.status_harmonizado) === normalizarTexto(statusAtivo));
    }

    if (conciliacaoAtiva === 'compras_sim') {
      lista = lista.filter(v =>
        (v.conciliado_custo_compra || (v.compra_conciliada ? 'SIM' : 'NAO')) === 'SIM'
      );
    }

    if (conciliacaoAtiva === 'catalogo_usado') {
      lista = lista.filter(v =>
        v.origem_custo_venda === 'catalogo' ||
        String(v.origem_custo_venda || '').includes('catalogo_multi_produto')
      );
    }

    if (conciliacaoAtiva === 'sem_custo') {
      lista = lista.filter(v =>
        Number(v.custo_final ?? v.custo ?? 0) <= 0 ||
        v.origem_custo_venda === 'sem_custo'
      );
    }

    return lista;
  }

  function chavePedidoCard(v) {
    const canal = String(v.canal || '').trim();
    const pedido = String(v.pedido || '').trim();
    const fallback = String(v.id_venda_compra || v.sku || v.produto || '').trim();

    return `${canal}__${pedido || fallback}`;
  }

  function statusPedidoCard(status) {
    const s = String(status || '').trim();

    if (s) return s;

    return 'Outros';
  }

  function obterPedidosUnicos(lista = []) {
    const mapa = new Map();

    lista.forEach(v => {
      const chave = chavePedidoCard(v);
      if (!chave || chave === '__') return;

      if (!mapa.has(chave)) {
        mapa.set(chave, {
          chave,
          status: statusPedidoCard(v.status_harmonizado || v.status_original || v.status),
          itens: 0
        });
      }

      const atual = mapa.get(chave);
      atual.itens += 1;

      // Se qualquer item do pedido estiver cancelado, o pedido deve contar como cancelado.
      if (String(v.status_harmonizado || '').trim() === 'Cancelado') {
        atual.status = 'Cancelado';
      }
    });

    return Array.from(mapa.values());
  }

  function atualizarCards(listaBase = null) {
    const base = Array.isArray(listaBase) ? listaBase : aplicarFiltrosBase();
    const pedidos = obterPedidosUnicos(base);

    const total = pedidos.length;

    const concluidos = pedidos.filter(v =>
      ['Concluído', 'Em avaliação', 'Outros'].includes(v.status)
    ).length;

    const emAndamento = pedidos.filter(v =>
      ['Em transito', 'Envio Manual acompanhar'].includes(v.status)
    ).length;

    const paraSair = pedidos.filter(v =>
      ['Precisa enviar', 'Esperando Emitir NF', 'Emitir NF'].includes(v.status)
    ).length;

    const cancelados = pedidos.filter(v => v.status === 'Cancelado').length;
    const validos = Math.max(0, total - cancelados);

    setText('cardTotalPedidos', total);
    setText('cardPedidosValidos', validos);
    setText('cardConcluido', concluidos);
    setText('cardEmAndamento', emAndamento);
    setText('cardParaSair', paraSair);
    setText('cardCancelado', cancelados);
  }


  function numeroFinanceiro(valor) {
    if (valor === null || valor === undefined || valor === '') return 0;
    if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;

    let texto = String(valor).trim();
    texto = texto
      .replace(/BRL/gi, '')
      .replace(/R\$/gi, '')
      .replace(/%/g, '')
      .replace(/\s+/g, '');

    if (!texto) return 0;

    // Aceita número no formato brasileiro: 1.234,56
    if (texto.includes('.') && texto.includes(',')) {
      texto = texto.replace(/\./g, '').replace(',', '.');
    } else if (texto.includes(',')) {
      texto = texto.replace(',', '.');
    }

    const numero = Number(texto);
    return Number.isFinite(numero) ? numero : 0;
  }

  function primeiroValorNumerico(obj, campos = []) {
    for (const campo of campos) {
      const valor = numeroFinanceiro(obj?.[campo]);
      if (valor !== 0) return valor;
    }
    return 0;
  }

  function calcularTotaisFinanceiros(lista = []) {
    const LIMITE_CANCELAMENTO_PERCENTUAL = 10;

    const validos = { valor: 0, custo: 0, comissao: 0, frete: 0, repasse: 0 };
    const cancelados = { valor: 0, custo: 0, comissao: 0, frete: 0, repasse: 0 };

    lista.forEach(v => {
      const valor = primeiroValorNumerico(v, [
        'preco_venda', 'valor_item', 'valor_venda', 'valor_produto',
        'subtotal_produto_shopee', 'sku_subtotal_after_discount',
        'sku_subtotal_before_discount', 'order_amount', 'total_item'
      ]);

      const custo = primeiroValorNumerico(v, [
        'custo_final', 'custo', 'custo_total', 'custo_produto',
        'custo_compra', 'custo_catalogo'
      ]);

      const comissao = primeiroValorNumerico(v, [
        'comissao', 'total_comissao', 'taxa_comissao',
        'taxa_comissao_liquida_shopee', 'taxa_servico_liquida_shopee',
        'tarifa_venda'
      ]);

      const frete = primeiroValorNumerico(v, [
        'frete', 'valor_frete', 'frete_vendedor',
        'tarifas_envio', 'shipping_fee_after_discount'
      ]);

      const repasse = primeiroValorNumerico(v, [
        'repasse', 'valor_repasse', 'receita_liquida',
        'total', 'total_repasse'
      ]);

      const status = normalizarTexto(v.status_harmonizado || v.status_original || v.status || '');
      const destino = status === 'cancelado' ? cancelados : validos;

      destino.valor += valor;
      destino.custo += custo;
      destino.comissao += comissao;
      destino.frete += frete;
      destino.repasse += repasse;
    });

    const margemValidos = validos.valor > 0 ? ((validos.repasse - validos.custo) / validos.valor) * 100 : 0;
    const margemCancelados = cancelados.valor > 0 ? ((cancelados.repasse - cancelados.custo) / cancelados.valor) * 100 : 0;
    const faturamentoTotal = validos.valor + cancelados.valor;
    const percentualCancelamento = faturamentoTotal > 0 ? (cancelados.valor / faturamentoTotal) * 100 : 0;

    return {
      validos,
      cancelados,
      margemValidos,
      margemCancelados,
      faturamentoTotal,
      percentualCancelamento,
      alertaCancelamento: percentualCancelamento >= LIMITE_CANCELAMENTO_PERCENTUAL,
      limiteCancelamentoPercentual: LIMITE_CANCELAMENTO_PERCENTUAL
    };
  }

  function atualizarTotaisFinanceiros(lista = []) {
    const totais = calcularTotaisFinanceiros(lista);

    setText('cardTotalValorItem', formatarMoeda(totais.validos.valor));
    setText('cardTotalCusto', formatarMoeda(totais.validos.custo));
    setText('cardTotalComissao', formatarMoeda(totais.validos.comissao));
    setText('cardTotalFrete', formatarMoeda(totais.validos.frete));
    setText('cardTotalRepasse', formatarMoeda(totais.validos.repasse));
    setText('cardMargemGeral', formatarPercentual(totais.margemValidos));

    // Cor da margem válida: >= 20% fica verde.
    document.querySelectorAll('[id="cardMargemGeral"]').forEach(el => {
      const card = el.closest('.mini-card');
      if (!card) return;
      card.classList.remove('margem-card-verde', 'margem-card-alerta', 'margem-card-ruim');
      if (totais.margemValidos >= 20) card.classList.add('margem-card-verde');
      else if (totais.margemValidos >= 10) card.classList.add('margem-card-alerta');
      else card.classList.add('margem-card-ruim');
    });

    setText('cardCanceladoValor', formatarMoeda(totais.cancelados.valor));
    setText('cardCanceladoCusto', formatarMoeda(totais.cancelados.custo));
    setText('cardCanceladoComissao', formatarMoeda(totais.cancelados.comissao));
    setText('cardCanceladoFrete', formatarMoeda(totais.cancelados.frete));
    setText('cardCanceladoRepasse', formatarMoeda(totais.cancelados.repasse));
    setText('cardPercentualCancelamento', formatarPercentual(totais.percentualCancelamento));

    const textoAlerta = totais.alertaCancelamento
      ? `Alerta: acima de ${formatarPercentual(totais.limiteCancelamentoPercentual)}`
      : `OK: abaixo de ${formatarPercentual(totais.limiteCancelamentoPercentual)}`;

    setSmall('cardPercentualCancelamentoInfo', textoAlerta);
    alternarClasseCard('cardPercentualCancelamento', 'alerta-cancelamento', totais.alertaCancelamento);

    console.log('[VENDAS] Totais financeiros atualizados', {
      linhas_filtradas: lista.length,
      validos: totais.validos,
      cancelados: totais.cancelados,
      percentualCancelamento: totais.percentualCancelamento,
      alertaCancelamento: totais.alertaCancelamento
    });
  }

  function renderVendas() {
    const listaBase = aplicarFiltrosBase();
    const lista = aplicarFiltros();

    atualizarCards(listaBase);
    atualizarTotaisFinanceiros(lista);

    if (!tbodyVendas) return;

    if (!lista.length) {
      tbodyVendas.innerHTML = `
        <tr>
          <td colspan="4" style="text-align:center; padding:18px;">
            Nenhuma venda encontrada.
          </td>
        </tr>
      `;
      return;
    }

    tbodyVendas.innerHTML = lista.map(v => {
      const calculaMargem = deveCalcularMargem(v);
      const margem = calculaMargem ? calcularMargemPedido(v) : null;
      const margemTexto = calculaMargem ? formatarPercentual(margem) : 'Não calcula';
      const margemClasse = calculaMargem ? classeMargemPedido(margem) : 'margem-nao-calcula';
      const calc = descreverCalculoRepasse(v);
      const isRateio = v.pedido_multi_produto_financeiro === true ||
        String(v.origem_repasse || '').includes('rateio');

      const participacao = isRateio
        ? formatarPercentual(v.participacao_pedido || v.ml_participacao_pedido)
        : '-';

      const totalPedido = isRateio
        ? formatarMoeda(v.repasse_total_pedido_shopee || v.ml_repasse_total_pedido || v.repasse)
        : '-';

      const pedidoItem = v.pedido_item_ml && v.pedido_item_ml !== v.pedido
        ? v.pedido_item_ml
        : '-';

      return `
        <tr>
          <td>${escapeHtml(v.canal || '-')}</td>
          <td>${escapeHtml(formatarData(obterDataDaVisao(v)))}</td>
          <td class="pedido-cell">${escapeHtml(v.pedido || '-')}</td>
          <td class="sku-cell">${escapeHtml(v.sku || '-')}</td>
          <td class="produto-cell">${escapeHtml(v.produto || '-')}</td>

          <td class="money-strong">${formatarMoeda(v.preco_venda)}</td>
          <td class="money-strong">${formatarMoeda(v.custo_final ?? v.custo)}</td>
          <td class="money-muted">${formatarMoeda(v.comissao)}</td>
          <td class="money-muted">${formatarMoeda(v.frete)}</td>
          <td class="money-strong">${formatarMoeda(v.repasse)}</td>
          <td>
            ${calculaMargem
              ? `<span class="${classeBadgeMargem(margem)}">
                  <b>${margemTexto}</b>
                  <small>${textoMetaMargem(margem)}</small>
                </span>`
              : `<span class="margem-nao-calcula">${margemTexto}</span>`}
          </td>

          <td>
            <span class="calc-badge ${calc.classe}">${escapeHtml(calc.titulo)}</span>
            <span class="calc-info">${escapeHtml(calc.detalhe)}</span>
          </td>
          <td>${participacao}</td>
          <td>${totalPedido}</td>
          <td>${escapeHtml(pedidoItem)}</td>

          <td>${formatarMoeda(v.custo_compra)}</td>
          <td>${formatarMoeda(v.custo_catalogo)}</td>
          <td>
            ${escapeHtml(v.origem_custo_venda || '-')}
            <span class="calc-info">${escapeHtml(descreverCusto(v))}</span>
          </td>

          <td>${escapeHtml(v.status_original || v.status || '-')}</td>
          <td>
            <span class="status-badge ${classeStatus(v.status_harmonizado)}">
              ${escapeHtml(v.status_harmonizado || '-')}
            </span>
          </td>

          <td>
            <span class="status-badge ${(v.conciliado_custo_compra || (v.compra_conciliada ? 'SIM' : 'NAO')) === 'SIM' ? 'ok' : 'danger'}">
              ${escapeHtml(v.conciliado_custo_compra || (v.compra_conciliada ? 'SIM' : 'NAO'))}
            </span>
          </td>
          <td>
            <span class="status-badge ${(v.conciliado_catalogo || 'NAO') === 'SIM' ? 'ok' : 'danger'}">
              ${escapeHtml(v.conciliado_catalogo || 'NAO')}
            </span>
          </td>
        </tr>
      `;
    }).join('');

    ativarBotoesCalculadora();
  }

  function renderStatus() {
    if (!tbodyStatus) return;

    if (!statusMapa.length) {
      tbodyStatus.innerHTML = `
        <tr>
          <td colspan="4" style="text-align:center; padding:18px;">
            Nenhum mapa de status encontrado.
          </td>
        </tr>
      `;
      return;
    }

    console.log('[VENDAS] Mapa de status renderizado', statusMapa.length);

    tbodyStatus.innerHTML = statusMapa.map(s => `
      <tr>
        <td>${escapeHtml(s.canal || '-')}</td>
        <td>${escapeHtml(s.status_original || '-')}</td>
        <td>
          <span class="status-badge ${classeStatus(s.status_harmonizado)}">
            ${escapeHtml(s.status_harmonizado || '-')}
          </span>
        </td>
        <td>${Number(s.quantidade || 0)}</td>
      </tr>
    `).join('');
  }

  function contarStatus() {
    const mapa = new Map();
    const base = aplicarFiltrosBase();

    for (const venda of base) {
      const status = venda.status_harmonizado || 'Sem status';
      mapa.set(status, (mapa.get(status) || 0) + 1);
    }

    const lista = [];

    for (const status of ORDEM_STATUS) {
      if (mapa.has(status)) {
        lista.push({ status, quantidade: mapa.get(status) });
        mapa.delete(status);
      }
    }

    for (const [status, quantidade] of mapa.entries()) {
      lista.push({ status, quantidade });
    }

    return lista;
  }

  function renderStatusFilters() {
    const container = document.getElementById('statusFilters');
    if (!container) return;

    const statusLista = contarStatus();

    const botaoTodos = `
      <button class="filter-chip ${statusAtivo === 'todos' ? 'active' : ''}" data-status="todos" type="button">
        Todos
      </button>
    `;

    const botoes = statusLista.map(item => `
      <button
        class="filter-chip ${normalizarTexto(statusAtivo) === normalizarTexto(item.status) ? 'active' : ''}"
        data-status="${escapeHtml(item.status)}"
        type="button">
        ${escapeHtml(item.status)} (${item.quantidade})
      </button>
    `).join('');

    container.innerHTML = botaoTodos + botoes;

    container.querySelectorAll('.filter-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        statusAtivo = btn.dataset.status || 'todos';
        renderStatusFilters();
        renderConciliacaoFilters();
    renderVendas();
      });
    });
  }

  function configurarStatusFilters() {
    renderStatusFilters();
  }

  function contarConciliacao() {
    const base = aplicarFiltrosBase();
    const total = base.length;

    const custoCompras = base.filter(v =>
      (v.conciliado_custo_compra || (v.compra_conciliada ? 'SIM' : 'NAO')) === 'SIM'
    ).length;

    const custoCatalogoUsado = base.filter(v =>
      v.origem_custo_venda === 'catalogo'
    ).length;

    const semCustoAssociado = base.filter(v =>
      Number(v.custo_final ?? v.custo ?? 0) <= 0 ||
      v.origem_custo_venda === 'sem_custo'
    ).length;

    return {
      total,
      custoCompras,
      custoCatalogoUsado,
      semCustoAssociado
    };
  }

  function renderConciliacaoFilters() {
    const container = document.getElementById('conciliacaoFilters');
    if (!container) return;

    const c = contarConciliacao();

    const chips = [
      { valor: 'todos', label: `Produtos (${c.total})` },
      { valor: 'compras_sim', label: `Custo compras conciliado (${c.custoCompras})` },
      { valor: 'catalogo_usado', label: `Custo usado do catálogo (${c.custoCatalogoUsado})` },
      { valor: 'sem_custo', label: `Sem custo associado (${c.semCustoAssociado})` }
    ];

    container.innerHTML = chips.map(chip => `
      <button
        class="filter-chip ${conciliacaoAtiva === chip.valor ? 'active' : ''}"
        data-conciliacao="${chip.valor}"
        type="button">
        ${escapeHtml(chip.label)}
      </button>
    `).join('');

    container.querySelectorAll('.filter-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        conciliacaoAtiva = btn.dataset.conciliacao || 'todos';
        renderConciliacaoFilters();
        renderVendas();
      });
    });
  }


function atualizarTudoFiltros() {
  renderStatusFilters();
  renderConciliacaoFilters();
  renderVendas();
}



  function configurarTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;

        if (tab === 'status') {
          if (painelVendas) painelVendas.style.display = 'none';
          if (painelStatus) painelStatus.style.display = 'block';
          renderStatus();
        } else {
          if (painelStatus) painelStatus.style.display = 'none';
          if (painelVendas) painelVendas.style.display = 'block';
          renderVendas();
        }
      });
    });
  }

  function limparFiltros() {
    if (filtroPedido) filtroPedido.value = '';
    if (filtroMarketplace) filtroMarketplace.value = 'todos';

    aplicarMesAtualPadrao(true);

    statusAtivo = 'todos';
    conciliacaoAtiva = 'todos';
    document.querySelectorAll('#statusFilters .filter-chip').forEach(b => {
      b.classList.toggle('active', b.dataset.status === 'todos');
    });

    renderVendas();
  }

  function exportarCsv() {
    const lista = aplicarFiltros();

    const cabecalho = [
      'Marketplace',
      'Data',
      'Pedido',
      'ID venda compra',
      'SKU',
      'Produto',
      'Valor da venda',
      'Custo final',
      'Comissão',
      'Frete',
      'Repasse',
      'Margem pedido',
      'Custo compras',
      'Custo catálogo',
      'Origem custo',
      'Status original',
      'Status harmonizado',
      'Conciliado compras?',
      'Conciliado catálogo?'
    ];

    const linhas = lista.map(v => [
      v.canal,
      formatarData(v.data),
      v.pedido,
      v.id_venda_compra,
      v.sku,
      v.produto,
      v.preco_venda,
      v.custo_final ?? v.custo,
      v.comissao,
      v.frete,
      v.repasse,
      deveCalcularMargem(v) ? formatarPercentual(calcularMargemPedido(v)) : 'Não calcula',
      v.custo_compra,
      v.custo_catalogo,
      v.origem_custo_venda,
      v.status_original || v.status,
      v.status_harmonizado,
      v.conciliado_custo_compra || (v.compra_conciliada ? 'SIM' : 'NAO'),
      v.conciliado_catalogo
    ]);

    const csv = [cabecalho, ...linhas]
      .map(row => row.map(col => `"${String(col ?? '').replace(/"/g, '""')}"`).join(';'))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'vendas-export.csv';
    a.click();

    URL.revokeObjectURL(url);
  }

  async function carregar() {
    try {
      if (tbodyVendas) {
        tbodyVendas.innerHTML = `
          <tr>
            <td colspan="4" style="text-align:center; padding:18px;">
              Carregando vendas...
            </td>
          </tr>
        `;
      }

      const [respVendas, respStatus, respCatalogo] = await Promise.all([
        fetch('./data/vendas.json?v=' + Date.now()),
        fetch('./data/vendas-status.json?v=' + Date.now()),
        fetch('./data/catalogo-custos.json?v=' + Date.now()).catch(() => null)
      ]);

      if (!respVendas.ok) {
        throw new Error(`Erro HTTP ${respVendas.status} ao buscar data/vendas.json`);
      }

      if (!respStatus.ok) {
        throw new Error(`Erro HTTP ${respStatus.status} ao buscar data/vendas-status.json`);
      }

      vendas = await respVendas.json();
      statusMapa = await respStatus.json();

      if (respCatalogo && respCatalogo.ok) {
        catalogoCustos = await respCatalogo.json();
      } else {
        catalogoCustos = [];
      }

      if (!Array.isArray(vendas)) {
        throw new Error('data/vendas.json não é uma lista válida.');
      }

      if (!Array.isArray(statusMapa)) {
        statusMapa = [];
      }

      aplicarCorrecaoStatusBase();

      console.log('vendas.json carregado:', vendas.length);
      console.log('vendas-status.json carregado:', statusMapa.length);
      console.log('catalogo-custos.json carregado:', Array.isArray(catalogoCustos) ? catalogoCustos.length : 0);
      preencherDatalistSku();

      aplicarMesAtualPadrao(true);

      renderStatusFilters();
      renderConciliacaoFilters();
      renderVendas();
      renderStatus();
    } catch (error) {
      console.error(error);

      if (tbodyVendas) {
        tbodyVendas.innerHTML = `
          <tr>
            <td colspan="4" style="text-align:center; padding:18px; color:#b42318;">
              Erro ao carregar vendas: ${escapeHtml(error.message)}
            </td>
          </tr>
        `;
      }
    }
  }

  filtroVisaoData?.addEventListener('change', atualizarTudoFiltros);
  filtroMarketplace?.addEventListener('change', atualizarTudoFiltros);
  filtroPedido?.addEventListener('input', atualizarTudoFiltros);
  filtroDataInicio?.addEventListener('change', atualizarTudoFiltros);
  filtroDataFim?.addEventListener('change', atualizarTudoFiltros);
  btnLimparDatas?.addEventListener('click', limparFiltros);
  btnCalcularMargem?.addEventListener('click', calcularSimulacaoMargem);
  calcProduto?.addEventListener('change', preencherCustoAutomatico);
  calcProduto?.addEventListener('blur', preencherCustoAutomatico);
  calcMarketplace?.addEventListener('change', () => {
    if (calcTaxa) calcTaxa.value = taxaPadraoMarketplace(calcMarketplace.value);
    calcularSimulacaoMargem();
  });
  [calcCusto, calcPreco, calcDesconto, calcFrete, calcRepasse, calcTaxa].forEach(el => {
    el?.addEventListener('input', calcularSimulacaoMargem);
  });

  btnAtualizar?.addEventListener('click', carregar);
  btnExportar?.addEventListener('click', exportarCsv);

  configurarStatusFilters();
  configurarTabs();
  carregar();


  function atualizarPedidosValidosFallback() {
    const totalEl = document.getElementById('cardTotalPedidos');
    const canceladoEl = document.getElementById('cardCancelado');
    const validoEl = document.getElementById('cardPedidosValidos');

    if (!totalEl || !canceladoEl || !validoEl) return;

    const total = parseInt(String(totalEl.textContent || '0').replace(/\D/g, ''), 10) || 0;
    const cancelados = parseInt(String(canceladoEl.textContent || '0').replace(/\D/g, ''), 10) || 0;

    validoEl.textContent = String(Math.max(0, total - cancelados));
  }

  window.addEventListener('load', atualizarPedidosValidosFallback);
  setInterval(atualizarPedidosValidosFallback, 700);

});
