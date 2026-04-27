// COLE NO TOPO DO processamento.js
const API_BASE = 'http://localhost:3001';

async function fetchJsonSeguro(url, options = {}) {
  const resp = await fetch(url, options);
  const texto = await resp.text();

  let data;
  try {
    data = JSON.parse(texto);
  } catch {
    throw new Error(`A API não retornou JSON. URL: ${url} | HTTP ${resp.status} | Retorno: ${texto.slice(0, 180)}`);
  }

  if (!resp.ok) {
    throw new Error(data.erro || data.message || `Erro HTTP ${resp.status}`);
  }

  return data;
}

// TROQUE:
// fetch('/api/processamento/status')
// POR:
// fetchJsonSeguro(`${API_BASE}/api/processamento/status`)

// TROQUE:
// fetch('/api/processamento/processar/todos', { method: 'POST' })
// POR:
// fetchJsonSeguro(`${API_BASE}/api/processamento/processar/todos`, { method: 'POST' })
