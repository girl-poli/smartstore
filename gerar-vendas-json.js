const fs = require('fs');
const xlsx = require('xlsx');

// =====================================================
// GERADOR DE VENDAS - BASE VERDADE = ARQUIVOS DE VENDAS
//
// Objetivo:
// - A verdade de vendas vem dos arquivos:
//   ./data_external/vendas-ml.xlsx
//   ./data_external/vendas-shopee.xlsx
//   ./data_external/vendas-tiktok.xlsx
//
// - A base de custo/compras entra como enriquecimento:
//   ./data/custo.json
//
// - Match principal:
//   vendas.pedido -> custo.id_pedido_mkt
//   fallback: vendas.pedido -> custo.id_produto
//
// Saídas:
//   ./data/vendas.json
//   ./data/vendas-resumo.json
//   ./data/vendas-status.json
//   ./data/vendas-conciliacao-custo.json
// =====================================================

// =====================
// CONFIG
// =====================
const FILE_ML = './data_external/vendas-ml.xlsx';
const FILE_SHOPEE = './data_external/vendas-shopee.xlsx';
const FILE_TIKTOK = './data_external/vendas-tiktok.xlsx';

// Base gerada na tela de custo/compras
const FILE_CUSTO_COMPRAS = './data_external/relatorio-dropstok-vendas.json';

// Fallback antigo de custo por catálogo/SKU
const FILE_CUSTO_CATALOGO = './data_external/relatorio-dropstok-mapeamento.json';

const OUTPUT = './data/vendas.json';
const OUTPUT_RESUMO = './data/vendas-resumo.json';
const OUTPUT_STATUS = './data/vendas-status.json';
const OUTPUT_CONCILIACAO = './data/vendas-conciliacao-custo.json';
const OUTPUT_CATALOGO_CUSTOS = './data/catalogo-custos.json';

// =====================
// HELPERS
// =====================

function arquivoExiste(filePath) {
  return fs.existsSync(filePath);
}

