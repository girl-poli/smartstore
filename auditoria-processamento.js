const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const ROOT = __dirname;
const DATA_EXTERNAL = path.join(ROOT, "data_external");

const ARQ_BASE = path.join(DATA_EXTERNAL, "relatorio-dropstok-mapeamento.json");
const ARQ_ML = path.join(DATA_EXTERNAL, "catalogo-ml.xlsx");
const ARQ_SHOPEE = path.join(DATA_EXTERNAL, "catalogo-shopee.xlsx");
const ARQ_TIKTOK = path.join(DATA_EXTERNAL, "catalogo-tiktok.xlsx");

function normalizarTexto(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function extrairSkuBase(sku) {
  if (!sku) return "";
  let valor = String(sku).trim();
  valor = valor
    .replace(/_var_[a-z0-9]+$/i, "")
    .replace(/\s*[-_]?\s*var\s*[a-z0-9]+$/i, "")
    .replace(/\s*[-_]?\s*v\s*\d+$/i, "")
    .trim();

  if (valor.includes("_")) valor = valor.split("_")[0].trim();
  return valor;
}

function normalizarSkuForte(sku) {
  return extrairSkuBase(sku)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .trim();
}

function titulo(txt) {
  console.log("\\n==============================");
  console.log(txt);
  console.log("==============================");
}

function existeArquivo(caminho) {
  console.log(fs.existsSync(caminho) ? "✅ EXISTE:" : "❌ NÃO EXISTE:", caminho);
}

function auditarBase() {
  titulo("1) AUDITORIA BASE DROPSTOK");
  existeArquivo(ARQ_BASE);

  if (!fs.existsSync(ARQ_BASE)) return new Set();

  const data = JSON.parse(fs.readFileSync(ARQ_BASE, "utf8"));
  console.log("Total linhas base:", Array.isArray(data) ? data.length : "NÃO É ARRAY");
  console.log("Primeiro item da base:", data[0]);

  const baseSet = new Set();

  data.forEach((item) => {
    const sku = item.sky || item.sku || item.SKU || "";
    const skuNorm = normalizarSkuForte(sku);
    if (skuNorm) baseSet.add(skuNorm);
  });

  console.log("Total SKUs base normalizados:", baseSet.size);
  console.log("Amostra SKUs base:", Array.from(baseSet).slice(0, 20));

  return baseSet;
}

function auditarExcel(nome, caminho, abaPreferida, colunasPossiveisSku = []) {
  titulo(`2) AUDITORIA ${nome}`);
  existeArquivo(caminho);

  if (!fs.existsSync(caminho)) return [];

  const wb = XLSX.readFile(caminho, { cellDates: false, raw: false });
  console.log("Abas encontradas:", wb.SheetNames);

  const ws = abaPreferida && wb.Sheets[abaPreferida] ? wb.Sheets[abaPreferida] : wb.Sheets[wb.SheetNames[0]];
  const abaUsada = abaPreferida && wb.Sheets[abaPreferida] ? abaPreferida : wb.SheetNames[0];

  console.log("Aba usada:", abaUsada);

  const linhas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  console.log("Total linhas lidas:", linhas.length);

  console.log("\\nPrimeiras 8 linhas:");
  linhas.slice(0, 8).forEach((linha, i) => {
    console.log(`Linha ${i + 1}:`, linha);
  });

  let headerIndex = -1;
  let idxSku = -1;

  for (let i = 0; i < Math.min(linhas.length, 20); i++) {
    const linha = linhas[i] || [];
    const textos = linha.map(c => normalizarTexto(c));

    for (const alvo of colunasPossiveisSku) {
      const idx = textos.findIndex(t => t === normalizarTexto(alvo));
      if (idx >= 0) {
        headerIndex = i;
        idxSku = idx;
        break;
      }
    }

    if (headerIndex >= 0) break;
  }

  console.log("\\nHeader detectado na linha:", headerIndex >= 0 ? headerIndex + 1 : "NÃO ENCONTRADO");
  console.log("Índice coluna SKU:", idxSku);

  if (headerIndex < 0 || idxSku < 0) {
    console.log("❌ Não achei coluna de SKU. Veja as primeiras linhas acima.");
    return [];
  }

  const dados = linhas.slice(headerIndex + 1);
  const skus = [];

  dados.forEach((linha) => {
    const sku = String(linha[idxSku] || "").trim();
    const skuNorm = normalizarSkuForte(sku);
    if (skuNorm) skus.push({ sku, skuNorm });
  });

  console.log("Total SKUs encontrados:", skus.length);
  console.log("Amostra SKUs:", skus.slice(0, 30));

  return skus;
}

function comparar(nome, baseSet, skusCanal) {
  titulo(`3) COMPARAÇÃO ${nome} X BASE`);

  let casados = 0;
  const naoCasados = [];

  skusCanal.forEach(({ sku, skuNorm }) => {
    if (baseSet.has(skuNorm)) casados++;
    else naoCasados.push({ sku, skuNorm });
  });

  console.log("SKUs canal:", skusCanal.length);
  console.log("Casados:", casados);
  console.log("Não casados:", naoCasados.length);
  console.log("Amostra NÃO casados:", naoCasados.slice(0, 50));

  if (casados === 0 && skusCanal.length > 0) {
    console.log("\\n🚨 ALERTA: nenhum SKU casou.");
    console.log("Isso normalmente significa que o campo da base não é 'sky', ou o SKU do marketplace tem outro padrão.");
  }
}

console.clear();
console.log("🔥 DIAGNÓSTICO DE PROCESSAMENTO / SKU");

const baseSet = auditarBase();

const skusML = auditarExcel("MERCADO LIVRE", ARQ_ML, "Anúncios", ["sku", "SKU"]);
const skusShopee = auditarExcel("SHOPEE", ARQ_SHOPEE, null, ["sku de referencia", "sku de referência", "sku"]);
const skusTikTok = auditarExcel("TIKTOK", ARQ_TIKTOK, "Template", ["seller_sku", "SKU do vendedor", "sku"]);

comparar("ML", baseSet, skusML);
comparar("SHOPEE", baseSet, skusShopee);
comparar("TIKTOK", baseSet, skusTikTok);

console.log("\\n✅ Diagnóstico concluído.");
console.log("Copie o resultado do terminal e cole no ChatGPT.");
