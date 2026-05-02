// resetar-meta-processamento.js
// Execute na raiz do projeto: node resetar-meta-processamento.js
// Força uma recriação das bases de saída no próximo clique em "Processar todos".

const fs = require('fs');
const path = require('path');

const metaPath = path.join(process.cwd(), 'data', 'processamento-meta.json');

if (!fs.existsSync(metaPath)) {
  console.log('⚠️ data/processamento-meta.json não existe. Nada para resetar.');
  process.exit(0);
}

const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

const pipelinesParaResetar = [
  'vendas_ml',
  'vendas_shopee',
  'vendas_tiktok',
  'custos',
  'dropstok_mapeamento',
  'catalogo_ml',
  'catalogo_shopee',
  'catalogo_tiktok'
];

for (const id of pipelinesParaResetar) {
  if (!meta[id]) continue;
  delete meta[id].sha256;
  delete meta[id].ultimaReferencia;
  meta[id].forcadoParaReprocessarEm = new Date().toISOString();
}

fs.copyFileSync(metaPath, metaPath + '.backup-reset');
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');

console.log('✅ Metadados resetados. Próximo "Processar todos" vai recriar as bases.');
console.log('📌 Backup criado: data/processamento-meta.json.backup-reset');