function lerJson(filePath, obrigatorio = true) {
  if (!arquivoExiste(filePath)) {
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

function toNumber(valor) {
  if (valor === null || valor === undefined || valor === '') return 0;

  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;

  let texto = String(valor).trim();

  texto = texto
    .replace(/BRL/gi, '')
    .replace(/R\$/gi, '')
    .replace(/\s+/g, '');

  if (!texto) return 0;

  if (texto.includes('.') && texto.includes(',')) {
    texto = texto.replace(/\./g, '').replace(',', '.');
  } else if (texto.includes(',')) {
    texto = texto.replace(',', '.');
  }

  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : 0;
}

function garantirPasta(filePath) {
  const dir = require('path').dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}


function normalizarDataTikTok(valor) {
  if (!valor) return '';

  const texto = String(valor).trim();
  if (!texto) return '';

  // Excel serial date
  if (/^\d+(\.\d+)?$/.test(texto)) {
    const n = Number(texto);
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

  // TikTok: MM/DD/YYYY hh:mm:ss AM/PM
  let m = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (m) {
    let [, mes, dia, ano, hora, minuto, segundo = '00', periodo] = m;
    let h = parseInt(hora, 10);

    if (periodo) {
      const p = periodo.toUpperCase();
      if (p === 'PM' && h < 12) h += 12;
      if (p === 'AM' && h === 12) h = 0;
    }

    return `${dia.padStart(2, '0')}/${mes.padStart(2, '0')}/${ano} ${String(h).padStart(2, '0')}:${minuto}:${segundo}`;
  }

  // YYYY-MM-DD HH:mm:ss
  m = texto.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const [, ano, mes, dia, hora, minuto, segundo = '00'] = m;
    return `${dia}/${mes}/${ano} ${String(hora).padStart(2, '0')}:${minuto}:${segundo}`;
  }

  // DD/MM/YYYY HH:mm:ss já em BR
  m = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    let [, dia, mes, ano, hora, minuto, segundo = '00'] = m;
    if (Number(mes) > 12) {
      const tmp = dia;
      dia = mes;
      mes = tmp;
    }
    return `${dia.padStart(2, '0')}/${mes.padStart(2, '0')}/${ano} ${String(hora).padStart(2, '0')}:${minuto}:${segundo}`;
  }

  return texto;
}

function normalizarDataGeral(valor) {
  if (!valor) return '';
  const texto = String(valor).trim();
  if (!texto) return '';

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

  const m = texto.toLowerCase().match(/^(\d{1,2}) de ([a-zçã]+) de (\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/i);
  if (m) {
    let [, dia, mesTexto, ano, hora = '00', minuto = '00', segundo = '00'] = m;
    const mes = meses[mesTexto] || '01';
    return `${dia.padStart(2, '0')}/${mes}/${ano} ${String(hora).padStart(2, '0')}:${minuto}:${segundo}`;
  }

  return normalizarDataTikTok(texto);
}


// =====================
// ML
// =====================
function tratarML() {
  const wb = xlsx.readFile(FILE_ML);
  const sheet = wb.Sheets[wb.SheetNames[0]];

  const linhas = xlsx.utils.sheet_to_json(sheet, {
    header: 1,
    defval: ''
  });

  const cabecalho = linhas[5]; // linha 6
  const dados = linhas.slice(6); // linha 7 em diante

  const idxPedido = cabecalho.findIndex(c => String(c).trim() === 'N.º de venda');
  const idxData = cabecalho.findIndex(c => String(c).trim() === 'Data da venda');
  const idxStatus = cabecalho.findIndex(c => String(c).trim() === 'Estado');
  const idxDescricaoStatus = cabecalho.findIndex(c => String(c).trim() === 'Descrição do status');
  const idxPacoteDiversos = cabecalho.findIndex(c => String(c).trim() === 'Pacote de diversos produtos');
  const idxKit = cabecalho.findIndex(c => String(c).trim() === 'Pertence a um kit');
  const idxProduto = cabecalho.findIndex(c => String(c).trim() === 'Título do anúncio');
  const idxSku = cabecalho.findIndex(c => String(c).trim() === 'SKU');
  const idxQtd = cabecalho.findIndex(c => String(c).trim() === 'Unidades');
  const idxReceitaProduto = cabecalho.findIndex(c => String(c).trim() === 'Receita por produtos (BRL)');
  const idxReceitaAcrescimo = cabecalho.findIndex(c => String(c).trim() === 'Receita por acréscimo no preço (pago pelo comprador)');
  const idxTarifaVenda = cabecalho.findIndex(c => String(c).trim() === 'Tarifa de venda e impostos (BRL)');
  const idxReceitaEnvio = cabecalho.findIndex(c => String(c).trim() === 'Receita por envio (BRL)');
  const idxTarifasEnvio = cabecalho.findIndex(c => String(c).trim() === 'Tarifas de envio (BRL)');
  const idxTotal = cabecalho.findIndex(c => String(c).trim() === 'Total (BRL)');
  const idxPrecoUnitario = cabecalho.findIndex(c => String(c).trim() === 'Preço unitário de venda do anúncio (BRL)');
  const idxComprador = cabecalho.findIndex(c => String(c).trim() === 'Comprador');
  const idxCidade = cabecalho.findIndex(c => String(c).trim() === 'Cidade');
  const idxEstadoCliente = cabecalho.findIndex(c => String(c).trim() === 'Estado');
  const idxFormaEntrega = cabecalho.findIndex(c => String(c).trim() === 'Forma de entrega');

  function valor(linha, idx) {
    return idx >= 0 ? toNumber(linha[idx]) : 0;
  }

  function texto(linha, idx) {
    return idx >= 0 ? String(linha[idx] || '').trim() : '';
  }

  function ehLinhaPacotePrincipal(linha) {
    const estado = normalizarTexto(texto(linha, idxStatus));
    const descricao = normalizarTexto(texto(linha, idxDescricaoStatus));

    const temFinanceiro =
      valor(linha, idxReceitaProduto) !== 0 ||
      valor(linha, idxTarifaVenda) !== 0 ||
      valor(linha, idxReceitaEnvio) !== 0 ||
      valor(linha, idxTarifasEnvio) !== 0 ||
      valor(linha, idxTotal) !== 0;

    return (estado.includes('pacote de') || descricao.includes('pacote de')) && temFinanceiro;
  }

  function ehLinhaProdutoDoPacote(linha) {
    const pacoteDiversos = normalizarTexto(texto(linha, idxPacoteDiversos));
    const estado = normalizarTexto(texto(linha, idxStatus));
    const sku = texto(linha, idxSku);
    const produto = texto(linha, idxProduto);

    const semFinanceiro =
      valor(linha, idxReceitaProduto) === 0 &&
      valor(linha, idxTarifaVenda) === 0 &&
      valor(linha, idxReceitaEnvio) === 0 &&
      valor(linha, idxTarifasEnvio) === 0 &&
      valor(linha, idxTotal) === 0;

    return pacoteDiversos === 'sim' &&
      (sku || produto) &&
      !estado.includes('pacote de') &&
      semFinanceiro;
  }

  function criarVendaML(linha, extras = {}) {
    const quantidade = Number(linha[idxQtd] || 1) || 1;

    const precoUnitario = valor(linha, idxPrecoUnitario);
    const receitaDireta = valor(linha, idxReceitaProduto);
    const receitaProdutos = extras.receitaProdutos ?? (receitaDireta || (precoUnitario * quantidade));

    const tarifaVenda = Math.abs(extras.tarifaVenda ?? valor(linha, idxTarifaVenda));
    const receitaEnvio = extras.receitaEnvio ?? valor(linha, idxReceitaEnvio);
    const tarifasEnvio = Math.abs(extras.tarifasEnvio ?? valor(linha, idxTarifasEnvio));
    const total = extras.total ?? valor(linha, idxTotal);

    return {
      data: normalizarDataGeral(linha[idxData] || ''),
      data_pedido: normalizarDataGeral(linha[idxData] || ''),
      data_financeira: normalizarDataGeral(linha[idxData] || ''),
      data_liquidacao: normalizarDataGeral(linha[idxData] || ''),
      pedido: String(extras.pedidoPrincipal || linha[idxPedido] || '').trim(),
      pedido_item_ml: String(linha[idxPedido] || '').trim(),
      canal: 'ML',
      sku: String(linha[idxSku] || '').trim(),
      produto: linha[idxProduto] || '',
      variacao: '',
      status: extras.status || linha[idxStatus] || '',
      status_original_ml_item: linha[idxStatus] || '',
      quantidade,
      preco_venda: receitaProdutos,
      comissao: tarifaVenda,
      frete: tarifasEnvio,
      receita_envio: receitaEnvio,
      repasse: total,
      origem_repasse: extras.origemRepasse || 'arquivo_vendas_ml',
      regra_repasse: extras.regraRepasse || 'Valores financeiros diretos da linha Mercado Livre',
      comprador: linha[idxComprador] || '',
      cidade: linha[idxCidade] || '',
      uf: linha[idxEstadoCliente] || '',
      entrega: linha[idxFormaEntrega] || '',
      origem_venda: 'arquivo_vendas_ml',

      ml_pacote_multi_produto: Boolean(extras.mlPacoteMultiProduto),
      ml_pedido_principal: extras.pedidoPrincipal || '',
      ml_preco_unitario_item: precoUnitario,
      ml_participacao_pedido: extras.participacaoPedido ?? '',
      participacao_pedido: extras.participacaoPedido ?? '',
      repasse_total_pedido_shopee: extras.repasseTotalPedido ?? '',
      ml_repasse_total_pedido: extras.repasseTotalPedido ?? '',
      ml_receita_total_pedido: extras.receitaTotalPedido ?? '',
      pedido_multi_produto_financeiro: Boolean(extras.mlPacoteMultiProduto)
    };
  }

  function ratearPacoteML(linhaPrincipal, itens) {
    const pedidoPrincipal = String(linhaPrincipal[idxPedido] || '').trim();

    const receitaTotal = valor(linhaPrincipal, idxReceitaProduto);
    const tarifaTotal = Math.abs(valor(linhaPrincipal, idxTarifaVenda));
    const receitaEnvioTotal = valor(linhaPrincipal, idxReceitaEnvio);
    const tarifasEnvioTotal = Math.abs(valor(linhaPrincipal, idxTarifasEnvio));
    const totalRepasse = valor(linhaPrincipal, idxTotal);

    // Peso correto: preço unitário do item * quantidade.
    // Exemplo:
    // Sabonete: 22,47
    // Lip balm: 8,99
    // Total: 31,46
    const pesos = itens.map(item => {
      const qtd = Number(item[idxQtd] || 1) || 1;
      const precoUnitario = valor(item, idxPrecoUnitario);
      const receitaLinha = valor(item, idxReceitaProduto);
      const acrescimoLinha = valor(item, idxReceitaAcrescimo);

      return (receitaLinha || (precoUnitario * qtd) || acrescimoLinha || qtd || 1);
    });

    const somaPesos = pesos.reduce((acc, n) => acc + n, 0) || itens.length || 1;

    return itens.map((linhaItem, index) => {
      const participacao = pesos[index] / somaPesos;

      return criarVendaML(linhaItem, {
        pedidoPrincipal,
        status: linhaItem[idxStatus] || linhaPrincipal[idxStatus] || '',
        receitaProdutos: receitaTotal * participacao,
        tarifaVenda: tarifaTotal * participacao,
        receitaEnvio: receitaEnvioTotal * participacao,
        tarifasEnvio: tarifasEnvioTotal * participacao,
        total: totalRepasse * participacao,
        origemRepasse: 'ml_rateio_pacote_multi_produto_por_preco_item',
        regraRepasse: 'Pacote ML: financeiro da linha principal rateado pelo preço unitário do item',
        mlPacoteMultiProduto: true,
        participacaoPedido: Number((participacao * 100).toFixed(2)),
        repasseTotalPedido: Number(totalRepasse.toFixed(2)),
        receitaTotalPedido: Number(receitaTotal.toFixed(2))
      });
    });
  }

  const vendas = [];

  for (let i = 0; i < dados.length; i++) {
    const linha = dados[i];

    if (!String(linha[idxPedido] || '').trim()) continue;

    if (ehLinhaPacotePrincipal(linha)) {
      const itens = [];
      let j = i + 1;

      while (j < dados.length) {
        const proxima = dados[j];

        if (!String(proxima[idxPedido] || '').trim()) {
          j++;
          continue;
        }

        if (ehLinhaPacotePrincipal(proxima)) break;

        if (ehLinhaProdutoDoPacote(proxima)) {
          itens.push(proxima);
          j++;
          continue;
        }

        break;
      }

      if (itens.length) {
        vendas.push(...ratearPacoteML(linha, itens));
        i = j - 1;
        continue;
      }

      vendas.push(criarVendaML(linha));
      continue;
    }

    vendas.push(criarVendaML(linha));
  }

  return vendas;
}

function findShopeeHeaderIndex(cabecalho, termosObrigatorios, termosOpcionais = []) {
  return cabecalho.findIndex(c => {
    const texto = normalizarTexto(c);
    const obrigatoriosOk = termosObrigatorios.every(t => texto.includes(normalizarTexto(t)));
    if (!obrigatoriosOk) return false;

    if (!termosOpcionais.length) return true;

    return termosOpcionais.some(t => texto.includes(normalizarTexto(t)));
  });
}


// =====================
// SHOPEE
// =====================
function tratarShopee() {
  const wb = xlsx.readFile(FILE_SHOPEE);
  const sheet = wb.Sheets[wb.SheetNames[0]];

  const linhas = xlsx.utils.sheet_to_json(sheet, {
    header: 1,
    defval: ''
  });

  const cabecalho = linhas[0]; // linha 1
  const dados = linhas.slice(1); // linha 2 em diante

  const idxPedido = cabecalho.findIndex(c => String(c).trim() === 'ID do pedido');
  const idxStatus = cabecalho.findIndex(c => String(c).trim() === 'Status do pedido');
  const idxData = cabecalho.findIndex(c => String(c).trim() === 'Data de criação do pedido');
  const idxSkuPrincipal = cabecalho.findIndex(c => String(c).trim() === 'Nº de referência do SKU principal');
  const idxSku = cabecalho.findIndex(c => String(c).trim() === 'Número de referência SKU');
  const idxProduto = cabecalho.findIndex(c => String(c).trim() === 'Nome do Produto');
  const idxVariacao = cabecalho.findIndex(c => String(c).trim() === 'Nome da variação');
  const idxQuantidade = cabecalho.findIndex(c => String(c).trim() === 'Quantidade');
  const idxSubtotal = cabecalho.findIndex(c => String(c).trim() === 'Subtotal do produto');
  const idxTaxaTransacao = cabecalho.findIndex(c => String(c).trim() === 'Taxa de transação');
  const idxComissaoBruta = cabecalho.findIndex(c => String(c).trim() === 'Taxa de comissão bruta');
  const idxComissaoLiquida = cabecalho.findIndex(c => String(c).trim() === 'Taxa de comissão líquida');
  const idxServicoBruto = cabecalho.findIndex(c => String(c).trim() === 'Taxa de serviço bruta');
  const idxServicoLiquido = cabecalho.findIndex(c => String(c).trim() === 'Taxa de serviço líquida');
  const idxTotalGlobal = cabecalho.findIndex(c => String(c).trim() === 'Total global');
  const idxFreteEstimado = cabecalho.findIndex(c => String(c).trim() === 'Valor estimado do frete');

  // Cupom/desconto pago pelo vendedor/loja.
  // Exemplo no detalhe Shopee: "Cupom da loja pago pelo vendedor".
  const idxDescontoVendedorShopee = cabecalho.findIndex(c => {
    const texto = normalizarTexto(c);
    const ehDescontoOuCupom = texto.includes('cupom') || texto.includes('desconto') || texto.includes('voucher');
    const ehVendedorOuLoja = texto.includes('vendedor') || texto.includes('loja');
    return ehDescontoOuCupom && ehVendedorOuLoja;
  });

  const idxComprador = cabecalho.findIndex(c => String(c).trim() === 'Nome de usuário (comprador)');
  const idxCidade = cabecalho.findIndex(c => String(c).trim() === 'Cidade');
  const idxUF = cabecalho.findIndex(c => String(c).trim() === 'UF');

  const vendas = dados
    .filter(linha => String(linha[idxPedido] || '').trim() !== '')
    .map(linha => {
      const taxaTransacao = Math.abs(toNumber(linha[idxTaxaTransacao]));
      const taxaComissaoBruta = Math.abs(toNumber(linha[idxComissaoBruta]));
      const taxaComissaoLiquida = Math.abs(toNumber(linha[idxComissaoLiquida]));
      const taxaServicoBruta = Math.abs(toNumber(linha[idxServicoBruto]));
      const taxaServicoLiquida = Math.abs(toNumber(linha[idxServicoLiquido]));
      const subtotalProduto = toNumber(linha[idxSubtotal]);
      const totalGlobal = toNumber(linha[idxTotalGlobal]);
      const descontoVendedorShopee = idxDescontoVendedorShopee >= 0
        ? Math.abs(toNumber(linha[idxDescontoVendedorShopee]))
        : 0;

      // Regra correta Shopee:
      // Repasse = Subtotal do produto - Taxa de comissão líquida - Taxa de serviço líquida
      // As taxas brutas ficam apenas para auditoria.
      const repasseShopee = subtotalProduto - taxaComissaoLiquida - taxaServicoLiquida;

      return {
        data: normalizarDataGeral(linha[idxData] || ''),
        data_pedido: normalizarDataGeral(linha[idxData] || ''),
        data_financeira: normalizarDataGeral(linha[idxData] || ''),
        data_liquidacao: normalizarDataGeral(linha[idxData] || ''),
        pedido: String(linha[idxPedido] || '').trim(),
        canal: 'Shopee',
        sku: String(linha[idxSku] || linha[idxSkuPrincipal] || '').trim(),
        produto: linha[idxProduto] || '',
        variacao: linha[idxVariacao] || '',
        status: linha[idxStatus] || '',
        quantidade: Number(linha[idxQuantidade] || 1),
        preco_venda: subtotalProduto,

        // Comissão exibida = taxas líquidas realmente usadas no repasse
        comissao: taxaComissaoLiquida + taxaServicoLiquida,

        // Frete fica separado para análise, mas não entra nesta regra de repasse
        frete: toNumber(linha[idxFreteEstimado]),

        repasse: repasseShopee,
        origem_repasse: 'shopee_subtotal_menos_comissao_liquida_menos_servico_liquido',
        regra_repasse: 'Subtotal do produto - Taxa de comissão líquida - Taxa de serviço líquida',

        subtotal_produto_shopee: subtotalProduto,
        total_global_shopee: totalGlobal,
        taxa_transacao_shopee: taxaTransacao,
        taxa_comissao_bruta_shopee: taxaComissaoBruta,
        taxa_comissao_liquida_shopee: taxaComissaoLiquida,
        taxa_servico_bruta_shopee: taxaServicoBruta,
        taxa_servico_liquida_shopee: taxaServicoLiquida,
        desconto_vendedor_shopee: descontoVendedorShopee,

        comprador: linha[idxComprador] || '',
        cidade: linha[idxCidade] || '',
        uf: linha[idxUF] || '',
        origem_venda: 'arquivo_vendas_shopee'
      };
    });

  return ajustarShopeeMultiProduto(vendas);
}


function ajustarShopeeMultiProduto(vendas) {
  const porPedido = new Map();

  for (const venda of vendas) {
    const chave = normalizarChave(venda.pedido);
    if (!chave) continue;

    if (!porPedido.has(chave)) porPedido.set(chave, []);
    porPedido.get(chave).push(venda);
  }

  for (const [, itens] of porPedido.entries()) {
    if (itens.length <= 1) continue;

    const subtotalPedido = itens.reduce((acc, item) => acc + toNumber(item.preco_venda), 0);
    if (subtotalPedido <= 0) continue;

    // No arquivo da Shopee, as taxas do pedido aparecem repetidas em cada item.
    // Por isso usamos o MAIOR valor do grupo como total do pedido.
    const comissaoTotalPedido = Math.max(...itens.map(item =>
      toNumber(item.taxa_comissao_liquida_shopee) + toNumber(item.taxa_servico_liquida_shopee)
    ));

    const descontoTotalPedido = Math.max(...itens.map(item =>
      toNumber(item.desconto_vendedor_shopee)
    ));

    const freteTotalPedido = Math.max(...itens.map(item =>
      toNumber(item.frete)
    ));

    // Regra validada no exemplo:
    // Subtotal produtos R$ 51,21 - Taxas R$ 17,21 - Cupom vendedor R$ 5,13 = R$ 28,87
    const repasseTotalPedido = subtotalPedido - comissaoTotalPedido - descontoTotalPedido;

    for (const item of itens) {
      const participacao = toNumber(item.preco_venda) / subtotalPedido;

      item.comissao = comissaoTotalPedido * participacao;
      item.frete = freteTotalPedido * participacao;
      item.repasse = repasseTotalPedido * participacao;

      item.pedido_multi_produto_financeiro = true;
      item.participacao_pedido = Number((participacao * 100).toFixed(2));
      item.subtotal_pedido_shopee = Number(subtotalPedido.toFixed(2));
      item.comissao_total_pedido_shopee = Number(comissaoTotalPedido.toFixed(2));
      item.desconto_total_pedido_shopee = Number(descontoTotalPedido.toFixed(2));
      item.frete_total_pedido_shopee = Number(freteTotalPedido.toFixed(2));
      item.repasse_total_pedido_shopee = Number(repasseTotalPedido.toFixed(2));

      item.origem_repasse = 'shopee_rateio_multi_produto_por_valor';
      item.regra_repasse = 'Pedido multi produto: repasse total do pedido rateado pela participação do item no subtotal';
    }
  }

  return vendas;
}


// =====================
// TIKTOK
// =====================
function tratarTikTok() {
  const wb = xlsx.readFile(FILE_TIKTOK);
  const sheet = wb.Sheets[wb.SheetNames[0]];

  const linhas = xlsx.utils.sheet_to_json(sheet, {
    header: 1,
    defval: ''
  });

  const cabecalho = linhas[0]; // linha 1
  const dados = linhas.slice(2); // linha 3 em diante

  const idxPedido = cabecalho.findIndex(c => String(c).trim() === 'Order ID');
  const idxPackage = cabecalho.findIndex(c => String(c).trim() === 'Package ID');
  const idxStatus = cabecalho.findIndex(c => String(c).trim() === 'Order Status');
  const idxSubstatus = cabecalho.findIndex(c => String(c).trim() === 'Order Substatus');
  const idxSku = cabecalho.findIndex(c => String(c).trim() === 'Seller SKU');
  const idxProduto = cabecalho.findIndex(c => String(c).trim() === 'Product Name');
  const idxVariacao = cabecalho.findIndex(c => String(c).trim() === 'Variation');
  const idxQtd = cabecalho.findIndex(c => String(c).trim() === 'Quantity');
  const idxSubtotalAntes = cabecalho.findIndex(c => String(c).trim() === 'SKU Subtotal Before Discount');
  const idxSubtotalDepois = cabecalho.findIndex(c => String(c).trim() === 'SKU Subtotal After Discount');
  const idxFreteDepois = cabecalho.findIndex(c => String(c).trim() === 'Shipping Fee After Discount');
  const idxOrderAmount = cabecalho.findIndex(c => String(c).trim() === 'Order Amount');
  const idxCreated = cabecalho.findIndex(c => String(c).trim() === 'Created Time');
  const idxPaid = cabecalho.findIndex(c => String(c).trim() === 'Paid Time');
  const idxRTS = cabecalho.findIndex(c => String(c).trim() === 'RTS Time');
  const idxShipped = cabecalho.findIndex(c => String(c).trim() === 'Shipped Time');
  const idxDelivered = cabecalho.findIndex(c => String(c).trim() === 'Delivered Time');
  const idxCancelled = cabecalho.findIndex(c => String(c).trim() === 'Cancelled Time');
  const idxBuyer = cabecalho.findIndex(c => String(c).trim() === 'Buyer Username');
  const idxCpfName = cabecalho.findIndex(c => String(c).trim() === 'CPF Name');
  const idxRecipient = cabecalho.findIndex(c => String(c).trim() === 'Recipient');
  const idxCity = cabecalho.findIndex(c => String(c).trim() === 'City');
  const idxState = cabecalho.findIndex(c => String(c).trim() === 'State');
  const idxDelivery = cabecalho.findIndex(c => String(c).trim() === 'Delivery Option');
  const idxProvider = cabecalho.findIndex(c => String(c).trim() === 'Shipping Provider Name');

  const vendas = dados
    .filter(linha => String(linha[idxPedido] || '').trim() !== '')
    .map(linha => {
      const subtotalAntes = toNumber(linha[idxSubtotalAntes]);
      const subtotalDepois = toNumber(linha[idxSubtotalDepois]);
      const freteDepois = toNumber(linha[idxFreteDepois]);
      const orderAmount = toNumber(linha[idxOrderAmount]);
      const quantidade = Number(linha[idxQtd] || 1);

      // =====================================================
      // MODELO INTELIGENTE TIKTOK POR HISTÓRICO
      // =====================================================
      // Como o arquivo de vendas TikTok não traz o valor real de liquidação,
      // usamos um modelo calibrado com os prints reais de liquidação enviados.
      //
      // Cada amostra contém:
      // - liquido: Vendas líquidas estimadas
      // - repasse: Valor total a ser liquidado
      // - taxaEfetiva = (liquido - repasse) / liquido
      //
      // O modelo escolhe a amostra histórica mais próxima do valor vendido
      // e aplica a taxa efetiva correspondente.
      // =====================================================

      const baseAfterDiscount = subtotalDepois || subtotalAntes || orderAmount || 0;

      const historicoTikTok = [
        { liquido: 21.24, repasse: 15.97 },
        { liquido: 26.24, repasse: 20.67 },
        { liquido: 26.55, repasse: 20.96 },
        { liquido: 37.72, repasse: 29.20 },
        { liquido: 23.44, repasse: 16.62 }
      ].map(item => ({
        ...item,
        taxaEfetiva: item.liquido > 0 ? (item.liquido - item.repasse) / item.liquido : 0
      }));

      function obterModeloHistoricoTikTok(valor) {
        if (!valor || valor <= 0) {
          return {
            taxaEfetiva: 0.25,
            amostraLiquido: 0,
            amostraRepasse: 0,
            regra: 'fallback_25_percent'
          };
        }

        let melhor = historicoTikTok[0];
        let menorDistancia = Math.abs(valor - melhor.liquido);

        for (const amostra of historicoTikTok) {
          const distancia = Math.abs(valor - amostra.liquido);

          if (distancia < menorDistancia) {
            melhor = amostra;
            menorDistancia = distancia;
          }
        }

        return {
          taxaEfetiva: melhor.taxaEfetiva,
          amostraLiquido: melhor.liquido,
          amostraRepasse: melhor.repasse,
          regra: 'historico_mais_proximo'
        };
      }

      const modelo = obterModeloHistoricoTikTok(baseAfterDiscount);
      const taxaHistoricaTikTok = modelo.taxaEfetiva;

      // Repasse estimado pelo histórico
      const repasseEstimadoTikTok = baseAfterDiscount - (baseAfterDiscount * taxaHistoricaTikTok);

      // Para leitura gerencial, a comissão representa toda a perda estimada
      // entre after discount e repasse.
      const comissaoEstimadaTikTok = baseAfterDiscount - repasseEstimadoTikTok;

      return {
        data: normalizarDataTikTok(linha[idxCreated] || linha[idxPaid] || ''),
        data_pedido: normalizarDataTikTok(linha[idxCreated] || linha[idxPaid] || ''),
        data_pagamento: normalizarDataTikTok(linha[idxPaid] || ''),
        data_rts: normalizarDataTikTok(linha[idxRTS] || ''),
        data_envio: normalizarDataTikTok(linha[idxShipped] || ''),
        data_entrega: normalizarDataTikTok(linha[idxDelivered] || ''),
        data_cancelamento: normalizarDataTikTok(linha[idxCancelled] || ''),
        data_financeira: normalizarDataTikTok(linha[idxDelivered] || linha[idxPaid] || linha[idxCreated] || ''),
        data_liquidacao: normalizarDataTikTok(linha[idxDelivered] || linha[idxPaid] || ''),
        pedido: String(linha[idxPedido] || '').trim(),
        pacote: String(linha[idxPackage] || '').trim(),
        canal: 'TikTok',
        sku: String(linha[idxSku] || '').trim(),
        produto: linha[idxProduto] || '',
        variacao: linha[idxVariacao] || '',
        status: linha[idxSubstatus] || linha[idxStatus] || '',
        order_status_tiktok: linha[idxStatus] || '',
        order_substatus_tiktok: linha[idxSubstatus] || '',
        quantidade,
        preco_venda: subtotalAntes,
        valor_after_discount_tiktok: baseAfterDiscount,
        comissao: comissaoEstimadaTikTok,
        taxa_fixa_tiktok: 0,
        frete: freteDepois,
        repasse: repasseEstimadoTikTok,
        origem_repasse: 'estimado_tiktok_modelo_historico',
        regra_repasse: 'After Discount - taxa efetiva histórica mais próxima',
        taxa_historica_tiktok: taxaHistoricaTikTok,
        percentual_taxa_historica_tiktok: Number((taxaHistoricaTikTok * 100).toFixed(2)),
        amostra_historica_liquido_tiktok: modelo.amostraLiquido,
        amostra_historica_repasse_tiktok: modelo.amostraRepasse,
        modelo_tiktok: modelo.regra,
        order_amount_original_tiktok: orderAmount,
        comprador: linha[idxBuyer] || '',
        nome_cliente: linha[idxCpfName] || linha[idxRecipient] || '',
        cidade: linha[idxCity] || '',
        uf: linha[idxState] || '',
        entrega: linha[idxDelivery] || '',
        transportadora: linha[idxProvider] || '',
        origem_venda: 'arquivo_vendas_tiktok'
      };
    });

  return vendas;
}

// =====================
// SKU / CUSTO CATÁLOGO
// =====================
function extrairSkuBase(sku) {
  if (!sku) return '';

  return String(sku)
    .replace(/\s*[-_]?\s*var\s*\d+$/i, '')
    .replace(/\s*[-_]?\s*v\s*\d+$/i, '')
    .replace(/\s*_var_\d+$/i, '')
    .trim();
}

function carregarMapaCustosCatalogo() {
  const bruto = lerJson(FILE_CUSTO_CATALOGO, false);
  const itens = Array.isArray(bruto) ? bruto : [];

  const mapa = new Map();

  itens.forEach(item => {
    const sku = String(item.sky || '').trim();
    if (!sku) return;

    const skuBase = extrairSkuBase(sku);
    const custo = toNumber(item.preco);

    mapa.set(skuBase, {
      skuBase,
      custo,
      nome_base: item.nome_produto || '',
      estoque: Number(item.estoque || 0)
    });
  });

  return mapa;
}

// =====================
// CUSTO / COMPRAS
// =====================
function carregarMapaComprasCusto() {
  const bruto = lerJson(FILE_CUSTO_COMPRAS, false);

  let compras = [];

  if (Array.isArray(bruto)) {
    compras = bruto;
  } else if (bruto && Array.isArray(bruto.vendas)) {
    compras = bruto.vendas;
  }

  const mapa = new Map();
  const duplicados = new Map();
  let semChave = 0;

  function adicionarChave(chave, itemMapeado, compraOriginal) {
    const chaveNorm = normalizarChave(chave);
    if (!chaveNorm) return;

    if (!mapa.has(chaveNorm)) {
      mapa.set(chaveNorm, itemMapeado);
    } else {
      const atual = mapa.get(chaveNorm);
      atual.qtd_compras_mesmo_pedido++;

      if (!duplicados.has(chaveNorm)) duplicados.set(chaveNorm, []);
      duplicados.get(chaveNorm).push(compraOriginal);
    }
  }

  for (const compra of compras) {
    // relatorio-dropstok-vendas.json:
    // id_produto costuma ser o ID pedido MKT / número do pedido da plataforma
    // id_venda costuma ser o ID interno do robô
    const idPedidoMkt = compra.id_pedido_mkt || compra.id_produto || compra.pedido_mkt || '';
    const pedidoCompra = compra.pedido || '';
    const idVendaCompra = compra.id_venda || '';

    if (!idPedidoMkt && !pedidoCompra && !idVendaCompra) {
      semChave++;
      continue;
    }

    const itemMapeado = {
      id_pedido_mkt: idPedidoMkt,
      id_venda_compra: idVendaCompra || pedidoCompra,
      canal_compra: compra.canal || '',
      custo_compra: toNumber(compra.custo),
      preco_venda_compra: toNumber(compra.preco_venda),
      status_custo: compra.status_custo || compra.status_final || '',
      acao_custo: compra.acao_sugerida || '',
      data_importacao: compra.data_importacao || compra.data_criacao || '',
      data_pagamento: compra.data_pagamento || '',
      data_etiqueta: compra.data_etiqueta || '',
      data_embalado: compra.data_embalado || '',
      compra_original: compra,
      qtd_compras_mesmo_pedido: 1
    };

    adicionarChave(idPedidoMkt, itemMapeado, compra);
    adicionarChave(pedidoCompra, itemMapeado, compra);
  }

  return {
    mapa,
    compras,
    duplicados,
    semChave
  };
}


function criarMapaQuantidadeItensPedido(vendas) {
  const mapa = new Map();

  for (const venda of vendas) {
    const chave = normalizarChave(venda.pedido);
    if (!chave) continue;
    mapa.set(chave, (mapa.get(chave) || 0) + 1);
  }

  return mapa;
}

function aplicarCustosECompras(vendas, mapaCustosCatalogo, mapaCompras) {
  const mapaQtdItensPedido = criarMapaQuantidadeItensPedido(vendas);
  return vendas.map(venda => {
    const skuBase = extrairSkuBase(venda.sku);
    const custoCatalogo = mapaCustosCatalogo.get(skuBase);

    const chavePedido = normalizarChave(venda.pedido);
    const compra = mapaCompras.get(chavePedido);

    const custoCompra = compra ? toNumber(compra.custo_compra) : 0;
    const custoCatalogoUnitario = custoCatalogo ? toNumber(custoCatalogo.custo) : 0;
    const quantidadeVenda = Number(venda.quantidade || 1) || 1;
    const custoCatalogoNumero = custoCatalogoUnitario * quantidadeVenda;

    const qtdItensPedido = mapaQtdItensPedido.get(chavePedido) || 1;
    const pedidoMultiProduto = qtdItensPedido > 1;

    // Regra de custo:
    // Pedido com 1 item/produto:
    //   usa custo da compra; fallback catálogo.
    //
    // Pedido com mais de 1 item/produto:
    //   usa custo unitário do catálogo * quantidade do item.
    //   Isso evita duplicar o custo da compra total para todos os produtos filhos.
    const custoFinal = pedidoMultiProduto
      ? (custoCatalogoNumero || custoCompra || 0)
      : (custoCompra || custoCatalogoNumero || 0);

    return {
      ...venda,

      sku_base: skuBase,

      custo: custoFinal,
      custo_final: custoFinal,

      custo_compra: custoCompra,
      custo_catalogo: custoCatalogoNumero,
      custo_catalogo_unitario: custoCatalogoUnitario,
      quantidade_custo_calculada: quantidadeVenda,

      origem_custo_venda: pedidoMultiProduto
        ? (custoCatalogo ? 'catalogo_multi_produto_qtd' : (compra ? 'relatorio_dropstok_vendas_multi_sem_catalogo' : 'sem_custo'))
        : (compra ? 'relatorio_dropstok_vendas' : (custoCatalogo ? 'catalogo' : 'sem_custo')),

      pedido_multi_produto_custo: pedidoMultiProduto,
      qtd_itens_mesmo_pedido_venda: qtdItensPedido,

      conciliado_custo_compra: compra ? 'SIM' : 'NAO',
      conciliado_catalogo: custoCatalogo ? 'SIM' : 'NAO',

      nome_base: custoCatalogo ? custoCatalogo.nome_base : '',
      estoque_base: custoCatalogo ? custoCatalogo.estoque : 0,
      tem_custo_catalogo: !!custoCatalogo,

      compra_conciliada: Boolean(compra),
      id_pedido_mkt: compra?.id_pedido_mkt || '',
      id_venda_compra: compra?.id_venda_compra || '',
      canal_compra: compra?.canal_compra || '',

      status_custo_compra: compra?.status_custo || '',
      acao_custo_compra: compra?.acao_custo || '',

      data_importacao_compra: compra?.data_importacao || '',
      data_pagamento_compra: compra?.data_pagamento || '',
      data_etiqueta_compra: compra?.data_etiqueta || '',
      data_embalado_compra: compra?.data_embalado || '',

      qtd_compras_mesmo_pedido: compra?.qtd_compras_mesmo_pedido || 0
    };
  });
}


function gerarCatalogoCustosParaTela(mapaCustosCatalogo) {
  return Array.from(mapaCustosCatalogo.values())
    .map(item => ({
      sku: item.skuBase,
      sku_base: item.skuBase,
      custo_catalogo_unitario: Number(item.custo || 0),
      produto: item.nome_base || '',
      estoque: Number(item.estoque || 0)
    }))
    .filter(item => item.sku);
}


// =====================
// STATUS DE VENDA - PRIMEIRO PASSO
// =====================
function harmonizarStatus(canal, statusOriginal) {
  const statusBruto = String(statusOriginal || '').trim();
  const status = normalizarTexto(statusOriginal);
  const canalNormalizado = normalizarTexto(canal);

  function retorno(novoStatus, vendaEfetiva, geraDemanda, regra) {
    return {
      status_harmonizado: novoStatus,
      venda_efetiva: vendaEfetiva,
      gera_demanda: geraDemanda,
      regra_status_venda: regra
    };
  }

  if (!status) {
    return retorno('Sem status', false, false, 'status vazio');
  }

  // =====================
  // MERCADO LIVRE
  // =====================
  if (canalNormalizado === 'ml') {
    if (status === 'a caminho') {
      return retorno('Em transito', false, true, 'ML: A caminho');
    }

    if (status === 'cancelada pelo comprador') {
      return retorno('Cancelado', false, true, 'ML: Cancelada pelo comprador');
    }

    if (status === 'combine a entrega') {
      return retorno('Envio Manual acompanhar', false, true, 'ML: Combine a entrega');
    }

    if (status === 'entregue') {
      return retorno('Concluído', true, true, 'ML: Entregue');
    }

    if (status === 'etiqueta impressa') {
      return retorno('Precisa enviar', false, true, 'ML: Etiqueta impressa');
    }

    if (status === 'mediacao finalizada com reembolso para o comprador') {
      return retorno('Cancelado', false, true, 'ML: Mediação com reembolso');
    }

    if (status === 'mediacao finalizada. te demos o dinheiro.') {
      return retorno('Concluído', true, true, 'ML: Mediação finalizada com dinheiro recebido');
    }

    if (status === 'pacote cancelado pelo mercado livre') {
      return retorno('Cancelado', false, true, 'ML: Pacote cancelado pelo Mercado Livre');
    }

    if (status === 'pacote de 2 produtos') {
      return retorno('Outros', false, true, 'ML: Pacote de 2 produtos');
    }

    if (status.includes('para enviar no dia')) {
      return retorno('Esperando Emitir NF', false, true, 'ML: Para enviar no dia');
    }

    if (status === 'pronta para emitir nf-e de venda') {
      return retorno('Emitir NF', false, true, 'ML: Pronta para emitir NF-e');
    }
  }

  // =====================
  // SHOPEE
  // =====================
  if (canalNormalizado === 'shopee') {
    if (status === 'cancelado') {
      return retorno('Cancelado', false, true, 'Shopee: Cancelado');
    }

    if (status === 'concluido' || status === 'concluído') {
      return retorno('Concluído', true, true, 'Shopee: Concluído');
    }

    if (status === 'entregue') {
      return retorno('Concluído', true, true, 'Shopee: Entregue');
    }

    if (status === 'enviado') {
      return retorno('Em transito', false, true, 'Shopee: Enviado');
    }

    if (status.includes('o comprador pode pedir uma devolucao') || status.includes('o comprador pode pedir uma devolução')) {
      return retorno('Em avaliação', false, true, 'Shopee: prazo de reclamação/devolução');
    }
  }

  // =====================
  // TIKTOK
  // =====================
  if (canalNormalizado === 'tiktok') {
    if (status === 'a ser enviado') {
      return retorno('Precisa enviar', false, true, 'TikTok: A ser enviado');
    }

    if (status === 'cancelado') {
      return retorno('Cancelado', false, true, 'TikTok: Cancelado');
    }

    if (status === 'concluido' || status === 'concluído') {
      return retorno('Concluído', true, true, 'TikTok: Concluído');
    }

    if (status === 'enviado') {
      return retorno('Em transito', false, true, 'TikTok: Enviado');
    }
  }

  // =====================
  // FALLBACK GERAL
  // =====================
  if (
    status.includes('cancel') ||
    status.includes('reembolso') ||
    status.includes('refund') ||
    status.includes('devolu')
  ) {
    return retorno('Cancelado', false, true, 'fallback: cancelamento/reembolso');
  }

  if (
    status.includes('concluido') ||
    status.includes('concluído') ||
    status.includes('delivered') ||
    status.includes('entregue') ||
    status.includes('finalizado')
  ) {
    return retorno('Concluído', true, true, 'fallback: concluído/entregue');
  }

  if (
    status.includes('nao pago') ||
    status.includes('não pago') ||
    status.includes('pending payment') ||
    status.includes('aguardando pagamento')
  ) {
    return retorno('Não efetivado', false, true, 'fallback: não pago');
  }

  if (
    status.includes('a caminho') ||
    status.includes('enviado') ||
    status.includes('shipped') ||
    status.includes('in transit')
  ) {
    return retorno('Em transito', false, true, 'fallback: transporte');
  }

  if (
    status.includes('a ser enviado') ||
    status.includes('etiqueta impressa') ||
    status.includes('aguardando envio')
  ) {
    return retorno('Precisa enviar', false, true, 'fallback: precisa enviar');
  }

  if (status.includes('pronta para emitir')) {
    return retorno('Emitir NF', false, true, 'fallback: emitir NF');
  }

  if (status.includes('para enviar no dia')) {
    return retorno('Esperando Emitir NF', false, true, 'fallback: esperando NF');
  }

  return retorno('Outros', false, true, 'fallback: outros');
}

function aplicarStatus(vendas) {
  return vendas.map(venda => {
    const infoStatus = harmonizarStatus(venda.canal, venda.status);

    return {
      ...venda,
      status_original: venda.status || '',
      status_harmonizado: infoStatus.status_harmonizado,
      regra_status_venda: infoStatus.regra_status_venda || '',
      venda_efetiva: infoStatus.venda_efetiva,
      gera_demanda: infoStatus.gera_demanda
    };
  });
}

function gerarResumoStatus(vendas) {
  const mapa = new Map();

  vendas.forEach(venda => {
    const chave = [
      venda.canal || '',
      venda.status_original || '',
      venda.status_harmonizado || ''
    ].join('||');

    if (!mapa.has(chave)) {
      mapa.set(chave, {
        canal: venda.canal || '',
        status_original: venda.status_original || '',
        status_harmonizado: venda.status_harmonizado || '',
        quantidade: 0
      });
    }

    mapa.get(chave).quantidade += 1;
  });

  return Array.from(mapa.values()).sort((a, b) => {
    if (a.canal !== b.canal) return a.canal.localeCompare(b.canal);
    return a.status_original.localeCompare(b.status_original);
  });
}

function gerarResumoConciliacao(vendas, comprasInfo) {
  const total = vendas.length;
  const conciliadas = vendas.filter(v => v.compra_conciliada).length;
  const naoConciliadas = total - conciliadas;

  const porCanal = {};

  for (const venda of vendas) {
    const canal = venda.canal || 'Sem canal';

    if (!porCanal[canal]) {
      porCanal[canal] = {
        total: 0,
        conciliadas: 0,
        nao_conciliadas: 0
      };
    }

    porCanal[canal].total++;

    if (venda.compra_conciliada) porCanal[canal].conciliadas++;
    else porCanal[canal].nao_conciliadas++;
  }

  const exemplosNaoConciliadas = vendas
    .filter(v => !v.compra_conciliada)
    .slice(0, 30)
    .map(v => ({
      canal: v.canal,
      pedido: v.pedido,
      status_original: v.status_original,
      status_harmonizado: v.status_harmonizado,
      sku: v.sku,
      produto: v.produto
    }));

  return {
    total_vendas: total,
    total_compras_base_custo: comprasInfo.compras.length,
    vendas_conciliadas_com_compras: conciliadas,
    vendas_nao_conciliadas_com_compras: naoConciliadas,
    percentual_conciliacao: total > 0 ? Number(((conciliadas / total) * 100).toFixed(2)) : 0,
    por_canal: porCanal,
    pedidos_com_mais_de_uma_compra: comprasInfo.duplicados.size,
    exemplos_nao_conciliadas: exemplosNaoConciliadas
  };
}

function gerarResumoGeral(vendas, ml, shopee, tiktok, comprasInfo) {
  const semCusto = vendas.filter(v => !Number(v.custo));
  const semCustoCancelado = semCusto.filter(v => v.status_harmonizado === 'Cancelado').length;
  const semCustoNaoCancelado = semCusto.filter(v => v.status_harmonizado !== 'Cancelado').length;

  const concluidos = vendas.filter(v =>
    ['Concluído', 'Em avaliação', 'Outros'].includes(v.status_harmonizado)
  ).length;
  const emAndamento = vendas.filter(v =>
    ['Em transito', 'Envio Manual acompanhar'].includes(v.status_harmonizado)
  ).length;
  const pedidosParaSair = vendas.filter(v =>
    ['Precisa enviar', 'Esperando Emitir NF', 'Emitir NF'].includes(v.status_harmonizado)
  ).length;
  const cancelados = vendas.filter(v => v.status_harmonizado === 'Cancelado').length;
  const naoEfetivadoOuOutros = vendas.filter(v =>
    v.status_harmonizado === 'Não efetivado' ||
    v.status_harmonizado === 'Outros' ||
    v.status_harmonizado === 'Sem status' ||
    v.status_harmonizado === 'Em avaliação'
  ).length;

  const resumoPorStatus = vendas.reduce((acc, v) => {
    const chave = v.status_harmonizado || 'Sem status';
    acc[chave] = (acc[chave] || 0) + 1;
    return acc;
  }, {});

  const conciliadas = vendas.filter(v => v.compra_conciliada).length;

  return {
    ml: ml.length,
    shopee: shopee.length,
    tiktok: tiktok.length,

    total: vendas.length,

    total_compras_base_custo: comprasInfo.compras.length,
    vendas_conciliadas_com_compras: conciliadas,
    vendas_nao_conciliadas_com_compras: vendas.length - conciliadas,
    percentual_conciliacao_compras: vendas.length > 0
      ? Number(((conciliadas / vendas.length) * 100).toFixed(2))
      : 0,

    comCusto: vendas.filter(v => Number(v.custo) > 0).length,
    comCustoCompra: vendas.filter(v => Number(v.custo_compra) > 0).length,
    comCustoCatalogo: vendas.filter(v => Number(v.custo_catalogo) > 0).length,

    semCustoCancelado,
    semCustoNaoCancelado,

    concluidos,
    emAndamento,
    pedidosParaSair,
    cancelados,
    naoEfetivadoOuOutros,
    resumo_por_status: resumoPorStatus
  };
}



// =====================================================
// INCREMENTAL REAL - VENDAS
// Nunca apaga a base antiga. Lê o JSON atual, valida se o registro já existe
// e só incrementa/atualiza sem duplicar.
// Chave: canal + pedido + sku + item/variação.
// =====================================================
function chaveIncrementalVenda(venda) {
  const canal = normalizarChave(venda.canal || venda.marketplace || venda.plataforma || '');
  const pedido = normalizarChave(
    venda.pedido ||
    venda.id_pedido ||
    venda.numero_pedido ||
    venda.order_id ||
    venda.id_order ||
    venda.ml_pedido_principal ||
    ''
  );

  const sku = normalizarChave(
    venda.sku ||
    venda.sku_base ||
    venda.seller_sku ||
    venda.sellerSku ||
    venda.codigo_sku ||
    ''
  );

  const item = normalizarChave(
    venda.pedido_item_ml ||
    venda.pacote ||
    venda.variacao ||
    venda.produto ||
    venda.nome_produto ||
    ''
  );

  // Se não houver pedido, usa fallback mais amplo para não perder linha.
  if (!pedido) {
    return [
      canal,
      normalizarChave(venda.data || venda.data_pedido || venda.data_financeira || ''),
      sku,
      item,
      normalizarChave(venda.preco_venda || venda.repasse || '')
    ].join('|');
  }

  return [canal, pedido, sku, item].join('|');
}

function mesclarIncrementalVendas(vendasNovas) {
  const antigas = extrairListaVendas(lerJson(OUTPUT, false));
  const mapa = new Map();

  for (const venda of antigas) {
    const chave = chaveIncrementalVenda(venda);
    if (!chave) continue;
    mapa.set(chave, venda);
  }

  let novos = 0;
  let atualizados = 0;

  for (const venda of vendasNovas) {
    const chave = chaveIncrementalVenda(venda);
    if (!chave) continue;

    if (mapa.has(chave)) {
      atualizados++;
      mapa.set(chave, {
        ...mapa.get(chave),
        ...venda,
        atualizado_em_incremental: new Date().toISOString()
      });
    } else {
      novos++;
      mapa.set(chave, {
        ...venda,
        criado_em_incremental: new Date().toISOString()
      });
    }
  }

  const final = Array.from(mapa.values());

  return {
    final,
    auditoria: {
      modo: 'incremental_merge_dedup',
      antigos: antigas.length,
      recebidos: vendasNovas.length,
      novos,
      atualizados,
      final: final.length,
      chave: 'canal + pedido + sku + item'
    }
  };
}

// =====================
// MAIN
// =====================
function main() {
  console.log('====================================');
  console.log('GERADOR DE VENDAS - BASE VERDADE VENDAS');
  console.log('====================================');

  const mapaCustosCatalogo = carregarMapaCustosCatalogo();
  const comprasInfo = carregarMapaComprasCusto();

  const ml = tratarML();
  const shopee = tratarShopee();
  const tiktok = tratarTikTok();

  const vendasBase = [...ml, ...shopee, ...tiktok];
  const vendasComCustos = aplicarCustosECompras(vendasBase, mapaCustosCatalogo, comprasInfo.mapa);
  const vendasProcessadas = aplicarStatus(vendasComCustos);

  const merge = mesclarIncrementalVendas(vendasProcessadas);
  const vendas = merge.final;

  const resumo = gerarResumoGeral(vendas, ml, shopee, tiktok, comprasInfo);
  resumo.incremental = merge.auditoria;

  const resumoStatus = gerarResumoStatus(vendas);
  const resumoConciliacao = gerarResumoConciliacao(vendas, comprasInfo);
  resumoConciliacao.incremental = merge.auditoria;

  garantirPasta(OUTPUT);

  fs.writeFileSync(OUTPUT, JSON.stringify(vendas, null, 2), 'utf-8');
  fs.writeFileSync(OUTPUT_RESUMO, JSON.stringify(resumo, null, 2), 'utf-8');
  fs.writeFileSync(OUTPUT_STATUS, JSON.stringify(resumoStatus, null, 2), 'utf-8');
  fs.writeFileSync(OUTPUT_CONCILIACAO, JSON.stringify(resumoConciliacao, null, 2), 'utf-8');

  console.log('✅ vendas.json gerado');
  console.log('✅ vendas-resumo.json gerado');
  console.log('✅ vendas-status.json gerado');
  console.log('✅ vendas-conciliacao-custo.json gerado');
  console.log('------------------------------------');
  console.log('ML:', ml.length);
  console.log('Shopee:', shopee.length);
  console.log('TikTok:', tiktok.length);
  console.log('Total vendas final:', vendas.length);
  console.log('Incremental:', JSON.stringify(resumo.incremental));
  console.log('Compras/custos base:', comprasInfo.compras.length);
  console.log('Vendas conciliadas com compras:', resumoConciliacao.vendas_conciliadas_com_compras);
  console.log('Vendas não conciliadas:', resumoConciliacao.vendas_nao_conciliadas_com_compras);
  console.log('% conciliação:', resumoConciliacao.percentual_conciliacao + '%');
  console.log('Com custo final:', resumo.comCusto);
  console.log('Com custo por compra:', resumo.comCustoCompra);
  console.log('Com custo por catálogo:', resumo.comCustoCatalogo);
  console.log('Concluídos:', resumo.concluidos);
  console.log('Em andamento:', resumo.emAndamento);
  console.log('Cancelados:', resumo.cancelados);
  console.log('Não efetivado / outros:', resumo.naoEfetivadoOuOutros);
}

main();
