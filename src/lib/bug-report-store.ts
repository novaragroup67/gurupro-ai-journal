import { supabase } from "@/integrations/supabase/client";
import { logSystemEvent } from "./admin-store";

export type BugPriority = "rendah" | "sedang" | "tinggi" | "kritis";
export type BugStatus = "baru" | "diproses" | "selesai";

export interface BugReportItem {
  id: string;
  reporterId: string;
  reporterRole: "guru" | "siswa" | "admin";
  reporterName: string;
  reporterEmail: string;
  title: string;
  description: string;
  route: string | null;
  priority: BugPriority;
  status: BugStatus;
  adminNotes: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubmitBugReportInput {
  title: string;
  description: string;
  route?: string;
  priority?: BugPriority;
}

function mapRowToBugReport(row: Record<string, unknown>): BugReportItem {
  return {
    id: String(row.id),
    reporterId: String(row.reporter_id),
    reporterRole: (row.reporter_role as any) || "guru",
    reporterName: String(row.reporter_name || "Pengguna"),
    reporterEmail: String(row.reporter_email || "-"),
    title: String(row.title || ""),
    description: String(row.description || ""),
    route: row.route ? String(row.route) : null,
    priority: (row.priority as BugPriority) || "sedang",
    status: (row.status as BugStatus) || "baru",
    adminNotes: row.admin_notes ? String(row.admin_notes) : null,
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/**
 * Mengirim laporan kendala / bug baru dari Guru atau Siswa ke Supabase.
 * Menggunakan RPC submit_bug_report untuk menjamin identitas pelapor diambil
 * langsung dari basis data server (mencegah spoofing reporter_id/role).
 */
export async function submitBugReport(
  input: SubmitBugReportInput,
): Promise<{ ok: boolean; message: string; reportId?: string }> {
  try {
    const cleanTitle = input.title?.trim();
    const cleanDesc = input.description?.trim();

    if (!cleanTitle) {
      return { ok: false, message: "Judul kendala wajib diisi." };
    }
    if (!cleanDesc) {
      return { ok: false, message: "Deskripsi detail kendala wajib diisi." };
    }

    const { data, error } = await supabase.rpc("submit_bug_report", {
      _title: cleanTitle,
      _description: cleanDesc,
      _route: input.route?.trim() || null,
      _priority: input.priority || "sedang",
    });

    if (error) {
      console.error("[BugReportStore] RPC submit_bug_report error:", error.message);
      return { ok: false, message: error.message };
    }

    return {
      ok: true,
      message: "Laporan kendala berhasil dikirim ke Administrator. Terima kasih atas masukan Anda!",
      reportId: data as string,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal mengirim laporan kendala.";
    console.error("[BugReportStore] Exception in submitBugReport:", err);
    return { ok: false, message: msg };
  }
}

/**
 * Mengambil daftar laporan kendala yang dibuat oleh pengguna yang sedang login.
 */
export async function getMyBugReports(): Promise<BugReportItem[]> {
  try {
    const { data, error } = await supabase
      .from("bug_reports")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[BugReportStore] Gagal mengambil laporan saya:", error.message);
      throw new Error(`Gagal memuat laporan kendala: ${error.message}`);
    }

    return (data || []).map(mapRowToBugReport);
  } catch (err) {
    console.error("[BugReportStore] Error getMyBugReports:", err);
    return [];
  }
}

/**
 * Mengambil seluruh laporan kendala untuk ditinjau oleh Admin di dashboard.
 */
export async function getAllBugReports(filters?: {
  status?: BugStatus | "semua";
  role?: "guru" | "siswa" | "semua";
}): Promise<BugReportItem[]> {
  try {
    let query = supabase.from("bug_reports").select("*").order("created_at", { ascending: false });

    if (filters?.status && filters.status !== "semua") {
      query = query.eq("status", filters.status);
    }
    if (filters?.role && filters.role !== "semua") {
      query = query.eq("reporter_role", filters.role);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[BugReportStore] Gagal mengambil seluruh laporan:", error.message);
      throw new Error(`Gagal memuat laporan bug sistem: ${error.message}`);
    }

    return (data || []).map(mapRowToBugReport);
  } catch (err) {
    console.error("[BugReportStore] Error getAllBugReports:", err);
    return [];
  }
}

/**
 * Memperbarui status laporan dan catatan tindak lanjut oleh Admin.
 */
export async function updateBugReportStatus(
  reportId: string,
  status: BugStatus,
  adminNotes?: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const updatePayload: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (adminNotes !== undefined) {
      updatePayload.admin_notes = adminNotes.trim() || null;
    }

    if (status === "selesai") {
      updatePayload.resolved_at = new Date().toISOString();
    } else {
      updatePayload.resolved_at = null;
    }

    const { error } = await supabase
      .from("bug_reports")
      .update(updatePayload)
      .eq("id", reportId);

    if (error) {
      console.error("[BugReportStore] Gagal memperbarui status laporan:", error.message);
      return { ok: false, message: error.message };
    }

    await logSystemEvent(
      "info",
      "bug_report_status_updated",
      `Admin mengubah status laporan ${reportId} menjadi ${status}`,
      { reportId, newStatus: status, hasNotes: Boolean(adminNotes) },
    );

    return {
      ok: true,
      message: `Status laporan berhasil diperbarui menjadi "${status}".`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal memperbarui status laporan.";
    console.error("[BugReportStore] Exception in updateBugReportStatus:", err);
    return { ok: false, message: msg };
  }
}
