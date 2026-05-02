const $ = (id) => document.getElementById(id);
let arquivosStatus = [];

function formatBytes(bytes) {
  const n = Number(bytes || 0);
  if (!n) return '-';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleString('pt-BR') : '-';
}

function badge(status) {
  if (status === 'ok') return '<span class="badge ok">OK</span>';
  if (status === 'erro') return '<span class="badge erro">Erro</span>';
  return '<span class="badge ausente">Ausente</span>';
}

function normalizarResposta(data) {
  const arquivos = Array.isArray(data.arquivos) ? data.arquivos : [];
  const resumo = data.resumo || {
    total: arquivos.length,
    ok: arquivos.filter(a => a.status === 'ok' || a.existe === true).length,
    ausentes: arquivos.filter(a => a.status === 'ausente' || a.existe === false).length,
    erros: arquivos.filter(a => a.status === 'erro').length,
    registros: arquivos.reduce((acc, a) => acc + (Number(a.registros) || 0), 0)
  };

  return { arquivos, resumo };
}

async function carregarStatus() {
  const tbody = $('tbodyArquivos');
  tbody.innerHTML = '<tr><td colspan="7">Carregando...</td></tr>';

  try {
    const res = await (window.smartAuth?.fetch || fetch)('/api/upload/status', { cache: 'no-store' });
    const data = await res.json();

    if (!res.ok || !data.ok) throw new Error(data.erro || 'Erro ao carregar status');

    const normalizado = normalizarResposta(data);
    arquivosStatus = normalizado.arquivos;

    $('pastaServidor').textContent = data.pasta || '';
    $('kpiTotal').textContent = normalizado.resumo.total || 0;
    $('kpiOk').textContent = normalizado.resumo.ok || 0;
    $('kpiAusentes').textContent = normalizado.resumo.ausentes || 0;
    $('kpiErros').textContent = normalizado.resumo.erros || 0;
    $('kpiRegistros').textContent = normalizado.resumo.registros || 0;

    if (!arquivosStatus.length) {
      tbody.innerHTML = '<tr><td colspan="7">Nenhum arquivo encontrado ainda.</td></tr>';
      return;
    }

    tbody.innerHTML = arquivosStatus.map((a, idx) => {
      const status = a.status || (a.existe ? 'ok' : 'ausente');
      return `
        <tr class="${status === 'erro' ? 'row-erro' : ''}">
          <td>
            <strong>${a.nome}</strong>
            <small>${a.descricao || ''}</small>
          </td>
          <td>${a.grupo || '-'}</td>
          <td>${badge(status)}</td>
          <td>${a.registros ?? '-'}</td>
          <td>${formatBytes(a.tamanhoBytes)}</td>
          <td>
            ${formatDate(a.atualizadoEm || a.ultimoUploadEm)}
            <small>${a.incrementalTexto || ''}</small>
            <small>Últ. proc.: ${formatDate(a.ultimoProcessamentoEm)}</small>
          </td>
          <td class="actions">
            <button onclick="verLog(${idx})" class="btn small ghost">Ver log</button>
            ${status === 'erro' || status === 'ausente'
              ? '<button onclick="selecionarArquivo()" class="btn small">Subir novamente</button>'
              : '<button onclick="reprocessar(' + idx + ')" class="btn small ghost">Processar</button>'}
          </td>
        </tr>`;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7">Erro: ${err.message}</td></tr>`;
  }
}

async function upload() {
  const input = $('fileInput');
  const status = $('status');

  if (!input.files.length) {
    status.textContent = 'Selecione arquivos!';
    status.className = 'status-msg erro';
    return;
  }

  const formData = new FormData();
  for (const file of input.files) formData.append('files', file);

  status.textContent = 'Enviando arquivos...';
  status.className = 'status-msg';

  try {
    const res = await (window.smartAuth?.fetch || fetch)('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();

    if (!res.ok || data.ok === false) throw new Error(data.erro || data.message || 'Erro no upload');

    status.textContent = data.message || 'Upload realizado com sucesso';
    status.className = 'status-msg ok';
    input.value = '';
    await carregarStatus();
  } catch (err) {
    status.textContent = 'Erro: ' + err.message;
    status.className = 'status-msg erro';
  }
}

function verLog(idx) {
  const a = arquivosStatus[idx];
  const status = a.status || (a.existe ? 'ok' : 'ausente');

  $('logBox').textContent = [
    `Arquivo: ${a.nome}`,
    `Status: ${status}`,
    `Registros: ${a.registros ?? '-'}`,
    `Tamanho: ${formatBytes(a.tamanhoBytes)}`,
    `Atualizado: ${formatDate(a.atualizadoEm || a.ultimoUploadEm)}`,
    '',
    a.erro ? 'ERRO:' : 'LOG:',
    `Incremental: ${a.incrementalTexto || '-'}`,
    `Último processamento: ${formatDate(a.ultimoProcessamentoEm)}`,
    `SHA atual: ${a.sha256 || '-'}`,
    `SHA processado: ${a.sha256Processado || '-'}`,
    '',
    a.erro || a.log || 'Sem log registrado.'
  ].join('\n');
}

function selecionarArquivo() {
  $('fileInput').click();
}

async function reprocessar(idx) {
  const a = arquivosStatus[idx];
  $('logBox').textContent = `Processando ${a.nome}...`;

  try {
    const res = await (window.smartAuth?.fetch || fetch)('/api/upload/reprocessar/' + encodeURIComponent(a.nome), { method: 'POST' });
    const data = await res.json();
    $('logBox').textContent = JSON.stringify(data, null, 2);
    await carregarStatus();
  } catch (err) {
    $('logBox').textContent = 'Erro ao processar: ' + err.message;
  }
}

$('btnUpload')?.addEventListener('click', upload);
$('btnStatus')?.addEventListener('click', carregarStatus);
carregarStatus();
