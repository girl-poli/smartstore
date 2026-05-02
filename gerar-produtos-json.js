const fs = require("fs");
const XLSX = require("xlsx");

// ===== ARQUIVOS =====
const ARQUIVO_MAPEAMENTO = "data_external/relatorio-dropstok-mapeamento.json";
const ARQUIVO_ML = "data_external/catalogo-ml.xlsx";
const ARQUIVO_SHOPEE = "data_external/catalogo-shopee.xlsx";
const ARQUIVO_TIKTOK = "data_external/catalogo-tiktok.xlsx";

const OUTPUT_PRODUTOS = "data/produtos.json";
const OUTPUT_RESUMO = "data/conferencia-resumo.json";

const OUTPUT_CORRIGIR_ML = "data/corrigir-ml.json";
const OUTPUT_CORRIGIR_SHOPEE = "data/corrigir-shopee.json";
const OUTPUT_CORRIGIR_TIKTOK = "data/corrigir-tiktok.json";

const OUTPUT_ESGOTADOS_ML = "data/esgotados-ml.json";
const OUTPUT_ESGOTADOS_SHOPEE = "data/esgotados-shopee.json";
const OUTPUT_ESGOTADOS_TIKTOK = "data/esgotados-tiktok.json";

const OUTPUT_VARIACOES_ML = "data/variacoes-ml.json";
const OUTPUT_VARIACOES_SHOPEE = "data/variacoes-shopee.json";
const OUTPUT_VARIACOES_TIKTOK = "data/variacoes-tiktok.json";

const OUTPUT_DUPLICADOS_ML = "data/duplicados-ml.json";
const OUTPUT_DUPLICADOS_SHOPEE = "data/duplicados-shopee.json";
const OUTPUT_DUPLICADOS_TIKTOK = "data/duplicados-tiktok.json";

function extrairSkuBase(sku) {
  if (!sku) return "";

  let valor = String(sku)
    .trim()
    .toUpperCase();

  if (!valor || valor === "SKU" || valor.includes("SELLER_SKU")) return "";

  valor = valor
    .replace(/_VAR_[A-Z0-9]+$/i, "")
    .replace(/-VAR-[A-Z0-9]+$/i, "")
    .replace(/VAR[A-Z0-9]+$/i, "")
    .replace(/_[A-Z0-9]+$/i, "")
    .replace(/-[A-Z0-9]+$/i, "")
    .trim();

  return valor;
}

function toNumber(valor) {
  if (valor === null || valor === undefined || valor === "") return null;

  if (typeof valor === "number") {
    return Number.isFinite(valor) ? valor : null;
  }

  let texto = String(valor).trim();
  if (!texto) return null;

  texto = texto
    .replace(/BRL/gi, "")
    .replace(/R\$/gi, "")
    .replace(/\s+/g, "")
    .trim();

  if (!texto) return null;

  if (texto.includes(".") && texto.includes(",")) {
    texto = texto.replace(/\./g, "").replace(",", ".");
  } else if (texto.includes(",")) {
    texto = texto.replace(",", ".");
  }

  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : null;
}

