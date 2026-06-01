const MAX_FILE_SIZE = 8 * 1024 * 1024;
const MAX_TEXT_LENGTH = 18000;

const TEXT_EXTENSIONS = new Set(['txt', 'md', 'csv']);
const EXCEL_EXTENSIONS = new Set(['xlsx', 'xls']);

function extensionOf(name) {
  return String(name || '').split('.').pop()?.toLowerCase() || '';
}

function compactText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
    .slice(0, MAX_TEXT_LENGTH);
}

async function extractPdf(file) {
  const [{ getDocument, GlobalWorkerOptions }, worker] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ]);
  GlobalWorkerOptions.workerSrc = worker.default;

  const pdf = await getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(`--- Página ${pageNumber} ---\n${content.items.map((item) => item.str).join(' ')}`);
  }

  return { text: compactText(pages.join('\n\n')), detail: `${pdf.numPages} página(s)` };
}

async function extractDocx(file) {
  const mammoth = await import('mammoth/mammoth.browser.min.js');
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return { text: compactText(result.value), detail: 'Documento Word' };
}

async function extractSpreadsheet(file) {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const sheets = workbook.SheetNames.map((name) => {
    const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[name], { blankrows: false });
    return `--- Planilha: ${name} ---\n${csv}`;
  });

  return { text: compactText(sheets.join('\n\n')), detail: `${workbook.SheetNames.length} planilha(s)` };
}

export async function extractDocument(file) {
  if (!file) throw new Error('Arquivo inválido.');
  if (file.size > MAX_FILE_SIZE) throw new Error('O arquivo excede o limite de 8 MB.');

  const extension = extensionOf(file.name);
  let extracted;

  if (extension === 'pdf') extracted = await extractPdf(file);
  else if (extension === 'docx') extracted = await extractDocx(file);
  else if (EXCEL_EXTENSIONS.has(extension)) extracted = await extractSpreadsheet(file);
  else if (TEXT_EXTENSIONS.has(extension)) extracted = { text: compactText(await file.text()), detail: 'Arquivo de texto' };
  else if (extension === 'doc') throw new Error('O formato .doc antigo não é compatível. Salve o arquivo como .docx.');
  else throw new Error('Formato não compatível. Use PDF, Word (.docx), Excel, CSV ou TXT.');

  if (!extracted.text) throw new Error('Não encontrei texto legível neste arquivo.');

  return {
    name: file.name,
    type: file.type || extension,
    size: file.size,
    text: extracted.text,
    detail: extracted.detail,
    truncated: extracted.text.length >= MAX_TEXT_LENGTH,
  };
}

export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

export function downloadText(content, filename, type = 'text/markdown;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadOriginal(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
