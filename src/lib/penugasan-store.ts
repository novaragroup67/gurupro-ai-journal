import { useEffect, useState, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PenugasanStatus = "draft" | "published" | "closed";

export interface Penugasan {
  id: string;
  kelasId: string;
  paketSoalId: string;
  guruId: string;
  judul: string;
  instruksi?: string | null;
  deadline?: string | null;
  status: PenugasanStatus;
  createdAt: string;
  updatedAt: string;
  // Metadata join / hydration
  kelasNama?: string;
  kelasTingkat?: string;
  kelasMapel?: string;
  kelasTahunAjaran?: string;
  paketSoalJudul?: string;
  totalSoal?: number;
  guruNama?: string;
}

export interface CreatePenugasanInput {
  kelasId: string;
  paketSoalId: string;
  judul: string;
  instruksi?: string;
  deadline?: string | null;
  status?: "draft" | "published";
}

export interface UpdatePenugasanInput {
  judul?: string;
  instruksi?: string | null;
  deadline?: string | null;
  kelasId?: string;
  paketSoalId?: string;
  status?: PenugasanStatus;
}

// In-memory cache for fast, synchronous rendering
let cachedGuruAssignments: Penugasan[] = [];
let cachedSiswaAssignments: Penugasan[] = [];
const listeners = new Set<() => void>();
const emitChange = () => listeners.forEach((l) => l());

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
  if (!id) throw new Error("Sesi tidak valid. Silakan login kembali.");
  return id;
}

/**
 * Fetch all assignments owned by the authenticated teacher.
 */
export async function refreshPenugasanGuru(): Promise<Penugasan[]> {
  try {
    const userId = await currentUserId();

    const { data, error } = await supabase
      .from("penugasan")
      .select(
        `
        id,
        kelas_id,
        paket_soal_id,
        guru_id,
        judul,
        instruksi,
        deadline,
        status,
        created_at,
        updated_at,
        kelas:kelas_id (
          id,
          nama_kelas,
          tingkat,
          mapel,
          tahun_ajaran
        ),
        paket_soal:paket_soal_id (
          id,
          judul,
          soal
        )
      `,
      )
      .eq("guru_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("[Penugasan] Gagal memuat data penugasan guru:", error.message);
      return cachedGuruAssignments;
    }

    cachedGuruAssignments = (data || []).map((row: any) => {
      const kelas = row.kelas;
      const paketSoal = row.paket_soal;
      const soalList = Array.isArray(paketSoal?.soal) ? paketSoal.soal : [];

      return {
        id: row.id,
        kelasId: row.kelas_id,
        paketSoalId: row.paket_soal_id,
        guruId: row.guru_id,
        judul: row.judul,
        instruksi: row.instruksi,
        deadline: row.deadline,
        status: row.status as PenugasanStatus,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        kelasNama: kelas?.nama_kelas || "",
        kelasTingkat: kelas?.tingkat || "",
        kelasMapel: kelas?.mapel || "",
        kelasTahunAjaran: kelas?.tahun_ajaran || "",
        paketSoalJudul: paketSoal?.judul || "",
        totalSoal: soalList.length,
      };
    });

    emitChange();
    return cachedGuruAssignments;
  } catch (err) {
    console.error("[Penugasan] Error fetching guru assignments:", err);
    return cachedGuruAssignments;
  }
}

/**
 * Fetch all published/closed assignments visible to the authenticated student.
 */
export async function refreshPenugasanSiswa(): Promise<Penugasan[]> {
  try {
    await currentUserId();

    // Query published/closed assignments filtered securely by Supabase RLS
    const { data, error } = await supabase
      .from("penugasan")
      .select(
        `
        id,
        kelas_id,
        paket_soal_id,
        guru_id,
        judul,
        instruksi,
        deadline,
        status,
        created_at,
        updated_at,
        kelas:kelas_id (
          id,
          nama_kelas,
          tingkat,
          mapel,
          tahun_ajaran,
          guru_id
        )
      `,
      )
      .order("deadline", { ascending: true, nullsFirst: false });

    if (error) {
      console.warn("[Penugasan] Gagal memuat data penugasan siswa:", error.message);
      return cachedSiswaAssignments;
    }

    // Ambil info nama guru untuk setiap kelas
    const guruIds = Array.from(
      new Set((data || []).map((r: any) => r.kelas?.guru_id).filter(Boolean)),
    );
    let guruMap: Record<string, string> = {};
    if (guruIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, nama")
        .in("id", guruIds);
      if (profiles) {
        guruMap = Object.fromEntries(profiles.map((p) => [p.id, p.nama]));
      }
    }

    cachedSiswaAssignments = (data || []).map((row: any) => {
      const kelas = row.kelas;
      return {
        id: row.id,
        kelasId: row.kelas_id,
        paketSoalId: row.paket_soal_id,
        guruId: row.guru_id,
        judul: row.judul,
        instruksi: row.instruksi,
        deadline: row.deadline,
        status: row.status as PenugasanStatus,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        kelasNama: kelas?.nama_kelas || "",
        kelasTingkat: kelas?.tingkat || "",
        kelasMapel: kelas?.mapel || "",
        kelasTahunAjaran: kelas?.tahun_ajaran || "",
        guruNama: kelas?.guru_id ? guruMap[kelas.guru_id] || "Guru Pengampu" : "Guru Pengampu",
      };
    });

    emitChange();
    return cachedSiswaAssignments;
  } catch (err) {
    console.error("[Penugasan] Error fetching student assignments:", err);
    return cachedSiswaAssignments;
  }
}

