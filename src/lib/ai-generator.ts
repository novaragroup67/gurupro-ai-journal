import type { JournalDraft } from "./journal-types";

export interface AiInput {
  mataPelajaran: string;
  kelas: string;
  tanggal: string;
  jam: string;
  materi: string;
  tujuan: string;
  metode: string;
  kondisiKelas: string;
  catatan: string;
}

interface TopicProfile {
  domain: string;
  konteks: string;
  kataKunci: string[];
  praktik: string;
  kesulitan: string;
  lanjutan: string;
}

const TOPIC_RULES: Array<{ match: RegExp; profile: TopicProfile }> = [
  {
    match: /(database|basis data|sql|erd|normalisasi|tabel|query)/i,
    profile: {
      domain: "pengelolaan data",
      konteks: "kebutuhan penyimpanan data pada sistem informasi sekolah",
      kataKunci: ["entitas", "relasi antar tabel", "primary key", "integritas data"],
      praktik: "merancang struktur tabel dan menjalankan query sederhana pada studi kasus nyata",
      kesulitan: "menentukan relasi antar tabel dan membedakan primary key dengan foreign key",
      lanjutan: "latihan normalisasi tabel dan penyusunan query gabungan (JOIN)",
    },
  },
  {
    match: /(web|html|css|flexbox|grid|react|javascript|frontend)/i,
    profile: {
      domain: "pengembangan web",
      konteks: "pembuatan halaman web yang rapi dan responsif",
      kataKunci: ["struktur halaman", "styling", "responsivitas", "pengalaman pengguna"],
      praktik: "membangun komponen halaman langsung di komputer masing-masing",
      kesulitan: "menjaga konsistensi tata letak pada ukuran layar yang berbeda",
      lanjutan: "pengembangan halaman menjadi mini project portofolio",
    },
  },
  {
    match: /(jaringan|ip|subnet|router|switch|topologi|lan|tcp)/i,
    profile: {
      domain: "jaringan komputer",
      konteks: "perencanaan jaringan pada laboratorium sekolah",
      kataKunci: ["pengalamatan", "topologi", "perangkat jaringan", "konektivitas"],
      praktik: "melakukan simulasi konfigurasi jaringan dan pengujian koneksi",
      kesulitan: "perhitungan pengalamatan dan pembacaan skema topologi",
      lanjutan: "praktik konfigurasi perangkat secara mandiri per kelompok",
    },
  },
  {
    match: /(objek|oop|class|inheritance|python|java|algoritma|pemrograman|logika)/i,
    profile: {
      domain: "logika pemrograman",
      konteks: "penyelesaian masalah dengan alur program yang terstruktur",
      kataKunci: ["alur logika", "struktur kode", "penggunaan ulang kode", "pengujian program"],
      praktik: "menulis dan menguji potongan program secara bertahap",
      kesulitan: "menerjemahkan alur logika menjadi kode yang benar",
      lanjutan: "latihan studi kasus dengan tingkat kesulitan bertingkat",
    },
  },
  {
    match: /(matematika|aljabar|statistik|trigonometri|fungsi|bilangan)/i,
    profile: {
      domain: "penalaran matematis",
      konteks: "penerapan konsep pada persoalan sehari-hari di lingkungan kejuruan",
      kataKunci: ["konsep dasar", "langkah penyelesaian", "ketelitian hitung", "penerapan rumus"],
      praktik: "mengerjakan soal bertingkat secara individu dan berpasangan",
      kesulitan: "ketelitian pada langkah perhitungan",
      lanjutan: "latihan soal HOTS dan pembahasan bersama",
    },
  },
  {
    match: /(bahasa|teks|paragraf|pidato|karya|literasi|writing|speaking)/i,
    profile: {
      domain: "literasi dan komunikasi",
      konteks: "kebutuhan komunikasi profesional di dunia kerja",
      kataKunci: ["struktur teks", "pilihan kata", "kepercayaan diri", "kaidah kebahasaan"],
      praktik: "menyusun dan menyajikan teks di depan kelas",
      kesulitan: "menjaga struktur teks agar runtut dan sesuai kaidah",
      lanjutan: "pemberian umpan balik tertulis dan revisi karya siswa",
    },
  },
];

