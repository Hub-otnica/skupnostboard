async function apiFetch(path, options = {}) {
  const customHeaders = options.headers || {};
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...customHeaders
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Prišlo je do napake.");
  }

  return data;
}

function setMessage(element, text, type) {
  element.textContent = text;
  element.className = `message visible ${type}`;
}

function clearMessage(element) {
  element.textContent = "";
  element.className = "message";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderErrorHtml(text) {
  return `<p class="message visible error">${escapeHtml(text)}</p>`;
}

function renderErrorTableRow(text, colspan = 1) {
  return `<tr><td colspan="${Number(colspan) || 1}">${escapeHtml(text)}</td></tr>`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Datoteke ni bilo mogoče prebrati."));
    reader.readAsDataURL(file);
  });
}
