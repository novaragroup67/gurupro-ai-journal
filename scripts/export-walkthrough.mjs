import fs from 'node:fs';
import path from 'node:path';

const sourceMdPath = path.resolve('docs/WALKTHROUGH.md');
const mdContent = fs.readFileSync(sourceMdPath, 'utf8');

const downloadsMdPath = 'C:/Users/LENOVO/Downloads/GURUPRO_WALKTHROUGH.md';
const downloadsHtmlPath = 'C:/Users/LENOVO/Downloads/GURUPRO_WALKTHROUGH.html';
const repoHtmlPath = path.resolve('docs/WALKTHROUGH.html');

// Copy markdown
fs.writeFileSync(downloadsMdPath, mdContent, 'utf8');

// Build HTML
const escapedMd = JSON.stringify(mdContent);

const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GuruPro — Dokumentasi & Walkthrough Lengkap</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/github-markdown-css@5.5.1/github-markdown.min.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
  <script src="https://cdn.jsdelivr.net/npm/marked@12.0.1/marked.min.js"></script>
  <style>
    body {
      background-color: #f8fafc;
      margin: 0;
      padding: 24px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
    }
    .wrapper {
      max-width: 1040px;
      margin: 0 auto;
      background: #ffffff;
      padding: 40px 48px;
      border-radius: 12px;
      box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.08);
      border: 1px solid #e2e8f0;
    }
    .header-bar {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      margin-bottom: 28px;
      padding-bottom: 20px;
      border-bottom: 2px solid #e2e8f0;
    }
    .brand-title {
      margin: 0;
      font-size: 22px;
      font-weight: 700;
      color: #0f172a;
    }
    .brand-subtitle {
      margin: 4px 0 0;
      color: #64748b;
      font-size: 14px;
    }
    .actions {
      display: flex;
      gap: 10px;
      align-items: center;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      font-size: 13px;
      font-weight: 600;
      border-radius: 6px;
      border: none;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.2s ease;
    }
    .btn-primary {
      background: #2563eb;
      color: #ffffff;
    }
    .btn-primary:hover {
      background: #1d4ed8;
    }
    .btn-outline {
      background: #f1f5f9;
      color: #334155;
      border: 1px solid #cbd5e1;
    }
    .btn-outline:hover {
      background: #e2e8f0;
    }
    .markdown-body {
      box-sizing: border-box;
      min-width: 200px;
      font-size: 15px;
      line-height: 1.65;
    }
    .markdown-body table {
      display: table;
      width: 100%;
    }
    @media print {
      body {
        background: #fff;
        padding: 0;
      }
      .wrapper {
        border: none;
        box-shadow: none;
        padding: 0;
        max-width: 100%;
      }
      .header-bar {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header-bar">
      <div>
        <h1 class="brand-title">GuruPro — Walkthrough & Documentation</h1>
        <p class="brand-subtitle">Foundation → Auth → Kelas → Modul → Soal → Penugasan → Penilaian → PPTX → QA → Ops → PRODUCT-1 → PRODUCT-2A</p>
      </div>
      <div class="actions">
        <button class="btn btn-primary" onclick="window.print()">🖨️ Cetak / Simpan ke PDF</button>
        <a class="btn btn-outline" href="GURUPRO_WALKTHROUGH.md" download>📄 Unduh File Markdown (.md)</a>
      </div>
    </div>
    <article class="markdown-body" id="content">Memuat dokumen...</article>
  </div>

  <script>
    const markdownSource = ${escapedMd};
    if (window.marked) {
      document.getElementById('content').innerHTML = marked.parse(markdownSource);
    } else {
      document.getElementById('content').innerText = markdownSource;
    }
  </script>
</body>
</html>
`;

fs.writeFileSync(downloadsHtmlPath, html, 'utf8');
fs.writeFileSync(repoHtmlPath, html, 'utf8');

console.log('Export completed successfully:');
console.log('1. Markdown -> ' + downloadsMdPath);
console.log('2. HTML (Interactive & Print-to-PDF) -> ' + downloadsHtmlPath);
console.log('3. Repo HTML -> ' + repoHtmlPath);
