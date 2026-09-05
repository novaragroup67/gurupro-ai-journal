import { useEffect, useSyncExternalStore } from "react";
import { activatePendingAccount } from "./auth-store";

export interface Kelas {
  id: string;
  namaKelas: string; // mis. "IPA 1"
  tingkat: string; // mis. "XI"
  mapel: string;
  tahunAjaran: string; // mis. "2025/2026"
  guruEmail: string; // email guru pemilik kelas
  kodeKelas: string; // mis. "XI-MTK-8F3K" — unik, auto-generate
  createdAt: string;
}

export interface AnggotaKelas {
  id: string;
  kelasId: string;
  siswaEmail: string;
  siswaNama: string;
  siswaNisn: string;
  status: "menunggu" | "aktif" | "ditolak";
  jenis: "akun-baru" | "tambah-kelas"; // untuk tampilan di verifikasi
  diajukan: string; // ISO date
}

const KELAS_KEY = "gurupro.kelas";
const ANGGOTA_KEY = "gurupro.kelas-anggota";

const DEMO_KELAS: Kelas[] = [
  {
    id: "demo-kelas-1",
    namaKelas: "IPA 1",
    tingkat: "XI",
    mapel: "Matematika",
    tahunAjaran: "2025/2026",
    guruEmail: "guru@gurupro.id",
    kodeKelas: "XI-MTK-8F3K",
    createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
  },
];

const DEMO_ANGGOTA: AnggotaKelas[] = [
  {
    id: "demo-anggota-1",
    kelasId: "demo-kelas-1",
    siswaEmail: "yusuf@siswa.id",
    siswaNama: "Yusuf Kurniawan",
    siswaNisn: "0071234567",
    status: "menunggu",
    jenis: "akun-baru",
    diajukan: new Date(Date.now() - 3600000 * 4).toISOString(),
  },
];

const listeners = new Set<() => void>();
const emitChange = () => listeners.forEach((l) => l());

export function readKelasList(): Kelas[] {
  if (typeof window === "undefined") return DEMO_KELAS;
  try {
    const raw = window.localStorage.getItem(KELAS_KEY);
    if (!raw) {
      window.localStorage.setItem(KELAS_KEY, JSON.stringify(DEMO_KELAS));
      return DEMO_KELAS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEMO_KELAS;
  } catch {
    return DEMO_KELAS;
  }
}

export function writeKelasList(data: Kelas[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KELAS_KEY, JSON.stringify(data));
    emitChange();
  } catch {
    /* ignore */
  }
}

export function readAnggotaList(): AnggotaKelas[] {
  if (typeof window === "undefined") return DEMO_ANGGOTA;
  try {
    const raw = window.localStorage.getItem(ANGGOTA_KEY);
    if (!raw) {
      window.localStorage.setItem(ANGGOTA_KEY, JSON.stringify(DEMO_ANGGOTA));
      return DEMO_ANGGOTA;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEMO_ANGGOTA;
  } catch {
    return DEMO_ANGGOTA;
  }
}

export function writeAnggotaList(data: AnggotaKelas[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ANGGOTA_KEY, JSON.stringify(data));
    emitChange();
  } catch {
    /* ignore */
  }
}

function singkatMapel(mapel: string): string {
  const map: Record<string, string> = {
    matematika: "MTK",
    fisika: "FIS",
    kimia: "KIM",
    biologi: "BIO",
    bahasaindonesia: "BIN",
    bahasainggris: "BIG",
    informatika: "INF",
    sejarah: "SEJ",
  };
  const normalized = mapel.toLowerCase().replace(/\s+/g, "");
  if (map[normalized]) return map[normalized];
  const words = mapel.trim().split(/\s+/);
  if (words.length >= 2) {
    return words
      .slice(0, 3)
      .map((w) => (w[0] ?? "").toUpperCase())
      .join("");
  }
  return mapel.slice(0, 3).toUpperCase() || "MPL";
}

