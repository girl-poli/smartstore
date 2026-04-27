const fs = require('fs');
const path = require('path');

// =====================================================
// GERADOR DE CUSTO - BASE ROBÔ + CRUZAMENTO COM VENDAS
// Base principal: ./data_external/relatorio-dropstok-vendas.json
// Enriquecimento: ./data/vendas.json
//
// Objetivo:
// - manter a base do robô
// - trazer id_pedido_mkt = id_produto do robô
// - cruzar id_pedido_mkt com pedido do vendas.json
// - trazer sku e nome do produto do arquivo de vendas
// - se pedido tiver mais de um produto, traz o primeiro e audita a quantidade
// =====================================================

const FILE_ROBO = './data_external/relatorio-dropstok-vendas.json';
const FILE_VENDAS = './data/vendas.json';

const OUTPUT_CUSTO = './data/custo.json';
const OUTPUT_STATUS = './data/custo-status.json';
const OUTPUT_RESUMO = './data/custo-resumo.json';
const OUTPUT_DEBUG = './data/custo-debug-regras.json';

const PEDIDOS_DEBUG = new Set([
  '47727',
  '48126',
  '38664',
  '38666',
  '53490'
]);

const ORDEM_STATUS = [
  'Embalado',
  'Cancelado',
  'Bloqueado',
  'Anexar Etiqueta',
  'Gerar Etiqueta',
  'Reembolsar',
  'Sem status'
];

// =====================
// HELPERS
// =====================

