async function upload() {
  const input = document.getElementById('fileInput');
  const status = document.getElementById('status');

  const files = input.files;

  if (!files.length) {
    status.innerText = "Selecione arquivos!";
    return;
  }

  const formData = new FormData();

  for (let file of files) {
    formData.append("files", file);
  }

  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
    status.innerText = data.message;

  } catch (err) {
    status.innerText = "Erro no upload";
  }
}