function randomCodeSegment(length = 4): string {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function generateKodeKelas(tingkat: string, mapel: string): string {
  const t = (tingkat.trim().toUpperCase() || "X").replace(/[^A-Z0-9]/g, "");
  const m = singkatMapel(mapel);
  const r = randomCodeSegment(4);
  return `${t}-${m}-${r}`;
}

export function buatKelas(data: {
  namaKelas: string;
  tingkat: string;
  mapel: string;
  tahunAjaran: string;
  guruEmail: string;
}): Kelas {
  const list = readKelasList();
  let kode = generateKodeKelas(data.tingkat, data.mapel);
  while (list.some((k) => k.kodeKelas.toUpperCase() === kode.toUpperCase())) {
    kode = generateKodeKelas(data.tingkat, data.mapel);
  }

  const newKelas: Kelas = {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `kelas-${Date.now()}`,
    namaKelas: data.namaKelas.trim(),
    tingkat: data.tingkat.trim(),
    mapel: data.mapel.trim(),
    tahunAjaran: data.tahunAjaran.trim(),
    guruEmail: data.guruEmail.trim().toLowerCase(),
    kodeKelas: kode,
    createdAt: new Date().toISOString(),
  };

  list.unshift(newKelas);
  writeKelasList(list);
  return newKelas;
}

export function perbaruiKodeKelas(id: string): Kelas | null {
  const list = readKelasList();
  const idx = list.findIndex((k) => k.id === id);
  if (idx < 0) return null;
  const target = list[idx];
  if (!target) return null;

  let newKode = generateKodeKelas(target.tingkat, target.mapel);
  while (list.some((k) => k.kodeKelas.toUpperCase() === newKode.toUpperCase())) {
    newKode = generateKodeKelas(target.tingkat, target.mapel);
  }

  const updated: Kelas = {
    ...target,
    kodeKelas: newKode,
  };
  list[idx] = updated;
  writeKelasList(list);
  return updated;
}

export function getKelasByGuru(guruEmail: string): Kelas[] {
  const email = guruEmail.trim().toLowerCase();
  return readKelasList().filter((k) => k.guruEmail.toLowerCase() === email);
}

export function getKelasByKode(kodeKelas: string): Kelas | undefined {
  const kode = kodeKelas.trim().toUpperCase();
  return readKelasList().find((k) => k.kodeKelas.toUpperCase() === kode);
}

export function hapusKelas(id: string) {
  const list = readKelasList().filter((k) => k.id !== id);
  writeKelasList(list);
  const anggota = readAnggotaList().filter((a) => a.kelasId !== id);
  writeAnggotaList(anggota);
}

export function ajukanGabung(data: {
  kelasId: string;
  siswaEmail: string;
  siswaNama: string;
  siswaNisn: string;
  jenis: "akun-baru" | "tambah-kelas";
}): { ok: true } | { ok: false; reason: "already-requested" | "already-member" } {
  const anggota = readAnggotaList();
  const email = data.siswaEmail.trim().toLowerCase();

  const existing = anggota.find(
    (a) => a.kelasId === data.kelasId && a.siswaEmail.toLowerCase() === email,
  );

  if (existing) {
    if (existing.status === "aktif") {
      return { ok: false, reason: "already-member" };
    }
    if (existing.status === "menunggu") {
      return { ok: false, reason: "already-requested" };
    }
    // Jika ditolak sebelumnya, ubah kembali menjadi menunggu
    existing.status = "menunggu";
    existing.diajukan = new Date().toISOString();
    existing.jenis = data.jenis;
    writeAnggotaList(anggota);
    return { ok: true };
  }

  anggota.push({
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `agt-${Date.now()}`,
    kelasId: data.kelasId,
    siswaEmail: email,
    siswaNama: data.siswaNama.trim(),
    siswaNisn: data.siswaNisn.trim(),
    status: "menunggu",
    jenis: data.jenis,
    diajukan: new Date().toISOString(),
  });

  writeAnggotaList(anggota);
  return { ok: true };
}

export function getAnggotaMenunggu(kelasId?: string): AnggotaKelas[] {
  const anggota = readAnggotaList();
  if (kelasId) {
    return anggota.filter((a) => a.kelasId === kelasId && a.status === "menunggu");
  }
  return anggota.filter((a) => a.status === "menunggu");
}

export function getAnggotaByKelas(kelasId: string): AnggotaKelas[] {
  return readAnggotaList().filter((a) => a.kelasId === kelasId);
}

export function getSemuaAnggotaByGuru(
  guruEmail: string,
): (AnggotaKelas & { namaKelas: string; mapel: string; tingkat: string })[] {
  const kelasGuru = getKelasByGuru(guruEmail);
  const kelasMap = new Map(kelasGuru.map((k) => [k.id, k]));
  const anggota = readAnggotaList();

  return anggota
    .filter((a) => kelasMap.has(a.kelasId))
    .map((a) => {
      const k = kelasMap.get(a.kelasId);
      return {
        ...a,
        namaKelas: k ? `${k.tingkat} ${k.namaKelas}` : "Kelas",
        mapel: k ? k.mapel : "-",
        tingkat: k ? k.tingkat : "-",
      };
    });
}

export function setujuiAnggota(id: string): boolean {
  const list = readAnggotaList();
  const idx = list.findIndex((a) => a.id === id);
  if (idx < 0) return false;
  const target = list[idx];
  if (!target) return false;

  list[idx] = { ...target, status: "aktif" };
  writeAnggotaList(list);

  // Jika siswa mendaftar sebagai akun baru, aktifkan juga akun di auth-store
  if (target.jenis === "akun-baru") {
    activatePendingAccount(target.siswaEmail);
  }
  return true;
}

export function tolakAnggota(id: string): boolean {
  const list = readAnggotaList();
  const idx = list.findIndex((a) => a.id === id);
  if (idx < 0) return false;
  const target = list[idx];
  if (!target) return false;

  list[idx] = { ...target, status: "ditolak" };
  writeAnggotaList(list);
  return true;
}

export function getKelasBySiswa(siswaEmail: string): Kelas[] {
  const email = siswaEmail.trim().toLowerCase();
  const activeKelasIds = new Set(
    readAnggotaList()
      .filter((a) => a.siswaEmail.toLowerCase() === email && a.status === "aktif")
      .map((a) => a.kelasId),
  );
  return readKelasList().filter((k) => activeKelasIds.has(k.id));
}

export function useKelas() {
  const kelasList = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    readKelasList,
    () => DEMO_KELAS,
  );

  const anggotaList = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    readAnggotaList,
    () => DEMO_ANGGOTA,
  );

  return { kelasList, anggotaList };
}