function normalizarTexto(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function estoqueEsgotado(valor) {
  if (valor === null || valor === undefined) return false;

  if (typeof valor === "number") {
    return valor <= 0;
  }

  let texto = String(valor).trim();

  if (!texto) return false;

  texto = texto.replace(/\s+/g, "");

  const numero = Number(texto.replace(",", "."));

  if (!isNaN(numero)) {
    return numero <= 0;
  }

  const txt = texto.toLowerCase();

  return [
    "esgotado",
    "soldout",
    "semestoque",
    "outofstock",
    "indisponivel"
  ].includes(txt);
}

function garantirPastaData() {
  fs.mkdirSync("data", { recursive: true });
}

function salvarJSON(caminho, conteudo) {
  fs.writeFileSync(caminho, JSON.stringify(conteudo, null, 2), "utf-8");
}

function carregarBasePrincipal() {
  const raw = fs.readFileSync(ARQUIVO_MAPEAMENTO, "utf-8");
  const data = JSON.parse(raw);

  const produtosMap = new Map();

  data.forEach((item) => {
    const skuOriginal = String(item.sky || "").trim();
    if (!skuOriginal) return;

    const skuBase = extrairSkuBase(skuOriginal);

    produtosMap.set(skuBase, {
      sku: skuOriginal,
      skuBase,
      nome: item.nome_produto || "",
      custo: toNumber(item.preco),
      ml: null,
      shopee: null,
      tiktok: null,
      existeNaPlataforma: true,
      temEstrela: item.tem_estrela === "SIM",
      jaCadastrado: item.ja_cadastrado === "SIM",
      estoque: Number(item.estoque || 0)
    });
  });

  return {
    produtosMap,
    totalLinhas: data.length
  };
}

function enriquecerML(produtosMap) {
  const wb = XLSX.readFile(ARQUIVO_ML);
  const ws = wb.Sheets["Anúncios"] || wb.Sheets[wb.SheetNames[0]];
  const linhas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  const headerIndex = linhas.findIndex((linha) => {
    const textos = linha.map(c => normalizarTexto(c));
    return (
      textos.includes("sku") &&
      textos.includes("preco") &&
      textos.some(t => t.includes("estoque"))
    );
  });

  if (headerIndex < 0) {
    throw new Error("Cabeçalho do Mercado Livre não encontrado.");
  }

  const cabecalho = linhas[headerIndex];
  const dados = linhas.slice(headerIndex + 1);

  const idxSku = cabecalho.findIndex(
    (c) => normalizarTexto(c) === "sku"
  );

  const idxNome = cabecalho.findIndex((c) => {
    const txt = normalizarTexto(c);
    return txt === "titulo" || txt === "título";
  });

  const idxPreco = cabecalho.findIndex((c) => {
    const txt = normalizarTexto(c);
    return txt === "preco" || txt === "preço";
  });

  const idxEstoque = cabecalho.findIndex((c) => {
    const txt = normalizarTexto(c);
    return (
      txt === "estoque no deposito" ||
      txt === "estoque no depósito" ||
      txt === "estoque" ||
      txt.includes("estoque") ||
      txt.includes("deposito") ||
      txt.includes("depósito") ||
      txt.includes("quantidade")
    );
  });

  console.log("ML HEADER:", {
    headerIndex,
    idxSku,
    idxNome,
    idxPreco,
    idxEstoque
  });

  let totalArquivo = 0;
  const skusCasados = new Set();
  const pendencias = [];
  const esgotados = [];
  const variacoes = [];
  const duplicados = [];
  const vistos = new Map();

  dados.forEach((linha) => {
    const skuOriginal = idxSku >= 0 ? String(linha[idxSku] || "").trim() : "";
    const nome = idxNome >= 0 ? String(linha[idxNome] || "").trim() : "";
    const preco = idxPreco >= 0 ? toNumber(linha[idxPreco]) : null;
    const estoqueRaw = idxEstoque >= 0 ? linha[idxEstoque] : "";

    if (!skuOriginal) return;

    totalArquivo++;

    const skuBase = extrairSkuBase(skuOriginal);

    console.log("ML ITEM", {
      skuOriginal,
      skuBase,
      estoqueRaw,
      tipoEstoque: typeof estoqueRaw
    });

    if (estoqueEsgotado(estoqueRaw)) {
      esgotados.push({
        marketplace: "ML",
        skuOriginal,
        skuTratado: skuBase,
        nome,
        preco,
        estoque: estoqueRaw,
        motivo: "Esgotado no canal"
      });
      return;
    }

    if (!produtosMap.has(skuBase)) {
      pendencias.push({
        marketplace: "ML",
        skuOriginal,
        skuTratado: skuBase,
        nome,
        preco,
        estoque: estoqueRaw,
        motivo: "SKU não encontrado na base"
      });
      return;
    }

    if (!vistos.has(skuBase)) {
      vistos.set(skuBase, new Set());
    }

    const originais = vistos.get(skuBase);

    if (originais.has(skuOriginal)) {
      duplicados.push({
        marketplace: "ML",
        skuOriginal,
        skuTratado: skuBase,
        nome,
        preco,
        estoque: estoqueRaw,
        motivo: "SKU original repetido no arquivo"
      });
      return;
    }

    if (originais.size > 0) {
      variacoes.push({
        marketplace: "ML",
        skuOriginal,
        skuTratado: skuBase,
        nome,
        preco,
        estoque: estoqueRaw,
        motivo: "Variação do mesmo SKU base"
      });
      originais.add(skuOriginal);
      return;
    }

    const prod = produtosMap.get(skuBase);
    prod.ml = preco;
    if (!prod.nome && nome) prod.nome = nome;
    produtosMap.set(skuBase, prod);

    originais.add(skuOriginal);
    skusCasados.add(skuBase);
  });

  return {
    totalArquivo,
    totalCasados: skusCasados.size,
    pendencias,
    esgotados,
    variacoes,
    duplicados
  };
}

function enriquecerShopee(produtosMap) {
  const wb = XLSX.readFile(ARQUIVO_SHOPEE);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const linhas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  const headerIndex = linhas.findIndex((linha) => {
    const textos = linha.map(c => normalizarTexto(c));
    return (
      textos.includes("nome do produto") &&
      textos.includes("estoque") &&
      (textos.includes("sku de referencia") || textos.includes("sku"))
    );
  });

  if (headerIndex < 0) {
    throw new Error("Cabeçalho da Shopee não encontrado.");
  }

  const cabecalho = linhas[headerIndex];
  const dados = linhas.slice(headerIndex + 1);

  const idxSkuReferencia = cabecalho.findIndex(
    (c) => normalizarTexto(c) === "sku de referencia"
  );
  const idxSku = cabecalho.findIndex(
    (c) => normalizarTexto(c) === "sku"
  );
  const idxNome = cabecalho.findIndex(
    (c) => normalizarTexto(c) === "nome do produto"
  );
  const idxPreco = cabecalho.findIndex(
    (c) => normalizarTexto(c) === "preco"
  );
  const idxEstoque = cabecalho.findIndex(
    (c) => normalizarTexto(c) === "estoque"
  );

  let totalArquivo = 0;
  const skusCasados = new Set();
  const pendencias = [];
  const esgotados = [];
  const variacoes = [];
  const duplicados = [];
  const vistos = new Map();

  dados.forEach((linha) => {
    const skuReferencia = idxSkuReferencia >= 0 ? String(linha[idxSkuReferencia] || "").trim() : "";
    const skuAlternativo = idxSku >= 0 ? String(linha[idxSku] || "").trim() : "";
    const skuOriginal = skuReferencia || skuAlternativo;

    const nome = String(linha[idxNome] || "").trim();
    const preco = toNumber(linha[idxPreco]);
    const estoqueRaw = linha[idxEstoque];

    if (!skuOriginal) return;

    totalArquivo++;

    const skuBase = extrairSkuBase(skuOriginal);

    if (estoqueEsgotado(estoqueRaw)) {
      esgotados.push({
        marketplace: "Shopee",
        skuOriginal,
        skuTratado: skuBase,
        nome,
        preco,
        estoque: estoqueRaw,
        motivo: "Esgotado no canal"
      });
      return;
    }

    if (!produtosMap.has(skuBase)) {
      pendencias.push({
        marketplace: "Shopee",
        skuOriginal,
        skuTratado: skuBase,
        nome,
        preco,
        estoque: estoqueRaw,
        motivo: "SKU não encontrado na base"
      });
      return;
    }

    if (!vistos.has(skuBase)) {
      vistos.set(skuBase, new Set());
    }

    const originais = vistos.get(skuBase);

    if (originais.has(skuOriginal)) {
      duplicados.push({
        marketplace: "Shopee",
        skuOriginal,
        skuTratado: skuBase,
        nome,
        preco,
        estoque: estoqueRaw,
        motivo: "SKU original repetido no arquivo"
      });
      return;
    }

    if (originais.size > 0) {
      variacoes.push({
        marketplace: "Shopee",
        skuOriginal,
        skuTratado: skuBase,
        nome,
        preco,
        estoque: estoqueRaw,
        motivo: "Variação do mesmo SKU base"
      });
      originais.add(skuOriginal);
      return;
    }

    const prod = produtosMap.get(skuBase);
    prod.shopee = preco;
    if (!prod.nome && nome) prod.nome = nome;
    produtosMap.set(skuBase, prod);

    originais.add(skuOriginal);
    skusCasados.add(skuBase);
  });

  return {
    totalArquivo,
    totalCasados: skusCasados.size,
    pendencias,
    esgotados,
    variacoes,
    duplicados
  };
}

function enriquecerTikTok(produtosMap) {
  const wb = XLSX.readFile(ARQUIVO_TIKTOK);

  const ws = wb.Sheets["Template"];
  if (!ws) {
    throw new Error('Aba "Template" não encontrada no arquivo do TikTok.');
  }

  const linhas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  console.log("\n=== AUDITORIA TIKTOK ===");
  console.log("Arquivo:", ARQUIVO_TIKTOK);
  console.log("Aba usada: Template");
  console.log("Total de linhas lidas:", linhas.length);

  // 0 = cabeçalho inglês
  // 1 = metadados
  // 2 = cabeçalho PT
  // 3 = obrigatoriedade
  // 4 = instruções
  // 5+ = dados reais
  const headerIndex = 0;
  const dataStartIndex = 5;

  const cabecalho = linhas[headerIndex] || [];
  const dados = linhas.slice(dataStartIndex);

  const idxNome = 2;      // C = product_name
  const idxPreco = 9;     // J = price
  const idxEstoque = 10;  // K = quantity
  const idxSku = 11;      // L = seller_sku

  console.log("Header index:", headerIndex);
  console.log("Data start index:", dataStartIndex);
  console.log("Cabeçalho:", cabecalho);
  console.log("Primeira linha real:", dados[0]);

  let totalArquivo = 0;
  const skusCasados = new Set();
  const pendencias = [];
  const esgotados = [];
  const variacoes = [];
  const duplicados = [];
  const vistos = new Map();

  let ignoradasSemSku = 0;
  let ignoradasInstrucao = 0;

  dados.forEach((linha, i) => {
    const linhaExcel = dataStartIndex + i + 1;

    const nome = String(linha[idxNome] || "").trim();
    const preco = toNumber(linha[idxPreco]);
    const estoqueRaw = linha[idxEstoque];
    const skuOriginal = String(linha[idxSku] || "").trim();

    if (!skuOriginal) {
      ignoradasSemSku++;

      pendencias.push({
        marketplace: "TikTok",
        linhaExcel,
        skuOriginal: "",
        skuTratado: "",
        nome,
        preco,
        estoque: estoqueRaw,
        motivo: "Linha sem SKU no arquivo"
      });

      return;
    }

    const skuNormalizado = normalizarTexto(skuOriginal);
    if (
      skuNormalizado.includes("opcional") ||
      skuNormalizado.includes("identificador do produto") ||
      skuNormalizado.includes("variant")
    ) {
      ignoradasInstrucao++;
      return;
    }

    totalArquivo++;

    const skuBase = extrairSkuBase(skuOriginal);

    if (i < 20) {
      console.log("TIKTOK ITEM", {
        linhaExcel,
        skuOriginal,
        skuBase,
        nome,
        preco,
        estoqueRaw,
        tipoEstoque: typeof estoqueRaw
      });
    }

    if (estoqueEsgotado(estoqueRaw)) {
      esgotados.push({
        marketplace: "TikTok",
        linhaExcel,
        skuOriginal,
        skuTratado: skuBase,
        nome,
        preco,
        estoque: estoqueRaw,
        motivo: "Esgotado no canal"
      });
      return;
    }

    if (!produtosMap.has(skuBase)) {
      pendencias.push({
        marketplace: "TikTok",
        linhaExcel,
        skuOriginal,
        skuTratado: skuBase,
        nome,
        preco,
        estoque: estoqueRaw,
        motivo: "SKU não encontrado na base"
      });
      return;
    }

    if (!vistos.has(skuBase)) {
      vistos.set(skuBase, new Set());
    }

    const originais = vistos.get(skuBase);

    if (originais.has(skuOriginal)) {
      duplicados.push({
        marketplace: "TikTok",
        linhaExcel,
        skuOriginal,
        skuTratado: skuBase,
        nome,
        preco,
        estoque: estoqueRaw,
        motivo: "SKU original repetido no arquivo"
      });
      return;
    }

    if (originais.size > 0) {
      variacoes.push({
        marketplace: "TikTok",
        linhaExcel,
        skuOriginal,
        skuTratado: skuBase,
        nome,
        preco,
        estoque: estoqueRaw,
        motivo: "Variação do mesmo SKU base"
      });
      originais.add(skuOriginal);
      return;
    }

    const prod = produtosMap.get(skuBase);
    prod.tiktok = preco;
    if (!prod.nome && nome) prod.nome = nome;
    produtosMap.set(skuBase, prod);

    originais.add(skuOriginal);
    skusCasados.add(skuBase);
  });

  console.log("=== FECHAMENTO AUDITORIA TIKTOK ===");
  console.log("Total linhas aba:", linhas.length);
  console.log("Ignoradas sem SKU:", ignoradasSemSku);
  console.log("Ignoradas por instrução:", ignoradasInstrucao);
  console.log("Total arquivo contado:", totalArquivo);
  console.log("Casados:", skusCasados.size);
  console.log("Pendências:", pendencias.length);
  console.log("Esgotados:", esgotados.length);
  console.log("Variações:", variacoes.length);
  console.log("Duplicados:", duplicados.length);

  return {
    totalArquivo,
    totalCasados: skusCasados.size,
    pendencias,
    esgotados,
    variacoes,
    duplicados
  };
}


// =====================
// INCREMENTAL REAL - MERGE COM DEDUPLICAÇÃO
// Para produtos, a chave é SKU base. Se já existir, atualiza dados; se não existir, incrementa.
// =====================
function lerJsonOpcional(caminho) {
  if (!fs.existsSync(caminho)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(caminho, 'utf-8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function chaveProdutoIncremental(item) {
  return extrairSkuBase(item.skuBase || item.sku || item.sky || item.seller_sku || '');
}

function mergeIncrementalProdutos(arquivoSaida, produtosNovos) {
  const existentes = lerJsonOpcional(arquivoSaida);
  const mapa = new Map();

  for (const item of existentes) {
    const chave = item._chave_incremental || chaveProdutoIncremental(item);
    if (!chave) continue;
    mapa.set(chave, { ...item, _chave_incremental: chave });
  }

  let inseridos = 0;
  let atualizados = 0;

  for (const item of produtosNovos) {
    const chave = chaveProdutoIncremental(item);
    if (!chave) continue;
    const anterior = mapa.get(chave);

    mapa.set(chave, {
      ...(anterior || {}),
      ...item,
      _chave_incremental: chave,
      atualizado_incremental_em: new Date().toISOString()
    });

    if (anterior) atualizados++;
    else inseridos++;
  }

  const final = Array.from(mapa.values());

  console.log('🔁 Incremental produtos:', {
    existentes: existentes.length,
    novos_lidos: produtosNovos.length,
    inseridos,
    atualizados,
    total_final: final.length
  });

  return { final, existentes: existentes.length, inseridos, atualizados };
}

function main() {
  garantirPastaData();

  const { produtosMap, totalLinhas } = carregarBasePrincipal();

  const ml = enriquecerML(produtosMap);
  const shopee = enriquecerShopee(produtosMap);
  const tiktok = enriquecerTikTok(produtosMap);

  const produtosNovos = Array.from(produtosMap.values());
  const mergeProdutos = mergeIncrementalProdutos(OUTPUT_PRODUTOS, produtosNovos);
  const produtos = mergeProdutos.final;

  const resumo = {
    base: {
      totalLinhasArquivo: totalLinhas,
      totalSkusBase: produtos.length,
      incremental: {
        existentes_antes: mergeProdutos.existentes,
        lidos_no_arquivo_atual: produtosNovos.length,
        inseridos: mergeProdutos.inseridos,
        atualizados_ignorando_duplicidade: mergeProdutos.atualizados,
        total_final: produtos.length
      }
    },
    ml: {
      totalArquivo: ml.totalArquivo,
      totalCasados: ml.totalCasados,
      totalPendentes: ml.pendencias.length,
      totalEsgotados: ml.esgotados.length,
      totalVariacoes: ml.variacoes.length,
      totalDuplicados: ml.duplicados.length
    },
    shopee: {
      totalArquivo: shopee.totalArquivo,
      totalCasados: shopee.totalCasados,
      totalPendentes: shopee.pendencias.length,
      totalEsgotados: shopee.esgotados.length,
      totalVariacoes: shopee.variacoes.length,
      totalDuplicados: shopee.duplicados.length
    },
    tiktok: {
      totalArquivo: tiktok.totalArquivo,
      totalCasados: tiktok.totalCasados,
      totalPendentes: tiktok.pendencias.length,
      totalEsgotados: tiktok.esgotados.length,
      totalVariacoes: tiktok.variacoes.length,
      totalDuplicados: tiktok.duplicados.length
    }
  };

  salvarJSON(OUTPUT_PRODUTOS, produtos);
  salvarJSON(OUTPUT_RESUMO, resumo);

  salvarJSON(OUTPUT_CORRIGIR_ML, ml.pendencias);
  salvarJSON(OUTPUT_CORRIGIR_SHOPEE, shopee.pendencias);
  salvarJSON(OUTPUT_CORRIGIR_TIKTOK, tiktok.pendencias);

  salvarJSON(OUTPUT_ESGOTADOS_ML, ml.esgotados);
  salvarJSON(OUTPUT_ESGOTADOS_SHOPEE, shopee.esgotados);
  salvarJSON(OUTPUT_ESGOTADOS_TIKTOK, tiktok.esgotados);

  salvarJSON(OUTPUT_VARIACOES_ML, ml.variacoes);
  salvarJSON(OUTPUT_VARIACOES_SHOPEE, shopee.variacoes);
  salvarJSON(OUTPUT_VARIACOES_TIKTOK, tiktok.variacoes);

  salvarJSON(OUTPUT_DUPLICADOS_ML, ml.duplicados);
  salvarJSON(OUTPUT_DUPLICADOS_SHOPEE, shopee.duplicados);
  salvarJSON(OUTPUT_DUPLICADOS_TIKTOK, tiktok.duplicados);

  console.log("=== RESUMO FINAL ===");
  console.log("Base:", resumo.base.totalSkusBase);

  console.log(
    "ML arquivo:",
    resumo.ml.totalArquivo,
    "| casados:",
    resumo.ml.totalCasados,
    "| pendentes:",
    resumo.ml.totalPendentes,
    "| esgotados:",
    resumo.ml.totalEsgotados,
    "| variacoes:",
    resumo.ml.totalVariacoes,
    "| duplicados:",
    resumo.ml.totalDuplicados
  );

  console.log(
    "Shopee arquivo:",
    resumo.shopee.totalArquivo,
    "| casados:",
    resumo.shopee.totalCasados,
    "| pendentes:",
    resumo.shopee.totalPendentes,
    "| esgotados:",
    resumo.shopee.totalEsgotados,
    "| variacoes:",
    resumo.shopee.totalVariacoes,
    "| duplicados:",
    resumo.shopee.totalDuplicados
  );

  console.log(
    "TikTok arquivo:",
    resumo.tiktok.totalArquivo,
    "| casados:",
    resumo.tiktok.totalCasados,
    "| pendentes:",
    resumo.tiktok.totalPendentes,
    "| esgotados:",
    resumo.tiktok.totalEsgotados,
    "| variacoes:",
    resumo.tiktok.totalVariacoes,
    "| duplicados:",
    resumo.tiktok.totalDuplicados
  );

  console.log("Arquivos gerados em /data");
}

main();