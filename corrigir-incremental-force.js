// corrigir-incremental-force.js
// Execute na raiz do projeto: node corrigir-incremental-force.js
// Objetivo: corrigir o servidor para NÃO pular processamento só porque o arquivo tem o mesmo hash.
// O incremental/deduplicação deve acontecer dentro dos geradores, não no bloqueio do pipeline.

const fs = require('fs');
const path = require('path');

const serverPath = path.join(process.cwd(), 'server.js');

if (!fs.existsSync(serverPath)) {
  console.error('❌ server.js não encontrado na raiz do projeto.');
  process.exit(1);
}

let code = fs.readFileSync(serverPath, 'utf8');
const original = code;

// Remove qualquer bloco de "SEM ALTERAÇÃO / processamento pulado" dentro de processarPipeline
code = code.replace(
  /\n\s*if\s*\(\s*anterior\.sha256[\s\S]*?processamento pulado[\s\S]*?return\s*\{[\s\S]*?readLog\(id\)\s*\}\s*;\s*\}\s*/m,
  '\n'
);

// Remove variações que usam ultimaReferencia para pular processamento
code = code.replace(
  /\n\s*if\s*\(\s*anterior\.ultimaReferencia[\s\S]*?processamento pulado[\s\S]*?return\s*\{[\s\S]*?readLog\(id\)\s*\}\s*;\s*\}\s*/m,
  '\n'
);

// Garante que o meta salve hash, mas nunca bloqueie o processamento.
if (!code.includes('FORCE_PROCESSAMENTO_SEMPRE')) {
  code = code.replace(
    "function processarPipeline(id) {",
    "function processarPipeline(id) {\n  // FORCE_PROCESSAMENTO_SEMPRE: o pipeline sempre executa quando o usuário clica.\n  // A deduplicação/incremental ocorre nos geradores JSON."
  );
}

// Se o servidor não tem hashArquivo, adiciona helper leve
if (!code.includes('function hashArquivo(filePath)')) {
  code = code.replace(
    "function readMeta() {",
    `function hashArquivo(filePath) {
  try {
    if (!fs.existsSync(filePath)) return '';
    const hash = crypto.createHash('sha256');
    hash.update(fs.readFileSync(filePath));
    return hash.digest('hex');
  } catch {
    return '';
  }
}

function readMeta() {`
  );
}

// Se dentro do processarPipeline ainda não calcula sha256 depois do stat, adiciona
if (!code.includes("const sha256 = hashArquivo(caminho);")) {
  code = code.replace(
    "  const stat = fs.statSync(caminho);\n  const scriptPath = path.join(ROOT, pipeline.script);",
    "  const stat = fs.statSync(caminho);\n  const sha256 = hashArquivo(caminho);\n  const scriptPath = path.join(ROOT, pipeline.script);"
  );
}

// Garante que as variáveis de ambiente incrementais vão para os scripts
code = code.replace(
  "      ULTIMA_DATA_REFERENCIA: anterior.ultimaReferencia || '',\n      MODO_INCREMENTAL: 'true'",
  "      ULTIMA_DATA_REFERENCIA: anterior.ultimaReferencia || '',\n      ULTIMO_SHA256_PROCESSADO: anterior.sha256 || '',\n      SHA256_ATUAL: typeof sha256 !== 'undefined' ? sha256 : '',\n      MODO_INCREMENTAL: 'true'"
);

// Garante que meta salve sha256 quando existir
code = code.replace(
  "    tamanhoBytes: stat.size,\n    registros,\n    ultimoErro:",
  "    tamanhoBytes: stat.size,\n    registros,\n    sha256: typeof sha256 !== 'undefined' ? sha256 : '',\n    ultimoErro:"
);

if (code === original) {
  console.log('⚠️ Nenhuma alteração aplicada. Talvez o server.js já esteja corrigido.');
} else {
  fs.copyFileSync(serverPath, serverPath + '.backup-incremental');
  fs.writeFileSync(serverPath, code, 'utf8');
  console.log('✅ server.js corrigido.');
  console.log('📌 Backup criado: server.js.backup-incremental');
  console.log('Agora rode: git add server.js && git commit -m "fix: forcar processamento com incremental nos geradores" && git push');
}
