const fs = require('fs');
const path = require('path');

/* =========================================================
   MOTOR DE REPRICING ML - FASE 2
   Entrada:
     - progresso-repricing-ml.json OU data/repricing-ml.json
     - data/produtos.json opcional para custo
     - relatorio-dropstok-mapeamento.json opcional para custo
   Saída:
     - data/repricing-ml-inteligencia.json
     - data/repricing-ml-inteligencia.csv
========================================================= */

const INPUT_REPRICING =
  process.env.INPUT_REPRICING ||
  process.env.REPRICING_INPUT ||
  'progresso-repricing-ml.json';

const PRODUTOS_JSON =
  process.env.PRODUTOS_JSON || 'data/produtos.json';

const DROPSTOK_JSON =
  process.env.DROPSTOK_JSON || 'relatorio-dropstok-mapeamento.json';

const OUT_JSON =
  process.env.OUT_JSON || 'data/repricing-ml-inteligencia.json';

const OUT_CSV =
  process.env.OUT_CSV || 'data/repricing-ml-inteligencia.csv';

const MARGEM_MINIMA =
  Number(process.env.MARGEM_MINIMA || 18) / 100;

const REDUCAO_COMPETITIVA =
  Number(process.env.REDUCAO_COMPETITIVA || 0.10);

const CASAS_DECIMAIS_PRECO =
  Number(process.env.CASAS_DECIMAIS_PRECO || 2);

fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });

function normalizarTexto(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function skuRoot(sku) {
  return String(sku || '')
    .trim()
    .replace(/_var_[a-z0-9]+$/i, '')
    .replace(/\s*[-_]?\s*var\s*[a-z0-9]+$/i, '')
    .replace(/\s*[-_]?\s*v\s*\d+$/i, '')
    .toUpperCase();
}

function numero(valor) {
  if (valor === null || valor === undefined || valor === '') return 0;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;

  let texto = String(valor)
    .replace(/BRL|R\$/gi, '')
    .replace(/\s+/g, '')
    .trim();

  if (!texto) return 0;

  const negativo = texto.includes('-');
  texto = texto.replace(/-/g, '');

  if (texto.includes('.') && texto.includes(',')) {
    texto = texto.replace(/\./g, '').replace(',', '.');
  } else if (texto.includes(',')) {
    texto = texto.replace(',', '.');
  }

  const n = Number(texto);
  if (!Number.isFinite(n)) return 0;
  return negativo ? -n : n;
}

function dinheiro(valor) {
  const n = numero(valor);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function arredondarPreco(valor) {
  const n = numero(valor);
  return Number(n.toFixed(CASAS_DECIMAIS_PRECO));
}

function escapeCsv(v) {
  const s = String(v ?? '');
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function lerJsonSeguro(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.warn(`[AVISO] Não consegui ler ${file}: ${e.message}`);
    return null;
  }
}

function extrairListaRepricing(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.itens)) return raw.itens;
  if (Array.isArray(raw?.dados)) return raw.dados;
  if (Array.isArray(raw?.produtos)) return raw.produtos;
  return [];
}

