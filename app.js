document.addEventListener('DOMContentLoaded', () => {

  const pluginLabelsGrafico = {
    id: 'pluginLabelsGrafico',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;

      ctx.save();
      ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';

      chart.data.datasets.forEach((dataset, datasetIndex) => {
        const meta = chart.getDatasetMeta(datasetIndex);
        if (!meta || meta.hidden) return;

        meta.data.forEach((element, index) => {
          const valor = dataset.data[index];
          if (valor === null || valor === undefined || Number.isNaN(Number(valor))) return;
          if (Number(valor) === 0) return;

          let texto = '';

          if (dataset.label === 'Receita bruta' || dataset.label === 'Repasse') {
            texto = Number(valor || 0).toLocaleString('pt-BR', {
              style: 'currency',
              currency: 'BRL',
              maximumFractionDigits: 0
            });
          } else if (dataset.label === 'Margem %') {
            texto = `${Number(valor || 0).toFixed(1).replace('.', ',')}%`;
          } else if (dataset.label === 'Qtd. vendas') {
            texto = `${Number(valor || 0)}`;
          }

          if (!texto) return;

          const pos = element && typeof element.tooltipPosition === 'function' ? element.tooltipPosition() : { x: 0, y: 0 };
          const yOffset = dataset.type === 'line' ? -8 : -4;

          ctx.fillStyle = dataset.label === 'Margem %'
            ? '#7a5651'
            : dataset.label === 'Qtd. vendas'
              ? '#4b5563'
              : '#27323f';

          ctx.fillText(texto, pos.x, pos.y + yOffset);
        });
      });

      ctx.restore();
    }
  };


  const btnProcessar = document.getElementById('btnProcessar');
  const btnLog = document.getElementById('btnLog');
  const auditoria = document.getElementById('auditoriaResumo');

  const filtroVisaoDataResumo = document.getElementById('filtroVisaoDataResumo');
  const filtroMarketplaceResumo = document.getElementById('filtroMarketplaceResumo');
  const filtroStatusResumo = document.getElementById('filtroStatusResumo');
  const filtroDataInicioResumo = document.getElementById('filtroDataInicioResumo');
  const filtroDataFimResumo = document.getElementById('filtroDataFimResumo');
  const btnLimparFiltrosResumo = document.getElementById('btnLimparFiltrosResumo');

  const cardTotalPedidos = document.getElementById('cardTotalPedidos');
  const cardTotalProdutos = document.getElementById('cardTotalProdutos');
  const cardFaturado = document.getElementById('cardFaturado');
  const cardFrete = document.getElementById('cardFrete');
  const cardComissao = document.getElementById('cardComissao');
  const cardCusto = document.getElementById('cardCusto');
  const cardRepasse = document.getElementById('cardRepasse');
  const cardLiquido = document.getElementById('cardLiquido');
  const cardMargem = document.getElementById('cardMargem');
  const cardMargemComparativo = document.getElementById('cardMargemComparativo');
  const cardMargemMeta = document.getElementById('cardMargemMeta');

  const mlTotal = document.getElementById('mlTotal');
  const shopeeTotal = document.getElementById('shopeeTotal');
  const tiktokTotal = document.getElementById('tiktokTotal');
  const resumoMktFinanceiro = document.getElementById('resumoMktFinanceiro');

  const statusML = document.getElementById('statusML');
  const statusShopee = document.getElementById('statusShopee');
  const statusTikTok = document.getElementById('statusTikTok');
  const statusCusto = document.getElementById('statusCusto');

  const alertaSemCusto = document.getElementById('alertaSemCusto');
  const alertaPagoCancelado = document.getElementById('alertaPagoCancelado');
  const alertaNaoEfetivado = document.getElementById('alertaNaoEfetivado');
  const resumoInteligente = document.getElementById('resumoInteligente');

  let vendas = [];
  let custos = [];
  let graficoResumo = null;
  let graficoML = null;
  let graficoShopee = null;
  let graficoTikTok = null;
  let graficoMensal12 = null;

  function resetAuditoria() {
    if (auditoria) auditoria.textContent = '';
  }

async function controlarMenuAdmin() {
  try {
    const resp = await fetch('/api/auth/me');
    const data = await resp.json();

    if (data.ok && data.user.role === 'ADMIN') {
      const menu = document.getElementById('menuUsuarios');
      if (menu) menu.style.display = 'block';
    }
  } catch (e) {
    console.error('Erro ao validar admin:', e);
  }
}

  function logAuditoria(mensagem, dados) {
    const linha = `[${new Date().toLocaleTimeString('pt-BR')}] ${mensagem}` +
      (dados ? `\n${typeof dados === 'string' ? dados : JSON.stringify(dados, null, 2)}` : '');

    console.log('[RESUMO]', mensagem, dados ?? '');

    if (auditoria) {
      auditoria.textContent += (auditoria.textContent ? '\n\n' : '') + linha;
    }
  }

  function paraNumero(valor) {
    if (valor === null || valor === undefined || valor === '') return 0;
    if (typeof valor === 'number') return isNaN(valor) ? 0 : valor;

    let texto = String(valor).trim();
    if (!texto) return 0;

    texto = texto
      .replace(/BRL/gi, '')
      .replace(/R\$/gi, '')
      .replace(/\s+/g, '')
      .trim();

    if (texto.includes(',') && texto.includes('.')) {
      texto = texto.replace(/\./g, '').replace(',', '.');
    } else if (texto.includes(',') && !texto.includes('.')) {
      texto = texto.replace(',', '.');
    }

    const numero = parseFloat(texto);
    return isNaN(numero) ? 0 : numero;
  }

  function obterPrimeiroNumero(item, campos) {
    for (const campo of campos) {
      const valor = paraNumero(item?.[campo]);
      if (valor > 0) return valor;
    }
    return 0;
  }

  function obterPrecoVenda(item) {
    return obterPrimeiroNumero(item, [
      'preco_venda',
      'valor_venda',
      'valor',
      'total',
      'valor_total',
      'gross_amount',
      'order_amount',
      'amount',
      'paid_amount',
      'sale_amount'
    ]);
  }

  function obterRepasse(item) {
    return obterPrimeiroNumero(item, [
      'repasse',
      'valor_repasse',
      'net_amount',
      'seller_amount',
      'valor_liquido',
      'recebivel',
      'receita_liquida'
    ]);
  }

  function obterCusto(item) {
    return obterPrimeiroNumero(item, [
      'custo',
      'custo_total',
      'cost',
      'product_cost'
    ]);
  }

  function obterFrete(item) {
    return obterPrimeiroNumero(item, [
      'frete',
      'shipping',
      'shipping_fee',
      'valor_frete'
    ]);
  }

  function obterComissao(item) {
    return obterPrimeiroNumero(item, [
      'comissao',
      'commission',
      'commission_fee',
      'taxa_comissao'
    ]);
  }

  function formatarMoeda(valor) {
    if (valor === null || valor === undefined || isNaN(valor)) return 'R$ 0,00';
    return Number(valor).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  }

  function formatarPercentual(valor) {
    if (valor === null || valor === undefined || isNaN(valor)) return '0%';
    return `${Number(valor).toFixed(1).replace('.', ',')}%`;
  }

  function classeFarolMargem(valor) {
    const margem = Number(valor || 0);

    if (margem >= 20) return 'farol-ok';
    if (margem >= 10) return 'farol-alerta';
    return 'farol-ruim';
  }

  function textoFarolMargem(valor) {
    const margem = Number(valor || 0);

    if (margem >= 20) return 'Meta OK';
    if (margem >= 10) return 'Atenção';
    return 'Abaixo da meta';
  }

  function calcularPercentual(valor, base) {
    const v = Number(valor || 0);
    const b = Number(base || 0);

    if (!b) return 0;

    return (v / b) * 100;
  }

  function classeMargem(margem) {
    const valor = Number(margem || 0);

    if (valor >= 20) return 'margem-ok';
    if (valor >= 10) return 'margem-alerta';
    return 'margem-ruim';
  }

  function textoMargem(margem) {
    const valor = Number(margem || 0);

    if (valor >= 20) return 'Dentro da meta';
    if (valor >= 10) return 'Atenção';
    return 'Abaixo da meta';
  }

  function indicadorComPercentual(valor, faturado) {
    return `
      ${formatarMoeda(valor)}
      <span class="percentual-mkt">(${formatarPercentual(calcularPercentual(valor, faturado))})</span>
    `;
  }

  function somar(lista, campo) {
    return lista.reduce((acc, item) => acc + paraNumero(item?.[campo]), 0);
  }

  function normalizarTexto(valor) {
    return String(valor || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function normalizarCanal(item) {
    const bruto = item?.canal ?? item?.marketplace ?? item?.plataforma ?? item?.loja ?? '';
    const texto = normalizarTexto(bruto);
    const compacto = texto.replace(/[^a-z0-9]/g, '');

    if (!texto) return 'Desconhecido';

    // Mercado Livre pode aparecer como:
    // ML, mercado_livre, mercado-livre, mercado livre, mercadolivre, SmartML
    if (
      texto === 'ml' ||
      compacto === 'ml' ||
      compacto.includes('mercadolivre') ||
      compacto.includes('smartml')
    ) {
      return 'ML';
    }

    if (compacto.includes('shopee')) return 'Shopee';

    if (
      compacto.includes('tiktok') ||
      compacto.includes('tiktokshop') ||
      texto === 'tt'
    ) {
      return 'TikTok';
    }

    return String(bruto).trim();
  }

  function prepararVendas(lista) {
    return (Array.isArray(lista) ? lista : []).map(item => ({
      ...item,
      canal_normalizado: normalizarCanal(item),
      preco_venda_normalizado: obterPrecoVenda(item),
      repasse_normalizado: obterRepasse(item),
      custo_normalizado: obterCusto(item),
      frete_normalizado: obterFrete(item),
      comissao_normalizado: obterComissao(item)
    }));
  }

  function parseDataVenda(valor) {
    if (!valor) return null;

    if (valor instanceof Date && !isNaN(valor.getTime())) {
      return valor;
    }

    // Excel serial date.
    if (typeof valor === 'number' || /^\d+(\.\d+)?$/.test(String(valor).trim())) {
      const n = Number(valor);
      if (Number.isFinite(n) && n > 20000 && n < 90000) {
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        const date = new Date(excelEpoch.getTime() + n * 86400000);
        return new Date(
          date.getUTCFullYear(),
          date.getUTCMonth(),
          date.getUTCDate(),
          date.getUTCHours(),
          date.getUTCMinutes(),
          date.getUTCSeconds()
        );
      }
    }

    const texto = String(valor).trim();
    if (!texto) return null;

    // Prioridade para padrão brasileiro DD/MM/YYYY.
    // Isso evita o JS interpretar 12/04/2026 como 04/dezembro/2026.
    let match = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?(?:\s*(AM|PM))?/i);
    if (match) {
      let [, p1, p2, yyyy, hh = '00', mi = '00', ss = '00', periodo] = match;

      let dia = Number(p1);
      let mes = Number(p2);
      let hora = Number(hh);

      // Se vier americano MM/DD/YYYY, ex.: 04/22/2026,
      // p2 > 12 denuncia que o segundo número é o dia.
      if (mes > 12) {
        dia = Number(p2);
        mes = Number(p1);
      }

      if (periodo) {
        const p = periodo.toUpperCase();
        if (p === 'PM' && hora < 12) hora += 12;
        if (p === 'AM' && hora === 12) hora = 0;
      }

      if (mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31) {
        return new Date(
          Number(yyyy),
          mes - 1,
          dia,
          hora,
          Number(mi),
          Number(ss || 0)
        );
      }
    }

    // ISO YYYY-MM-DD.
    match = texto.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (match) {
      const [, yyyy, mm, dd, hh = '00', mi = '00', ss = '00'] = match;
      return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss));
    }

    // Português: 13 de abril de 2026 16:14.
    match = texto.match(/^(\d{1,2})\s+de\s+([a-zçãéêíóôõú]+)\s+de\s+(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/i);
    if (match) {
      const meses = {
        janeiro: 0,
        fevereiro: 1,
        março: 2,
        marco: 2,
        abril: 3,
        maio: 4,
        junho: 5,
        julho: 6,
        agosto: 7,
        setembro: 8,
        outubro: 9,
        novembro: 10,
        dezembro: 11
      };

      const [, dd, mesTexto, yyyy, hh = '00', mi = '00'] = match;
      const mes = meses[normalizarTexto(mesTexto)];
      if (mes !== undefined) {
        return new Date(Number(yyyy), mes, Number(dd), Number(hh), Number(mi), 0);
      }
    }

    const tentativaDireta = new Date(texto);
    if (!isNaN(tentativaDireta.getTime())) return tentativaDireta;

    return null;
  }


  function obterDataDaVisaoResumo(item) {
    const visao = filtroVisaoDataResumo?.value || 'pedido';

    if (visao === 'financeira') {
      return item?.data_financeira ||
        item?.data_liquidacao ||
        item?.data_pagamento ||
        item?.data_pagamento_compra ||
        item?.data_custo ||
        item?.paid_time ||
        item?.PaidTime ||
        item?.data_pedido ||
        item?.data_venda ||
        item?.data_criacao ||
        item?.created_time ||
        item?.CreatedTime ||
        item?.data_importacao ||
        item?.data;
    }

    // Regra robusta:
    // alguns geradores/marketplaces gravam a data como data_venda ou data_criacao.
    // Se o filtro usa só data_pedido/data, as vendas de maio ficam invisíveis.
    return item?.data_pedido ||
      item?.data_venda ||
      item?.data_criacao ||
      item?.created_time ||
      item?.CreatedTime ||
      item?.data_importacao ||
      item?.data_pagamento ||
      item?.data_financeira ||
      item?.data;
  }

  function obterDataCustoDaVisao(item) {
    const visao = filtroVisaoDataResumo?.value || 'pedido';

    if (visao === 'financeira') {
      return item?.data_custo ||
        item?.data_pagamento ||
        item?.data_pagamento_compra ||
        item?.data_importacao ||
        item?.data_criacao ||
        item?.data_embalado ||
        item?.data_etiqueta;
    }

    return item?.data_pedido ||
      item?.data_venda ||
      item?.data_importacao ||
      item?.data_criacao ||
      item?.data_pagamento;
  }


  function ehVendaCancelada(item) {
    const status = normalizarTexto(item?.status_harmonizado || item?.status || item?.status_original);
    return status === 'cancelado' || status.includes('cancelado') || status.includes('cancelada');
  }

  // Regra financeira do Resumo:
  // - contagem de vendas/pedidos continua considerando tudo que veio da plataforma;
  // - cálculo de faturamento, repasse, custo, receita líquida e margem EXCLUI cancelados.
  function entraNoCalculoFinanceiro(item) {
    return !ehVendaCancelada(item);
  }

  function listaFinanceira(lista = []) {
    return (Array.isArray(lista) ? lista : []).filter(entraNoCalculoFinanceiro);
  }

  function ehCustoExcluido(item) {
    const status = normalizarTexto(item?.status_custo || item?.status_final_robo || item?.status_original || item?.status);
    return status === 'cancelado' || status === 'bloqueado';
  }


  // =====================================================
  // CONTAGEM CORRETA DE PEDIDOS DISTINTOS
  // Regra: 2 produtos/linhas no mesmo pedido = 1 pedido.
  // NUNCA usa SKU para contar pedido.
  // =====================================================
  function chavePedidoDistintoResumo(item, index = 0) {
    const canal = item?.canal_normalizado || normalizarCanal(item) || 'GERAL';

    const camposPedido = [
      item?.pedido,
      item?.id_pedido,
      item?.numero_pedido,
      item?.order_id,
      item?.id_order,
      item?.id_venda,
      item?.codigo_pedido,
      item?.orderId,
      item?.pedido_mkt,
      item?.id_pedido_mkt,
      item?.ml_pedido_principal
    ];

    const bruto = camposPedido.find(v => v !== undefined && v !== null && String(v).trim() !== '');

    if (bruto !== undefined && bruto !== null && String(bruto).trim() !== '') {
      let pedidoNormalizado = String(bruto)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .trim()
        .replace(/\.0$/g, '')
        .replace(/\s+/g, '')
        .replace(/[^0-9]/g, '');

      // Se por algum motivo o pedido não for numérico, mantém uma chave textual estável.
      if (!pedidoNormalizado) {
        pedidoNormalizado = String(bruto)
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[\u200B-\u200D\uFEFF]/g, '')
          .trim()
          .replace(/\s+/g, '')
          .toUpperCase();
      }

      if (pedidoNormalizado) return `${canal}__${pedidoNormalizado}`;
    }

    return null;
  }

  function agruparPorPedidoDistintoResumo(lista = []) {
    const mapa = new Map();

    (Array.isArray(lista) ? lista : []).forEach((item, index) => {
      const chave = chavePedidoDistintoResumo(item, index);
      if (!chave) return;
      if (!mapa.has(chave)) mapa.set(chave, []);
      mapa.get(chave).push(item);
    });

    return Array.from(mapa.values());
  }

  function contarPedidoDistintoResumo(lista = []) {
    return agruparPorPedidoDistintoResumo(lista).length;
  }

  function statusDoPedidoDistintoResumo(linhasPedido = []) {
    const statuses = linhasPedido.map(item => normalizarTexto(item?.status_harmonizado || item?.status || item?.status_original));

    // Prioridade do pedido: cancelado vence se qualquer linha estiver cancelada.
    if (statuses.some(s => s === 'cancelado' || s.includes('cancelado') || s.includes('cancelada'))) return 'Cancelado';
    if (statuses.some(s => ['precisa enviar', 'esperando emitir nf', 'emitir nf'].includes(s))) return 'Para sair';
    if (statuses.some(s => ['em transito', 'em trânsito', 'envio manual acompanhar'].includes(s))) return 'Em trânsito';
    if (statuses.some(s => ['concluido', 'concluído', 'entregue', 'em avaliacao', 'em avaliação', 'outros'].includes(s))) return 'Concluído';
    if (statuses.some(s => ['nao efetivado', 'não efetivado'].includes(s))) return 'Não efetivado';

    return 'Outros';
  }

  function contarPedidosDistintosPorStatusResumo(lista = []) {
    const grupos = agruparPorPedidoDistintoResumo(lista);

    const contagem = {
      total: grupos.length,
      concluidos: 0,
      emTransito: 0,
      paraSair: 0,
      cancelados: 0,
      outros: 0
    };

    grupos.forEach(linhasPedido => {
      const status = statusDoPedidoDistintoResumo(linhasPedido);

      if (status === 'Concluído') contagem.concluidos += 1;
      else if (status === 'Em trânsito') contagem.emTransito += 1;
      else if (status === 'Para sair') contagem.paraSair += 1;
      else if (status === 'Cancelado') contagem.cancelados += 1;
      else contagem.outros += 1;
    });

    return contagem;
  }

  function auditarPedidosDistintosResumo(lista = [], canal = '') {
    try {
      const grupos = agruparPorPedidoDistintoResumo(lista);
      const linhas = grupos.map((linhasPedido, idx) => ({
        canal,
        grupo: idx + 1,
        chave: chavePedidoDistintoResumo(linhasPedido[0], idx),
        pedido: linhasPedido[0]?.pedido || linhasPedido[0]?.order_id || linhasPedido[0]?.id_pedido || '-',
        qtd_linhas_produtos: linhasPedido.length,
        status_calculado: statusDoPedidoDistintoResumo(linhasPedido),
        status_linhas: [...new Set(linhasPedido.map(x => x.status_harmonizado || x.status || x.status_original || '-'))].join(' | '),
        skus: linhasPedido.map(x => x.sku || '-').join(' | ')
      }));

      console.group(`[AUDITORIA PEDIDOS STATUS] ${canal}`);
      console.table(linhas);
      console.groupEnd();
    } catch (e) {
      console.warn('[AUDITORIA PEDIDOS STATUS] erro', e);
    }
  }

  function obterQuantidade(item) {
    const qtd = paraNumero(item?.quantidade);
    return qtd > 0 ? qtd : 1;
  }

  function prepararCustos(lista) {
    return (Array.isArray(lista) ? lista : []).map(item => ({
      ...item,
      canal_normalizado: normalizarCanal(item),
      custo_normalizado: obterCusto(item)
    }));
  }

  function obterListaCustoFiltrada(opcoes = {}) {
    let lista = [...custos];

    const mkt = filtroMarketplaceResumo?.value || 'todos';
    const dataInicio = filtroDataInicioResumo?.value || '';
    const dataFim = filtroDataFimResumo?.value || '';

    if (mkt !== 'todos') {
      lista = lista.filter(item => item.canal_normalizado === mkt);
    }

    if (!opcoes.ignorarDatas && (dataInicio || dataFim)) {
      const inicio = dataInicio ? parseInputDataResumo(dataInicio, false) : null;
      const fim = dataFim ? parseInputDataResumo(dataFim, true) : null;

      lista = lista.filter(item => {
        const data = parseDataVenda(obterDataCustoDaVisao(item));
        if (!data) return false;
        if (inicio && data < inicio) return false;
        if (fim && data > fim) return false;
        return true;
      });
    }

    return lista;
  }

  function renderRegrasResumo() {
    const el = document.getElementById('regrasResumo');
    if (!el) return;

    const regras = [
      'Total de pedidos: conta todas as vendas/pedidos do recorte, inclusive Cancelado, para bater com a tela de Vendas.',
      'Total de produtos: soma quantidades das vendas do recorte; valores financeiros e margem excluem Cancelado.',
      'Total faturado, frete, comissão, repasse, custo, receita líquida e margem: excluem pedidos Cancelados.',
      'Visão Pedido: filtra e soma vendas pela data do pedido; custo acompanha os pedidos filtrados.',
      'Visão Financeira: filtra receita pela data financeira/liquidação e custo pela data de pagamento/importação.',
      'Receita líquida: Repasse - Total de custo.',
      'Margem líquida: Receita líquida / Total faturado. Meta mínima: 20%.'
    ];

    el.innerHTML = regras.map(regra => `<li>${regra}</li>`).join('');
  }

  function obterListaFiltrada(opcoes = {}) {
    let lista = [...vendas];

    const mkt = filtroMarketplaceResumo?.value || 'todos';
    const status = filtroStatusResumo?.value || 'todos';
    const dataInicio = filtroDataInicioResumo?.value || '';
    const dataFim = filtroDataFimResumo?.value || '';

    if (mkt !== 'todos') {
      lista = lista.filter(item => item.canal_normalizado === mkt);
    }

    if (status !== 'todos') {
      lista = lista.filter(item => item.status_harmonizado === status);
    }

    if (!opcoes.ignorarDatas && (dataInicio || dataFim)) {
      const inicio = dataInicio ? parseInputDataResumo(dataInicio, false) : null;
      const fim = dataFim ? parseInputDataResumo(dataFim, true) : null;

      lista = lista.filter(item => {
        const data = parseDataVenda(obterDataDaVisaoResumo(item));
        if (!data) return false;
        if (inicio && data < inicio) return false;
        if (fim && data > fim) return false;
        return true;
      });
    }

    return lista;
  }



