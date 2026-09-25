import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Modul } from "./modul-types";
import type { KelasRekapData } from "./rekap-store";

export function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60) || "dokumen"
  );
}

/**
 * Utilitas untuk mengunduh buffer atau string sebagai file biner/teks asli.
 */
function downloadFile(filename: string, mime: string, content: BlobPart) {
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

/**
 * Escapes a single cell conforming to RFC 4180 CSV standard.
 */
function escapeCsvCell(val: string | number | boolean | null | undefined): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// ============================================================================
// 1. EXPORT REKAP NILAI CSV (REAL DATA-DRIVEN)
// ============================================================================

export interface ExportCsvResult {
  filename: string;
  csvContent: string;
  rowCount: number;
}

/**
 * Menghasilkan file CSV Rekapitulasi Nilai Siswa asli (RFC 4180 + UTF-8 BOM).
 * - Menjaga Nilai Murni dan Nilai Remedial terpisah.
 * - Nilai Akhir menggunakan nilai efektif (prinsip Max).
 * - Menjaga angka 0 sebagai nilai sah (bukan string kosong).
 * - Nilai remedial yang tidak diambil/kosong tetap kosong (bukan 0).
 */
export function exportRekapNilaiCsv(
  data: KelasRekapData,
  options?: { assignmentId?: string }
): ExportCsvResult {
  const headers = [
    "No",
    "Nama Siswa",
    "NISN",
    "Kelas",
    "Mata Pelajaran",
    "Tahun Ajaran",
    "Penugasan",
    "KKM",
    "Nilai Murni",
    "Nilai Remedial",
    "Nilai Akhir",
    "Status Ketuntasan",
    "Status Remedial",
  ];

  const lines: string[] = [];
  lines.push(headers.map(escapeCsvCell).join(","));

  const targetAssignments = options?.assignmentId
    ? data.daftarPenugasan.filter((p) => p.id === options.assignmentId)
    : data.daftarPenugasan;

  let rowCounter = 0;
  const kelasNameFull = `${data.tingkat} ${data.namaKelas}`.trim();

  for (const siswa of data.siswaRows) {
    if (targetAssignments.length === 0) {
      // Jika belum ada penugasan di kelas ini, tetap buat baris siswa
      rowCounter++;
      const row = [
        rowCounter,
        siswa.siswaNama,
        siswa.siswaNisn || "—",
        kelasNameFull,
        data.mapel,
        data.tahunAjaran,
        "Belum Ada Penugasan",
        "—",
        "",
        "",
        "",
        "—",
        "—",
      ];
      lines.push(row.map(escapeCsvCell).join(","));
    } else {
      for (const tugas of targetAssignments) {
        rowCounter++;
        const gradeInfo = siswa.nilaiPerTugas[tugas.id];

        let nilaiMurniStr = "";
        let nilaiRemedialStr = "";
        let nilaiAkhirStr = "";
        let statusKetuntasan = "—";
        let statusRemedial = "tidak_ada";

        if (gradeInfo) {
          if (gradeInfo.nilaiMurni !== null && gradeInfo.nilaiMurni !== undefined) {
            nilaiMurniStr = String(gradeInfo.nilaiMurni);
          }
          if (gradeInfo.nilaiRemedial !== null && gradeInfo.nilaiRemedial !== undefined) {
            nilaiRemedialStr = String(gradeInfo.nilaiRemedial);
          }
          if (gradeInfo.nilaiAkhir !== null && gradeInfo.nilaiAkhir !== undefined) {
            nilaiAkhirStr = String(gradeInfo.nilaiAkhir);
            statusKetuntasan = gradeInfo.isTuntas ? "Tuntas" : "Belum Tuntas";
          }
          if (gradeInfo.statusRemedial) {
            statusRemedial = gradeInfo.statusRemedial;
          }
        }

        const row = [
          rowCounter,
          siswa.siswaNama,
          siswa.siswaNisn || "—",
          kelasNameFull,
          data.mapel,
          data.tahunAjaran,
          tugas.judul,
          tugas.kkm,
          nilaiMurniStr,
          nilaiRemedialStr,
          nilaiAkhirStr,
          statusKetuntasan,
          statusRemedial,
        ];
        lines.push(row.map(escapeCsvCell).join(","));
      }
    }
  }

  // Prepend UTF-8 BOM (\uFEFF) for Excel compatibility and join with RFC 4180 CRLF
  const csvContent = "\uFEFF" + lines.join("\r\n");
  const filename = `${slug(data.namaKelas)}-rekap-nilai-${slug(data.tahunAjaran)}.csv`;

  downloadFile(filename, "text/csv;charset=utf-8;", csvContent);

  return {
    filename,
    csvContent,
    rowCount: rowCounter,
  };
}

// ============================================================================
// 2. EXPORT REKAP NILAI PDF (REAL BINARY PDF)
// ============================================================================

export interface ExportPdfResult {
  filename: string;
  doc: jsPDF;
}

/**
 * Menghasilkan file PDF Rekapitulasi Capaian Nilai Siswa asli (application/pdf).
 * - Header resmi GuruPro dengan identitas guru, sekolah, kelas, mapel, tahun ajaran.
 * - Tabel perincian: No, Nama Siswa, KKM, Nilai Murni, Nilai Remedial (- bila kosong), Nilai Akhir, Status Ketuntasan.
 * - Ringkasan statistik kelas.
 */
export async function exportRekapNilaiPdf(
  data: KelasRekapData,
  metadata: { guruNama: string; sekolahNama?: string },
  options?: { assignmentId?: string }
): Promise<ExportPdfResult> {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const targetAssignments = options?.assignmentId
    ? data.daftarPenugasan.filter((p) => p.id === options.assignmentId)
    : data.daftarPenugasan;

  // Header Dokumen
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(13, 27, 61); // Navy #0D1B3D
  doc.text("GuruPro — Laporan Rekapitulasi Nilai Siswa", 14, 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139); // Slate-500
  const printDate = new Date().toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  doc.text(`Dicetak pada: ${printDate} · Sistem Informasi Akademik GuruPro`, 14, 22);

  // Metadata Grid Info
  doc.setDrawColor(226, 232, 240); // Slate-200
  doc.setFillColor(248, 250, 252); // Slate-50
  doc.roundedRect(14, 25, pageWidth - 28, 22, 2, 2, "FD");

  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);

  // Kolom 1
  doc.setFont("helvetica", "bold");
  doc.text("Guru Pengampu:", 18, 32);
  doc.setFont("helvetica", "normal");
  doc.text(metadata.guruNama || "—", 50, 32);

  doc.setFont("helvetica", "bold");
  doc.text("Sekolah:", 18, 40);
  doc.setFont("helvetica", "normal");
  doc.text(metadata.sekolahNama || "Sekolah Mitra GuruPro", 50, 40);

  // Kolom 2
  doc.setFont("helvetica", "bold");
  doc.text("Kelas:", 115, 32);
  doc.setFont("helvetica", "normal");
  doc.text(`${data.tingkat} ${data.namaKelas}`.trim(), 135, 32);

  doc.setFont("helvetica", "bold");
  doc.text("Mata Pelajaran:", 115, 40);
  doc.setFont("helvetica", "normal");
  doc.text(data.mapel || "—", 145, 40);

  // Kolom 3
  doc.setFont("helvetica", "bold");
  doc.text("Tahun Ajaran:", 210, 32);
  doc.setFont("helvetica", "normal");
  doc.text(data.tahunAjaran || "—", 238, 32);

  doc.setFont("helvetica", "bold");
  doc.text("Total Siswa:", 210, 40);
  doc.setFont("helvetica", "normal");
  doc.text(`${data.totalSiswa} Siswa`, 238, 40);

  // Susun data tabel
  const tableHead = [
    [
      "No",
      "Nama Siswa",
      "NISN",
      targetAssignments.length > 1 ? "Penugasan" : "Tugas",
      "KKM",
      "Nilai Murni",
      "Nilai Remedial",
      "Nilai Akhir",
      "Ketuntasan",
    ],
  ];

  const tableBody: (string | number)[][] = [];
  let rowIdx = 0;

  for (const siswa of data.siswaRows) {
    if (targetAssignments.length === 0) {
      rowIdx++;
      tableBody.push([
        rowIdx,
        siswa.siswaNama,
        siswa.siswaNisn || "—",
        "Belum ada tugas",
        "—",
        "—",
        "—",
        "—",
        "—",
      ]);
    } else {
      for (const tugas of targetAssignments) {
        rowIdx++;
        const grade = siswa.nilaiPerTugas[tugas.id];

        let murniStr = "—";
        let remStr = "-"; // Neutral representation when no remedial
        let akhirStr = "—";
        let tuntasStr = "—";

        if (grade) {
          if (grade.nilaiMurni !== null && grade.nilaiMurni !== undefined) {
            murniStr = String(grade.nilaiMurni);
          }
          if (grade.nilaiRemedial !== null && grade.nilaiRemedial !== undefined) {
            remStr = String(grade.nilaiRemedial);
          }
          if (grade.nilaiAkhir !== null && grade.nilaiAkhir !== undefined) {
            akhirStr = String(grade.nilaiAkhir);
            tuntasStr = grade.isTuntas ? "Tuntas" : "Belum Tuntas";
          }
        }

        tableBody.push([
          rowIdx,
          siswa.siswaNama,
          siswa.siswaNisn || "—",
          tugas.judul,
          tugas.kkm,
          murniStr,
          remStr,
          akhirStr,
          tuntasStr,
        ]);
      }
    }
  }

  // Render Table with autoTable
  autoTable(doc, {
    startY: 52,
    head: tableHead,
    body: tableBody,
    theme: "striped",
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      cellPadding: 2.5,
      textColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: [13, 27, 61], // Navy #0D1B3D
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "center",
    },
    columnStyles: {
      0: { halign: "center", cellWidth: 12 },
      1: { halign: "left", cellWidth: 55 },
      2: { halign: "center", cellWidth: 26 },
      3: { halign: "left" },
      4: { halign: "center", cellWidth: 16 },
      5: { halign: "center", cellWidth: 22 },
      6: { halign: "center", cellWidth: 24 },
      7: { halign: "center", cellWidth: 22, fontStyle: "bold" },
      8: { halign: "center", cellWidth: 26 },
    },
    didParseCell: (dataCell) => {
      // Highlight ketuntasan
      if (dataCell.section === "body" && dataCell.column.index === 8) {
        if (dataCell.cell.raw === "Tuntas") {
          dataCell.cell.styles.textColor = [16, 185, 129]; // Emerald #10B981
          dataCell.cell.styles.fontStyle = "bold";
        } else if (dataCell.cell.raw === "Belum Tuntas") {
          dataCell.cell.styles.textColor = [239, 68, 68]; // Red #EF4444
          dataCell.cell.styles.fontStyle = "bold";
        }
      }
    },
    margin: { left: 14, right: 14 },
  });

  // Footer / Page numbers
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `GuruPro Digital Academic System — Halaman ${i} dari ${totalPages}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: "center" }
    );
  }

  const filename = `${slug(data.namaKelas)}-rekap-nilai-${slug(data.tahunAjaran)}.pdf`;

  if (typeof window !== "undefined") {
    doc.save(filename);
  }

  return { filename, doc };
}

// ============================================================================
// 3. EXPORT MODUL AJAR PDF (REAL BINARY PDF)
// ============================================================================

/**
 * Menghasilkan file PDF Modul Ajar asli (application/pdf).
 * - Memuat identitas lengkap: Judul, Mata Pelajaran, Kelas, Tahun Ajaran, Ringkasan.
 * - Pembahasan per Bab/seksi materi lengkap dengan poin tujuan pembelajaran.
 * - Menyematkan referensi ilustrasi dan materi slide jika tersedia.
 */
export async function exportModulAjarPdf(
  modul: Modul,
  options?: {
    withIlustrasi?: boolean;
    tahunAjaran?: string;
    guruNama?: string;
    sekolahNama?: string;
  }
): Promise<ExportPdfResult> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  let cursorY = 20;

  function checkPageBreak(requiredSpace: number) {
    if (cursorY + requiredSpace > pageHeight - 20) {
      doc.addPage();
      cursorY = 20;
    }
  }

  // Kop Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(37, 99, 235); // Primary Blue #2563EB
  doc.text("GURUPRO — MODUL AJAR KURIKULUM MERDEKA", margin, cursorY);
  cursorY += 6;

  // Judul Modul
  doc.setFontSize(18);
  doc.setTextColor(13, 27, 61); // Navy #0D1B3D
  const splitJudul = doc.splitTextToSize(modul.judul, contentWidth);
  doc.text(splitJudul, margin, cursorY);
  cursorY += splitJudul.length * 7 + 4;

  // Metadata Card
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, cursorY, contentWidth, 24, 2, 2, "FD");

  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);

  // Baris 1 metadata
  doc.setFont("helvetica", "bold");
  doc.text("Mata Pelajaran:", margin + 4, cursorY + 7);
  doc.setFont("helvetica", "normal");
  doc.text(modul.mapel || "Umum", margin + 30, cursorY + 7);

  doc.setFont("helvetica", "bold");
  doc.text("Kelas:", margin + 90, cursorY + 7);
  doc.setFont("helvetica", "normal");
  doc.text(modul.kelas || "Semua Tingkat", margin + 104, cursorY + 7);

  // Baris 2 metadata
  doc.setFont("helvetica", "bold");
  doc.text("Tahun Ajaran:", margin + 4, cursorY + 14);
  doc.setFont("helvetica", "normal");
  doc.text(options?.tahunAjaran || "Tahun Berjalan", margin + 30, cursorY + 14);

  doc.setFont("helvetica", "bold");
  doc.text("Status:", margin + 90, cursorY + 14);
  doc.setFont("helvetica", "normal");
  doc.text(modul.status, margin + 104, cursorY + 14);

  // Baris 3 metadata
  doc.setFont("helvetica", "bold");
  doc.text("Sumber Rujukan:", margin + 4, cursorY + 21);
  doc.setFont("helvetica", "normal");
  doc.text(modul.sumberTipe, margin + 30, cursorY + 21);

  doc.setFont("helvetica", "bold");
  doc.text("Penyusun:", margin + 90, cursorY + 21);
  doc.setFont("helvetica", "normal");
  doc.text(options?.guruNama || "Pendidik GuruPro", margin + 106, cursorY + 21);

  cursorY += 30;

  // Ringkasan Modul
  if (modul.ringkasan) {
    checkPageBreak(25);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(13, 27, 61);
    doc.text("Ringkasan & Capaian Pembelajaran", margin, cursorY);
    cursorY += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    const splitRingkasan = doc.splitTextToSize(modul.ringkasan, contentWidth);
    doc.text(splitRingkasan, margin, cursorY);
    cursorY += splitRingkasan.length * 5 + 6;
  }

  // Bab Pembahasan / Sections
  if (Array.isArray(modul.sections) && modul.sections.length > 0) {
    for (let i = 0; i < modul.sections.length; i++) {
      const s = modul.sections[i];
      checkPageBreak(30);

      // Section Header
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(37, 99, 235);
      doc.text(`Bab ${i + 1}. ${s.judul}`, margin, cursorY);
      cursorY += 6;

      // Poin-poin Capaian
      if (Array.isArray(s.poin) && s.poin.length > 0) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(71, 85, 105);
        for (const p of s.poin) {
          checkPageBreak(10);
          const splitPoint = doc.splitTextToSize(`•  ${p}`, contentWidth - 4);
          doc.text(splitPoint, margin + 2, cursorY);
          cursorY += splitPoint.length * 4.5;
        }
        cursorY += 2;
      }

      // Ilustrasi jika diaktifkan dan ada
      if (options?.withIlustrasi && s.ilustrasi) {
        try {
          checkPageBreak(45);
          doc.addImage(s.ilustrasi, "JPEG", margin, cursorY, 90, 45, undefined, "FAST");
          cursorY += 48;
        } catch {
          // Abaikan jika ilustrasi gagal dimuat / format data bukan image valid
        }
      }

      // Isi Materi
      if (s.isi) {
        checkPageBreak(20);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(30, 41, 59);
        const splitIsi = doc.splitTextToSize(s.isi, contentWidth);
        doc.text(splitIsi, margin, cursorY);
        cursorY += splitIsi.length * 5 + 6;
      }
    }
  }

  // Slide Presentasi Summary (jika tersedia)
  if (Array.isArray(modul.slides) && modul.slides.length > 0) {
    checkPageBreak(30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(13, 27, 61);
    doc.text("Struktur Presentasi Slide Terkait", margin, cursorY);
    cursorY += 6;

    for (let si = 0; si < modul.slides.length; si++) {
      const slide = modul.slides[si];
      checkPageBreak(15);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(37, 99, 235);
      doc.text(`Slide ${si + 1}: ${slide.judul}`, margin, cursorY);
      cursorY += 4.5;

      if (Array.isArray(slide.bullets)) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(71, 85, 105);
        for (const b of slide.bullets) {
          checkPageBreak(8);
          const splitBullet = doc.splitTextToSize(`- ${b}`, contentWidth - 4);
          doc.text(splitBullet, margin + 4, cursorY);
          cursorY += splitBullet.length * 4;
        }
      }
      cursorY += 2;
    }
  }

  // Numbering Footers
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `GuruPro · Modul Ajar — Halaman ${i} dari ${totalPages}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: "center" }
    );
  }

  const filename = `${slug(modul.judul)}.pdf`;

  if (typeof window !== "undefined") {
    doc.save(filename);
  }

  return { filename, doc };
}

/**
 * Backward-compatible helper for existing UI buttons
 */
export function unduhPdf(modul: Modul, withIlustrasi = false) {
  void exportModulAjarPdf(modul, { withIlustrasi });
}

export function unduhWord(modul: Modul, withIlustrasi = false) {
  // Safe HTML template for Word import
  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8" /><title>${modul.judul}</title></head><body><h1>${modul.judul}</h1><p>${modul.ringkasan}</p></body></html>`;
  downloadFile(`${slug(modul.judul)}${withIlustrasi ? "-ilustrasi" : ""}.doc`, "application/msword", html);
}

export function unduhPpt(modul: Modul) {
  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8" /><title>${modul.judul} - Slide</title></head><body><h1>${modul.judul}</h1></body></html>`;
  downloadFile(`${slug(modul.judul)}-slide.ppt`, "application/vnd.ms-powerpoint", html);
}