function lerJson(filePath, obrigatorio = true) {
  if (!fs.existsSync(filePath)) {
    if (obrigatorio) {
      throw new Error(`❌ Arquivo não encontrado: ${filePath}`);
    }
    console.log(`⚠️ Arquivo opcional não encontrado: ${filePath}`);
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (error) {
    throw new Error(`❌ Erro ao ler JSON ${filePath}: ${error.message}`);
  }
}

function garantirPasta(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function normalizarTexto(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

function normalizarChave(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .trim()
    .toUpperCase();
}

function escaparRegex(valor) {
  return String(valor || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toNumber(valor) {
  if (valor === null || valor === undefined || valor === '') return 0;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;

  let texto = String(valor)
    .replace(/R\$/gi, '')
    .replace(/BRL/gi, '')
    .replace(/\s+/g, '')
    .trim();

  if (!texto) return 0;

  if (texto.includes('.') && texto.includes(',')) {
    texto = texto.replace(/\./g, '').replace(',', '.');
  } else if (texto.includes(',')) {
    texto = texto.replace(',', '.');
  }

  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : 0;
}

function extrairListaRobo(conteudo) {
  if (Array.isArray(conteudo)) return conteudo;
  if (conteudo && Array.isArray(conteudo.vendas)) return conteudo.vendas;
  return [];
}

function extrairListaVendas(conteudo) {
  if (!conteudo) return [];
  if (Array.isArray(conteudo)) return conteudo;
  if (conteudo && Array.isArray(conteudo.vendas)) return conteudo.vendas;
  if (conteudo && Array.isArray(conteudo.data)) return conteudo.data;
  return [];
}

function obterPedidoVenda(venda) {
  return normalizarChave(
    venda.pedido ||
    venda.id_pedido ||
    venda.numero_pedido ||
    venda.order_id ||
    venda.id_produto ||
    venda.id ||
    ''
  );
}

function obterSkuVenda(venda) {
  return (
    venda.sku ||
    venda.skuOriginal ||
    venda.sku_base ||
    venda.seller_sku ||
    venda.sellerSku ||
    venda.codigo_sku ||
    ''
  );
}

function obterProdutoVenda(venda) {
  return (
    venda.produto ||
    venda.nome_produto ||
    venda.nome_base ||
    venda.product_name ||
    venda.titulo ||
    venda.title ||
    ''
  );
}

/**
 * Mapa por pedido MKT.
 * Se tiver mais de um produto no mesmo pedido, mantém o primeiro
 * e audita os demais.
 */
function criarMapaVendas(vendas) {
  const mapa = new Map();
  const duplicados = new Map();

  for (const venda of vendas) {
    const chave = obterPedidoVenda(venda);
    if (!chave) continue;

    if (!mapa.has(chave)) {
      mapa.set(chave, {
        pedido_mkt: chave,
        sku_venda: obterSkuVenda(venda),
        produto_venda: obterProdutoVenda(venda),
        canal_venda: venda.canal || venda.marketplace || '',
        registro_original: venda,
        quantidade_itens_mesmo_pedido: 1
      });
    } else {
      const atual = mapa.get(chave);
      atual.quantidade_itens_mesmo_pedido++;

      if (!duplicados.has(chave)) duplicados.set(chave, []);
      duplicados.get(chave).push({
        sku_venda: obterSkuVenda(venda),
        produto_venda: obterProdutoVenda(venda)
      });
    }
  }

  return { mapa, duplicados };
}

/**
 * Alguns registros podem trazer texto_card com texto da página inteira.
 * Para reduzir falso positivo, isolamos o trecho do próprio ID.
 */
function extrairTextoDoProprioItem(item) {
  const textoOriginal = String(item.texto_card || '');
  const idVenda = String(item.id_venda || '').trim();

  if (!textoOriginal || !idVenda) return textoOriginal;

  const regex = new RegExp(
    `(ID:\\s*${escaparRegex(idVenda)}[\\s\\S]*?)(?=\\sID:\\s*\\d+\\s#|$)`,
    'i'
  );

  const match = textoOriginal.match(regex);
  return match && match[1] ? match[1] : textoOriginal;
}

// =====================
// STATUS DE CUSTO
// =====================

function calcularStatusCusto(item) {
  const textoItemOriginal = extrairTextoDoProprioItem(item);
  const textoItem = normalizarTexto(textoItemOriginal);
  const statusFinal = normalizarTexto(item.status_final);

  const temPagamento = Boolean(item.data_pagamento);
  const temEtiqueta = Boolean(item.data_etiqueta);
  const temEmbalado = Boolean(item.data_embalado);
  const custoNumero = toNumber(item.custo);
  const temCusto = custoNumero > 0;

  const debug = {
    id_venda: item.id_venda || '',
    id_produto: item.id_produto || '',
    canal: item.canal || '',
    status_final_original: item.status_final || '',
    status_final_normalizado: statusFinal,
    custo: custoNumero,
    temCusto,
    temPagamento,
    temEtiqueta,
    temEmbalado,
    data_pagamento: item.data_pagamento || '',
    data_etiqueta: item.data_etiqueta || '',
    data_embalado: item.data_embalado || '',
    texto_item_usado_regra: textoItemOriginal,
    flags: {},
    regra_escolhida: '',
    status_escolhido: ''
  };

  const temVendaBloqueada = textoItem.includes('venda bloqueada');
  const temTentarBaixar = textoItem.includes('tentar baixar');
  const temAnexarManual = textoItem.includes('anexar manualmente');

  const temAnexar =
    textoItem.includes('anexar') ||
    textoItem.includes('etiqueta importada -- anexar') ||
    textoItem.includes('etiqueta importada anexar');

  const canceladoPeloStatus =
    statusFinal.includes('cancel') ||
    statusFinal.includes('reembolso');

  const canceladoPeloTexto =
    textoItem.includes('cancelado') ||
    textoItem.includes('cancelada') ||
    textoItem.includes('reembolso') ||
    textoItem.includes('mediação') ||
    textoItem.includes('mediacao');

  const cancelado = canceladoPeloStatus || canceladoPeloTexto;

  debug.flags = {
    temVendaBloqueada,
    temTentarBaixar,
    temAnexarManual,
    temAnexar,
    canceladoPeloStatus,
    canceladoPeloTexto,
    cancelado
  };

  function retorno(status_custo, regra_status_custo) {
    debug.status_escolhido = status_custo;
    debug.regra_escolhida = regra_status_custo;

    return {
      status_custo,
      regra_status_custo,
      debug_regra: debug
    };
  }

  if (temEmbalado || statusFinal === 'embalado') {
    return retorno('Embalado', 'prioridade 1: tem data_embalado ou status_final embalado');
  }

  if (temVendaBloqueada) {
    return retorno('Bloqueado', 'prioridade 2: venda bloqueada detectada no card');
  }

  if (cancelado && temPagamento) {
    return retorno('Reembolsar', 'prioridade 3: cancelado + pagamento confirmado');
  }

  if (cancelado && !temPagamento) {
    return retorno('Cancelado', 'prioridade 4: cancelado sem pagamento confirmado');
  }

  if (temPagamento && temEtiqueta && !temEmbalado) {
    return retorno('Anexar Etiqueta', 'prioridade 5: pagamento + etiqueta + sem embalado');
  }

  if (temPagamento && temAnexar && !temEtiqueta && !temEmbalado) {
    return retorno('Anexar Etiqueta', 'prioridade 5: pagamento + anexar etiqueta + sem etiqueta impressa e sem embalado');
  }

  if (temPagamento && !temAnexar && !temEtiqueta && !temEmbalado) {
    return retorno('Gerar Etiqueta', 'prioridade 6: pagamento sem anexar, sem etiqueta impressa e sem embalado');
  }

  return retorno('Sem status', 'prioridade 7: nenhuma regra aplicada no robô');
}

function acaoSugerida(statusCusto) {
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

function contarPor(lista, campo) {
  const resumo = {};

  for (const item of lista) {
    const chave = item[campo] || 'Sem informação';
    resumo[chave] = (resumo[chave] || 0) + 1;
  }

  return resumo;
}

function ordenarResumoStatus(resumo) {
  const ordenado = {};

  for (const status of ORDEM_STATUS) {
    if (Object.prototype.hasOwnProperty.call(resumo, status)) {
      ordenado[status] = resumo[status];
    }
  }

  for (const [status, qtd] of Object.entries(resumo)) {
    if (!Object.prototype.hasOwnProperty.call(ordenado, status)) {
      ordenado[status] = qtd;
    }
  }

  return ordenado;
}

// =====================
// MAIN
// =====================

function main() {
  console.log('====================================');
  console.log('GERADOR DE CUSTO - BASE ROBÔ + VENDAS');
  console.log('====================================');

  const brutoRobo = lerJson(FILE_ROBO);
  const vendasRobo = extrairListaRobo(brutoRobo);

  if (!Array.isArray(vendasRobo) || !vendasRobo.length) {
    throw new Error('❌ O arquivo do robô não possui uma lista válida.');
  }

  const brutoVendas = lerJson(FILE_VENDAS, false);
  const vendas = extrairListaVendas(brutoVendas);
  const mapaVendasInfo = criarMapaVendas(vendas);
  const mapaVendas = mapaVendasInfo.mapa;

  const totalEsperadoTela = brutoRobo.totalEsperadoTela || vendasRobo.length;

  console.log(`📦 Total esperado na tela do robô: ${totalEsperadoTela}`);
  console.log(`🤖 Total de registros no robô: ${vendasRobo.length}`);
  console.log(`🧾 Total de registros em vendas.json: ${vendas.length}`);
  console.log(`🔗 Pedidos indexados em vendas.json: ${mapaVendas.size}`);
  console.log(`🔁 Pedidos com mais de um item em vendas.json: ${mapaVendasInfo.duplicados.size}`);

  let totalComCusto = 0;
  let totalSemCusto = 0;
  let totalComCruzamentoVendas = 0;
  let totalSemCruzamentoVendas = 0;

  const debugRegras = [];
  const exemplosSemCruzamento = [];
  const exemplosPedidosMultiplos = [];

  for (const [pedido, itens] of mapaVendasInfo.duplicados.entries()) {
    if (exemplosPedidosMultiplos.length < 20) {
      exemplosPedidosMultiplos.push({
        id_pedido_mkt: pedido,
        quantidade_itens_extras: itens.length,
        itens_extras: itens
      });
    }
  }

  const custos = vendasRobo.map(item => {
    const custoNumero = toNumber(item.custo);
    const vendaNumero = toNumber(item.preco_venda);
    const temCusto = custoNumero > 0;

    if (temCusto) totalComCusto++;
    else totalSemCusto++;

    const idPedidoMkt = item.id_produto || '';
    const chavePedidoMkt = normalizarChave(idPedidoMkt);
    const vendaMatch = mapaVendas.get(chavePedidoMkt);

    if (vendaMatch) {
      totalComCruzamentoVendas++;
    } else {
      totalSemCruzamentoVendas++;

      if (exemplosSemCruzamento.length < 20) {
        exemplosSemCruzamento.push({
          id_venda_robo: item.id_venda || '',
          id_pedido_mkt: idPedidoMkt,
          canal: item.canal || '',
          status_final: item.status_final || ''
        });
      }
    }

    const status = calcularStatusCusto(item);
    debugRegras.push(status.debug_regra);

    return {
      origem_base: 'robo',

      id_unico: item.id_unico || '',
      pagina: item.pagina || '',
      ordem_na_pagina: item.ordem_na_pagina || '',

      pedido: item.id_venda || '',
      id_venda: item.id_venda || '',

      id_pedido_mkt: idPedidoMkt,
      id_produto: item.id_produto || '',

      canal: item.canal || '',
      sku: vendaMatch?.sku_venda || '',
      sku_venda: vendaMatch?.sku_venda || '',
      produto: vendaMatch?.produto_venda || item.produto || '',
      produto_venda: vendaMatch?.produto_venda || '',
      produto_robo: item.produto || '',
      qtd_itens_mesmo_pedido_vendas: vendaMatch?.quantidade_itens_mesmo_pedido || 0,
      tem_cruzamento_vendas: Boolean(vendaMatch),

      data_venda: vendaMatch?.registro_original?.data || vendaMatch?.registro_original?.data_venda || vendaMatch?.registro_original?.data_criacao || '',
      data_importacao: item.data_criacao || '',
      data_criacao: item.data_criacao || '',

      custo: custoNumero,
      preco_venda: vendaNumero,
      tem_custo: temCusto,

      data_pagamento: item.data_pagamento || '',
      data_etiqueta: item.data_etiqueta || '',
      data_embalado: item.data_embalado || '',

      status_original: item.status_final || '',
      status_final_robo: item.status_final || '',
      status_custo: status.status_custo,
      regra_status_custo: status.regra_status_custo,
      origem_status_custo: 'robo',

      acao_sugerida: acaoSugerida(status.status_custo),

      texto_card: item.texto_card || '',
      texto_item_usado_regra: status.debug_regra.texto_item_usado_regra,
      coletado_em: item.coletado_em || ''
    };
  });

  const mapaStatus = {};

  for (const item of custos) {
    const chave = [
      item.status_original || '',
      item.status_custo || '',
      item.regra_status_custo || '',
      item.tem_custo ? 'com_custo' : 'sem_custo',
      item.tem_cruzamento_vendas ? 'com_vendas' : 'sem_vendas'
    ].join('|');

    if (!mapaStatus[chave]) {
      mapaStatus[chave] = {
        status_original: item.status_original || '',
        status_custo: item.status_custo || '',
        regra: item.regra_status_custo || '',
        origem: item.origem_status_custo || 'robo',
        custo_flag: item.tem_custo ? 'Com custo' : 'Sem custo',
        vendas_flag: item.tem_cruzamento_vendas ? 'Com vendas' : 'Sem vendas',
        quantidade: 0
      };
    }

    mapaStatus[chave].quantidade++;
  }

  const listaStatus = Object.values(mapaStatus).sort((a, b) => {
    const ia = ORDEM_STATUS.indexOf(a.status_custo);
    const ib = ORDEM_STATUS.indexOf(b.status_custo);

    if (ia !== -1 && ib !== -1 && ia !== ib) return ia - ib;
    if (ia !== -1 && ib === -1) return -1;
    if (ia === -1 && ib !== -1) return 1;

    return b.quantidade - a.quantidade;
  });

  const resumoPorStatus = ordenarResumoStatus(contarPor(custos, 'status_custo'));
  const resumoPorCanal = contarPor(custos, 'canal');
  const resumoPorStatusOriginal = contarPor(custos, 'status_original');

  const debugPedidosCriticos = debugRegras.filter(d => PEDIDOS_DEBUG.has(String(d.id_venda)));

  const resumo = {
    etapa: 'base_robo_com_cruzamento_vendas',
    origem_robo: FILE_ROBO,
    origem_vendas: FILE_VENDAS,
    ordem_status: ORDEM_STATUS,

    total_esperado_tela_robo: totalEsperadoTela,
    total_registros_robo: vendasRobo.length,
    total_registros_vendas_json: vendas.length,
    total_pedidos_indexados_vendas: mapaVendas.size,
    total_pedidos_multiplos_vendas: mapaVendasInfo.duplicados.size,
    total_registros_custo_json: custos.length,

    total_com_custo: totalComCusto,
    total_sem_custo: totalSemCusto,

    total_com_cruzamento_vendas: totalComCruzamentoVendas,
    total_sem_cruzamento_vendas: totalSemCruzamentoVendas,

    exemplos_sem_cruzamento_vendas: exemplosSemCruzamento,
    exemplos_pedidos_multiplos_vendas: exemplosPedidosMultiplos,

    pedidos_debug: Array.from(PEDIDOS_DEBUG),
    debug_pedidos_criticos: debugPedidosCriticos,

    paginas_concluidas: brutoRobo.paginasConcluidas || [],
    total_paginas: brutoRobo.totalPaginas || null,
    ultima_pagina_concluida: brutoRobo.ultimaPaginaConcluida || null,

    resumo_por_status_custo: resumoPorStatus,
    resumo_por_canal: resumoPorCanal,
    resumo_por_status_original: resumoPorStatusOriginal
  };

  garantirPasta(OUTPUT_CUSTO);

  fs.writeFileSync(OUTPUT_CUSTO, JSON.stringify(custos, null, 2), 'utf-8');
  fs.writeFileSync(OUTPUT_STATUS, JSON.stringify(listaStatus, null, 2), 'utf-8');
  fs.writeFileSync(OUTPUT_RESUMO, JSON.stringify(resumo, null, 2), 'utf-8');
  fs.writeFileSync(OUTPUT_DEBUG, JSON.stringify(debugRegras, null, 2), 'utf-8');

  console.log('====================================');
  console.log('✅ ARQUIVOS GERADOS');
  console.log('====================================');
  console.log(`✅ ${OUTPUT_CUSTO}`);
  console.log(`✅ ${OUTPUT_STATUS}`);
  console.log(`✅ ${OUTPUT_RESUMO}`);
  console.log(`✅ ${OUTPUT_DEBUG}`);
  console.log('------------------------------------');
  console.log(`Total esperado tela robô: ${totalEsperadoTela}`);
  console.log(`Total registros robô: ${vendasRobo.length}`);
  console.log(`Total registros vendas.json: ${vendas.length}`);
  console.log(`Total no custo.json: ${custos.length}`);
  console.log(`Com custo: ${totalComCusto}`);
  console.log(`Sem custo: ${totalSemCusto}`);
  console.log(`Com cruzamento vendas: ${totalComCruzamentoVendas}`);
  console.log(`Sem cruzamento vendas: ${totalSemCruzamentoVendas}`);
  console.log('------------------------------------');
  console.log('Resumo por status_custo:');
  console.table(resumoPorStatus);
}

main();
