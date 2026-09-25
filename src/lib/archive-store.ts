import { supabase } from "@/integrations/supabase/client";
import { reloadModuls } from "./modul-store";
import { reloadPaketSoal } from "./soal-store";
import { refreshPenugasanGuru } from "./penugasan-store";

export type AcademicItemType = "modul" | "paket_soal" | "penugasan";

export interface ArchivedItem {
  id: string;
  itemType: AcademicItemType;
  judul: string;
  deskripsi: string;
  mapel: string;
  kelasNama: string;
  tahunAjaran: string;
  archivedAt: string;
  extraInfo: Record<string, any>;
}

/**
 * Mengambil seluruh data administrasi akademik guru yang sedang diarsipkan dari Supabase.
 * Menggunakan RPC get_teacher_archived_items() dengan proteksi RLS dan kepemilikan guru.
 */
export async function fetchTeacherArchivedItems(): Promise<ArchivedItem[]> {
  try {
    const { data, error } = await supabase.rpc("get_teacher_archived_items");

    if (error) {
      console.error("[ArchiveStore] Gagal mengambil daftar arsip:", error.message);
      throw new Error(`Gagal memuat arsip: ${error.message}`);
    }

    if (!Array.isArray(data)) {
      return [];
    }

    return data.map((item: any) => ({
      id: item.id,
      itemType: item.item_type as AcademicItemType,
      judul: item.judul || "Tanpa Judul",
      deskripsi: item.deskripsi || "",
      mapel: item.mapel || "—",
      kelasNama: item.kelas_nama || "—",
      tahunAjaran: item.tahun_ajaran || "Tidak Terikat",
      archivedAt: item.archived_at,
      extraInfo: typeof item.extra_info === "object" && item.extra_info !== null ? item.extra_info : {},
    }));
  } catch (err) {
    console.error("[ArchiveStore] Error fetchTeacherArchivedItems:", err);
    throw err;
  }
}

/**
 * Mengarsipkan item akademik (Modul Ajar, Paket Soal, atau Penugasan).
 * Memanggil RPC archive_academic_item() yang aman dan mencatat audit log.
 */
export async function archiveAcademicItem(
  itemType: AcademicItemType,
  itemId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const { data, error } = await supabase.rpc("archive_academic_item", {
      _item_type: itemType,
      _item_id: itemId,
    });

    if (error) {
      console.error("[ArchiveStore] Gagal mengarsipkan item:", error.message);
      throw new Error(error.message || "Gagal mengarsipkan data.");
    }

    // Refresh active in-memory stores accordingly
    if (itemType === "modul") {
      void reloadModuls();
    } else if (itemType === "paket_soal") {
      void reloadPaketSoal();
    } else if (itemType === "penugasan") {
      void refreshPenugasanGuru();
    }

    return {
      success: true,
      message: "Data berhasil diarsipkan ke Pusat Arsip.",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal mengarsipkan data.";
    return { success: false, message: msg };
  }
}

/**
 * Memulihkan item akademik yang telah diarsipkan kembali ke daftar aktif.
 * Memanggil RPC restore_academic_item() yang mempertahankan ID asli dan relasi historis.
 */
export async function restoreAcademicItem(
  itemType: AcademicItemType,
  itemId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const { data, error } = await supabase.rpc("restore_academic_item", {
      _item_type: itemType,
      _item_id: itemId,
    });

    if (error) {
      console.error("[ArchiveStore] Gagal memulihkan item:", error.message);
      throw new Error(error.message || "Gagal memulihkan data.");
    }

    // Refresh active in-memory stores accordingly
    if (itemType === "modul") {
      void reloadModuls();
    } else if (itemType === "paket_soal") {
      void reloadPaketSoal();
    } else if (itemType === "penugasan") {
      void refreshPenugasanGuru();
    }

    return {
      success: true,
      message: "Data berhasil dipulihkan ke daftar aktif.",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal memulihkan data.";
    return { success: false, message: msg };
  }
}