function obterPrimeiro(item, campos) {
  for (const c of campos) {
    const v = item?.[c];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return '';
}

function carregarCustos() {
  const mapa = new Map();

  const produtos = lerJsonSeguro(PRODUTOS_JSON);
  const listaProdutos = Array.isArray(produtos) ? produtos : [];

  for (const p of listaProdutos) {
    const sku = skuRoot(obterPrimeiro(p, ['sku', 'skuBase', 'SKU', 'seller_sku']));
    const custo = numero(obterPrimeiro(p, ['custo', 'preco', 'preco_custo', 'cost']));
    const nome = obterPrimeiro(p, ['nome', 'titulo', 'title', 'produto']);

    if (sku && custo > 0) {
      mapa.set(sku, { sku, custo, nome, origem: PRODUTOS_JSON });
    }
  }

  const dropstok = lerJsonSeguro(DROPSTOK_JSON);
  const listaDrop = Array.isArray(dropstok) ? dropstok : Array.isArray(dropstok?.produtos) ? dropstok.produtos : [];

  for (const p of listaDrop) {
    const sku = skuRoot(obterPrimeiro(p, ['sku', 'SKU', 'codigo', 'seller_sku']));
    const custo = numero(obterPrimeiro(p, ['preco', 'custo', 'preco_custo', 'cost']));
    const nome = obterPrimeiro(p, ['nome', 'titulo', 'title', 'produto']);

    if (sku && custo > 0 && !mapa.has(sku)) {
      mapa.set(sku, { sku, custo, nome, origem: DROPSTOK_JSON });
    }
  }

  return mapa;
}

function menorConcorrente(item) {
  const valores = [];

  if (numero(item.preco_para_ganhar) > 0) valores.push(numero(item.preco_para_ganhar));
  if (numero(item.melhor_preco_site) > 0) valores.push(numero(item.melhor_preco_site));

  if (Array.isArray(item.concorrentes)) {
    for (const c of item.concorrentes) {
      const preco = numero(c?.preco);
      if (preco > 0) valores.push(preco);
    }
  }

  return valores.length ? Math.min(...valores) : 0;
}

function calcularRepasseEstimado(preco, taxaPercentual, fretePago) {
  const p = numero(preco);
  const taxa = numero(taxaPercentual) / 100;
  const frete = Math.abs(numero(fretePago));

  if (!p) return 0;
  return p - (p * taxa) - frete;
}

function calcularMargem(preco, custo, taxaPercentual, fretePago) {
  const p = numero(preco);
  const c = numero(custo);
  if (!p || !c) return null;
  const repasse = calcularRepasseEstimado(p, taxaPercentual, fretePago);
  return ((repasse - c) / p) * 100;
}

function calcularPrecoMinimo18(custo, taxaPercentual, fretePago) {
  const c = numero(custo);
  const taxa = numero(taxaPercentual) / 100;
  const frete = Math.abs(numero(fretePago));
  const denominador = 1 - taxa - MARGEM_MINIMA;

  if (!c || denominador <= 0) return 0;

  return arredondarPreco((c + frete) / denominador);
}

function classificar(item, custoInfo) {
  const precoAtual = numero(item.preco_atual);
  const taxa = numero(item.tarifa_percentual);
  const frete = Math.abs(numero(item.frete_pago));
  const recebeAtual = numero(item.valor_recebe);
  const concorrencia = menorConcorrente(item);
  const custo = numero(custoInfo?.custo);

  const base = {
    anuncio_id: item.anuncio_id || '',
    sku: item.sku || '',
    sku_root: skuRoot(item.sku),
    titulo: item.titulo || '',
    preco_atual: precoAtual,
    estoque: numero(item.estoque),
    tarifa_percentual: taxa,
    frete_pago: frete,
    frete_gratis: Boolean(item.frete_gratis),
    valor_recebe_atual: recebeAtual,
    status_competicao: item.status_competicao || '',
    preco_para_ganhar: numero(item.preco_para_ganhar),
    melhor_preco_site: numero(item.melhor_preco_site),
    menor_concorrencia: concorrencia,
    custo: custo || 0,
    origem_custo: custoInfo?.origem || '',
    margem_minima_meta: `${(MARGEM_MINIMA * 100).toFixed(1)}%`,
    capturado_em: item.capturado_em || '',
    url: item.url || ''
  };

  if (!custo) {
    return {
      ...base,
      preco_minimo_margem: 0,
      margem_atual: null,
      margem_preco_sugerido: null,
      preco_sugerido: precoAtual || concorrencia || 0,
      acao: 'REVISAR_CUSTO',
      prioridade: 'ALTA',
      motivo: 'Sem custo encontrado para calcular margem mínima.'
    };
  }

  const precoMinimo = calcularPrecoMinimo18(custo, taxa, frete);
  const margemAtual = calcularMargem(precoAtual, custo, taxa, frete);

  let precoSugerido = precoAtual;
  let acao = 'MANTER';
  let prioridade = 'BAIXA';
  let motivo = 'Preço atual já respeita a margem mínima.';

  if (concorrencia > 0) {
    const alvoCompetitivo = arredondarPreco(Math.max(0, concorrencia - REDUCAO_COMPETITIVA));

    if (alvoCompetitivo >= precoMinimo) {
      precoSugerido = alvoCompetitivo;

      if (precoSugerido < precoAtual) {
        acao = 'BAIXAR_PARA_COMPETIR';
        prioridade = 'ALTA';
        motivo = 'Concorrência permite competir mantendo margem mínima.';
      } else if (precoSugerido > precoAtual) {
        acao = 'SUBIR_PRECO';
        prioridade = 'MEDIA';
        motivo = 'Preço atual está abaixo do preço competitivo possível.';
      } else {
        acao = 'MANTER';
        prioridade = 'BAIXA';
        motivo = 'Preço atual já está alinhado com concorrência e margem.';
      }
    } else {
      precoSugerido = precoMinimo;
      acao = 'NAO_COMPETIR';
      prioridade = 'ALTA';
      motivo = 'Concorrência está abaixo do preço mínimo para margem de segurança.';
    }
  } else if (precoAtual < precoMinimo) {
    precoSugerido = precoMinimo;
    acao = 'SUBIR_PARA_MARGEM';
    prioridade = 'ALTA';
    motivo = 'Preço atual não garante margem mínima.';
  }

  const margemSugerida = calcularMargem(precoSugerido, custo, taxa, frete);
  const repasseSugerido = calcularRepasseEstimado(precoSugerido, taxa, frete);

  return {
    ...base,
    preco_minimo_margem: precoMinimo,
    margem_atual: margemAtual === null ? null : Number(margemAtual.toFixed(2)),
    repasse_sugerido: Number(repasseSugerido.toFixed(2)),
    margem_preco_sugerido: margemSugerida === null ? null : Number(margemSugerida.toFixed(2)),
    preco_sugerido: arredondarPreco(precoSugerido),
    delta_preco: arredondarPreco(precoSugerido - precoAtual),
    acao,
    prioridade,
    motivo
  };
}

function salvarCsv(lista) {
  const headers = [
    'prioridade',
    'acao',
    'motivo',
    'sku',
    'sku_root',
    'anuncio_id',
    'titulo',
    'preco_atual',
    'preco_sugerido',
    'delta_preco',
    'preco_minimo_margem',
    'margem_atual',
    'margem_preco_sugerido',
    'menor_concorrencia',
    'custo',
    'tarifa_percentual',
    'frete_pago',
    'valor_recebe_atual',
    'repasse_sugerido',
    'status_competicao',
    'estoque',
    'origem_custo',
    'url'
  ];

  const linhas = [headers.join(';')];

  for (const item of lista) {
    linhas.push(headers.map(h => escapeCsv(item[h])).join(';'));
  }

  fs.writeFileSync(OUT_CSV, linhas.join('\n'), 'utf8');
}

function resumo(lista) {
  const porAcao = {};
  const porPrioridade = {};

  for (const item of lista) {
    porAcao[item.acao] = (porAcao[item.acao] || 0) + 1;
    porPrioridade[item.prioridade] = (porPrioridade[item.prioridade] || 0) + 1;
  }

  return {
    total: lista.length,
    porAcao,
    porPrioridade,
    gerado_em: new Date().toISOString()
  };
}

function run() {
  const raw = lerJsonSeguro(INPUT_REPRICING);
  if (!raw) {
    console.error(`Não encontrei o arquivo de entrada: ${INPUT_REPRICING}`);
    console.error('Dica: coloque o progresso-repricing-ml.json na pasta do projeto ou configure INPUT_REPRICING.');
    process.exit(1);
  }

  const itens = extrairListaRepricing(raw);
  const custos = carregarCustos();

  console.log('========================================');
  console.log('MOTOR DE REPRICING ML');
  console.log('========================================');
  console.log('Entrada:', path.resolve(INPUT_REPRICING));
  console.log('Itens capturados:', itens.length);
  console.log('Custos carregados:', custos.size);
  console.log('Margem mínima:', `${(MARGEM_MINIMA * 100).toFixed(1)}%`);
  console.log('Saída JSON:', path.resolve(OUT_JSON));
  console.log('Saída CSV:', path.resolve(OUT_CSV));

  const analisados = itens.map(item => {
    const custoInfo = custos.get(skuRoot(item.sku));
    return classificar(item, custoInfo);
  });

  const saida = {
    resumo: resumo(analisados),
    itens: analisados
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(saida, null, 2), 'utf8');
  salvarCsv(analisados);

  console.log('\nRESUMO');
  console.table(saida.resumo.porAcao);
  console.log('Finalizado.');
}

run();