const DEFAULT_PROFILE: TopicProfile = {
  domain: "kompetensi kejuruan",
  konteks: "penerapan materi pada situasi kerja nyata",
  kataKunci: ["konsep dasar", "langkah kerja", "ketelitian", "penerapan praktis"],
  praktik: "mengerjakan lembar kerja dan latihan terbimbing",
  kesulitan: "memahami istilah baru pada materi",
  lanjutan: "pendalaman materi melalui latihan lanjutan",
};

function profileFor(materi: string, mapel: string): TopicProfile {
  const haystack = `${materi} ${mapel}`;
  return TOPIC_RULES.find((r) => r.match.test(haystack))?.profile ?? DEFAULT_PROFILE;
}

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length] as T;
}

export function generateJournal(input: AiInput, seed = Date.now()): JournalDraft {
  const kk = (i: number) => profileFor(input.materi, input.mataPelajaran).kataKunci[i] ?? "konsep dasar";
  const p = profileFor(input.materi, input.mataPelajaran);
  const materi = input.materi.trim() || "materi pembelajaran";
  const mapel = input.mataPelajaran.trim() || "Mata Pelajaran";
  const kelas = input.kelas.trim() || "Kelas";
  const metode = input.metode || pick(["Project Based Learning", "Diskusi Kelompok", "Praktikum Terbimbing"], seed);
  const kondisi = input.kondisiKelas || pick(["Kondusif", "Sangat kondusif", "Cukup kondusif"], seed >> 2);
  const hadir = 27 + (seed % 6);
  const total = 32;
  const pembuka = pick(
    [
      `Guru membuka pembelajaran dengan apersepsi mengenai ${p.konteks}.`,
      `Pembelajaran dibuka dengan pertanyaan pemandu tentang ${materi} dalam ${p.konteks}.`,
      `Kegiatan awal diisi dengan penyampaian tujuan pembelajaran dan gambaran umum ${materi}.`,
    ],
    seed,
  );

  const tujuan =
    input.tujuan.trim() ||
    `Setelah pembelajaran ini, peserta didik mampu menjelaskan konsep ${materi} serta menerapkannya pada ${p.konteks} dengan tepat.`;

  return {
    tanggal: input.tanggal,
    jam: input.jam || "07:30 - 09:00",
    mataPelajaran: mapel,
    kelas,
    materi,
    tujuan,
    metode,
    kondisiKelas: kondisi,
    source: "AI",
    aktivitas: [
      `Pendahuluan (10 menit): ${pembuka}`,
      `Kegiatan Inti (60 menit): Guru menjelaskan ${kk(0)} dan ${kk(1)} pada ${materi}, kemudian peserta didik ${p.praktik} menggunakan pendekatan ${metode.toLowerCase()}.`,
      `Penutup (20 menit): Peserta didik menyimpulkan poin penting ${materi}, guru memberikan penguatan tentang ${kk(3)} dan menyampaikan rencana pertemuan berikutnya.`,
    ].join("\n"),
    partisipasi: `Kehadiran ${hadir} dari ${total} peserta didik. Sebagian besar siswa aktif bertanya dan berdiskusi saat membahas ${materi}. Beberapa siswa perlu pendampingan tambahan pada bagian ${p.kesulitan}.`,
    penilaian: `Penilaian sikap melalui observasi keaktifan diskusi; penilaian pengetahuan melalui pertanyaan lisan seputar ${kk(0)} pada ${materi}; penilaian keterampilan melalui hasil kerja peserta didik saat ${p.praktik}.`,
    refleksi: `Pendekatan ${metode.toLowerCase()} efektif membantu peserta didik ${kelas} memahami ${materi} karena dikaitkan langsung dengan ${p.konteks}. Pengelolaan waktu pada kegiatan inti masih perlu diperbaiki agar semua kelompok mendapat kesempatan presentasi.`,
    tindakLanjut: `Pertemuan berikutnya dilanjutkan dengan ${p.lanjutan}. Peserta didik yang belum tuntas pada ${p.kesulitan} akan mendapat pendampingan dan latihan tambahan di luar jam pelajaran.`,
    catatan:
      input.catatan.trim() ||
      `Materi ${materi} pada bidang ${p.domain} sebaiknya didukung media visual agar peserta didik lebih mudah memahami alur kerjanya.`,
  };
}
