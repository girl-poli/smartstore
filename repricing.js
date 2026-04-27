document.addEventListener('DOMContentLoaded', () => {
  const $ = (id) => document.getElementById(id);

  const tbody = $('tbodyPricing') || document.querySelector('table tbody');
  const auditoria = $('auditoriaResumo') || $('auditoria');
  const busca = $('busca');
  const filtroAcao = $('filtroAcao');
  const btnRecalcular = $('btnRecalcular');
  const btnExportar = $('btnExportar');
  const margemMinimaInput = $('margemMinima');
  const deltaCompetirInput = $('deltaCompetir');
  const custoPadraoInput = $('custoPadrao');

  const ARQUIVOS_REPRICING = [
    '/data_external/repricing-final.json',
    '/data_external/repricing-consolidado.json',
    '/data_external/repricing-ml-inteligencia.json',
    '/data_external/progresso-repricing-ml.json',
    '/data_external/repricing-ml.json',
    './data_external/repricing-final.json',
    './data_external/repricing-consolidado.json',
    './data_external/repricing-ml-inteligencia.json',
    './data_external/progresso-repricing-ml.json',
    './data_external/repricing-ml.json'
  ];

  const ARQUIVOS_CUSTO = [
    '/data_external/relatorio-dropstok-mapeamento.json',
    './data_external/relatorio-dropstok-mapeamento.json'
  ];

  let repricingRaw = [];
  let baseCusto = [];
  let dados = [];
  let fonteRepricing = '';
  let fonteCusto = '';
  const aprovadosManuais = new Set();

  function log(msg, obj) {
    const linha = `[${new Date().toLocaleTimeString('pt-BR')}] ${msg}` + (obj ? `\n${JSON.stringify(obj, null, 2)}` : '');
    console.log('[PRICING]', msg, obj || '');
    if (auditoria) auditoria.textContent += (auditoria.textContent && auditoria.textContent !== 'Aguardando leitura...' ? '\n\n' : '') + linha;
  }

  function setText(id, valor) {
    const el = $(id);
    if (el) el.textContent = valor;
  }

  function normalizarTexto(valor) {
    return String(valor || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .toLowerCase()
      .trim();
  }

  function normalizarSku(valor) {
    const sku = String(valor || '').toUpperCase().replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    const match = sku.match(/DPX\d+/i);
    if (match) return match[0].toUpperCase();
    return sku
      .replace(/_VAR_[A-Z0-9]+$/i, '')
      .replace(/\s*[-_]\s*VAR\s*[A-Z0-9]+$/i, '')
      .replace(/\s*VAR\s*[A-Z0-9]+$/i, '')
      .replace(/\s+/g, '');
  }

  function numero(valor) {
    if (valor === null || valor === undefined || valor === '') return 0;
    if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;

    let texto = String(valor)
      .replace(/BRL/gi, '')
      .replace(/R\$/gi, '')
      .replace(/%/g, '')
      .replace(/\s+/g, '')
      .trim();

    if (!texto) return 0;
    const negativo = texto.startsWith('-');
    texto = texto.replace(/^-/, '');

    if (texto.includes('.') && texto.includes(',')) texto = texto.replace(/\./g, '').replace(',', '.');
    else if (texto.includes(',') && !texto.includes('.')) texto = texto.replace(',', '.');

    const n = Number(texto);
    if (!Number.isFinite(n)) return 0;
    return negativo ? -n : n;
  }

  function moeda(valor) {
    const n = numero(valor);
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function percentual(valor) {
    if (valor === null || valor === undefined || !Number.isFinite(Number(valor))) return '-';
    return Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
  }

  function escaparHtml(valor) {
    return String(valor ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function fetchPrimeiroJson(lista) {
    for (const caminho of lista) {
      try {
        log(`Tentando carregar: ${caminho}`);
        const resp = await fetch(caminho + (caminho.includes('?') ? '&' : '?') + 'v=' + Date.now());
        if (!resp.ok) continue;
        const json = await resp.json();
        return { caminho, json };
      } catch (e) {
        console.warn('Falha caminho', caminho, e.message);
      }
    }
    return { caminho: '', json: null };
  }

  function extrairItens(json) {
    if (Array.isArray(json)) return json;
    if (Array.isArray(json?.itens)) return json.itens;
    if (Array.isArray(json?.data)) return json.data;
    if (Array.isArray(json?.items)) return json.items;
    return [];
  }

  function montarMapaCustoDropstok(lista) {
    const mapa = new Map();
    (Array.isArray(lista) ? lista : []).forEach(item => {
      const sku = normalizarSku(item.sky || item.sku || item.sku_venda || item.codigo_sku);
      const custo = numero(item.preco || item.custo || item.custo_final || item.valor_custo || item.preco_custo);
      if (!sku || custo <= 0) return;
      if (!mapa.has(sku)) {
        mapa.set(sku, {
          custo,
          origem: 'dropstok',
          produto: item.nome_produto || item.produto || item.nome || '',
          raw: item
        });
      }
    });
    return mapa;
  }

  function menorPrecoConcorrencia(item) {
    const concorrentes = Array.isArray(item.concorrentes) ? item.concorrentes : [];
    const precos = concorrentes.map(c => numero(c.preco)).filter(v => v > 0);
    return precos.length ? Math.min(...precos) : 0;
  }

  function obterTipoEnvio(item) {
    const texto = `${item.tipo_envio || ''} ${item.texto_card || ''}`;
    if (/premium/i.test(texto)) return 'Premium';
    if (/cl[aá]ssico/i.test(texto)) return 'Clássico';
    return item.tipo_envio || '-';
  }

  function obterTipoFrete(item) {
    const texto = `${item.tipo_frete || ''} ${item.texto_card || ''}`;
    if (/frete gr[aá]tis|gr[aá]tis para o comprador/i.test(texto)) return 'Frete grátis';
    if (/por conta do comprador|comprador/i.test(texto)) return 'Comprador';
    if (/combine a entrega|combinar com o comprador/i.test(texto)) return 'Combinar';
    return item.tipo_frete || '-';
  }

  function calcularItem(item, mapaCusto) {
    const margemMinima = numero(margemMinimaInput?.value || 18);
    const delta = numero(deltaCompetirInput?.value || 0.10);
    const custoPadrao = numero(custoPadraoInput?.value || 0);

    const sku = normalizarSku(item.sku || item.sku_original || item.texto_card || item.titulo);
    const custoInfo = mapaCusto.get(sku);
    const custo = numero(item.custo) || numero(custoInfo?.custo) || custoPadrao;

    const precoAtual = numero(item.preco_atual || item.preco || item.precoAtual);
    const recebe = numero(item.valor_recebe || item.recebe || item.valorRecebe);
    const tarifa = numero(item.tarifa_percentual || item.tarifa);
    const frete = Math.abs(numero(item.frete_pago || item.frete || item.custo_envio));
    const statusMl = String(item.status_competicao || item.status_ml || '').toUpperCase();
    const concorrencia = menorPrecoConcorrencia(item);
    const tipoEnvio = obterTipoEnvio(item);
    const tipoFrete = obterTipoFrete(item);

    const margemAtual = precoAtual > 0 && recebe > 0 && custo > 0 ? ((recebe - custo) / precoAtual) * 100 : null;
    const fatorRepasse = precoAtual > 0 && recebe > 0 ? recebe / precoAtual : 0;
    const precoMinimoMargem = custo > 0 && fatorRepasse > (margemMinima / 100) ? custo / (fatorRepasse - (margemMinima / 100)) : 0;
    const gapMargem = margemAtual === null ? null : margemAtual - margemMinima;

    let acao = 'REVISAR';
    let acaoLabel = 'Revisar manual';
    let motivo = 'Dados insuficientes para decisão automática.';
    let precoSugerido = precoAtual;
    let alertaFrete = '';

    if (!custo || custo <= 0) {
      acao = 'INFORMAR_CUSTO';
      acaoLabel = 'Informar custo';
      motivo = 'Sem custo do produto. Não aprovar preço sem custo.';
    } else if (!precoAtual || !recebe) {
      acao = 'REVISAR';
      acaoLabel = 'Revisar manual';
      motivo = 'Preço atual ou valor recebido não encontrado.';
    } else if (margemAtual < margemMinima) {
      acao = 'NAO_COLOCAR';
      acaoLabel = 'Não colocar';
      precoSugerido = Math.max(precoAtual, precoMinimoMargem || precoAtual);
      motivo = `Margem atual ${percentual(margemAtual)} abaixo da mínima de ${percentual(margemMinima)}.`;
      if (tipoFrete !== 'Frete grátis' && frete > 0) alertaFrete = 'Antes de reduzir preço, avaliar frete grátis/condição de envio.';
    } else if (concorrencia > 0) {
      const precoCompetitivo = Math.max(0, concorrencia - delta);
      if (precoCompetitivo >= precoMinimoMargem) {
        acao = 'COMPETIR';
        acaoLabel = 'Pode competir';
        precoSugerido = precoCompetitivo;
        motivo = `Concorrência permite competir. Menor concorrência: ${moeda(concorrencia)}.`;
      } else {
        acao = 'NAO_COLOCAR';
        acaoLabel = 'Não colocar';
        precoSugerido = precoMinimoMargem || precoAtual;
        motivo = `Concorrência abaixo do preço mínimo saudável. Menor concorrência: ${moeda(concorrencia)}.`;
        if (tipoFrete !== 'Frete grátis' && frete > 0) alertaFrete = 'Alternativa: testar frete grátis antes de baixar preço.';
      }
    } else if (statusMl.includes('PERDENDO')) {
      acao = 'REVISAR';
      acaoLabel = 'Revisar manual';
      precoSugerido = precoMinimoMargem || precoAtual;
      motivo = 'Está perdendo, mas ainda sem preço de concorrência estruturado.';
      if (tipoFrete !== 'Frete grátis' && frete > 0) alertaFrete = 'Pode ser problema de frete/envio, não somente preço.';
    } else if (statusMl.includes('GANHANDO') || statusMl.includes('COMPARTILHANDO') || statusMl.includes('COMPETINDO')) {
      acao = 'MANTER';
      acaoLabel = 'Manter';
      precoSugerido = precoAtual;
      motivo = 'Margem acima da mínima e status sem urgência de ajuste.';
    }

    return {
      ...item,
      sku,
      custo,
      custo_origem: custoInfo?.origem || (custoPadrao > 0 ? 'custo padrão' : ''),
      custo_produto_nome: custoInfo?.produto || '',
      preco_atual: precoAtual,
      valor_recebe: recebe,
      tarifa_percentual: tarifa,
      frete_pago: frete,
      tipo_envio: tipoEnvio,
      tipo_frete: tipoFrete,
      menor_concorrencia: concorrencia,
      preco_minimo_margem: Number((precoMinimoMargem || 0).toFixed(2)),
      margem_atual_pct: margemAtual === null ? null : Number(margemAtual.toFixed(2)),
      gap_margem_pct: gapMargem === null ? null : Number(gapMargem.toFixed(2)),
      status_competicao: statusMl || '-',
      acao,
      acao_label: acaoLabel,
      motivo,
      alerta_frete: alertaFrete,
      preco_sugerido: Number(precoSugerido.toFixed(2))
    };
  }

  function calcularTudo() {
    const mapaCusto = montarMapaCustoDropstok(baseCusto);
    dados = repricingRaw.map(item => calcularItem(item, mapaCusto));
    render();
    renderAuditoria();
  }

  function listaFiltrada() {
    const termo = normalizarTexto(busca?.value || '');
    const acao = filtroAcao?.value || 'todos';
    let lista = [...dados];
    if (termo) lista = lista.filter(i => normalizarTexto(`${i.sku} ${i.titulo} ${i.anuncio_id}`).includes(termo));
    if (acao !== 'todos') lista = lista.filter(i => i.acao === acao || (acao === 'REVISAR' && i.acao === 'INFORMAR_CUSTO'));
    return lista;
  }

  function badgeAcao(i) {
    const cls = i.acao === 'COMPETIR' ? 'ok' : i.acao === 'NAO_COLOCAR' ? 'danger' : i.acao === 'MANTER' ? 'ok' : 'warn';
    const icon = i.acao === 'COMPETIR' ? '✅' : i.acao === 'NAO_COLOCAR' ? '❌' : i.acao === 'MANTER' ? '✅' : '⚠️';
    return `<span class="badge ${cls}">${icon} ${escaparHtml(i.acao_label || i.acao)}</span>`;
  }

  function badgeMargem(i) {
    if (i.margem_atual_pct === null || i.margem_atual_pct === undefined) return '<span class="badge warn">Sem margem</span>';
    const min = numero(margemMinimaInput?.value || 18);
    const cls = i.margem_atual_pct >= min ? 'ok' : (i.margem_atual_pct >= min - 3 ? 'warn' : 'danger');
    return `<span class="badge ${cls}">${percentual(i.margem_atual_pct)}</span>`;
  }

  function blocoAcao(i) {
    const min = numero(margemMinimaInput?.value || 18);
    const gap = i.gap_margem_pct;
    const gapClass = gap === null ? 'warn' : gap >= 0 ? 'ok' : gap >= -3 ? 'warn' : 'danger';
    return `
      <div class="acao-box acao-${i.acao}">
        ${badgeAcao(i)}
        <div class="acao-metricas">
          <span>Margem: <strong>${percentual(i.margem_atual_pct)}</strong></span>
          <span>Mín: <strong>${percentual(min)}</strong></span>
          <span>Gap: <strong class="gap-${gapClass}">${gap === null ? '-' : (gap > 0 ? '+' : '') + percentual(gap)}</strong></span>
          ${i.preco_minimo_margem ? `<span>Mín. saudável: <strong>${moeda(i.preco_minimo_margem)}</strong></span>` : ''}
        </div>
        <small>${escaparHtml(i.motivo || '')}</small>
        ${i.alerta_frete ? `<small class="frete-alerta">💡 ${escaparHtml(i.alerta_frete)}</small>` : ''}
      </div>`;
  }

  function renderTabela() {
    const lista = listaFiltrada();
    if (!tbody) { log('ERRO: tbody da tabela não encontrado.'); return; }
    if (!lista.length) {
      tbody.innerHTML = '<tr><td colspan="10" class="empty-row">Nenhum item encontrado.</td></tr>';
      return;
    }

    tbody.innerHTML = lista.map(i => {
      const chave = i.sku || i.anuncio_id || '';
      return `
        <tr>
          <td><input class="chk-aprovar-pricing" data-chave="${escaparHtml(chave)}" type="checkbox" ${i.acao === 'COMPETIR' ? '' : 'disabled'} ${aprovadosManuais.has(chave) ? 'checked' : ''} /></td>
          <td class="produto-cell"><strong>${escaparHtml(i.sku || '-')}</strong><br>${escaparHtml(i.titulo || '-')}<br><small>Anúncio: ${escaparHtml(i.anuncio_id || '-')}</small></td>
          <td><strong>${moeda(i.preco_atual)}</strong></td>
          <td><strong>${moeda(i.valor_recebe)}</strong><br><small>capturado</small></td>
          <td><strong>${escaparHtml(i.tipo_envio || '-')}</strong><br>${escaparHtml(i.tipo_frete || '-')}<br><small>${escaparHtml(String(i.tarifa_percentual || 0))}% / ${moeda(i.frete_pago)}</small></td>
          <td>${i.custo > 0 ? `<strong>${moeda(i.custo)}</strong><br><small>${escaparHtml(i.custo_origem || '')}</small>` : '<span class="badge warn">Sem custo</span>'}</td>
          <td>${badgeMargem(i)}</td>
          <td><span class="badge neutral">${escaparHtml(i.status_competicao || '-')}</span></td>
          <td>${blocoAcao(i)}</td>
          <td><strong>${moeda(i.preco_sugerido)}</strong><br>${i.preco_minimo_margem ? `<small>Mín: ${moeda(i.preco_minimo_margem)}</small>` : ''}</td>
        </tr>`;
    }).join('');
  }

  function renderCards() {
    const total = dados.length;
    const nao = dados.filter(i => i.acao === 'NAO_COLOCAR').length;
    const revisar = dados.filter(i => i.acao === 'REVISAR' || i.acao === 'INFORMAR_CUSTO').length;
    const competir = dados.filter(i => i.acao === 'COMPETIR').length;
    const margens = dados.map(i => i.margem_atual_pct).filter(v => Number.isFinite(v));
    const media = margens.length ? margens.reduce((a, b) => a + b, 0) / margens.length : 0;

    setText('kpiTotal', total);
    setText('kpiNaoColocar', nao);
    setText('kpiRevisar', revisar);
    setText('kpiCompetir', competir);
    setText('kpiMargemMedia', percentual(media));

    const titulo = $('tituloDecisao');
    const texto = $('textoDecisao');
    const semCusto = dados.filter(i => !i.custo).length;
    if (titulo) {
      if (semCusto > 0) titulo.textContent = 'Prioridade: completar custos';
      else if (competir > 0) titulo.textContent = 'Prioridade: aprovar oportunidades';
      else if (nao > 0) titulo.textContent = 'Prioridade: proteger margem';
      else titulo.textContent = 'Prioridade: revisar manualmente';
    }
    if (texto) {
      if (semCusto > 0) texto.textContent = `${semCusto} anúncio(s) sem custo. Sem custo, não aprove preço.`;
      else if (competir > 0) texto.textContent = `${competir} anúncio(s) podem competir respeitando a margem mínima.`;
      else texto.textContent = `${nao} anúncio(s) não devem baixar preço pela regra atual.`;
    }
  }

  function renderAuditoria() {
    log('Resumo do merge', {
      fonteRepricing,
      fonteCusto,
      total_repricing: repricingRaw.length,
      total_custo: baseCusto.length,
      total_merge: dados.length,
      com_custo: dados.filter(i => i.custo > 0).length,
      sem_custo: dados.filter(i => !i.custo).length,
      aprovados_manuais: aprovadosManuais.size
    });
  }

  function render() {
    renderCards();
    renderTabela();
  }

  async function carregar() {
    if (auditoria) auditoria.textContent = '';

    const repricing = await fetchPrimeiroJson(ARQUIVOS_REPRICING);
    fonteRepricing = repricing.caminho;
    repricingRaw = extrairItens(repricing.json);

    const custo = await fetchPrimeiroJson(ARQUIVOS_CUSTO);
    fonteCusto = custo.caminho;
    baseCusto = Array.isArray(custo.json) ? custo.json : [];

    if (!repricingRaw.length) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="10" class="empty-row">Erro: arquivo JSON de pricing não encontrado ou vazio.</td></tr>';
      log('Erro: arquivo JSON de pricing não encontrado ou vazio.');
      return;
    }

    log('Arquivos carregados', { fonteRepricing, itensPricing: repricingRaw.length, fonteCusto, itensCusto: baseCusto.length });
    calcularTudo();
  }

  function exportarCsv() {
    const lista = listaFiltrada();
    const headers = [
      'aprovar','sku','anuncio_id','titulo','preco_atual','valor_recebe','tipo_envio','tipo_frete','taxa','frete','custo','margem_atual_pct','gap_margem_pct','status_ml','acao','preco_minimo_margem','preco_sugerido','motivo','alerta_frete'
    ];
    const linhas = [headers.join(';')];
    lista.forEach(i => {
      const chave = i.sku || i.anuncio_id || '';
      linhas.push([
        aprovadosManuais.has(chave) ? 'SIM' : 'NAO',
        i.sku,
        i.anuncio_id,
        i.titulo,
        i.preco_atual,
        i.valor_recebe,
        i.tipo_envio,
        i.tipo_frete,
        i.tarifa_percentual,
        i.frete_pago,
        i.custo,
        i.margem_atual_pct,
        i.gap_margem_pct,
        i.status_competicao,
        i.acao,
        i.preco_minimo_margem,
        i.preco_sugerido,
        i.motivo,
        i.alerta_frete
      ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';'));
    });
    const blob = new Blob([linhas.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pricing-decisao.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  document.addEventListener('change', (ev) => {
    const el = ev.target;
    if (!el || !el.matches('.chk-aprovar-pricing')) return;
    const chave = el.dataset.chave;
    if (!chave) return;
    if (el.checked) aprovadosManuais.add(chave);
    else aprovadosManuais.delete(chave);
    renderCards();
  });

  busca?.addEventListener('input', renderTabela);
  filtroAcao?.addEventListener('change', renderTabela);
  btnRecalcular?.addEventListener('click', calcularTudo);
  btnExportar?.addEventListener('click', exportarCsv);
  margemMinimaInput?.addEventListener('change', calcularTudo);
  deltaCompetirInput?.addEventListener('change', calcularTudo);
  custoPadraoInput?.addEventListener('change', calcularTudo);

  carregar();
});
