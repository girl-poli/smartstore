// pipeline-guard.js
// Execute: node pipeline-guard.js
// Objetivo: validar se o pipeline tem arquivos de entrada, se os geradores rodam
// e se os JSONs finais usados pelo dashboard foram criados.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = process.cwd();
const DATA = path.join(ROOT, 'data');
const EXT = path.join(ROOT, 'data_external');
const LOG = path.join(DATA, 'pipeline-guard-log.txt');

fs.mkdirSync(DATA, { recursive: true });

function linha(txt = '') {
  fs.appendFileSync(LOG, txt + '\n', 'utf8');
  console.log(txt);
}

function existe(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function tamanho(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return 0;
  return fs.statSync(p).size;
}

function contarJson(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return 0;
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (Array.isArray(data)) return data.length;
    if (Array.isArray(data.vendas)) return data.vendas.length;
    if (Array.isArray(data.data)) return data.data.length;
    if (Array.isArray(data.custos)) return data.custos.length;
    if (Array.isArray(data.produtos)) return data.produtos.length;
    return 1;
  } catch {
    return -1;
  }
}

function rodar(script) {
  linha('');
  linha(`▶ Rodando ${script}...`);

  if (!existe(script)) {
    linha(`❌ Script não encontrado: ${script}`);
    return false;
  }

  const res = spawnSync('node', [script], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: true
  });

  if (res.stdout) linha('STDOUT:\n' + res.stdout.trim());
  if (res.stderr) linha('STDERR:\n' + res.stderr.trim());

  if (res.status !== 0) {
    linha(`❌ ${script} falhou com código ${res.status}`);
    return false;
  }

  linha(`✅ ${script} executado com sucesso`);
  return true;
}

function validarEntradas() {
  linha('====================================');
  linha('VALIDAÇÃO DE ENTRADAS');
  linha('====================================');

  const entradas = [
    'data_external/vendas-ml.xlsx',
    'data_external/vendas-shopee.xlsx',
    'data_external/vendas-tiktok.xlsx',
    'data_external/relatorio-dropstok-vendas.json',
    'data_external/relatorio-dropstok-mapeamento.json',
    'data_external/catalogo-ml.xlsx',
    'data_external/catalogo-shopee.xlsx',
    'data_external/catalogo-tiktok.xlsx'
  ];

  let ok = true;

  for (const arq of entradas) {
    const tem = existe(arq);
    const tam = tamanho(arq);
    linha(`${tem ? '✅' : '⚠️'} ${arq} ${tem ? `(${tam} bytes)` : 'não encontrado'}`);

    // Vendas precisa pelo menos de um arquivo de venda.
    // Catálogos são importantes, mas nem sempre todos existem no teste.
  }

  const temVenda =
    existe('data_external/vendas-ml.xlsx') ||
    existe('data_external/vendas-shopee.xlsx') ||
    existe('data_external/vendas-tiktok.xlsx');

  if (!temVenda) {
    linha('❌ Nenhum arquivo de vendas encontrado em data_external.');
    ok = false;
  }

  return ok;
}

function validarSaidas() {
  linha('');
  linha('====================================');
  linha('VALIDAÇÃO DE SAÍDAS DO DASHBOARD');
  linha('====================================');

  const saidas = [
    'data/vendas.json',
    'data/vendas-resumo.json',
    'data/vendas-status.json',
    'data/vendas-conciliacao-custo.json',
    'data/custo.json',
    'data/custo-status.json',
    'data/custo-resumo.json',
    'data/produtos.json',
    'data/catalogo-custos.json'
  ];

  let ok = true;

  for (const arq of saidas) {
    const tem = existe(arq);
    const qtd = tem ? contarJson(arq) : 0;

    if (!tem) {
      linha(`❌ ${arq} não foi criado`);
      ok = false;
      continue;
    }

    if (qtd < 0) {
      linha(`❌ ${arq} existe, mas JSON está inválido`);
      ok = false;
      continue;
    }

    linha(`✅ ${arq} criado | registros: ${qtd}`);
  }

  return ok;
}

function main() {
  fs.writeFileSync(LOG, '', 'utf8');

  linha('====================================');
  linha('PIPELINE GUARD - SMART COSMÉTICOS');
  linha(`Início: ${new Date().toLocaleString('pt-BR')}`);
  linha('====================================');

  const entradasOk = validarEntradas();
  if (!entradasOk) {
    linha('');
    linha('❌ Pipeline interrompido: entradas obrigatórias ausentes.');
    process.exit(1);
  }

  // Ordem segura:
  // 1. Vendas primeiro para recriar data/vendas.json.
  // 2. Custos depois, pois usa vendas.json para cruzamento.
  // 3. Produtos por último.
  const scripts = [
    'gerar-vendas-json.js',
    'gerar-custos-json.js',
    'gerar-produtos-json.js'
  ];

  let scriptsOk = true;

  for (const script of scripts) {
    const ok = rodar(script);
    if (!ok) {
      scriptsOk = false;
      linha('');
      linha(`🚨 Parei no erro de ${script}. Corrija antes de subir para produção.`);
      break;
    }
  }

  const saidasOk = validarSaidas();

  linha('');
  linha('====================================');
  linha('RESULTADO FINAL');
  linha('====================================');

  if (scriptsOk && saidasOk) {
    linha('✅ PIPELINE OK. Pode testar as telas localmente.');
    linha('Abra: http://localhost:3001/index.html');
    linha('Abra: http://localhost:3001/vendas.html');
    process.exit(0);
  }

  linha('❌ PIPELINE COM ERRO. Não faça git push ainda.');
  linha(`Veja o log completo em: ${LOG}`);
  process.exit(1);
}

main();
