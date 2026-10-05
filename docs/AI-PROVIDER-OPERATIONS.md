# GuruPro — Panduan Operasional Integrasi AI Dwi-Penyedia (AI-PROVIDER-OPERATIONS)

Status: **AKTIF & OPERASIONAL**  
Versi: `1.0.0` (GO-LIVE-1)  
Cakupan: Orkestrasi Google Gemini & OpenAI

---

## 1. Arsitektur Dual AI Router

Sistem menggunakan [`DualIllustrationRouter`](file:///c:/novara%20project/gurupro-ai-journal-main/src/lib/ai/providers/dual-illustration-router.ts) untuk mengelola generasi citra visual edukatif dan generator modul/soal dengan arsitektur failover cerdas:

```text
                  [ Permintaan Generasi AI ]
                              │
                              ▼
                  [ Concurrency Guard (<= 2) ]
                              │
                              ▼
                  [ Rate Limiter (<= 20 req/m) ]
                              │
                              ▼
                 ┌───────────────────────────┐
                 │  Penyedia Primer: GEMINI  │
                 │ (gemini-3.1-flash-image)  │
                 └─────────────┬─────────────┘
                               │
               ┌───────────────┴───────────────┐
               │                               │
         [ HTTP 200 OK ]         [ Error Transien: 429/5xx ]
               │                               │
               ▼                               ▼
      [ Validasi Biner ]           ┌───────────────────────────┐
     (PNG/JPEG >= 512 B)           │  Penyedia Sekunder:       │
               │                   │  OPENAI (gpt-image-2)     │
               ▼                   └─────────────┬─────────────┘
        [ Persistensi ]                          │
        (Bucket Storage)               ┌─────────┴─────────┐
                                       │                   │
                                 [ HTTP 200 OK ]       [ Gagal ]
                                       │                   │
                                       ▼                   ▼
                               [ Validasi Biner ]    [ Notifikasi ]
                               (PNG/JPEG >= 512 B)   (Pesan Ramah)
```

---

## 2. Invarian Keselamatan (Safety Policies)

### Strict Fail-Closed Safety Invariant
- Jika Google Gemini atau OpenAI memicu penolakan kebijakan keselamatan (*content policy refusal* / `AI_SAFETY_BLOCKED`), permintaan **langsung dibatalkan seketika (fail-closed)**.
- Sistem **TIDAK AKAN PERNAH** mencoba mengalihkan permintaan yang diblokir oleh kebijakan keselamatan ke penyedia sekunder.
- Hal ini menjamin bahwa konten tidak pantas atau berbahaya tidak akan lolos melalui penyedia lain.

---

## 3. Pengendalian Biaya & Pencegahan Penyalahgunaan (Cost & Abuse Controls)

| Safeguard | Ambang Batas (Threshold) | Tindakan Pencegahan |
|---|---|---|
| **Concurrency Guard** | Maksimal 2 proses serentak per user | Menolak permintaan ketiga dengan pesan antrean sibuk |
| **User Rate Limiter** | Maksimal 20 permintaan per menit per user | Memblokir lonjakan klik atau spam generasi |
| **Payload Ingestion Limit** | Maksimal 10 MB (dokumen Base64) | Mencegah kelebihan beban memori serverless |
| **External URL Stream Limit** | Maksimal 2 MB (artikel web) | Mencegah pengunduhan file biner besar tak sengaja |
| **Max Retry Limit** | 2 kali percobaan berulang terisolasi | Menghindari loop tak terbatas pada error jaringan |
| **Anti-Mock Guard** | Menolak SVG prototype atau string mock | Memastikan hanya biner nyata PNG/JPEG $\ge 512$ bytes yang disimpan |

---

## 4. Metadata Observabilitas & Korelasi (Correlation Tracking)

Setiap panggilan generasi AI mencatat metadata terstruktur tanpa membocorkan kredensial rahasia:
- `requestId`: UUID unik untuk melacak seluruh siklus permintaan.
- `userId`: ID pengguna terotentikasi.
- `moduleId`: ID modul ajar terkait.
- `provider`: Penyedia yang dicoba (`gemini` / `openai`).
- `model`: Nama model yang dieksekusi (contoh: `gemini-3.1-flash-image`).
- `latencyMs`: Waktu tanggap eksekusi dalam milidetik.
- `failoverOccurred`: Boolean penanda apakah terjadi failover ke sekunder.
- `finalStatus`: `SUCCESS`, `SAFETY_BLOCKED`, atau `ERROR`.
- `errorCode`: Kode taksonomi error (contoh: `AI_PROVIDER_ERROR`).
