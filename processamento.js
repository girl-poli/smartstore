
// ===============================
// VISÃO ANALÍTICA DE NEGÓCIO
// Lê os JSONs consolidados para mostrar fluxo por marketplace.
// ===============================
const ARQUIVOS_ANALITICOS = [
  { chave: 'vendas', path: './data/vendas.json' },
  { chave: 'custos', path: './data/custo.json' },
  { chave: 'catalogo', path: './data/catalogo-custos.json' }
];

function normalizarTextoAnalitico(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function normalizarCanalAnalitico(item) {
  const bruto = item?.canal ?? item?.marketplace ?? item?.plataforma ?? item?.loja ?? item?.canal_compra ?? '';
  const texto = normalizarTextoAnalitico(bruto);
  const compacto = texto.replace(/[^a-z0-9]/g, '');

  if (texto === 'ml' || compacto === 'ml' || compacto.includes('mercadolivre') || compacto.includes('smartml')) return 'ML';
  if (compacto.includes('shopee')) return 'Shopee';
  if (compacto.includes('tiktok') || compacto.includes('tiktokshop') || texto === 'tt') return 'TikTok';
  return bruto ? String(bruto).trim() : 'Desconhecido';
}

function ehCanceladoAnalitico(item) {
  const status = normalizarTextoAnalitico(item?.status_harmonizado || item?.status || item?.status_original || item?.status_final);
  return status === 'cancelado' || status.includes('cancelado') || status.includes('cancelada');
}

function numeroAnalitico(valor) {
  if (valor === null || valor === undefined || valor === '') return 0;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;

  let texto = String(valor)
    .replace(/BRL|R\$/gi, '')
    .replace(/\s+/g, '')
    .trim();

  if (texto.includes(',') && texto.includes('.')) texto = texto.replace(/\./g, '').replace(',', '.');
  else if (texto.includes(',')) texto = texto.replace(',', '.');

  const n = Number(texto);
  return Number.isFinite(n) ? n : 0;
}

function chavePedidoAnalitico(item) {
  const canal = item?.canal_normalizado || normalizarCanalAnalitico(item) || 'GERAL';
  const campos = [
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

  const bruto = campos.find(v => v !== undefined && v !== null && String(v).trim() !== '');
  if (!bruto) return null;

  let pedido = String(bruto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .replace(/\.0$/g, '')
    .replace(/\s+/g, '')
    .replace(/[^0-9]/g, '');

  if (!pedido) return null;
  return `${canal}__${pedido}`;
}

function contarPedidosAnalitico(lista = []) {
  const set = new Set();
  (Array.isArray(lista) ? lista : []).forEach(item => {
    const chave = chavePedidoAnalitico(item);
    if (chave) set.add(chave);
  });
  return set.size;
}

function contarProdutosAnalitico(lista = []) {
  const set = new Set();
  (Array.isArray(lista) ? lista : []).forEach(item => {
    const sku = String(item?.sku || item?.sku_base || item?.seller_sku || '').trim().toUpperCase();
    if (sku) set.add(sku.replace(/\s*[-_]?\s*VAR\s*\d+$/i, ''));
  });
  return set.size;
}

async function carregarJsonAnalitico(path) {
  try {
    const resp = await fetch(path + '?v=' + Date.now());
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function badgeAnalitico(status) {
  if (status === 'ok') return '<span class="pipeline-badge ok">OK</span>';
  if (status === 'atencao') return '<span class="pipeline-badge atencao">Atenção</span>';
  return '<span class="pipeline-badge erro">Erro</span>';
}

function resumoCanalAnalitico(vendas, custos, canal) {
  const vendasCanal = vendas.filter(v => normalizarCanalAnalitico(v) === canal);
  const validas = vendasCanal.filter(v => !ehCanceladoAnalitico(v));
  const canceladas = vendasCanal.filter(v => ehCanceladoAnalitico(v));
  const custosCanal = custos.filter(c => normalizarCanalAnalitico(c) === canal);
  const semCusto = validas.filter(v => numeroAnalitico(v.custo_final ?? v.custo ?? v.custo_normalizado) <= 0).length;

  return {
    canal,
    vendas: vendasCanal.length,
    pedidos: contarPedidosAnalitico(validas),
    produtos: contarProdutosAnalitico(vendasCanal),
    custos: custosCanal.length,
    semCusto,
    canceladas: canceladas.length
  };
}

function renderPipelineAnalitico(vendas, custos) {
  const el = $('pipelineAnalitico');
  if (!el) return;

  const canais = ['ML', 'Shopee', 'TikTok'];

  el.innerHTML = canais.map(canal => {
    const r = resumoCanalAnalitico(vendas, custos, canal);
    const status = r.vendas > 0 && r.pedidos > 0 ? (r.semCusto > 0 || r.canceladas > 0 ? 'atencao' : 'ok') : 'erro';

    return `
      <article class="analytics-card">
        <div class="analytics-head">
          <h4>${canal === 'ML' ? 'Mercado Livre' : canal}</h4>
          ${badgeAnalitico(status)}
        </div>

        <div class="analytics-steps">
          <div class="analytics-step">
            <span class="analytics-dot">1</span>
            <div><small>Arquivo de vendas</small><strong>Linhas importadas</strong></div>
            <span class="analytics-value">${fmtQtd(r.vendas)}</span>
          </div>

          <div class="analytics-step">
            <span class="analytics-dot">2</span>
            <div><small>Pedidos válidos</small><strong>Sem cancelados</strong></div>
            <span class="analytics-value">${fmtQtd(r.pedidos)}</span>
          </div>

          <div class="analytics-step">
            <span class="analytics-dot">3</span>
            <div><small>Produtos / SKUs</small><strong>Distintos</strong></div>
            <span class="analytics-value">${fmtQtd(r.produtos)}</span>
          </div>

          <div class="analytics-step">
            <span class="analytics-dot">4</span>
            <div><small>Custos associados</small><strong>Registros de custo</strong></div>
            <span class="analytics-value">${fmtQtd(r.custos)}</span>
          </div>

          <div class="analytics-step">
            <span class="analytics-dot">5</span>
            <div><small>Sem custo</small><strong>Pedidos/itens revisar</strong></div>
            <span class="analytics-value">${fmtQtd(r.semCusto)}</span>
          </div>

          <div class="analytics-step">
            <span class="analytics-dot">6</span>
            <div><small>Cancelamentos</small><strong>Linhas canceladas</strong></div>
            <span class="analytics-value">${fmtQtd(r.canceladas)}</span>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

async function carregarPipelineAnalitico() {
  const vendas = await carregarJsonAnalitico('./data/vendas.json');
  const custosJson = await carregarJsonAnalitico('./data/custo.json');
  const catalogo = await carregarJsonAnalitico('./data/catalogo-custos.json');
  const custos = custosJson.length ? custosJson : catalogo;

  renderPipelineAnalitico(vendas, custos);
}


const $ = (id) => document.getElementById(id);

function fmtData(valor) {
  if (!valor) return '-';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return String(valor);
  return d.toLocaleString('pt-BR');
}

function fmtQtd(valor) {
  if (valor === null || valor === undefined || valor === '') return '-';
  const n = Number(valor);
  if (Number.isNaN(n)) return String(valor);
  return n.toLocaleString('pt-BR');
}

function badgeClasse(status) {
  if (status === 'ok') return 'ok';
  if (status === 'erro') return 'erro';
  if (status === 'atencao') return 'atencao';
  return 'pendente';
}

function badgeTexto(status) {
  if (status === 'ok') return 'Válido';
  if (status === 'erro') return 'Erro';
  if (status === 'atencao') return 'Atenção';
  return 'Pendente';
}

function cardPipeline(item) {
  const cls = badgeClasse(item.status);
  return `
    <article class="pipeline-card ${cls}">
      <div class="pipeline-head">
        <h4>${item.titulo}</h4>
        <span class="pipeline-badge ${cls}">${badgeTexto(item.status)}</span>
      </div>

      <div class="pipeline-info">
        <div><small>Arquivo</small><strong>${item.arquivo}</strong></div>
        <div><small>Tipo</small><strong>${item.tipo || '-'}</strong></div>
        <div><small>Registros</small><strong>${fmtQtd(item.registros)}</strong></div>
        <div><small>Incremental</small><strong>${item.incrementalTexto || 'Pronto'}</strong></div>
        <div><small>Última referência</small><strong>${item.ultimaReferencia ? fmtData(item.ultimaReferencia) : '-'}</strong></div>
        <div><small>Última execução</small><strong>${fmtData(item.ultimaExecucao)}</strong></div>
      </div>

      <div class="pipeline-actions">
        <button class="btn btn-primary btn-processar-pipeline" data-pipeline="${item.id}" type="button">Processar</button>
        <button class="btn btn-secondary btn-log-pipeline" data-pipeline="${item.id}" type="button">Ver log</button>
      </div>
    </article>
  `;
}

async function carregarStatus() {
  try {
    const resp = await fetch('/api/processamento/status?v=' + Date.now());
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const data = await resp.json();
    const pipelines = Array.isArray(data.pipelines) ? data.pipelines : [];

    const marketplaces = pipelines.filter(p => p.grupo === 'marketplace');
    const core = pipelines.filter(p => p.grupo === 'core');

    $('pipelineMarketplaces').innerHTML = marketplaces.map(cardPipeline).join('') || '<p>Nenhum pipeline de marketplace encontrado.</p>';
    $('pipelineCore').innerHTML = core.map(cardPipeline).join('') || '<p>Nenhum arquivo core encontrado.</p>';

    $('kpiArquivos').textContent = fmtQtd(data.resumo?.total || 0);
    $('kpiValidos').textContent = fmtQtd(data.resumo?.validos || 0);
    $('kpiPendentes').textContent = fmtQtd(data.resumo?.pendentes || 0);
    $('kpiRegistrosMkt').textContent = fmtQtd(data.resumo?.registrosMkt || 0);
    $('kpiRegistrosCore').textContent = fmtQtd(data.resumo?.registrosCore || 0);
    $('kpiUltimaExecucao').textContent = data.resumo?.ultimaExecucao ? fmtData(data.resumo.ultimaExecucao) : '-';
    $('pipelineAtualizadoEm').textContent = `Atualizado: ${fmtData(new Date())}`;
    $('logProcessamento').textContent = data.log || 'Sem log ainda.';

    ativarBotoes();
    carregarPipelineAnalitico();
  } catch (e) {
    $('logProcessamento').textContent = 'Erro ao carregar status: ' + e.message + '\n\nConfira se abriu a página na mesma porta do servidor Node.';
    carregarPipelineAnalitico();
  }
}

async function processarPipeline(pipeline, btn) {
  const textoOriginal = btn?.textContent || '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Processando...';
  }

  try {
    const resp = await fetch('/api/processamento/processar/' + pipeline, { method: 'POST' });
    const data = await resp.json();
    $('logProcessamento').textContent = data.log || JSON.stringify(data, null, 2);
    await carregarStatus();
  } catch (e) {
    $('logProcessamento').textContent = 'Erro ao processar: ' + e.message;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = textoOriginal;
    }
  }
}

function ativarBotoes() {
  document.querySelectorAll('.btn-processar-pipeline').forEach(btn => {
    btn.onclick = () => processarPipeline(btn.dataset.pipeline, btn);
  });

  document.querySelectorAll('.btn-log-pipeline').forEach(btn => {
    btn.onclick = async () => {
      try {
        const resp = await fetch('/api/processamento/log/' + btn.dataset.pipeline + '?v=' + Date.now());
        const data = await resp.json();
        $('logProcessamento').textContent = data.log || 'Sem log para este pipeline.';
      } catch (e) {
        $('logProcessamento').textContent = 'Erro ao carregar log: ' + e.message;
      }
    };
  });
}

$('btnAtualizarStatus')?.addEventListener('click', carregarStatus);
$('btnProcessarTodos')?.addEventListener('click', (e) => processarPipeline('todos', e.currentTarget));
$('btnCopiarLog')?.addEventListener('click', async () => {
  await navigator.clipboard.writeText($('logProcessamento').textContent || '');
});

carregarStatus();