function formatarInputData(data) {
  if (!(data instanceof Date) || isNaN(data.getTime())) return '';

  const dia = String(data.getDate()).padStart(2, '0');
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const ano = data.getFullYear();

  return `${dia}/${mes}/${ano}`;
}

  function mascaraDataBR(valor) {
    const numeros = String(valor || '').replace(/\D/g, '').slice(0, 8);

    if (numeros.length <= 2) return numeros;
    if (numeros.length <= 4) return `${numeros.slice(0, 2)}/${numeros.slice(2)}`;

    return `${numeros.slice(0, 2)}/${numeros.slice(2, 4)}/${numeros.slice(4)}`;
  }

  function dataInputEstaCompleta(valor) {
    return /^\d{2}\/\d{2}\/\d{4}$/.test(String(valor || '').trim()) ||
      /^\d{4}-\d{2}-\d{2}$/.test(String(valor || '').trim());
  }

  function parseInputDataResumo(valor, fimDoDia = false) {
    if (!valor) return null;

    const texto = String(valor).trim();
    let match = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

    if (match) {
      const [, dd, mm, yyyy] = match;
      const data = new Date(
        Number(yyyy),
        Number(mm) - 1,
        Number(dd),
        fimDoDia ? 23 : 0,
        fimDoDia ? 59 : 0,
        fimDoDia ? 59 : 0
      );

      if (
        data.getFullYear() === Number(yyyy) &&
        data.getMonth() === Number(mm) - 1 &&
        data.getDate() === Number(dd)
      ) {
        return data;
      }

      return null;
    }

    match = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (match) {
      const [, yyyy, mm, dd] = match;
      return new Date(
        Number(yyyy),
        Number(mm) - 1,
        Number(dd),
        fimDoDia ? 23 : 0,
        fimDoDia ? 59 : 0,
        fimDoDia ? 59 : 0
      );
    }

    return null;
  }

