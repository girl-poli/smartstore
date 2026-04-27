const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_EXTERNAL_DIR = process.env.DATA_EXTERNAL_DIR || path.join(ROOT, 'data_external');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');

const ARQUIVO_REPRICING_INTELIGENCIA = path.join(DATA_EXTERNAL_DIR, 'repricing-ml-inteligencia.json');
const ARQUIVO_REPRICING_RAW_1 = path.join(DATA_EXTERNAL_DIR, 'progresso-repricing-ml.json');
const ARQUIVO_REPRICING_RAW_2 = path.join(DATA_EXTERNAL_DIR, 'repricing-ml.json');
const ARQUIVO_CUSTO = path.join(DATA_DIR, 'custo.json');
const ARQUIVO_SAIDA_JSON = path.join(DATA_EXTERNAL_DIR, 'repricing-ml-inteligencia.json');
const ARQUIVO_SAIDA_CSV = path.join(DATA_EXTERNAL_DIR, 'repricing-ml-inteligencia.csv');

const MARGEM_MINIMA = Number(process.env.MARGEM_MINIMA || 18);
const DIFERENCA_COMPETIR = Number(process.env.DIFERENCA_COMPETIR || 0.10);

fs.mkdirSync(DATA_EXTERNAL_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

function normalizarTexto(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .toLowerCase()
    .trim();
}

function normalizarSku(valor) {
  let sku = String(valor || '')
    .toUpperCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();

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
    .replace(/\s+/g, '')
    .trim();

  if (!texto) return 0;

  const negativo = texto.startsWith('-');
  texto = texto.replace(/^-/, '');

  if (texto.includes('.') && texto.includes(',')) {
    texto = texto.replace(/\./g, '').replace(',', '.');
  } else if (texto.includes(',') && !texto.includes('.')) {
    texto = texto.replace(',', '.');
  }

  const n = Number(texto);
  if (!Number.isFinite(n)) return 0;
  return negativo ? -n : n;
}

function moeda(valor) {
  return numero(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function lerJson(caminho, fallback = null) {
  if (!fs.existsSync(caminho)) return fallback;
  return JSON.parse(fs.readFileSync(caminho, 'utf8'));
}

function carregarRepricingRaw() {
  const fontes = [ARQUIVO_REPRICING_RAW_1, ARQUIVO_REPRICING_RAW_2, ARQUIVO_REPRICING_INTELIGENCIA];

  for (const caminho of fontes) {
    if (!fs.existsSync(caminho)) continue;

    const json = lerJson(caminho);
    const itens = Array.isArray(json) ? json : Array.isArray(json?.itens) ? json.itens : [];

    if (itens.length) {
      return { caminho, itens };
    }
  }

  return { caminho: '', itens: [] };
}

function obterCusto(item) {
  const campos = [
    item?.custo,
    item?.custo_final,
    item?.custo_compra,
    item?.valor_custo,
    item?.preco_custo,
    item?.custo_catalogo
  ];

  for (const valor of campos) {
    const n = numero(valor);
    if (n > 0) return n;
  }

  return 0;
}

function montarMapaCusto(listaCusto = []) {
  const mapa = new Map();

  for (const item of Array.isArray(listaCusto) ? listaCusto : []) {
    const custo = obterCusto(item);
    if (custo <= 0) continue;

    const candidatos = [
      item.sku,
      item.sku_venda,
      item.id_produto,
      item.id_pedido_mkt,
      item.codigo_sku,
      item.seller_sku
    ];

    for (const candidato of candidatos) {
      const chave = normalizarSku(candidato);
      if (!chave) continue;

      if (!mapa.has(chave)) {
        mapa.set(chave, {
          custo,
          origem: 'custo.json',
          sku_origem: candidato,
          produto_custo: item.produto || item.produto_venda || item.nome || '',
          status_custo: item.status_custo || item.status_final || item.status_original || '',
          raw: item
        });
      }
    }
  }

  return mapa;
}

function menorPrecoConcorrencia(item) {
  const concorrentes = Array.isArray(item.concorrentes) ? item.concorrentes : [];
  const precos = concorrentes.map(c => numero(c.preco)).filter(v => v > 0);
  return precos.length ? Math.min(...precos) : 0;
}

function calcularDecisao(item, custoInfo) {
  const precoAtual = numero(item.preco_atual || item.preco || item.precoAtual);
  const valorRecebe = numero(item.valor_recebe || item.recebe || item.valorRecebe);
  const tarifa = numero(item.tarifa_percentual || item.tarifa || item.taxa);
  const frete = Math.abs(numero(item.frete_pago || item.frete || item.custo_envio));
  const custo = numero(custoInfo?.custo);
  const statusMl = String(item.status_competicao || item.status_ml || '').toUpperCase();
  const concorrencia = menorPrecoConcorrencia(item);

  const margemAtual = precoAtual > 0 && valorRecebe > 0 && custo > 0
    ? ((valorRecebe - custo) / precoAtual) * 100
    : null;

  let precoSugerido = precoAtual;
  let acao = 'REVISAR';
  let acaoLabel = 'Revisar manual';
  let motivo = 'Dados insuficientes para decisão automática.';

  if (!custo || custo <= 0) {
    acao = 'INFORMAR_CUSTO';
    acaoLabel = 'Informar custo';
    motivo = 'Sem custo do produto. Não aprovar preço sem custo.';
  } else if (!precoAtual || precoAtual <= 0 || !valorRecebe || valorRecebe <= 0) {
    acao = 'REVISAR';
    acaoLabel = 'Revisar manual';
    motivo = 'Preço atual ou valor recebido não encontrado.';
  } else if (margemAtual < MARGEM_MINIMA) {
    acao = 'NAO_COLOCAR';
    acaoLabel = 'Não colocar';
    motivo = `Margem atual ${margemAtual.toFixed(1).replace('.', ',')}% abaixo da mínima de ${MARGEM_MINIMA}%.`;
  } else if (concorrencia > 0) {
    const sugestaoConcorrencia = Math.max(0, concorrencia - DIFERENCA_COMPETIR);
    const fatorRepasse = valorRecebe / precoAtual;
    const precoMinimoMargem = fatorRepasse > 0
      ? custo / (fatorRepasse - (MARGEM_MINIMA / 100))
      : 0;

    if (precoMinimoMargem > 0 && sugestaoConcorrencia >= precoMinimoMargem) {
      acao = 'COMPETIR';
      acaoLabel = 'Pode competir';
      precoSugerido = sugestaoConcorrencia;
      motivo = `Concorrência permite competir mantendo margem mínima de ${MARGEM_MINIMA}%.`;
    } else {
      acao = 'NAO_COLOCAR';
      acaoLabel = 'Não colocar';
      precoSugerido = Math.max(precoAtual, precoMinimoMargem || precoAtual);
      motivo = 'Concorrência abaixo do preço mínimo saudável.';
    }
  } else if (statusMl.includes('PERDENDO')) {
    acao = 'REVISAR';
    acaoLabel = 'Revisar manual';
    motivo = 'Está perdendo, mas não há preço de concorrência capturado para sugerir ajuste.';
  } else if (statusMl.includes('GANHANDO') || statusMl.includes('COMPARTILHANDO') || statusMl.includes('COMPETINDO')) {
    acao = 'MANTER';
    acaoLabel = 'Manter';
    motivo = 'Margem está acima da mínima e status não exige redução automática.';
  }

  return {
    margem_minima_regra: MARGEM_MINIMA,
    diferenca_competir: DIFERENCA_COMPETIR,
    custo,
    custo_origem: custoInfo?.origem || '',
    custo_status: custoInfo?.status_custo || '',
    margem_atual: margemAtual,
    margem_atual_pct: margemAtual === null ? null : Number(margemAtual.toFixed(2)),
    concorrencia_menor_preco: concorrencia,
    preco_sugerido: Number(numero(precoSugerido).toFixed(2)),
    acao,
    acao_label: acaoLabel,
    motivo
  };
}

function escapeCsv(valor) {
  const str = String(valor ?? '');
  return `"${str.replace(/"/g, '""')}"`;
}

function escreverCsv(itens) {
  const headers = [
    'anuncio_id', 'sku', 'titulo', 'preco_atual', 'valor_recebe', 'tarifa_percentual', 'frete_pago',
    'status_competicao', 'custo', 'margem_atual_pct', 'acao', 'preco_sugerido', 'motivo'
  ];

  const linhas = [headers.join(';')];
  for (const i of itens) {
    linhas.push(headers.map(h => escapeCsv(i[h])).join(';'));
  }

  fs.writeFileSync(ARQUIVO_SAIDA_CSV, linhas.join('\n'), 'utf8');
}

function run() {
  const repricing = carregarRepricingRaw();
  const custoJson = lerJson(ARQUIVO_CUSTO, []);
  const mapaCusto = montarMapaCusto(custoJson);

  const itens = repricing.itens.map((item, idx) => {
    const sku = normalizarSku(item.sku || item.sku_base || item.codigo_sku || item.texto_card);
    const custoInfo = mapaCusto.get(sku) || null;
    const decisao = calcularDecisao(item, custoInfo);

    return {
      ...item,
      index: idx + 1,
      sku_original: item.sku || '',
      sku,
      preco_atual: numero(item.preco_atual || item.preco),
      valor_recebe: numero(item.valor_recebe || item.recebe),
      tarifa_percentual: numero(item.tarifa_percentual || item.tarifa),
      frete_pago: Math.abs(numero(item.frete_pago || item.frete)),
      ...decisao,
      atualizado_em: new Date().toISOString()
    };
  });

  const resumo = {
    gerado_em: new Date().toISOString(),
    fonte_repricing: repricing.caminho,
    fonte_custo: ARQUIVO_CUSTO,
    total: itens.length,
    com_custo: itens.filter(i => i.custo > 0).length,
    sem_custo: itens.filter(i => !i.custo).length,
    competir: itens.filter(i => i.acao === 'COMPETIR').length,
    nao_colocar: itens.filter(i => i.acao === 'NAO_COLOCAR').length,
    revisar: itens.filter(i => i.acao === 'REVISAR' || i.acao === 'INFORMAR_CUSTO').length,
    manter: itens.filter(i => i.acao === 'MANTER').length,
    margem_media_atual: (() => {
      const margens = itens.map(i => i.margem_atual_pct).filter(v => Number.isFinite(v));
      return margens.length ? Number((margens.reduce((a, b) => a + b, 0) / margens.length).toFixed(2)) : 0;
    })()
  };

  const saida = { resumo, itens };
  fs.writeFileSync(ARQUIVO_SAIDA_JSON, JSON.stringify(saida, null, 2), 'utf8');
  escreverCsv(itens);

  console.log('========================================');
  console.log('MERGE REPRICING + CUSTO FINALIZADO');
  console.log('========================================');
  console.log('Fonte repricing:', repricing.caminho || 'NÃO ENCONTRADA');
  console.log('Fonte custo:', ARQUIVO_CUSTO);
  console.log('Total:', resumo.total);
  console.log('Com custo:', resumo.com_custo);
  console.log('Sem custo:', resumo.sem_custo);
  console.log('Saída JSON:', ARQUIVO_SAIDA_JSON);
  console.log('Saída CSV:', ARQUIVO_SAIDA_CSV);
}

run();
