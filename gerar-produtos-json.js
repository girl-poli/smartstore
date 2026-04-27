// CORREÇÃO ML - leitura correta da aba
const XLSX = require("xlsx");

function enriquecerML() {
  const wb = XLSX.readFile("data_external/catalogo-ml.xlsx");
  const ws = wb.Sheets["Anúncios"] || wb.Sheets[wb.SheetNames[0]];
  const linhas = XLSX.utils.sheet_to_json(ws, { header: 1 });

  console.log("ML CORRIGIDO - lendo aba:", wb.SheetNames);
}

enriquecerML();
