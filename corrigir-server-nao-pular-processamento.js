// corrigir-server-nao-pular-processamento.js
// Execute na raiz do projeto: node corrigir-server-nao-pular-processamento.js
// Correção: o servidor NÃO deve pular processamento quando você clica em Processar.
// Quem evita duplicidade são os geradores JSON.

const fs = require('fs');
const path = require('path');

const serverPath = path.join(process.cwd(), 'server.js');

if (!fs.existsSync(serverPath)) {
  console.error('❌ server.js não encontrado.');
  process.exit(1);
}

let code = fs.readFileSync(serverPath, 'utf8');
const original = code;

// Remove blocos de "SEM ALTERAÇÃO" que retornam sem executar o gerador.
const patterns = [
  /\n\s*if\s*\(\s*anterior\.sha256[\s\S]*?SEM ALTERA[ÇC][AÃ]O[\s\S]*?return\s*\{[\s\S]*?readLog\(id\)\s*\}\s*;\s*\}\s*/m,
  /\n\s*if\s*\(\s*anterior\.ultimaReferencia[\s\S]*?SEM ALTERA[ÇC][AÃ]O[\s\S]*?return\s*\{[\s\S]*?readLog\(id\)\s*\}\s*;\s*\}\s*/m,
  /\n\s*if\s*\(\s*anterior\.sha256[\s\S]*?processamento pulado[\s\S]*?return\s*\{[\s\S]*?readLog\(id\)\s*\}\s*;\s*\}\s*/m,
  /\n\s*if\s*\(\s*anterior\.ultimaReferencia[\s\S]*?processamento pulado[\s\S]*?return\s*\{[\s\S]*?readLog\(id\)\s*\}\s*;\s*\}\s*/m
];

for (const p of patterns) {
  code = code.replace(p, '\n');
}

// Marca visual para saber que foi corrigido
if (!code.includes('SERVER_NAO_PULA_PROCESSAMENTO')) {
  code = code.replace(
    "async function processarPipeline(id) {",
    "async function processarPipeline(id) {\n  // SERVER_NAO_PULA_PROCESSAMENTO: quando o usuário clica em Processar, sempre executa o gerador.\n  // O incremental/dedup fica nos scripts gerar-*.js."
  );
}

if (code === original) {
  console.log('⚠️ Nenhum bloco de skip encontrado. O server.js pode já estar corrigido.');
} else {
  fs.copyFileSync(serverPath, serverPath + '.backup-nao-pular');
  fs.writeFileSync(serverPath, code, 'utf8');
  console.log('✅ server.js corrigido para não pular processamento.');
  console.log('📌 Backup criado: server.js.backup-nao-pular');
}