function dataBrParaIso(valor) {
  const m = String(valor || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return '';

  const [, dia, mes, ano] = m;
  return `${ano}-${mes}-${dia}`;
}

function dataIsoParaBr(valor) {
  const m = String(valor || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';

  const [, ano, mes, dia] = m;
  return `${dia}/${mes}/${ano}`;
}

function prepararCampoDataResumo(input) {
  if (!input) return;

  const picker = document.getElementById(`${input.id}Picker`);
  const botao = document.querySelector(`[data-date-target="${input.id}"]`);

  function sincronizarPicker() {
    if (picker) picker.value = dataBrParaIso(input.value);
  }

  function aplicarFiltroSeValido() {
    const vazio = !String(input.value || '').trim();
    const valido = vazio || dataInputEstaCompleta(input.value);

    input.classList.toggle('input-data-invalida', !valido);
    sincronizarPicker();

    if (valido && vendas.length) {
      aplicarTudoNaTela();
    }
  }

  input.addEventListener('input', () => {
    input.value = mascaraDataBR(input.value);
    sincronizarPicker();
  });

  input.addEventListener('blur', aplicarFiltroSeValido);

  input.addEventListener('change', aplicarFiltroSeValido);

  if (picker) {
    picker.addEventListener('change', () => {
      input.value = dataIsoParaBr(picker.value);
      input.classList.remove('input-data-invalida');
      if (vendas.length) aplicarTudoNaTela();
    });
  }

  if (botao) {
    botao.addEventListener('click', () => {
      sincronizarPicker();
      if (picker && typeof picker.showPicker === 'function') {
        picker.showPicker();
      } else if (picker) {
        picker.click();
      } else {
        input.focus();
      }
    });
  }
}


function obterPeriodoMesAtualResumo() {
  const referencia = new Date();
  const inicio = new Date(referencia.getFullYear(), referencia.getMonth(), 1);
  const fim = new Date(referencia.getFullYear(), referencia.getMonth() + 1, 0);

  return { inicio, fim };
}

function sincronizarPickerResumo(input, data) {
  if (!input || !(data instanceof Date) || isNaN(data.getTime())) return;

  const picker = document.getElementById(`${input.id}Picker`);
  if (picker) {
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    picker.value = `${ano}-${mes}-${dia}`;
  }
}

function aplicarFiltroMesAtualPadrao(force = false) {
  if (!filtroDataInicioResumo || !filtroDataFimResumo) return;

  const inicioAtual = (filtroDataInicioResumo.value || '').trim();
  const fimAtual = (filtroDataFimResumo.value || '').trim();

  if (!force && (inicioAtual || fimAtual)) return;

  const { inicio, fim } = obterPeriodoMesAtualResumo();

  filtroDataInicioResumo.value = formatarInputData(inicio);
  filtroDataFimResumo.value = formatarInputData(fim);

  filtroDataInicioResumo.classList.remove('input-data-invalida');
  filtroDataFimResumo.classList.remove('input-data-invalida');

  sincronizarPickerResumo(filtroDataInicioResumo, inicio);
  sincronizarPickerResumo(filtroDataFimResumo, fim);
}
  function calcularMargemPorData(lista) {
    const mapa = new Map();

    listaFinanceira(lista).forEach(item => {
      const data = item._dataObj || parseDataVenda(obterDataDaVisaoResumo(item));
      if (!data) return;

      const chave = [
        data.getFullYear(),
        String(data.getMonth() + 1).padStart(2, '0'),
        String(data.getDate()).padStart(2, '0')
      ].join('-');

      if (!mapa.has(chave)) {
        mapa.set(chave, {
          faturado: 0,
          repasse: 0,
          custo: 0
        });
      }

      const atual = mapa.get(chave);
      atual.faturado += paraNumero(item.preco_venda_normalizado);
      atual.repasse += paraNumero(item.repasse_normalizado);
      atual.custo += paraNumero(item.custo_normalizado);
    });

    const resultado = new Map();

    mapa.forEach((valores, chave) => {
      const margem = valores.faturado > 0
        ? ((valores.repasse - valores.custo) / valores.faturado) * 100
        : null;

      resultado.set(chave, margem);
    });

    return resultado;
  }

  function chaveMesmoDiaMesAnterior(dataRef) {
    if (!(dataRef instanceof Date) || isNaN(dataRef.getTime())) return '';

    const anterior = new Date(dataRef);
    anterior.setMonth(anterior.getMonth() - 1);

    const ano = anterior.getFullYear();
    const mes = String(anterior.getMonth() + 1).padStart(2, '0');
    const dia = String(anterior.getDate()).padStart(2, '0');

    return `${ano}-${mes}-${dia}`;
  }


  function obterUltimos30Dias(lista) {
    const comData = lista
      .map(item => ({ ...item, _dataObj: parseDataVenda(obterDataDaVisaoResumo(item)) }))
      .filter(item => item._dataObj instanceof Date && !isNaN(item._dataObj.getTime()))
      .sort((a, b) => a._dataObj - b._dataObj);

    if (!comData.length) return [];

    const ultimaData = comData[comData.length - 1]._dataObj;
    const inicioJanela = new Date(ultimaData);
    inicioJanela.setDate(inicioJanela.getDate() - 29);
    inicioJanela.setHours(0, 0, 0, 0);

    return comData.filter(item => item._dataObj >= inicioJanela);
  }

 function calcularResumo(lista) {
  const vendasTodas = Array.isArray(lista) ? lista : [];
  const vendasValidas = listaFinanceira(vendasTodas);
  const custosValidos = obterListaCustoFiltrada().filter(item => !ehCustoExcluido(item));

  // ✅ CORREÇÃO AQUI:
  // Total de pedidos = pedido distinto (usando a função correta)
  const totalPedidos = contarPedidoDistintoResumo(vendasValidas);
  
  // ✅ CORREÇÃO AQUI:
  // Total de produtos = SOMA das quantidades (isso está correto, é quantos itens/produtos foram vendidos)
  const totalProdutos = vendasValidas.reduce((acc, item) => acc + obterQuantidade(item), 0);

  const faturado = vendasValidas.reduce((acc, item) => acc + paraNumero(item.preco_venda_normalizado), 0);
  const frete = vendasValidas.reduce((acc, item) => acc + paraNumero(item.frete_normalizado), 0);
  const comissao = vendasValidas.reduce((acc, item) => acc + paraNumero(item.comissao_normalizado), 0);
  const repasse = vendasValidas.reduce((acc, item) => acc + paraNumero(item.repasse_normalizado), 0);

  const visao = filtroVisaoDataResumo?.value || 'pedido';

  const custo = visao === 'financeira'
    ? custosValidos.reduce((acc, item) => acc + paraNumero(item.custo_normalizado), 0)
    : vendasValidas.reduce((acc, item) => acc + paraNumero(item.custo_normalizado), 0);

  const receitaLiquida = repasse - custo;
  const margemMedia = faturado > 0 ? (receitaLiquida / faturado) * 100 : 0;

  const ml = vendasValidas.filter(v => v.canal_normalizado === 'ML');
  const shopee = vendasValidas.filter(v => v.canal_normalizado === 'Shopee');
  const tiktok = vendasValidas.filter(v => v.canal_normalizado === 'TikTok');

  return {
    totalPedidos,           // ✅ Agora conta pedidos distintos
    totalProdutos,          // ✅ Soma de quantidades (SKUs/linhas)
    faturado,
    frete,
    comissao,
    repasse,
    custo,
    receitaLiquida,
    margemMedia,

    mlTotal: ml.reduce((acc, item) => acc + paraNumero(item.repasse_normalizado), 0),
    shopeeTotal: shopee.reduce((acc, item) => acc + paraNumero(item.repasse_normalizado), 0),
    tiktokTotal: tiktok.reduce((acc, item) => acc + paraNumero(item.repasse_normalizado), 0),

    mlFaturado: ml.reduce((acc, item) => acc + paraNumero(item.preco_venda_normalizado), 0),
    shopeeFaturado: shopee.reduce((acc, item) => acc + paraNumero(item.preco_venda_normalizado), 0),
    tiktokFaturado: tiktok.reduce((acc, item) => acc + paraNumero(item.preco_venda_normalizado), 0),

    mlQtd: contarPedidoDistintoResumo(ml),
    shopeeQtd: contarPedidoDistintoResumo(shopee),
    tiktokQtd: contarPedidoDistintoResumo(tiktok),
    custoQtd: custosValidos.length
  };
}

  function calcularResumoCanal(lista, canal) {
    const vendasCanalTodas = (Array.isArray(lista) ? lista : []).filter(v => v.canal_normalizado === canal);
    const vendasCanal = listaFinanceira(vendasCanalTodas);

    const faturado = vendasCanal.reduce((acc, item) => acc + paraNumero(item.preco_venda_normalizado), 0);
    const frete = vendasCanal.reduce((acc, item) => acc + paraNumero(item.frete_normalizado), 0);
    const comissao = vendasCanal.reduce((acc, item) => acc + paraNumero(item.comissao_normalizado), 0);
    const repasse = vendasCanal.reduce((acc, item) => acc + paraNumero(item.repasse_normalizado), 0);

    const custosCanal = obterListaCustoFiltrada()
      .filter(item => {
        const canalCusto = item.canal_normalizado || normalizarCanal(item);
        return canalCusto === canal && !ehCustoExcluido(item);
      });

    const visao = filtroVisaoDataResumo?.value || 'pedido';

    const custo = visao === 'financeira'
      ? custosCanal.reduce((acc, item) => acc + paraNumero(item.custo_normalizado), 0)
      : vendasCanal.reduce((acc, item) => acc + paraNumero(item.custo_normalizado), 0);

    console.log('[CUSTO POR CANAL]', canal, {
      registros_custo: custosCanal.length,
      custo_total: custo,
      exemplos: custosCanal.slice(0, 3).map(i => ({
        canal: i.canal,
        canal_normalizado: i.canal_normalizado,
        custo: i.custo,
        status: i.status_custo || i.status_final_robo || i.status_original
      }))
    });

    const receitaLiquida = repasse - custo;
    const margem = faturado > 0 ? (receitaLiquida / faturado) * 100 : 0;

    return {
      canal,
      // Mostra a quantidade de pedidos distintos do canal, inclusive cancelados.
      pedidos: contarPedidoDistintoResumo(vendasCanalTodas),
      faturado,
      frete,
      comissao,
      repasse,
      custo,
      receitaLiquida,
      margem
    };
  }


  function obterPeriodoReguaMensal(lista = []) {
    const inicioInput = filtroDataInicioResumo?.value || '';
    const fimInput = filtroDataFimResumo?.value || '';

    const inicioFiltro = inicioInput ? parseInputDataResumo(inicioInput, false) : null;
    const fimFiltro = fimInput ? parseInputDataResumo(fimInput, true) : null;

    if (inicioFiltro && fimFiltro) {
      return {
        inicio: new Date(inicioFiltro.getFullYear(), inicioFiltro.getMonth(), inicioFiltro.getDate()),
        fim: new Date(fimFiltro.getFullYear(), fimFiltro.getMonth(), fimFiltro.getDate())
      };
    }

    if (inicioFiltro) {
      return {
        inicio: new Date(inicioFiltro.getFullYear(), inicioFiltro.getMonth(), 1),
        fim: new Date(inicioFiltro.getFullYear(), inicioFiltro.getMonth() + 1, 0)
      };
    }

    if (fimFiltro) {
      return {
        inicio: new Date(fimFiltro.getFullYear(), fimFiltro.getMonth(), 1),
        fim: new Date(fimFiltro.getFullYear(), fimFiltro.getMonth(), fimFiltro.getDate())
      };
    }

    const datas = lista
      .map(item => parseDataVenda(obterDataDaVisaoResumo(item)))
      .filter(data => data instanceof Date && !isNaN(data.getTime()))
      .sort((a, b) => a - b);

    const referencia = datas.length ? datas[datas.length - 1] : new Date();

    return {
      inicio: new Date(referencia.getFullYear(), referencia.getMonth(), 1),
      fim: new Date(referencia.getFullYear(), referencia.getMonth() + 1, 0)
    };
  }

  function chaveDataRegua(data) {
    return [
      data.getFullYear(),
      String(data.getMonth() + 1).padStart(2, '0'),
      String(data.getDate()).padStart(2, '0')
    ].join('-');
  }

  function classeReguaMargem(margem, qtd) {
    if (!qtd) return 'regua-neutra';
    if (margem >= 20) return 'regua-ok';
    if (margem >= 10) return 'regua-alerta';
    return 'regua-ruim';
  }

  function renderReguaMargemCanal(lista, canal) {
    const periodo = obterPeriodoReguaMensal(lista);
    const mapa = new Map();

    lista
      .filter(item => item.canal_normalizado === canal && !ehVendaCancelada(item))
      .forEach(item => {
        const data = parseDataVenda(obterDataDaVisaoResumo(item));
        if (!data) return;

        const chave = chaveDataRegua(data);

        if (!mapa.has(chave)) {
          mapa.set(chave, {
            faturado: 0,
            repasse: 0,
            custo: 0,
            quantidade: 0
          });
        }

        const atual = mapa.get(chave);
        atual.faturado += paraNumero(item.preco_venda_normalizado);
        atual.repasse += paraNumero(item.repasse_normalizado);
        atual.custo += paraNumero(item.custo_normalizado);
        atual.quantidade += 1;
      });

    const dias = [];
    const cursor = new Date(periodo.inicio);
    const fim = new Date(periodo.fim);

    while (cursor <= fim) {
      const chave = chaveDataRegua(cursor);
      const valores = mapa.get(chave) || { faturado: 0, repasse: 0, custo: 0, quantidade: 0 };

      const margem = valores.faturado > 0
        ? ((valores.repasse - valores.custo) / valores.faturado) * 100
        : null;

      const dia = String(cursor.getDate()).padStart(2, '0');
      const mes = String(cursor.getMonth() + 1).padStart(2, '0');

      dias.push({
        dia,
        label: `${dia}/${mes}`,
        quantidade: valores.quantidade,
        margem,
        faturado: valores.faturado,
        repasse: valores.repasse,
        custo: valores.custo,
        classe: classeReguaMargem(margem || 0, valores.quantidade)
      });

      cursor.setDate(cursor.getDate() + 1);
    }

    const diasComVenda = dias.filter(d => d.quantidade > 0);
    const ok = diasComVenda.filter(d => d.margem >= 20).length;
    const alerta = diasComVenda.filter(d => d.margem >= 10 && d.margem < 20).length;
    const ruim = diasComVenda.filter(d => d.margem < 10).length;

    return `
      <div class="mkt-regua-margem">
        <div class="mkt-regua-head">
          <small>Farol de margem no mês</small>
          <strong>${ok}/${diasComVenda.length || 0} dias OK</strong>
        </div>

        <div class="mkt-regua-dias">
          ${dias.map(dia => {
            const titulo = dia.quantidade
              ? `${dia.label} | Margem ${formatarPercentual(dia.margem)} | ${dia.quantidade} venda(s) | Receita ${formatarMoeda(dia.faturado)} | Repasse ${formatarMoeda(dia.repasse)} | Custo ${formatarMoeda(dia.custo)}`
              : `${dia.label} | sem venda`;

            return `<span class="regua-dia ${dia.classe}" title="${titulo}">${dia.dia}</span>`;
          }).join('')}
        </div>

        <div class="mkt-regua-resumo">
          <span class="ok">${ok} OK</span>
          <span class="alerta">${alerta} atenção</span>
          <span class="ruim">${ruim} críticos</span>
        </div>
      </div>
    `;
  }


  function renderizarFarolMktMensal(lista = []) {
    const el = document.getElementById('farolMktMensal');
    if (!el) return;

    const canais = ['ML', 'Shopee', 'TikTok'];
    const labels = {
      ML: 'Mercado Livre',
      Shopee: 'Shopee',
      TikTok: 'TikTok'
    };

    const cards = canais.map(canal => {
      const itensCanal = (Array.isArray(lista) ? lista : [])
        .filter(item => item.canal_normalizado === canal && !ehVendaCancelada(item));

      const resumo = calcularResumoCanal(lista, canal);
      const diasComVenda = itensCanal.length;

      let classe = 'farol-mkt-ok';
      let texto = 'Meta OK';

      if (!diasComVenda || resumo.faturado <= 0) {
        classe = 'farol-mkt-neutro';
        texto = 'Sem venda';
      } else if (resumo.margem < 10) {
        classe = 'farol-mkt-ruim';
        texto = 'Crítico';
      } else if (resumo.margem < 20) {
        classe = 'farol-mkt-alerta';
        texto = 'Atenção';
      }

      return `
        <article class="farol-mkt-card ${classe}">
          <div class="farol-mkt-head">
            <div>
              <small>${labels[canal]}</small>
              <strong>${formatarPercentual(resumo.margem || 0)}</strong>
            </div>
            <span>${texto}</span>
          </div>

          <div class="farol-mkt-metrics">
            <div><small>Receita</small><strong>${formatarMoeda(resumo.faturado)}</strong></div>
            <div><small>Repasse</small><strong>${formatarMoeda(resumo.repasse)}</strong></div>
            <div><small>Custo</small><strong>${formatarMoeda(resumo.custo)}</strong></div>
            <div><small>Pedidos</small><strong>${resumo.pedidos}</strong></div>
          </div>

          ${renderReguaMargemCanal(lista, canal)}
        </article>
      `;
    }).join('');

    el.innerHTML = cards;

    console.log('[FAROL MKT] renderizado', {
      total_linhas_recebidas: Array.isArray(lista) ? lista.length : 0,
      canais: canais.map(canal => ({
        canal,
        linhas: (lista || []).filter(item => item.canal_normalizado === canal).length
      }))
    });
  }


  function renderResumoPorMarketplace(lista) {
    if (!resumoMktFinanceiro) return;

    const canais = ['ML', 'Shopee', 'TikTok'];
    const labels = {
      ML: 'Mercado Livre',
      Shopee: 'Shopee',
      TikTok: 'TikTok'
    };

    const dados = canais.map(canal => calcularResumoCanal(lista, canal));

    resumoMktFinanceiro.innerHTML = dados.map(item => `
      <article class="mkt-fin-card">
        <div class="mkt-fin-header">
          <span>${labels[item.canal] || item.canal}</span>
          <strong>${item.pedidos} ped.</strong>
        </div>

        <div class="mkt-fin-grid">
          <div>
            <small>Receita bruta</small>
            <strong>${formatarMoeda(item.faturado)}</strong>
          </div>

          <div>
            <small>Frete</small>
            <strong>${indicadorComPercentual(item.frete, item.faturado)}</strong>
          </div>

          <div>
            <small>Comissão</small>
            <strong>${indicadorComPercentual(item.comissao, item.faturado)}</strong>
          </div>

          <div>
            <small>Repasse</small>
            <strong>${indicadorComPercentual(item.repasse, item.faturado)}</strong>
          </div>

          <div>
            <small>Custo</small>
            <strong>${indicadorComPercentual(item.custo, item.faturado)}</strong>
          </div>

          <div>
            <small>Receita líquida</small>
            <strong>${indicadorComPercentual(item.receitaLiquida, item.faturado)}</strong>
          </div>

          <div class="margem-box ${classeMargem(item.margem)}">
            <small>Margem</small>
            <strong>${formatarPercentual(item.margem)}</strong>
            <span>${textoMargem(item.margem)} • Meta 20%</span>
          </div>

          <div>
            <small>Fonte custo</small>
            <strong>Tabela de custos</strong>
          </div>
        </div>
      </article>
    `).join('');
  }


  function deslocarDataMesAnterior(data) {
    if (!(data instanceof Date) || isNaN(data.getTime())) return null;
    return new Date(
      data.getFullYear(),
      data.getMonth() - 1,
      data.getDate(),
      data.getHours(),
      data.getMinutes(),
      data.getSeconds()
    );
  }

  function obterListaComparativoMesAnterior() {
    const mkt = filtroMarketplaceResumo?.value || 'todos';
    const status = filtroStatusResumo?.value || 'todos';
    const dataInicio = filtroDataInicioResumo?.value || '';
    const dataFim = filtroDataFimResumo?.value || '';

    let lista = [...vendas];

    if (mkt !== 'todos') {
      lista = lista.filter(item => item.canal_normalizado === mkt);
    }

    if (status !== 'todos') {
      lista = lista.filter(item => item.status_harmonizado === status);
    }

    let inicio = null;
    let fim = null;

    if (dataInicio || dataFim) {
      const inicioAtual = dataInicio ? parseInputDataResumo(dataInicio, false) : null;
      const fimAtual = dataFim ? parseInputDataResumo(dataFim, true) : null;

      inicio = inicioAtual ? deslocarDataMesAnterior(inicioAtual) : null;
      fim = fimAtual ? deslocarDataMesAnterior(fimAtual) : null;
    } else {
      const datas = lista
        .map(item => parseDataVenda(obterDataDaVisaoResumo(item)))
        .filter(data => data instanceof Date && !isNaN(data.getTime()))
        .sort((a, b) => a - b);

      if (datas.length) {
        const ref = datas[datas.length - 1];
        inicio = new Date(ref.getFullYear(), ref.getMonth() - 1, 1, 0, 0, 0);
        fim = new Date(ref.getFullYear(), ref.getMonth(), 0, 23, 59, 59);
      }
    }

    if (inicio || fim) {
      lista = lista.filter(item => {
        const data = parseDataVenda(obterDataDaVisaoResumo(item));
        if (!data) return false;
        if (inicio && data < inicio) return false;
        if (fim && data > fim) return false;
        return true;
      });
    }

    return lista;
  }

  function atualizarCardMargemComparativo(resumoAtual) {
    if (!cardMargem) return;

    const margemAtual = Number(resumoAtual?.margemMedia || 0);
    const meta = 20;

    const card = cardMargem.closest('.metric-card');
    if (card) {
      card.classList.remove('meta-ok', 'meta-ruim');
      card.classList.add(margemAtual >= meta ? 'meta-ok' : 'meta-ruim');
    }

    if (cardMargemMeta) {
      cardMargemMeta.textContent = `Meta atual: ${formatarPercentual(meta)}`;
    }

    if (!cardMargemComparativo) return;

    const listaAnterior = obterListaComparativoMesAnterior();
    const resumoAnterior = calcularResumo(listaAnterior);
    const margemAnterior = Number(resumoAnterior?.margemMedia || 0);

    if (!listaAnterior.length || !Number.isFinite(margemAnterior)) {
      cardMargemComparativo.textContent = 'Mês anterior: sem base';
      cardMargemComparativo.className = '';
      return;
    }

    const delta = margemAtual - margemAnterior;
    const sinal = delta >= 0 ? '▲' : '▼';
    const classe = delta >= 0 ? 'positivo' : 'negativo';

    cardMargemComparativo.innerHTML = `<span class="${classe}">${sinal} ${formatarPercentual(Math.abs(delta))}</span> vs mês ant. (${formatarPercentual(margemAnterior)})`;
  }


  function preencherResumo(resumo) {
    if (cardTotalPedidos) cardTotalPedidos.textContent = resumo.totalPedidos || 0;
    if (cardTotalProdutos) cardTotalProdutos.textContent = resumo.totalProdutos || 0;
    if (cardFaturado) cardFaturado.textContent = formatarMoeda(resumo.faturado);
    if (cardFrete) cardFrete.textContent = formatarMoeda(resumo.frete);
    if (cardComissao) cardComissao.textContent = formatarMoeda(resumo.comissao);
    if (cardCusto) cardCusto.textContent = formatarMoeda(resumo.custo);
    if (cardRepasse) cardRepasse.textContent = formatarMoeda(resumo.repasse);
    if (cardLiquido) cardLiquido.textContent = formatarMoeda(resumo.receitaLiquida);
    if (cardMargem) cardMargem.textContent = formatarPercentual(resumo.margemMedia);
    atualizarCardMargemComparativo(resumo);

    if (mlTotal) mlTotal.textContent = `${formatarMoeda(resumo.mlTotal)} • ${resumo.mlQtd} ped.`;
    if (shopeeTotal) shopeeTotal.textContent = `${formatarMoeda(resumo.shopeeTotal)} • ${resumo.shopeeQtd} ped.`;
    if (tiktokTotal) tiktokTotal.textContent = `${formatarMoeda(resumo.tiktokTotal)} • ${resumo.tiktokQtd} ped.`;
  }

  function atualizarStatusArquivos(resumo) {
    function aplicarStatus(el, qtd, faturado, repasse) {
      if (!el) return;

      const temQtd = Number(qtd || 0) > 0;
      const temValor = paraNumero(faturado) > 0 || paraNumero(repasse) > 0;

      el.classList.remove('badge-success', 'badge-warning', 'badge-soft');

      if (temValor) {
        el.textContent = 'Válido';
        el.classList.add('badge-success');
        return;
      }

      if (temQtd) {
        el.textContent = 'Pendente';
        el.classList.add('badge-warning');
        return;
      }

      el.textContent = 'Sem dados';
      el.classList.add('badge-soft');
    }

    aplicarStatus(statusML, resumo.mlQtd, resumo.mlFaturado, resumo.mlTotal);
    aplicarStatus(statusShopee, resumo.shopeeQtd, resumo.shopeeFaturado, resumo.shopeeTotal);
    aplicarStatus(statusTikTok, resumo.tiktokQtd, resumo.tiktokFaturado, resumo.tiktokTotal);

    if (statusCusto) {
      statusCusto.textContent = 'Válido';
      statusCusto.classList.remove('badge-warning', 'badge-soft');
      statusCusto.classList.add('badge-success');
    }
  }

  function preencherAlertas(lista) {
    const semCusto = lista.filter(v => !paraNumero(v.custo_normalizado)).length;
    const pagoCancelado = lista.filter(v =>
      v.status_harmonizado === 'Cancelado' &&
      (paraNumero(v.preco_venda_normalizado) > 0 || paraNumero(v.repasse_normalizado) > 0)
    ).length;
    const naoEfetivado = lista.filter(v => v.status_harmonizado === 'Não efetivado').length;

    if (alertaSemCusto) alertaSemCusto.textContent = semCusto;
    if (alertaPagoCancelado) alertaPagoCancelado.textContent = pagoCancelado;
    if (alertaNaoEfetivado) alertaNaoEfetivado.textContent = naoEfetivado;
  }

  function preencherResumoInteligente(lista, resumo) {
    const vendasValidas = lista.filter(item => !ehVendaCancelada(item));
    const cancelados = lista.filter(v => ehVendaCancelada(v)).length;

    const texto = `${resumo.totalPedidos} pedidos/vendas no recorte atual (${cancelados} cancelado(s) fora do cálculo de margem). Faturamento de ${formatarMoeda(resumo.faturado)}, repasse de ${formatarMoeda(resumo.repasse)}, custo operacional de ${formatarMoeda(resumo.custo)} e receita líquida de ${formatarMoeda(resumo.receitaLiquida)}. Margem líquida sobre faturamento: ${formatarPercentual(resumo.margemMedia)}.`;

    if (resumoInteligente) resumoInteligente.textContent = texto;
  }

  function agruparPorDia(lista) {
    const mapa = new Map();

    listaFinanceira(lista).forEach(item => {
      const data = item._dataObj || parseDataVenda(item.data);
      if (!data) return;

      const chave = [
        String(data.getDate()).padStart(2, '0'),
        String(data.getMonth() + 1).padStart(2, '0')
      ].join('/');

      if (!mapa.has(chave)) {
        mapa.set(chave, {
          dataRef: new Date(data.getFullYear(), data.getMonth(), data.getDate()),
          faturado: 0,
          repasse: 0,
          custo: 0,
          quantidade: 0
        });
      }

      const atual = mapa.get(chave);
      atual.faturado += paraNumero(item.preco_venda_normalizado);
      atual.repasse += paraNumero(item.repasse_normalizado);
      atual.custo += paraNumero(item.custo_normalizado);
      atual.quantidade += 1;
    });

    return Array.from(mapa.entries())
      .map(([dia, valores]) => {
        const margem = valores.faturado > 0
          ? ((valores.repasse - valores.custo) / valores.faturado) * 100
          : 0;

        return {
          dia,
          dataRef: valores.dataRef,
          faturado: Number(valores.faturado.toFixed(2)),
          repasse: Number(valores.repasse.toFixed(2)),
          custo: Number(valores.custo.toFixed(2)),
          margem: Number(margem.toFixed(2)),
          quantidade: valores.quantidade
        };
      })
      .sort((a, b) => a.dataRef - b.dataRef);
  }

  function criarGraficoBarraLinha(canvas, datasets, yMaxSugestao = null) {
    return new Chart(canvas, {
      data: {
        labels: datasets.labels,
        datasets: datasets.series
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        layout: {
          padding: {
            top: 26,
            right: 12,
            left: 8,
            bottom: 8
          }
        },
        plugins: {
          legend: { position: 'top' }
        },
        scales: {
          yValor: {
            type: 'linear',
            position: 'left',
            suggestedMax: yMaxSugestao || undefined,
            ticks: {
              callback: (value) => `R$ ${Number(value).toLocaleString('pt-BR')}`
            }
          },
          yPercentual: {
            type: 'linear',
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: {
              callback: (value) => `${value}%`
            }
          },
          yQuantidade: {
            type: 'linear',
            position: 'right',
            offset: true,
            grid: { drawOnChartArea: false },
            ticks: {
              callback: (value) => `${value}`
            }
          }
        }
      },
      plugins: [pluginLabelsGrafico]
    });
  }

  function montarDatasets(agrupado) {
    const labels = agrupado.map(i => i.dia);
    const faturado = agrupado.map(i => i.faturado);
    const repasse = agrupado.map(i => i.repasse);
    const margem = agrupado.map(i => i.quantidade > 0 ? i.margem : null);
    const quantidade = agrupado.map(i => i.quantidade);

    return {
      labels,
      series: [
        {
          type: 'bar',
          label: 'Receita bruta',
          data: faturado,
          backgroundColor: 'rgba(242,108,99,0.75)',
          borderColor: '#f26c63',
          borderWidth: 1,
          yAxisID: 'yValor'
        },
        {
          type: 'bar',
          label: 'Repasse',
          data: repasse,
          backgroundColor: 'rgba(192,138,132,0.75)',
          borderColor: '#c08a84',
          borderWidth: 1,
          yAxisID: 'yValor'
        },
        {
          type: 'line',
          label: 'Margem %',
          data: margem,
          borderColor: '#8f6f6a',
          backgroundColor: '#8f6f6a',
          tension: 0.3,
          yAxisID: 'yPercentual'
        },
        {
          type: 'line',
          label: 'Qtd. vendas',
          data: quantidade,
          borderColor: '#6b7280',
          backgroundColor: '#6b7280',
          tension: 0.3,
          yAxisID: 'yQuantidade'
        }
      ]
    };
  }

  function renderizarFarolMargemDiario(agrupado, listaComparacao = []) {
    const el = document.getElementById('farolMargemDiario');
    if (!el) return;

    if (!agrupado.length) {
      el.innerHTML = '<p class="farol-vazio">Sem dados para os últimos 30 dias.</p>';
      return;
    }

    const margemMesAnterior = calcularMargemPorData(listaComparacao);

    el.innerHTML = agrupado.map(item => {
      const chaveAnterior = chaveMesmoDiaMesAnterior(item.dataRef);
      const margemAnterior = margemMesAnterior.get(chaveAnterior);
      const temComparacao = margemAnterior !== null && margemAnterior !== undefined && Number.isFinite(Number(margemAnterior));
      const variacao = temComparacao ? item.margem - margemAnterior : null;
      const classeVariacao = !temComparacao
        ? 'neutro'
        : variacao >= 0
          ? 'positivo'
          : 'negativo';

      const textoVariacao = !temComparacao
        ? 'sem mês anterior'
        : `${variacao >= 0 ? '▲ +' : '▼ '}${formatarPercentual(variacao).replace('-', '')}`;

      const textoAnterior = !temComparacao
        ? ''
        : `Mês ant.: ${formatarPercentual(margemAnterior)}`;

      if (item.semVenda || !item.quantidade) {
        return `
          <article class="farol-dia farol-sem-venda">
            <strong>${item.dia}</strong>
            <span>-</span>
            <small>Sem venda</small>
            <em>0 venda(s)</em>
            <div class="comparativo-mes neutro">
              <b>sem movimento</b>
              <i>${textoAnterior || ''}</i>
            </div>
          </article>
        `;
      }

      return `
        <article class="farol-dia ${classeFarolMargem(item.margem)}">
          <strong>${item.dia}</strong>
          <span>${formatarPercentual(item.margem)}</span>
          <small>${textoFarolMargem(item.margem)}</small>
          <em>${item.quantidade} venda(s)</em>
          <div class="comparativo-mes ${classeVariacao}">
            <b>${textoVariacao}</b>
            <i>${textoAnterior}</i>
          </div>
        </article>
      `;
    }).join('');
  }


  function completarJanela30Dias(agrupado, listaReferencia = []) {
    const mapa = new Map();

    agrupado.forEach(item => {
      if (!item || !item.dataRef) return;
      const chave = [
        item.dataRef.getFullYear(),
        String(item.dataRef.getMonth() + 1).padStart(2, '0'),
        String(item.dataRef.getDate()).padStart(2, '0')
      ].join('-');

      mapa.set(chave, item);
    });

    const datasReferencia = listaReferencia
      .map(item => item._dataObj || parseDataVenda(obterDataDaVisaoResumo(item)))
      .filter(data => data instanceof Date && !isNaN(data.getTime()))
      .sort((a, b) => a - b);

    const ultimaData = datasReferencia.length
      ? datasReferencia[datasReferencia.length - 1]
      : new Date();

    const resultado = [];

    for (let i = 29; i >= 0; i--) {
      const data = new Date(ultimaData);
      data.setDate(data.getDate() - i);
      data.setHours(0, 0, 0, 0);

      const chave = [
        data.getFullYear(),
        String(data.getMonth() + 1).padStart(2, '0'),
        String(data.getDate()).padStart(2, '0')
      ].join('-');

      const dia = [
        String(data.getDate()).padStart(2, '0'),
        String(data.getMonth() + 1).padStart(2, '0')
      ].join('/');

      if (mapa.has(chave)) {
        resultado.push(mapa.get(chave));
      } else {
        resultado.push({
          dia,
          dataRef: data,
          faturado: 0,
          repasse: 0,
          custo: 0,
          margem: null,
          quantidade: 0,
          semVenda: true
        });
      }
    }

    return resultado;
  }


  function renderizarGrafico(lista) {
    const canvas = document.getElementById('graficoResumo');
    if (!canvas || typeof Chart === 'undefined') return;

    // Bloco fixo de "Últimos 30 dias":
    // ignora Data Inicial/Data Final, mas respeita Marketplace e Status.
    const baseUltimos30 = obterListaFiltrada({ ignorarDatas: true });

    const ultimos30 = obterUltimos30Dias(baseUltimos30);
    const agrupadoReal = agruparPorDia(ultimos30);
    const agrupado = completarJanela30Dias(agrupadoReal, ultimos30.length ? ultimos30 : baseUltimos30);
    const datasets = montarDatasets(agrupado);

    const listaComparacao = baseUltimos30;

    if (graficoResumo) graficoResumo.destroy();
    graficoResumo = criarGraficoBarraLinha(canvas, datasets);

    renderizarFarolMargemDiario(agrupado, listaComparacao);
  }


  function obterCampoTexto(item, campos, padrao = '-') {
    for (const campo of campos) {
      const valor = item?.[campo];
      if (valor !== undefined && valor !== null && String(valor).trim() !== '') return String(valor).trim();
    }
    return padrao;
  }

  function obterSkuProduto(item) {
    return obterCampoTexto(item, ['sku', 'seller_sku', 'SKU', 'codigo_sku', 'codigo_produto', 'id_sku', 'item_sku'], 'Sem SKU');
  }

  function obterNomeProduto(item) {
    return obterCampoTexto(item, ['produto', 'nome_produto', 'nome', 'titulo', 'title', 'product_name', 'descricao', 'item_title'], 'Produto sem nome');
  }

  function chaveMesAno(data) {
    return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
  }

  function labelMesAno(data) {
    return data.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '');
  }

  function obterBaseUltimos12Meses() {
    const base = obterListaFiltrada({ ignorarDatas: true })
      .map(item => ({ ...item, _dataObj: parseDataVenda(obterDataDaVisaoResumo(item)) }))
      .filter(item => item._dataObj instanceof Date && !isNaN(item._dataObj.getTime()));

    if (!base.length) return [];

    const datas = base.map(item => item._dataObj).sort((a, b) => a - b);
    const ultima = datas[datas.length - 1];
    const inicio = new Date(ultima.getFullYear(), ultima.getMonth() - 11, 1, 0, 0, 0);
    const fim = new Date(ultima.getFullYear(), ultima.getMonth() + 1, 0, 23, 59, 59);

    return base.filter(item => item._dataObj >= inicio && item._dataObj <= fim);
  }

  function agruparPorMesUltimos12(lista = []) {
    const base = Array.isArray(lista) ? lista : [];
    const datas = base.map(item => item._dataObj || parseDataVenda(obterDataDaVisaoResumo(item))).filter(data => data instanceof Date && !isNaN(data.getTime())).sort((a, b) => a - b);
    const referencia = datas.length ? datas[datas.length - 1] : new Date();
    const meses = [];

    for (let i = 11; i >= 0; i--) {
      const dataMes = new Date(referencia.getFullYear(), referencia.getMonth() - i, 1);
      meses.push({ chave: chaveMesAno(dataMes), label: labelMesAno(dataMes), dataRef: dataMes, itens: [], faturado: 0, repasse: 0, custo: 0, quantidade: 0, margem: null });
    }

    const mapa = new Map(meses.map(m => [m.chave, m]));

    listaFinanceira(base).forEach(item => {
      const data = item._dataObj || parseDataVenda(obterDataDaVisaoResumo(item));
      if (!data) return;
      const chave = chaveMesAno(data);
      if (!mapa.has(chave)) return;
      const mes = mapa.get(chave);
      mes.itens.push(item);
      mes.faturado += paraNumero(item.preco_venda_normalizado);
      mes.repasse += paraNumero(item.repasse_normalizado);
      mes.custo += paraNumero(item.custo_normalizado);
    });

    meses.forEach(mes => {
      mes.quantidade = contarPedidoDistintoResumo(mes.itens);
      mes.margem = mes.faturado > 0 ? ((mes.repasse - mes.custo) / mes.faturado) * 100 : null;
    });

    return meses.map(mes => ({ dia: mes.label, dataRef: mes.dataRef, faturado: Number(mes.faturado.toFixed(2)), repasse: Number(mes.repasse.toFixed(2)), custo: Number(mes.custo.toFixed(2)), margem: mes.margem === null ? null : Number(mes.margem.toFixed(2)), quantidade: mes.quantidade }));
  }

  function renderizarGraficoMensal12() {
    const canvas = document.getElementById('graficoMensal12');
    if (!canvas || typeof Chart === 'undefined') return;
    const base12 = obterBaseUltimos12Meses();
    const agrupado = agruparPorMesUltimos12(base12);
    const datasets = montarDatasets(agrupado);
    if (graficoMensal12) graficoMensal12.destroy();
    graficoMensal12 = criarGraficoBarraLinha(canvas, datasets);
    const badge = document.getElementById('badgeGraficoMensal12');
    if (badge) badge.textContent = 'Últimos 12 meses';
  }

 function calcularTopProdutos(lista = [], limite = 10) {
  const mapa = new Map();

  listaFinanceira(lista).forEach(item => {
    const sku = obterSkuProduto(item);
    const nome = obterNomeProduto(item);
    const canal = item.canal_normalizado || normalizarCanal(item);

    // ✅ consolida pelo SKU, não pelo nome
    const chave = sku;

    if (!mapa.has(chave)) {
      mapa.set(chave, {
        sku,
        nome,
        canais: new Set(),
        quantidade: 0,
        pedidosChaves: new Set(),
        faturado: 0,
        repasse: 0,
        custo: 0
      });
    }

    const atual = mapa.get(chave);

    // ✅ usa o nome mais completo apenas para exibição
    if (!atual.nome || String(nome).length > String(atual.nome).length) {
      atual.nome = nome;
    }

    atual.canais.add(canal || 'Desconhecido');
    atual.quantidade += obterQuantidade(item);
    atual.faturado += paraNumero(item.preco_venda_normalizado);
    atual.repasse += paraNumero(item.repasse_normalizado);
    atual.custo += paraNumero(item.custo_normalizado);

    const chavePedido = chavePedidoDistintoResumo(item);
    if (chavePedido) atual.pedidosChaves.add(chavePedido);
  });

  return Array.from(mapa.values())
    .map(item => ({
      ...item,
      pedidos: item.pedidosChaves.size,
      canaisTexto: Array.from(item.canais).filter(Boolean).join(' / '),
      receitaLiquida: item.repasse - item.custo,
      margem: item.faturado > 0 ? ((item.repasse - item.custo) / item.faturado) * 100 : 0
    }))
    .sort((a, b) => b.quantidade !== a.quantidade ? b.quantidade - a.quantidade : b.faturado - a.faturado)
    .slice(0, limite);
}
  function renderizarTopProdutos() {
    const tbody = document.getElementById('topProdutosBody');
    const vazio = document.getElementById('topProdutosVazio');
    if (!tbody) return;
    const base12 = obterBaseUltimos12Meses();
    const top = calcularTopProdutos(base12, 10);
    if (!top.length) {
      tbody.innerHTML = '';
      if (vazio) vazio.style.display = 'block';
      return;
    }
    if (vazio) vazio.style.display = 'none';
    tbody.innerHTML = top.map((item, index) => `
      <tr>
        <td><strong>${index + 1}</strong></td>
        <td><strong>${item.nome}</strong><small>${item.sku}</small></td>
        <td>${item.canaisTexto || '-'}</td>
        <td>${item.quantidade}</td>
        <td>${item.pedidos}</td>
        <td>${formatarMoeda(item.faturado)}</td>
        <td>${formatarMoeda(item.repasse)}</td>
        <td>${formatarPercentual(item.margem)}</td>
      </tr>
    `).join('');
  }



  function classeEntrega(percentual) {
    const p = Number(percentual || 0);
    if (p >= 70) return 'entrega-ok';
    if (p >= 45) return 'entrega-alerta';
    return 'entrega-ruim';
  }

  function textoEntrega(percentual) {
    const p = Number(percentual || 0);
    if (p >= 70) return 'Fluxo saudável';
    if (p >= 45) return 'Atenção operacional';
    return 'Gargalo operacional';
  }

  function renderizarEntregaPorCanal(lista) {
    const el = document.getElementById('entregaPorCanal');
    if (!el) return;

    const ultimos10 = typeof obterUltimos30Dias === 'function'
      ? obterUltimos30Dias(lista)
      : lista;

    const canais = ['ML', 'Shopee', 'TikTok'];
    const labels = { ML: 'Mercado Livre', Shopee: 'Shopee', TikTok: 'TikTok' };

    const cards = canais.map(canal => {
      const itens = ultimos10.filter(item => item.canal_normalizado === canal);

      auditarPedidosDistintosResumo(itens, canal);

      // IMPORTANTE:
      // Aqui não pode contar linha/produto.
      // Conta PEDIDO DISTINTO dentro de cada status.
      const contagem = contarPedidosDistintosPorStatusResumo(itens);

      const total = contagem.total;
      const concluidos = contagem.concluidos;
      const emTransito = contagem.emTransito;
      const paraSair = contagem.paraSair;
      const cancelados = contagem.cancelados;

      const taxaEntrega = total ? (concluidos / total) * 100 : 0;
      const base = total || 1;
      const pConcluido = (concluidos / base) * 100;
      const pTransito = (emTransito / base) * 100;
      const pSair = (paraSair / base) * 100;
      const pCancelado = (cancelados / base) * 100;

      return `
        <article class="entrega-card ${classeEntrega(taxaEntrega)}">
          <div class="entrega-card-head">
            <strong>${labels[canal]}</strong>
            <span>${total} ped.</span>
          </div>

          <div class="entrega-percentual">
            <strong>${formatarPercentual(taxaEntrega)}</strong>
            <small>${textoEntrega(taxaEntrega)}</small>
          </div>

          <div class="entrega-stack">
            <span class="stack-ok" style="width:${pConcluido}%"></span>
            <span class="stack-transito" style="width:${pTransito}%"></span>
            <span class="stack-sair" style="width:${pSair}%"></span>
            <span class="stack-cancelado" style="width:${pCancelado}%"></span>
          </div>

          <div class="entrega-grid">
            <div><small>Concluídos</small><b>${concluidos}</b></div>
            <div><small>Em trânsito</small><b>${emTransito}</b></div>
            <div><small>Para sair</small><b>${paraSair}</b></div>
            <div><small>Cancelados</small><b>${cancelados}</b></div>
          </div>
        </article>
      `;
    }).join('');

    el.innerHTML = cards;
  }


  function renderizarMiniGrafico(canvasId, lista, canal, graficoAtual) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return graficoAtual;

    const filtrada = lista.filter(item => item.canal_normalizado === canal);
    const ultimos14 = obterUltimos30Dias(filtrada);
    const agrupado = agruparPorDia(ultimos14);

    const labels = agrupado.map(i => i.dia);
    const faturado = agrupado.map(i => i.faturado);
    const repasse = agrupado.map(i => i.repasse);

    if (graficoAtual) graficoAtual.destroy();

    return new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Fat.',
            data: faturado,
            backgroundColor: 'rgba(242,108,99,0.75)',
            borderColor: '#f26c63',
            borderWidth: 1
          },
          {
            label: 'Rep.',
            data: repasse,
            backgroundColor: 'rgba(192,138,132,0.75)',
            borderColor: '#c08a84',
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' }
        },
        scales: {
          y: {
            ticks: {
              callback: (value) => `R$ ${Number(value).toLocaleString('pt-BR')}`
            }
          }
        }
      }
    });
  }



  function classeEntrega(percentual) {
    const p = Number(percentual || 0);
    if (p >= 70) return 'entrega-ok';
    if (p >= 45) return 'entrega-alerta';
    return 'entrega-ruim';
  }

  function textoEntrega(percentual) {
    const p = Number(percentual || 0);
    if (p >= 70) return 'Fluxo saudável';
    if (p >= 45) return 'Atenção operacional';
    return 'Gargalo operacional';
  }

  function renderizarEntregaPorCanal(lista) {
    const el = document.getElementById('entregaPorCanal');
    if (!el) return;

    const ultimos10 = typeof obterUltimos30Dias === 'function'
      ? obterUltimos30Dias(lista)
      : lista;

    const canais = ['ML', 'Shopee', 'TikTok'];
    const labels = { ML: 'Mercado Livre', Shopee: 'Shopee', TikTok: 'TikTok' };

    const cards = canais.map(canal => {
      const itens = ultimos10.filter(item => item.canal_normalizado === canal);

      auditarPedidosDistintosResumo(itens, canal);

      // IMPORTANTE:
      // Aqui não pode contar linha/produto.
      // Conta PEDIDO DISTINTO dentro de cada status.
      const contagem = contarPedidosDistintosPorStatusResumo(itens);

      const total = contagem.total;
      const concluidos = contagem.concluidos;
      const emTransito = contagem.emTransito;
      const paraSair = contagem.paraSair;
      const cancelados = contagem.cancelados;

      const taxaEntrega = total ? (concluidos / total) * 100 : 0;
      const base = total || 1;
      const pConcluido = (concluidos / base) * 100;
      const pTransito = (emTransito / base) * 100;
      const pSair = (paraSair / base) * 100;
      const pCancelado = (cancelados / base) * 100;

      return `
        <article class="entrega-card ${classeEntrega(taxaEntrega)}">
          <div class="entrega-card-head">
            <strong>${labels[canal]}</strong>
            <span>${total} ped.</span>
          </div>

          <div class="entrega-percentual">
            <strong>${formatarPercentual(taxaEntrega)}</strong>
            <small>${textoEntrega(taxaEntrega)}</small>
          </div>

          <div class="entrega-stack">
            <span class="stack-ok" style="width:${pConcluido}%"></span>
            <span class="stack-transito" style="width:${pTransito}%"></span>
            <span class="stack-sair" style="width:${pSair}%"></span>
            <span class="stack-cancelado" style="width:${pCancelado}%"></span>
          </div>

          <div class="entrega-grid">
            <div><small>Concluídos</small><b>${concluidos}</b></div>
            <div><small>Em trânsito</small><b>${emTransito}</b></div>
            <div><small>Para sair</small><b>${paraSair}</b></div>
            <div><small>Cancelados</small><b>${cancelados}</b></div>
          </div>
        </article>
      `;
    }).join('');

    el.innerHTML = cards;
  }


  function renderizarMiniGraficos(lista) {
    if (document.getElementById('entregaPorCanal')) return;

    const antigo = document.getElementById('graficosPorCanal');
    if (antigo) antigo.innerHTML = '';

    graficoML = renderizarMiniGrafico('graficoML', lista, 'ML', graficoML);
    graficoShopee = renderizarMiniGrafico('graficoShopee', lista, 'Shopee', graficoShopee);
    graficoTikTok = renderizarMiniGrafico('graficoTikTok', lista, 'TikTok', graficoTikTok);
  }

  function aplicarTudoNaTela() {
    try {
      let lista = obterListaFiltrada();

      // Não limpa datas automaticamente.
      // O resumo deve permanecer no período selecionado; por padrão, mês atual.

      const resumo = calcularResumo(lista);

      preencherResumo(resumo);
      renderResumoPorMarketplace(lista);
      renderizarFarolMktMensal(lista);
      atualizarStatusArquivos(resumo);
      preencherAlertas(lista);
      preencherResumoInteligente(lista, resumo);
      renderRegrasResumo();
      renderizarGrafico(lista);
      renderizarGraficoMensal12();
      renderizarTopProdutos();
      renderizarEntregaPorCanal(lista);
      renderizarMiniGraficos(lista);
    } catch (error) {
      console.error('Erro ao renderizar resumo:', error);
      logAuditoria('ERRO AO RENDERIZAR RESUMO', {
        mensagem: error.message,
        stack: error.stack
      });

      if (resumoInteligente) {
        resumoInteligente.textContent = `Erro ao renderizar: ${error.message}. Clique em Ver log e me envie o texto.`;
      }
    }
  }

  async function carregarResumo() {
    resetAuditoria();

    try {
      logAuditoria('Início do carregamento');

      const cache = Date.now();

      const [responseVendas, responseCustos] = await Promise.all([
        fetch('./data/vendas.json?v=' + cache),
        fetch('./data/custo.json?v=' + cache)
      ]);

      if (!responseVendas.ok) {
        throw new Error(`Não foi possível carregar o arquivo vendas.json (${responseVendas.status})`);
      }

      if (!responseCustos.ok) {
        throw new Error(`Não foi possível carregar o arquivo custo.json (${responseCustos.status})`);
      }

      const jsonVendas = await responseVendas.json();
      const jsonCustos = await responseCustos.json();

      if (!Array.isArray(jsonVendas)) {
        throw new Error('O conteúdo de vendas.json não é um array');
      }

      if (!Array.isArray(jsonCustos)) {
        throw new Error('O conteúdo de custo.json não é um array');
      }

      vendas = prepararVendas(jsonVendas);
      custos = prepararCustos(jsonCustos);

      aplicarFiltroMesAtualPadrao(true);
      aplicarTudoNaTela();
    } catch (error) {
      console.error('Erro ao carregar resumo executivo:', error);
      logAuditoria('ERRO', {
        mensagem: error.message,
        stack: error.stack
      });
    }
  }

  if (btnProcessar) {
    btnProcessar.addEventListener('click', () => {
      logAuditoria('Botão Processar clicado');
      carregarResumo();
    });
  }

  if (btnLog) {
    btnLog.addEventListener('click', () => {
      alert(auditoria ? auditoria.textContent : 'Sem auditoria disponível.');
    });
  }

  [filtroVisaoDataResumo, filtroMarketplaceResumo, filtroStatusResumo].forEach(el => {
    if (!el) return;
    el.addEventListener('change', () => {
      if (!vendas.length) return;
      aplicarTudoNaTela();
    });
  });

  prepararCampoDataResumo(filtroDataInicioResumo);
  prepararCampoDataResumo(filtroDataFimResumo);


  if (btnLimparFiltrosResumo) {
    btnLimparFiltrosResumo.addEventListener('click', () => {
      if (filtroVisaoDataResumo) filtroVisaoDataResumo.value = 'pedido';
      if (filtroMarketplaceResumo) filtroMarketplaceResumo.value = 'todos';
      if (filtroStatusResumo) filtroStatusResumo.value = 'todos';
      if (filtroDataInicioResumo) filtroDataInicioResumo.value = '';
      if (filtroDataFimResumo) filtroDataFimResumo.value = '';
      const pickerInicio = document.getElementById('filtroDataInicioResumoPicker');
      const pickerFim = document.getElementById('filtroDataFimResumoPicker');
      if (pickerInicio) pickerInicio.value = '';
      if (pickerFim) pickerFim.value = '';

      if (!vendas.length) return;

      aplicarFiltroMesAtualPadrao(true);
      aplicarTudoNaTela();
    });
  }

  carregarResumo();
});