/**
 * Create a new assignment. Enforces teacher ownership and validation.
 */
export async function createPenugasan(
  input: CreatePenugasanInput,
): Promise<{ ok: true; penugasan: Penugasan } | { ok: false; message: string }> {
  try {
    const userId = await currentUserId();

    if (!input.kelasId) {
      return { ok: false, message: "Pilih kelas target penugasan." };
    }
    if (!input.paketSoalId) {
      return { ok: false, message: "Pilih paket soal yang akan ditugaskan." };
    }
    if (!input.judul.trim()) {
      return { ok: false, message: "Judul penugasan wajib diisi." };
    }

    const initialStatus = input.status || "draft";

    const { data: row, error } = await supabase
      .from("penugasan")
      .insert({
        guru_id: userId,
        kelas_id: input.kelasId,
        paket_soal_id: input.paketSoalId,
        judul: input.judul.trim(),
        instruksi: input.instruksi ? input.instruksi.trim() : null,
        deadline: input.deadline ? new Date(input.deadline).toISOString() : null,
        status: initialStatus,
      })
      .select(
        `
        id,
        kelas_id,
        paket_soal_id,
        guru_id,
        judul,
        instruksi,
        deadline,
        status,
        created_at,
        updated_at,
        kelas:kelas_id (
          id,
          nama_kelas,
          tingkat,
          mapel
        ),
        paket_soal:paket_soal_id (
          id,
          judul,
          soal
        )
      `,
      )
      .single();

    if (error) {
      return { ok: false, message: error.message };
    }

    const kelas = (row as any)?.kelas;
    const paketSoal = (row as any)?.paket_soal;
    const soalList = Array.isArray(paketSoal?.soal) ? paketSoal.soal : [];

    const created: Penugasan = {
      id: row.id,
      kelasId: row.kelas_id,
      paketSoalId: row.paket_soal_id,
      guruId: row.guru_id,
      judul: row.judul,
      instruksi: row.instruksi,
      deadline: row.deadline,
      status: row.status as PenugasanStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      kelasNama: kelas?.nama_kelas || "",
      kelasTingkat: kelas?.tingkat || "",
      kelasMapel: kelas?.mapel || "",
      paketSoalJudul: paketSoal?.judul || "",
      totalSoal: soalList.length,
    };

    cachedGuruAssignments = [created, ...cachedGuruAssignments];
    emitChange();
    return { ok: true, penugasan: created };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal membuat penugasan.";
    return { ok: false, message: msg };
  }
}

/**
 * Update an existing assignment.
 */
export async function updatePenugasan(
  id: string,
  patch: UpdatePenugasanInput,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await currentUserId();

    const updatePayload: Record<string, unknown> = {};
    if (patch.judul !== undefined) updatePayload.judul = patch.judul.trim();
    if (patch.instruksi !== undefined)
      updatePayload.instruksi = patch.instruksi ? patch.instruksi.trim() : null;
    if (patch.deadline !== undefined)
      updatePayload.deadline = patch.deadline ? new Date(patch.deadline).toISOString() : null;
    if (patch.kelasId !== undefined) updatePayload.kelas_id = patch.kelasId;
    if (patch.paketSoalId !== undefined) updatePayload.paket_soal_id = patch.paketSoalId;
    if (patch.status !== undefined) updatePayload.status = patch.status;

    const { error } = await supabase.from("penugasan").update(updatePayload).eq("id", id);

    if (error) {
      return { ok: false, message: error.message };
    }

    await refreshPenugasanGuru();
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal memperbarui penugasan.";
    return { ok: false, message: msg };
  }
}

/**
 * Publish an assignment (changes status from 'draft' to 'published').
 */
export async function publishPenugasan(
  id: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  return updatePenugasan(id, { status: "published" });
}

/**
 * Close an assignment (changes status to 'closed').
 */
export async function closePenugasan(
  id: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  return updatePenugasan(id, { status: "closed" });
}

/**
 * Delete an assignment.
 */
export async function deletePenugasan(
  id: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await currentUserId();

    const { error } = await supabase.from("penugasan").delete().eq("id", id);

    if (error) {
      return { ok: false, message: error.message };
    }

    cachedGuruAssignments = cachedGuruAssignments.filter((p) => p.id !== id);
    emitChange();
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal menghapus penugasan.";
    return { ok: false, message: msg };
  }
}

/**
 * Reactive React Hook for Guru
 */
export function usePenugasanGuru() {
  const items = useSyncExternalStore(
    subscribe,
    () => cachedGuruAssignments,
    () => [],
  );
  const [loading, setLoading] = useState(cachedGuruAssignments.length === 0);

  useEffect(() => {
    let active = true;
    void refreshPenugasanGuru().finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  return { penugasanList: items, loading, reload: refreshPenugasanGuru };
}

/**
 * Reactive React Hook for Siswa
 */
export function usePenugasanSiswa() {
  const items = useSyncExternalStore(
    subscribe,
    () => cachedSiswaAssignments,
    () => [],
  );
  const [loading, setLoading] = useState(cachedSiswaAssignments.length === 0);

  useEffect(() => {
    let active = true;
    void refreshPenugasanSiswa().finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  return { penugasanList: items, loading, reload: refreshPenugasanSiswa };
}
