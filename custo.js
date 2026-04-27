document.addEventListener('DOMContentLoaded', () => {
  const tbodyCusto = document.getElementById('tbodyCusto');
  const tbodyStatus = document.getElementById('tbodyStatus');
  const filtrosBar = document.querySelector('.filters-bar');
  const abas = document.querySelectorAll('.custo-tab-btn');

  const filtroMarketplace = document.getElementById('filtroMarketplaceCusto');
  const filtroPedido = document.getElementById('filtroPedidoCusto');
  const filtroSkuProduto = document.getElementById('filtroSkuProdutoCusto');
  const filtroDataInicio = document.getElementById('filtroDataInicioCusto');
  const filtroDataFim = document.getElementById('filtroDataFimCusto');
  const filtroTipoData = document.getElementById('filtroTipoDataCusto');
  const btnLimparFiltros = document.getElementById('btnLimparFiltrosCusto');
  const btnExportar = document.getElementById('btnExportarCusto');
  const resumoTabela = document.getElementById('resumoTabelaCusto');
  const resumoMapaStatus = document.getElementById('resumoMapaStatus');

  const ORDEM_STATUS = [
    'Embalado',
    'Cancelado',
    'Bloqueado',
    'Anexar Etiqueta',
    'Gerar Etiqueta',
    'Reembolsar'
  ];

  let baseCompleta = [];
  let custos = [];
  let mapaStatus = [];

  let filtroAtivo = {
    tipo: 'todos',
    valor: ''
  };

  function normalizarTexto(valor) {
    return String(valor || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function formatarMoeda(valor) {
    const numero = Number(valor || 0);

    if (!Number.isFinite(numero)) return '-';

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


  function numeroCustoSeguro(valor) {
    if (valor === null || valor === undefined || valor === '') return 0;
    if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;

    let texto = String(valor)
      .replace(/BRL|R\$/gi, '')
      .replace(/\s+/g, '')
      .trim();

    if (!texto) return 0;

    // Formato BR: 1.234,56
    if (texto.includes('.') && texto.includes(',')) {
      texto = texto.replace(/\./g, '').replace(',', '.');
    }
    // Formato BR simples: 43,20
    else if (texto.includes(',') && !texto.includes('.')) {
      texto = texto.replace(',', '.');
    }
    // Formato americano/JSON: 43.2 ou 43.20
    // NÃO remove ponto decimal aqui.

    const numero = Number(texto);
    return Number.isFinite(numero) ? numero : 0;
  }

  function obterValorCusto(item) {
    const campos = [
      item?.custo,
      item?.custo_final,
      item?.custo_compra,
      item?.valor_custo,
      item?.preco_custo
    ];

    for (const valor of campos) {
      const numero = numeroCustoSeguro(valor);
      if (numero > 0) return numero;
    }

    return 0;
  }

  function somarValorCusto(lista = []) {
    return (Array.isArray(lista) ? lista : []).reduce((acc, item) => acc + obterValorCusto(item), 0);
  }

  function atualizarClasseCard(idNumero, classe) {
    const el = document.getElementById(idNumero);
    const card = el?.closest('.mini-card');
    if (!card) return;

    card.classList.remove('card-pro-ok', 'card-pro-alerta', 'card-pro-ruim', 'card-pro-neutro');
    if (classe) card.classList.add(classe);
  }

  function formatarData(valor) {
    if (!valor) return '-';

    let v = String(valor).trim();

    if (!v || v === '-' || v === '--') return '-';

    v = v
      .replace(/\s+/g, ' ')
      .replace(/\s*hs\.?\s*$/i, '')
      .trim();

    // yyyy-mm-dd hh:mm ou yyyy-mm-dd hh:mm:ss
    let m = v.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (m) {
      const [, ano, mes, dia, hora, minuto, segundo = '00'] = m;
      return `${dia}/${mes}/${ano} ${hora}:${minuto}:${segundo}`;
    }

    // dd/mm/yyyy hh:mm ou dd/mm/yyyy hh:mm:ss
    m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (m) {
      let [, dia, mes, ano, hora, minuto, segundo = '00'] = m;
      dia = dia.padStart(2, '0');
      mes = mes.padStart(2, '0');
      hora = hora.padStart(2, '0');
      return `${dia}/${mes}/${ano} ${hora}:${minuto}:${segundo}`;
    }

    // 13 de abril de 2026 16:14
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

    m = v.toLowerCase().match(/^(\d{1,2}) de ([a-zçã]+) de (\d{4}) (\d{1,2}):(\d{2})(?::(\d{2}))?/i);
    if (m) {
      let [, dia, mesTexto, ano, hora, minuto, segundo = '00'] = m;
      const mes = meses[mesTexto] || '01';
      dia = dia.padStart(2, '0');
      hora = hora.padStart(2, '0');
      return `${dia}/${mes}/${ano} ${hora}:${minuto}:${segundo}`;
    }

    return v;
  }


  function dataParaComparacao(valor) {
    if (!valor) return null;

    const f = formatarData(valor);
    if (!f || f === '-') return null;

    const m = f.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
    if (!m) return null;

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

  function obterValorDataFiltro(item) {
    const tipo = filtroTipoData?.value || 'data_venda';

    if (tipo === 'data_importacao') return item.data_importacao || item.data_criacao;
    if (tipo === 'data_pagamento') return item.data_pagamento;
    if (tipo === 'data_embalado') return item.data_embalado;

    return item.data_venda;
  }

  function escaparHtml(valor) {
    return String(valor ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setText(id, valor) {
    const el = document.getElementById(id);
    if (el) el.textContent = valor;
  }

  function setCard(idNumero, idSub, numero, subtexto) {
    setText(idNumero, numero);
    setText(idSub, subtexto);
  }

  function obterClasseBadgeStatusCusto(status) {
    const s = normalizarTexto(status);

    if (s === 'embalado') return 'ok';

    if (
      s === 'anexar etiqueta' ||
      s === 'gerar etiqueta'
    ) {
      return 'warn';
    }

    if (
      s === 'cancelado' ||
      s === 'bloqueado' ||
      s === 'reembolsar'
    ) {
      return 'danger';
    }

    return 'neutral';
  }

  function obterClasseCruzamento(temCruzamento) {
    return temCruzamento ? 'ok' : 'neutral';
  }

  function obterAcaoSugerida(statusCusto) {
    const s = normalizarTexto(statusCusto);

    if (s === 'embalado') return 'Acompanhar envio';
    if (s === 'cancelado') return 'Revisar cancelamento/custo';
    if (s === 'bloqueado') return 'Desbloquear venda / revisar bloqueio';
    if (s === 'anexar etiqueta') return 'Anexar etiqueta';
    if (s === 'gerar etiqueta') return 'Gerar etiqueta';
    if (s === 'reembolsar') return 'Conferir reembolso';
    if (s === 'sem status') return 'Investigar';

    return 'Investigar';
  }

  function contarStatus(lista, status) {
    return lista.filter(i => normalizarTexto(i.status_custo) === normalizarTexto(status)).length;
  }

  function ehCanceladoOuReembolso(item) {
    const s = normalizarTexto(item.status_custo);
    return s === 'cancelado' || s === 'reembolsar';
  }

  function ehPendente(item) {
    const s = normalizarTexto(item.status_custo);
    return s === 'gerar etiqueta' || s === 'anexar etiqueta' || s === 'bloqueado';
  }

  function contarStatusMap() {
    const mapa = new Map();

    for (const item of custos) {
      const status = item.status_custo || 'Sem status';
      mapa.set(status, (mapa.get(status) || 0) + 1);
    }

    const statusOrdenados = [];

    for (const status of ORDEM_STATUS) {
      if (mapa.has(status)) {
        statusOrdenados.push({ status, quantidade: mapa.get(status) });
        mapa.delete(status);
      }
    }

    for (const [status, quantidade] of mapa.entries()) {
      statusOrdenados.push({ status, quantidade });
    }

    return statusOrdenados;
  }

  function renderFiltrosStatus() {
    if (!filtrosBar) return;

    const statusList = contarStatusMap();

    const botoesFixos = `
      <button class="filter-chip ${filtroAtivo.tipo === 'todos' ? 'active' : ''}" data-tipo="todos" data-valor="" type="button">
        Todos
      </button>
      <button class="filter-chip ${filtroAtivo.tipo === 'com_vendas' ? 'active' : ''}" data-tipo="com_vendas" data-valor="" type="button">
        Conciliadas com vendas
      </button>
      <button class="filter-chip ${filtroAtivo.tipo === 'sem_vendas' ? 'active' : ''}" data-tipo="sem_vendas" data-valor="" type="button">
        Não conciliadas
      </button>
      <button class="filter-chip ${filtroAtivo.tipo === 'validas' ? 'active' : ''}" data-tipo="validas" data-valor="" type="button">
        Compras válidas
      </button>
      <button class="filter-chip ${filtroAtivo.tipo === 'pendentes' ? 'active' : ''}" data-tipo="pendentes" data-valor="" type="button">
        Compras pendentes
      </button>
    `;

    const botoesStatus = statusList.map(item => {
      const ativo =
        filtroAtivo.tipo === 'status' &&
        normalizarTexto(filtroAtivo.valor) === normalizarTexto(item.status);

      return `
        <button class="filter-chip ${ativo ? 'active' : ''}"
          data-tipo="status"
          data-valor="${escaparHtml(item.status)}"
          type="button">
          ${escaparHtml(item.status)} (${item.quantidade})
        </button>
      `;
    }).join('');

    filtrosBar.innerHTML = botoesFixos + botoesStatus;

    filtrosBar.querySelectorAll('.filter-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        filtroAtivo = {
          tipo: btn.dataset.tipo || 'todos',
          valor: btn.dataset.valor || ''
        };

        renderFiltrosStatus();
        renderCustos();
      });
    });
  }

  function atualizarCards(listaFiltrada = custos) {
    const lista = Array.isArray(listaFiltrada) ? listaFiltrada : [];

    const totalCompras = lista.length;
    const conciliadasLista = lista.filter(i => i.tem_cruzamento_vendas);
    const validasLista = lista.filter(i => !ehCanceladoOuReembolso(i));
    const pendentesLista = lista.filter(i => ehPendente(i));

    const conciliadas = conciliadasLista.length;
    const validas = validasLista.length;
    const pendentes = pendentesLista.length;

    const pctConciliadas = totalCompras > 0 ? (conciliadas / totalCompras) * 100 : 0;
    const pctPendentes = validas > 0 ? (pendentes / validas) * 100 : 0;

    setCard('cardTotalCompras', 'cardTotalComprasSub', totalCompras, 'Base filtrada');
    setCard(
      'cardComprasConciliadas',
      'cardComprasConciliadasSub',
      conciliadas,
      `${formatarPercentual(pctConciliadas)} sobre o filtro`
    );
    setCard(
      'cardComprasValidas',
      'cardComprasValidasSub',
      validas,
      'Exclui Cancelado e Reembolsar'
    );
    setCard(
      'cardComprasPendentes',
      'cardComprasPendentesSub',
      pendentes,
      `${formatarPercentual(pctPendentes)} sobre compras válidas`
    );

    setCard(
      'cardValorTotalCompras',
      'cardValorTotalComprasSub',
      formatarMoeda(somarValorCusto(lista)),
      'Soma da base filtrada'
    );
    setCard(
      'cardValorConciliadas',
      'cardValorConciliadasSub',
      formatarMoeda(somarValorCusto(conciliadasLista)),
      'Somente conciliadas'
    );
    setCard(
      'cardValorValidas',
      'cardValorValidasSub',
      formatarMoeda(somarValorCusto(validasLista)),
      'Compras válidas'
    );
    setCard(
      'cardValorPendentes',
      'cardValorPendentesSub',
      formatarMoeda(somarValorCusto(pendentesLista)),
      'Pendências operacionais'
    );

    atualizarClasseCard('cardComprasConciliadas', pctConciliadas >= 80 ? 'card-pro-ok' : pctConciliadas >= 50 ? 'card-pro-alerta' : 'card-pro-ruim');
    atualizarClasseCard('cardComprasValidas', validas > 0 ? 'card-pro-ok' : 'card-pro-neutro');
    atualizarClasseCard('cardComprasPendentes', pendentes > 0 ? 'card-pro-alerta' : 'card-pro-ok');
    atualizarClasseCard('cardValorPendentes', pendentes > 0 ? 'card-pro-alerta' : 'card-pro-ok');

    setText('alertaCancelado', contarStatus(lista, 'Cancelado'));
    setText('alertaSemStatus', contarStatus(lista, 'Sem status'));
    setText('alertaPendentes', pendentes);

    console.log('[CUSTO] Cards PRO atualizados', {
      linhas_filtradas: lista.length,
      totalCompras,
      conciliadas,
      validas,
      pendentes,
      valores: {
        total: somarValorCusto(lista),
        conciliadas: somarValorCusto(conciliadasLista),
        validas: somarValorCusto(validasLista),
        pendentes: somarValorCusto(pendentesLista)
      },
      exemplos_custo: lista.slice(0, 5).map(i => ({
        pedido: i.pedido || i.id_venda,
        custo_original: i.custo,
        custo_convertido: obterValorCusto(i)
      }))
    });
  }

  function aplicarFiltro(lista) {
    let resultado = [...lista];

    if (filtroAtivo.tipo === 'com_vendas') {
      resultado = resultado.filter(i => i.tem_cruzamento_vendas);
    }

    if (filtroAtivo.tipo === 'sem_vendas') {
      resultado = resultado.filter(i => !i.tem_cruzamento_vendas);
    }

    if (filtroAtivo.tipo === 'validas') {
      resultado = resultado.filter(i => !ehCanceladoOuReembolso(i));
    }

    if (filtroAtivo.tipo === 'pendentes') {
      resultado = resultado.filter(i => ehPendente(i));
    }

    if (filtroAtivo.tipo === 'status') {
      resultado = resultado.filter(i =>
        normalizarTexto(i.status_custo) === normalizarTexto(filtroAtivo.valor)
      );
    }

    const marketplace = filtroMarketplace?.value || 'todos';

    if (marketplace !== 'todos') {
      resultado = resultado.filter(i => normalizarTexto(i.canal) === normalizarTexto(marketplace));
    }

    const pedido = normalizarTexto(filtroPedido?.value || '');

    if (pedido) {
      resultado = resultado.filter(i =>
        normalizarTexto(i.pedido).includes(pedido) ||
        normalizarTexto(i.id_venda).includes(pedido) ||
        normalizarTexto(i.id_pedido_mkt).includes(pedido) ||
        normalizarTexto(i.id_produto).includes(pedido)
      );
    }

    const skuProduto = normalizarTexto(filtroSkuProduto?.value || '');

    if (skuProduto) {
      resultado = resultado.filter(i =>
        normalizarTexto(i.sku).includes(skuProduto) ||
        normalizarTexto(i.sku_venda).includes(skuProduto) ||
        normalizarTexto(i.id_pedido_mkt).includes(skuProduto) ||
        normalizarTexto(i.id_produto).includes(skuProduto) ||
        normalizarTexto(i.produto).includes(skuProduto) ||
        normalizarTexto(i.produto_venda).includes(skuProduto)
      );
    }

    const inicio = dataInputInicio(filtroDataInicio?.value || '');
    const fim = dataInputFim(filtroDataFim?.value || '');

    if (inicio || fim) {
      resultado = resultado.filter(i => {
        const dataItem = dataParaComparacao(obterValorDataFiltro(i));

        if (!dataItem) return false;
        if (inicio && dataItem < inicio) return false;
        if (fim && dataItem > fim) return false;

        return true;
      });
    }

    return resultado;
  }

  function atualizarResumoTabela(lista) {
    if (!resumoTabela) return;

    const base = Array.isArray(lista) ? lista : [];
    const totalCompras = base.length;
    const conciliadas = base.filter(i => i.tem_cruzamento_vendas).length;
    const validas = base.filter(i => !ehCanceladoOuReembolso(i)).length;
    const pendentes = base.filter(i => ehPendente(i)).length;
    const pctConciliadas = totalCompras > 0 ? (conciliadas / totalCompras) * 100 : 0;
    const pctPendentes = validas > 0 ? (pendentes / validas) * 100 : 0;

    let filtroTexto = 'Todos';

    if (filtroAtivo.tipo === 'com_vendas') filtroTexto = 'Conciliadas com vendas';
    if (filtroAtivo.tipo === 'sem_vendas') filtroTexto = 'Não conciliadas';
    if (filtroAtivo.tipo === 'validas') filtroTexto = 'Compras válidas';
    if (filtroAtivo.tipo === 'pendentes') filtroTexto = 'Compras pendentes';
    if (filtroAtivo.tipo === 'status') filtroTexto = `Status: ${filtroAtivo.valor}`;

    resumoTabela.textContent =
      `Base filtrada: ${totalCompras} | Conciliadas: ${conciliadas} (${formatarPercentual(pctConciliadas)}) | Válidas: ${validas} | Pendentes: ${pendentes} (${formatarPercentual(pctPendentes)}) | Filtro: ${filtroTexto} | Exibindo: ${base.length}`;
  }

  function renderCustos() {
    const lista = aplicarFiltro(custos);

    atualizarCards(lista);
    atualizarResumoTabela(lista);

    if (!tbodyCusto) return;

    if (!lista.length) {
      tbodyCusto.innerHTML = `
        <tr>
          <td colspan="15" style="text-align:center;">Nenhum registro encontrado.</td>
        </tr>
      `;
      return;
    }

    tbodyCusto.innerHTML = lista.map(i => {
      const statusCusto = i.status_custo || 'Sem status';
      const statusOriginal = i.status_original || i.statusOriginal || i.status_final_robo || i.status || '-';
      const temCruzamento = Boolean(i.tem_cruzamento_vendas);
      const acao = i.acao_sugerida || i.acao || obterAcaoSugerida(statusCusto);

      return `
        <tr>
          <td>${escaparHtml(i.pedido || i.id_venda || '-')}</td>
          <td>${escaparHtml(i.canal || '-')}</td>
          <td>${escaparHtml(i.id_pedido_mkt || i.id_produto || '-')}</td>
          <td>${escaparHtml(i.sku_venda || i.sku || '-')}</td>
          <td>${escaparHtml(i.produto_venda || i.produto || '-')}</td>
          <td>${escaparHtml(formatarData(i.data_venda))}</td>
          <td>${escaparHtml(formatarData(i.data_importacao || i.data_criacao))}</td>
          <td>${escaparHtml(formatarData(i.data_pagamento))}</td>
          <td>${escaparHtml(formatarData(i.data_embalado))}</td>
          <td>
            <span class="status-badge ${obterClasseCruzamento(temCruzamento)}">
              ${temCruzamento ? 'Sim' : 'Não'}
            </span>
          </td>
          <td>
            <span class="status-badge ${obterClasseBadgeStatusCusto(statusCusto)}">
              ${escaparHtml(statusCusto)}
            </span>
          </td>
          <td>${formatarMoeda(i.custo)}</td>
          <td>${formatarMoeda(i.preco_venda)}</td>
          <td>${escaparHtml(statusOriginal)}</td>
          <td><span class="acao-texto">${escaparHtml(acao)}</span></td>
        </tr>
      `;
    }).join('');
  }

  function renderMapaStatus() {
    if (!tbodyStatus) return;

    if (!mapaStatus.length) {
      tbodyStatus.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center;">Nenhum mapa de status encontrado.</td>
        </tr>
      `;

      if (resumoMapaStatus) {
        resumoMapaStatus.textContent = 'Nenhum dado encontrado em data/custo-status.json';
      }

      return;
    }

    const total = mapaStatus.reduce((acc, item) => acc + Number(item.quantidade || 0), 0);

    if (resumoMapaStatus) {
      resumoMapaStatus.textContent = `Total mapeado: ${total} | Combinações de status/regra: ${mapaStatus.length}`;
    }

    tbodyStatus.innerHTML = mapaStatus.map(item => {
      const statusCusto = item.status_custo || 'Sem status';

      return `
        <tr>
          <td>${escaparHtml(item.status_original || '-')}</td>
          <td>
            <span class="status-badge ${obterClasseBadgeStatusCusto(statusCusto)}">
              ${escaparHtml(statusCusto)}
            </span>
          </td>
          <td>${escaparHtml(item.regra || '-')}</td>
          <td>${escaparHtml(item.origem || '-')}</td>
          <td>${escaparHtml(item.custo_flag || '-')}</td>
          <td>${escaparHtml(item.vendas_flag || '-')}</td>
          <td>${Number(item.quantidade || 0)}</td>
        </tr>
      `;
    }).join('');
  }

  function limparFiltros() {
    if (filtroMarketplace) filtroMarketplace.value = 'todos';
    if (filtroPedido) filtroPedido.value = '';
    if (filtroSkuProduto) filtroSkuProduto.value = '';
    if (filtroDataInicio) filtroDataInicio.value = '';
    if (filtroDataFim) filtroDataFim.value = '';
    if (filtroTipoData) filtroTipoData.value = 'data_venda';

    filtroAtivo = {
      tipo: 'todos',
      valor: ''
    };

    renderFiltrosStatus();
    renderCustos();
  }

  function exportarTabela() {
    const lista = aplicarFiltro(custos);

    const cabecalho = [
      'Pedido',
      'Marketplace',
      'ID pedido MKT',
      'SKU',
      'Produto',
      'Data da Venda',
      'Data da Importação',
      'Data do Pagamento',
      'Data do Pedido Embalado',
      'Cruzou vendas',
      'Status do custo',
      'Custo',
      'Venda',
      'Status original',
      'Ação sugerida'
    ];

    const linhas = lista.map(i => [
      i.pedido || i.id_venda,
      i.canal,
      i.id_pedido_mkt || i.id_produto,
      i.sku_venda || i.sku,
      i.produto_venda || i.produto,
      i.data_venda,
      i.data_importacao || i.data_criacao,
      i.data_pagamento,
      i.data_embalado,
      i.tem_cruzamento_vendas ? 'Sim' : 'Não',
      i.status_custo,
      i.custo,
      i.preco_venda,
      i.status_original || i.statusOriginal || i.status_final_robo || i.status,
      i.acao_sugerida || i.acao || obterAcaoSugerida(i.status_custo)
    ]);

    const csv = [cabecalho, ...linhas]
      .map(row => row.map(col => `"${String(col ?? '').replace(/"/g, '""')}"`).join(';'))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'analise-custo-export.csv';
    a.click();

    URL.revokeObjectURL(url);
  }

  async function carregar() {
    try {
      if (resumoTabela) resumoTabela.textContent = 'Carregando dados...';

      const [respCusto, respStatus] = await Promise.all([
        fetch('./data/custo.json?v=' + Date.now()),
        fetch('./data/custo-status.json?v=' + Date.now())
      ]);

      if (!respCusto.ok) {
        throw new Error(`Erro HTTP ${respCusto.status} ao buscar data/custo.json`);
      }

      if (!respStatus.ok) {
        throw new Error(`Erro HTTP ${respStatus.status} ao buscar data/custo-status.json`);
      }

      const custoJson = await respCusto.json();
      const statusJson = await respStatus.json();

      baseCompleta = Array.isArray(custoJson) ? custoJson : [];
      custos = Array.isArray(custoJson) ? custoJson : [];
      mapaStatus = Array.isArray(statusJson) ? statusJson : [];

      console.log('custo.json carregado:', custos.length);
      console.log('custo-status.json carregado:', mapaStatus.length);

      renderFiltrosStatus();
      renderCustos();
      renderMapaStatus();
    } catch (e) {
      console.error('Erro em custo.js:', e);

      if (tbodyCusto) {
        tbodyCusto.innerHTML = `
          <tr>
            <td colspan="15" style="text-align:center;">Erro ao carregar dados de custo: ${escaparHtml(e.message)}</td>
          </tr>
        `;
      }

      if (tbodyStatus) {
        tbodyStatus.innerHTML = `
          <tr>
            <td colspan="7" style="text-align:center;">Erro ao carregar mapa de status: ${escaparHtml(e.message)}</td>
          </tr>
        `;
      }

      if (resumoTabela) resumoTabela.textContent = 'Erro ao carregar dados.';
      if (resumoMapaStatus) resumoMapaStatus.textContent = 'Erro ao carregar mapa de status.';
    }
  }

  abas.forEach(btn => {
    btn.addEventListener('click', () => {
      const aba = btn.dataset.aba;

      abas.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.custo-tab-content').forEach(sec => sec.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(`aba-${aba}`)?.classList.add('active');
    });
  });

  filtroMarketplace?.addEventListener('change', renderCustos);
  filtroPedido?.addEventListener('input', renderCustos);
  filtroSkuProduto?.addEventListener('input', renderCustos);
  filtroDataInicio?.addEventListener('change', renderCustos);
  filtroDataFim?.addEventListener('change', renderCustos);
  filtroTipoData?.addEventListener('change', renderCustos);
  btnLimparFiltros?.addEventListener('click', limparFiltros);
  btnExportar?.addEventListener('click', exportarTabela);

  carregar();
});
