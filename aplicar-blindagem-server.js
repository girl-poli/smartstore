// aplicar-blindagem-server.js
// Execute: node aplicar-blindagem-server.js
// Objetivo: impedir que o server pule processamento por SHA.
// O usuário clicou em processar => o gerador precisa rodar.
// Quem evita duplicidade é o gerar-vendas-json.js / gerar-custos-json.js / gerar-produtos-json.js.

const fs = require('fs');
const path = require('path');

const serverPath = path.join(process.cwd(), 'server.js');

if (!fs.existsSync(serverPath)) {
  console.error('❌ server.js não encontrado na raiz do projeto.');
  process.exit(1);
}

let code = fs.readFileSync(serverPath, 'utf8');
const original = code;

const patterns = [
  /\n\s*if\s*\(\s*anterior\.sha256[\s\S]*?SEM ALTERA[ÇC][AÃ]O[\s\S]*?return\s*\{[\s\S]*?readLog\(id\)\s*\}\s*;\s*\}\s*/m,
  /\n\s*if\s*\(\s*anterior\.sha256[\s\S]*?processamento pulado[\s\S]*?return\s*\{[\s\S]*?readLog\(id\)\s*\}\s*;\s*\}\s*/m,
  /\n\s*if\s*\(\s*anterior\.ultimaReferencia[\s\S]*?processamento pulado[\s\S]*?return\s*\{[\s\S]*?readLog\(id\)\s*\}\s*;\s*\}\s*/m
];

for (const p of patterns) {
  code = code.replace(p, '\n');
}

if (!code.includes('PIPELINE_BLINDADO_NAO_PULAR')) {
  code = code.replace(
    /async function processarPipeline\(id\) \{/,
    `async function processarPipeline(id) {
  // PIPELINE_BLINDADO_NAO_PULAR:
  // Nunca pular execução por SHA quando o usuário clica em processar.
  // O incremental/deduplicação fica nos geradores.`
  );

  code = code.replace(
    /function processarPipeline\(id\) \{/,
    `function processarPipeline(id) {
  // PIPELINE_BLINDADO_NAO_PULAR:
  // Nunca pular execução por SHA quando o usuário clica em processar.
  // O incremental/deduplicação fica nos geradores.`
  );
}

if (code !== original) {
  fs.copyFileSync(serverPath, serverPath + '.backup-pipeline-blindado');
  fs.writeFileSync(serverPath, code, 'utf8');
  console.log('✅ server.js blindado para não pular processamento.');
  console.log('📌 Backup: server.js.backup-pipeline-blindado');
} else {
  console.log('⚠️ Nenhuma alteração aplicada. Talvez o server já esteja blindado.');
}
