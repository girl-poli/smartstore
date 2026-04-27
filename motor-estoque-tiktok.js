const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

/* =========================================================
   MOTOR ESTOQUE TIKTOK x DROPSTOK - V3
   Porta do dashboard: 3000

   REGRA PRINCIPAL:
   - A BASE DO TIKTOK MANDA.
   - 100% das linhas úteis do TikTok sobem para o resultado.
   - Mesmo sem SKU/SKY, aparece na tela para auditoria.
   - Dropstok entra como complemento quando encontrar SKU.

   Arquivos aceitos automaticamente:
   - catalogo-tiktok.xlsx
   - catalogo-tiktok(1).xlsx, catalogo-tiktok(4).xlsx etc.
   - data/catalogo-tiktok.xlsx
   - data_external/catalogo-tiktok.xlsx

   - relatorio-dropstok-mapeamento.json
   - relatorio-dropstok-mapeamento(1).json etc.
   - data/relatorio-dropstok-mapeamento.json
   - data_external/relatorio-dropstok-mapeamento.json
========================================================= */

const CONFIG = {
  tiktokFile: process.env.TIKTOK_FILE || 'catalogo-tiktok.xlsx',
  dropstokFile: process.env.DROPSTOK_FILE || 'relatorio-dropstok-mapeamento.json',
  outputDir: process.env.OUTPUT_DIR || 'data',

  // TikTok conforme seu arquivo:
  // linha 3 = cabeçalho, linha 6 = início dos dados
  headerRow: Number(process.env.TIKTOK_HEADER_ROW || 3),
  dataStartRow: Number(process.env.TIKTOK_DATA_START_ROW || 6),

  // Colunas fixas informadas por você:
  // K = quantity / estoque TikTok
  // L = seller_sku / SKU TikTok
  tiktokQuantityCol: process.env.TIKTOK_QUANTITY_COL || 'K',
  tiktokSkuCol: process.env.TIKTOK_SKU_COL || 'L',

  bufferSeguranca: Number(process.env.BUFFER_SEGURANCA || 2),
  limiteCritico: Number(process.env.LIMITE_CRITICO || 3),
  limiteAtencao: Number(process.env.LIMITE_ATENCAO || 8)
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function clean(v) {
  return String(v ?? '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function toNumber(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = clean(v).replace(/[^0-9,.-]/g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function colToIndex(col) {
  let n = 0;
  for (const c of String(col).toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

function normalizeSku(v) {
  let sku = clean(v).toUpperCase();
  if (!sku) return '';
  sku = sku.replace(/["']/g, '').trim();
  sku = sku.replace(/\s+/g, '');
  sku = sku.replace(/[-_\s]*VAR\s*\d+$/i, '');
  sku = sku.replace(/[-_\s]*V\s*\d+$/i, '');
  return sku;
}

function listCandidateDirs() {
  return [
    process.cwd(),
    path.join(process.cwd(), 'data'),
    path.join(process.cwd(), 'data_external'),
    path.join(process.cwd(), 'arquivos'),
    path.join(process.cwd(), 'uploads')
  ];
}

function baseNameWithoutExt(file) {
  return path.basename(file).toLowerCase().replace(/\.(xlsx|xls|json)$/i, '');
}

function findFile(preferred, extensions) {
  const directCandidates = [];
  const preferredBase = baseNameWithoutExt(preferred)
    .replace(/\(\d+\)$/i, '')
    .replace(/\s+/g, '');

  for (const dir of listCandidateDirs()) {
    directCandidates.push(path.join(dir, preferred));
  }

  for (const c of directCandidates) {
    if (fs.existsSync(c)) return c;
  }

  const matches = [];
  for (const dir of listCandidateDirs()) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir);
    for (const f of files) {
      const extOk = extensions.some(ext => f.toLowerCase().endsWith(ext));
      if (!extOk) continue;
      const fBase = baseNameWithoutExt(f).replace(/\(\d+\)$/i, '').replace(/\s+/g, '');
      if (fBase.includes(preferredBase) || preferredBase.includes(fBase)) {
        matches.push(path.join(dir, f));
      }
    }
  }

  if (matches.length) {
    matches.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    return matches[0];
  }

  throw new Error(
    `Arquivo não encontrado: ${preferred}. Coloque na raiz do projeto, na pasta data ou em data_external. ` +
    `Também aceito nomes como catalogo-tiktok(4).xlsx.`
  );
}

function findHeaderIndex(header, patterns) {
  return header.findIndex(h => patterns.some(re => re.test(clean(h))));
}

function readTikTok() {
  const file = findFile(CONFIG.tiktokFile, ['.xlsx', '.xls']);
  const wb = XLSX.readFile(file, { cellDates: false, raw: false });
  const sheetName = wb.SheetNames.includes('Template') ? 'Template' : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const header = rows[CONFIG.headerRow - 1] || [];
  const skuIdx = colToIndex(CONFIG.tiktokSkuCol);
  const qtyIdx = colToIndex(CONFIG.tiktokQuantityCol);

  const nameIdx = findHeaderIndex(header, [/product.?name/i, /nome/i, /titulo/i, /title/i]);
  const productIdIdx = findHeaderIndex(header, [/product.?id/i, /id.?produto/i, /produto.?id/i]);
  const priceIdx = findHeaderIndex(header, [/price/i, /preço/i, /preco/i]);
  const statusIdx = findHeaderIndex(header, [/status/i]);

  const items = [];
  for (let r = CONFIG.dataStartRow - 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const hasAnyValue = row.some(v => clean(v) !== '');
    if (!hasAnyValue) continue;

    const skuOriginal = clean(row[skuIdx]);
    const skuNormalizado = normalizeSku(skuOriginal);
    const estoqueTikTok = toNumber(row[qtyIdx]);

    items.push({
      origem: 'TIKTOK',
      linha_tiktok: r + 1,
      sku_tiktok_original: skuOriginal,
      sku_chave: skuNormalizado,
      nome_tiktok: nameIdx >= 0 ? clean(row[nameIdx]) : '',
      product_id_tiktok: productIdIdx >= 0 ? clean(row[productIdIdx]) : '',
      preco_tiktok: priceIdx >= 0 ? clean(row[priceIdx]) : '',
      status_tiktok: statusIdx >= 0 ? clean(row[statusIdx]) : '',
      estoque_tiktok: estoqueTikTok,
      linha_bruta_tiktok: row.map(clean)
    });
  }

  console.log(`TikTok lido: ${items.length} linhas úteis.`);
  console.log(`Arquivo TikTok: ${file}`);
  console.log(`Aba: ${sheetName}`);
  console.log(`SKU TikTok: coluna ${CONFIG.tiktokSkuCol} | Estoque TikTok: coluna ${CONFIG.tiktokQuantityCol}`);
  return items;
}

function readDropstok() {
  const file = findFile(CONFIG.dropstokFile, ['.json']);
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  const map = new Map();

  for (const p of json) {
    const sku = normalizeSku(p.sky || p.sku || p.SKU || p.codigo || '');
    if (!sku) continue;
    const estoque = toNumber(p.estoque);
    const item = {
      sku_dropstok: sku,
      nome_dropstok: clean(p.nome_produto || p.nome || p.titulo || ''),
      estoque_dropstok: estoque,
      custo_dropstok: clean(p.preco || p.custo || ''),
      ja_cadastrado: clean(p.ja_cadastrado || p.tem_estrela || ''),
      imagem: clean(p.imagem || '')
    };
    const atual = map.get(sku);
    if (!atual || item.estoque_dropstok > atual.estoque_dropstok) map.set(sku, item);
  }

  console.log(`Dropstok lido: ${map.size} SKUs únicos.`);
  console.log(`Arquivo Dropstok: ${file}`);
  return map;
}

function decidir(row) {
  const temSku = !!row.sku_chave;
  const temDrop = row.encontrado_dropstok === 'SIM';
  const tiktok = Number(row.estoque_tiktok || 0);
  const drop = Number(row.estoque_dropstok || 0);
  const buffer = CONFIG.bufferSeguranca;

  if (!temSku) {
    return { risco: 'SEM SKU NO TIKTOK', acao: 'CORRIGIR SKU NA BASE TIKTOK', estoque_sugerido_tiktok: 0 };
  }

  if (!temDrop) {
    return { risco: 'SKU NÃO ENCONTRADO NO DROPSTOK', acao: 'REVISAR: produto existe no TikTok mas não casou com Dropstok', estoque_sugerido_tiktok: 0 };
  }

  if (drop <= 0) {
    return { risco: 'SEM ESTOQUE DROPSTOK', acao: 'ZERAR / PAUSAR NO TIKTOK', estoque_sugerido_tiktok: 0 };
  }

  const sugerido = Math.max(0, drop - buffer);

  if (drop <= CONFIG.limiteCritico) {
    return { risco: 'CRÍTICO', acao: `REDUZIR TIKTOK PARA ${sugerido}`, estoque_sugerido_tiktok: sugerido };
  }

  if (tiktok > sugerido) {
    return { risco: 'TIKTOK ACIMA DO SEGURO', acao: `REDUZIR TIKTOK PARA ${sugerido}`, estoque_sugerido_tiktok: sugerido };
  }

  if (drop <= CONFIG.limiteAtencao) {
    return { risco: 'ATENÇÃO', acao: 'MONITORAR ESTOQUE BAIXO', estoque_sugerido_tiktok: sugerido };
  }

  return { risco: 'OK', acao: 'MANTER', estoque_sugerido_tiktok: tiktok };
}

function cruzar(tiktokRows, dropMap) {
  return tiktokRows.map(row => {
    const drop = row.sku_chave ? dropMap.get(row.sku_chave) : null;
    const base = {
      ...row,
      encontrado_dropstok: drop ? 'SIM' : 'NÃO',
      sku_dropstok: drop?.sku_dropstok || '',
      nome_dropstok: drop?.nome_dropstok || '',
      estoque_dropstok: drop?.estoque_dropstok ?? 0,
      custo_dropstok: drop?.custo_dropstok || '',
      ja_cadastrado_dropstok: drop?.ja_cadastrado || '',
      diferenca_estoque: drop ? (Number(row.estoque_tiktok || 0) - Number(drop.estoque_dropstok || 0)) : Number(row.estoque_tiktok || 0)
    };
    return { ...base, ...decidir(base) };
  });
}

function escapeCsv(v) {
  const s = String(v ?? '');
  if (/[;"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeCsv(file, rows) {
  const headers = [
    'linha_tiktok', 'sku_tiktok_original', 'sku_chave', 'nome_tiktok', 'product_id_tiktok',
    'preco_tiktok', 'status_tiktok', 'estoque_tiktok', 'encontrado_dropstok', 'sku_dropstok',
    'nome_dropstok', 'estoque_dropstok', 'custo_dropstok', 'diferenca_estoque',
    'estoque_sugerido_tiktok', 'risco', 'acao'
  ];
  const lines = [headers.join(';')];
  for (const r of rows) lines.push(headers.map(h => escapeCsv(r[h])).join(';'));
  fs.writeFileSync(file, lines.join('\n'), 'utf8');
}

function resumo(rows) {
  const count = (fn) => rows.filter(fn).length;
  return {
    gerado_em: new Date().toISOString(),
    total_linhas_tiktok: rows.length,
    total_com_sku_tiktok: count(r => !!r.sku_chave),
    total_sem_sku_tiktok: count(r => !r.sku_chave),
    total_casados_dropstok: count(r => r.encontrado_dropstok === 'SIM'),
    total_nao_casados_dropstok: count(r => r.encontrado_dropstok !== 'SIM'),
    total_critico: count(r => r.risco === 'CRÍTICO'),
    total_atencao: count(r => r.risco === 'ATENÇÃO'),
    total_tiktok_acima_seguro: count(r => r.risco === 'TIKTOK ACIMA DO SEGURO'),
    total_sem_estoque_dropstok: count(r => r.risco === 'SEM ESTOQUE DROPSTOK'),
    total_ok: count(r => r.risco === 'OK')
  };
}

function run() {
  ensureDir(CONFIG.outputDir);
  console.log('=====================================');
  console.log('MOTOR ESTOQUE TIKTOK x DROPSTOK - V3');
  console.log('=====================================');

  const tiktok = readTikTok();
  const drop = readDropstok();
  const resultado = cruzar(tiktok, drop);
  const res = resumo(resultado);

  const jsonFile = path.join(CONFIG.outputDir, 'estoque-tiktok-cruzado.json');
  const csvFile = path.join(CONFIG.outputDir, 'estoque-tiktok-cruzado.csv');
  const resumoFile = path.join(CONFIG.outputDir, 'resumo-estoque-tiktok.json');

  fs.writeFileSync(jsonFile, JSON.stringify(resultado, null, 2), 'utf8');
  fs.writeFileSync(resumoFile, JSON.stringify(res, null, 2), 'utf8');
  writeCsv(csvFile, resultado);

  console.log('\n=========== RESUMO ===========');
  console.table(res);
  console.log('JSON:', path.resolve(jsonFile));
  console.log('CSV:', path.resolve(csvFile));
  console.log('RESUMO:', path.resolve(resumoFile));
  console.log('\nAgora abra: http://localhost:3000/estoque-tiktok.html');
}

run();
