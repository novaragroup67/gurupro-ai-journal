import type { Modul } from "./modul-types";
import { escapeXml } from "./modul-ai";

function slug(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60) || "modul";
}

function download(filename: string, mime: string, content: string) {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function modulHtml(modul: Modul, withIlustrasi: boolean) {
  const sections = modul.sections
    .map((s, i) => {
      const img =
        withIlustrasi && s.ilustrasi
          ? `<p><img src="${s.ilustrasi}" alt="Ilustrasi ${escapeXml(s.judul)}" style="max-width:520px;border:1px solid #E5E7EB;border-radius:8px" /></p>`
          : "";
      return `<h2>Bab ${i + 1}. ${escapeXml(s.judul)}</h2>
${img}
<ul>${s.poin.map((p) => `<li>${escapeXml(p)}</li>`).join("")}</ul>
<p>${escapeXml(s.isi)}</p>`;
    })
    .join("\n");

  return `<!doctype html><html lang="id"><head><meta charset="utf-8" />
<title>${escapeXml(modul.judul)}</title>
<style>
body{font-family:Inter,Arial,sans-serif;color:#0D1B3D;line-height:1.6;max-width:720px;margin:32px auto;padding:0 16px}
h1{font-size:24px;margin-bottom:4px} h2{font-size:17px;margin-top:28px;color:#2563EB}
.meta{color:#6B7280;font-size:13px} ul{padding-left:20px}
</style></head><body>
<h1>${escapeXml(modul.judul)}</h1>
<p class="meta">${escapeXml([modul.mapel, modul.kelas].filter(Boolean).join(" · ") || "Modul Ajar")} — ${escapeXml(modul.status)}</p>
<p>${escapeXml(modul.ringkasan)}</p>
${sections}
<p class="meta">Dibuat dengan GuruPro (prototipe).</p>
</body></html>`;
}

export function unduhPdf(modul: Modul, withIlustrasi = false) {
  if (typeof window === "undefined") return;
  const w = window.open("", "_blank");
  if (!w) {
    download(`${slug(modul.judul)}.html`, "text/html", modulHtml(modul, withIlustrasi));
    return;
  }
  w.document.write(modulHtml(modul, withIlustrasi));
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}

export function unduhWord(modul: Modul, withIlustrasi = false) {
  download(`${slug(modul.judul)}${withIlustrasi ? "-ilustrasi" : ""}.doc`, "application/msword", modulHtml(modul, withIlustrasi));
}

export function unduhPpt(modul: Modul) {
  const slides = modul.slides
    .map(
      (s, i) => `<div class="slide">
  <h2>${escapeXml(s.judul)}</h2>
  ${s.ilustrasi ? `<img src="${s.ilustrasi}" alt="" />` : ""}
  <ul>${s.bullets.map((b) => `<li>${escapeXml(b)}</li>`).join("")}</ul>
  <span class="no">Slide ${i + 1}</span>
</div>`,
    )
    .join("\n");

  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8" /><title>${escapeXml(modul.judul)} — Slide</title>
<style>
body{font-family:Inter,Arial,sans-serif;color:#0D1B3D;margin:0;background:#E5E7EB}
.slide{position:relative;background:#fff;width:960px;min-height:540px;margin:24px auto;padding:48px;box-sizing:border-box;page-break-after:always}
h2{color:#2563EB;font-size:30px;margin:0 0 20px} li{font-size:19px;margin-bottom:10px}
img{max-width:320px;float:right;margin-left:24px;border-radius:12px}
.no{position:absolute;bottom:24px;right:32px;color:#6B7280;font-size:13px}
</style></head><body>${slides}</body></html>`;

  download(`${slug(modul.judul)}-slide.ppt`, "application/vnd.ms-powerpoint", html);
}
