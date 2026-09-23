import { supabase } from "@/integrations/supabase/client";

export interface AdminStats {
  totalUsers: number;
  totalTeachers: number;
  totalStudents: number;
  totalAdmins: number;
  totalClasses: number;
  totalModules: number;
  totalAssignments: number;
  pendingTeachers: number;
}

export interface TeacherAdminItem {
  id: string;
  nama: string;
  email: string;
  nip: string;
  sekolah: string;
  mapel: string;
  telepon: string;
  statusVerifikasi: "menunggu" | "terverifikasi" | "ditolak";
  createdAt: string;
}

export interface SystemLogItem {
  id: string;
  level: "info" | "warn" | "error" | "auth_failure";
  eventType: string;
  message: string;
  context: Record<string, unknown>;
  createdAt: string;
}

const SENSITIVE_KEYS = new Set([
  "password",
  "katasandi",
  "kata_sandi",
  "token",
  "secret",
  "authorization",
  "kunci",
  "jawaban",
  "cookie",
]);

function sanitizeContext(raw?: Record<string, unknown>): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  const cleaned: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(raw)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      cleaned[key] = "[REDACTED]";
    } else if (typeof val === "object" && val !== null && !Array.isArray(val)) {
      cleaned[key] = sanitizeContext(val as Record<string, unknown>);
    } else {
      cleaned[key] = val;
    }
  }
  return cleaned;
}

/**
 * Mencatat log event sistem / error nyata ke database.
 * Menjamin tidak membocorkan credential, token, atau kunci jawaban.
 */
export async function logSystemEvent(
  level: "info" | "warn" | "error" | "auth_failure",
  eventType: string,
  message: string,
  context: Record<string, unknown> = {},
): Promise<void> {
  try {
    const sanitized = sanitizeContext(context);
    const { error } = await supabase.rpc("log_system_event", {
      _level: level,
      _event_type: eventType,
      _message: message,
      _context: sanitized as any,
    });
    if (error) {
      console.warn("[SystemLogs] Gagal mencatat log sistem:", error.message);
    }
  } catch (err) {
    // Fail-safe: logging failure must never crash the app
    console.error("[SystemLogs] Error logSystemEvent:", err);
  }
}

/**
 * Mengambil ringkasan statistik operasional untuk Admin.
 */
export async function getAdminStats(): Promise<AdminStats> {
  try {
    const { data, error } = await supabase.rpc("get_admin_dashboard_stats");
    if (error) {
      console.warn("[AdminStore] Gagal memanggil get_admin_dashboard_stats:", error.message);
      // Fallback query langsung jika RPC gagal
      return await getAdminStatsFallback();
    }

    const res = data as any;
    return {
      totalUsers: Number(res?.total_users ?? 0),
      totalTeachers: Number(res?.total_teachers ?? 0),
      totalStudents: Number(res?.total_students ?? 0),
      totalAdmins: Number(res?.total_admins ?? 0),
      totalClasses: Number(res?.total_classes ?? 0),
      totalModules: Number(res?.total_modules ?? 0),
      totalAssignments: Number(res?.total_assignments ?? 0),
      pendingTeachers: Number(res?.pending_teachers ?? 0),
    };
  } catch (err) {
    console.error("[AdminStore] Error getAdminStats:", err);
    return await getAdminStatsFallback();
  }
}

async function getAdminStatsFallback(): Promise<AdminStats> {
  try {
    const [profilesRes, kelasRes, modulsRes, penugasanRes] = await Promise.all([
      supabase.from("profiles").select("role, status_verifikasi"),
      supabase.from("kelas").select("id", { count: "exact", head: true }),
      supabase.from("moduls").select("id", { count: "exact", head: true }),
      supabase.from("penugasan").select("id", { count: "exact", head: true }),
    ]);

    const profiles = profilesRes.data || [];
    const totalTeachers = profiles.filter((p) => p.role === "guru").length;
    const totalStudents = profiles.filter((p) => p.role === "siswa").length;
    const totalAdmins = profiles.filter((p) => p.role === "admin").length;
    const pendingTeachers = profiles.filter(
      (p) => p.role === "guru" && p.status_verifikasi === "menunggu",
    ).length;

    return {
      totalUsers: profiles.length,
      totalTeachers,
      totalStudents,
      totalAdmins,
      totalClasses: kelasRes.count ?? 0,
      totalModules: modulsRes.count ?? 0,
      totalAssignments: penugasanRes.count ?? 0,
      pendingTeachers,
    };
  } catch {
    return {
      totalUsers: 0,
      totalTeachers: 0,
      totalStudents: 0,
      totalAdmins: 0,
      totalClasses: 0,
      totalModules: 0,
      totalAssignments: 0,
      pendingTeachers: 0,
    };
  }
}

/**
 * Mengambil daftar akun guru untuk dimonitor dan diverifikasi oleh Admin.
 */
export async function getTeachersList(): Promise<TeacherAdminItem[]> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, nama, email, nip, sekolah, mapel, telepon, status_verifikasi, created_at")
      .eq("role", "guru")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[AdminStore] Gagal memuat daftar guru dari Supabase:", error.message);
      throw new Error(`Gagal memuat daftar guru dari database: ${error.message}`);
    }

    return (data || []).map((row) => ({
      id: row.id,
      nama: row.nama || "-",
      email: row.email || "-",
      nip: row.nip || "-",
      sekolah: row.sekolah || "-",
      mapel: row.mapel || "-",
      telepon: row.telepon || "-",
      statusVerifikasi: (row.status_verifikasi as any) || "terverifikasi",
      createdAt: row.created_at,
    }));
  } catch (err) {
    console.error("[AdminStore] Error getTeachersList:", err);
    throw err;
  }
}

/**
 * Memperbarui status verifikasi akun guru oleh Admin.
 */
export async function updateTeacherVerification(
  teacherId: string,
  status: "menunggu" | "terverifikasi" | "ditolak",
): Promise<{ ok: boolean; message: string }> {
  try {
    const { data, error } = await supabase.rpc("admin_update_teacher_verification", {
      _teacher_id: teacherId,
      _status: status,
    });

    if (error) {
      return { ok: false, message: error.message };
    }

    return { ok: true, message: `Status guru berhasil diubah menjadi ${status}.` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal memperbarui verifikasi guru.";
    return { ok: false, message: msg };
  }
}

/**
 * Mengambil rekaman log error dan aktivitas sistem untuk Admin.
 */
export async function getSystemLogs(limit = 30): Promise<SystemLogItem[]> {
  try {
    const { data, error } = await supabase
      .from("system_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[AdminStore] Gagal memuat system_logs dari Supabase:", error.message);
      throw new Error(`Gagal memuat log sistem dari database: ${error.message}`);
    }

    return (data || []).map((row) => ({
      id: row.id,
      level: row.level as any,
      eventType: row.event_type,
      message: row.message,
      context: (row.context as Record<string, unknown>) || {},
      createdAt: row.created_at,
    }));
  } catch (err) {
    console.error("[AdminStore] Error getSystemLogs:", err);
    throw err;
  }
}

export interface TeacherClassItem {
  id: string;
  namaKelas: string;
  tingkat: string;
  mapel: string;
  tahunAjaran: string;
  kodeKelas: string;
  jumlahSiswa: number;
}

/**
 * Mengambil daftar kelas yang diampu oleh seorang guru (untuk inspeksi admin).
 */
export async function getTeacherClasses(teacherId: string): Promise<TeacherClassItem[]> {
  try {
    const { data: kelasRows, error: kError } = await supabase
      .from("kelas")
      .select("id, nama_kelas, tingkat, mapel, tahun_ajaran, kode_kelas")
      .eq("guru_id", teacherId)
      .order("created_at", { ascending: false });

    if (kError) {
      console.error("[AdminStore] Gagal mengambil kelas guru:", kError.message);
      return [];
    }

    const { data: anggotaRows } = await supabase
      .from("kelas_anggota")
      .select("kelas_id")
      .eq("status", "aktif");

    const counts: Record<string, number> = {};
    for (const a of anggotaRows || []) {
      counts[a.kelas_id] = (counts[a.kelas_id] || 0) + 1;
    }

    return (kelasRows || []).map((k) => ({
      id: k.id,
      namaKelas: k.nama_kelas,
      tingkat: k.tingkat,
      mapel: k.mapel,
      tahunAjaran: k.tahun_ajaran,
      kodeKelas: k.kode_kelas,
      jumlahSiswa: counts[k.id] || 0,
    }));
  } catch (err) {
    console.error("[AdminStore] Error getTeacherClasses:", err);
    return [];
  }
}

/**
 * Memperbarui data profil guru oleh Admin.
 */
export async function adminUpdateTeacherProfile(
  teacherId: string,
  data: {
    nama: string;
    nip: string;
    sekolah: string;
    mapel: string;
    telepon: string;
  },
): Promise<{ ok: boolean; message: string }> {
  try {
    const { error } = await supabase.rpc("admin_update_teacher_profile", {
      _teacher_id: teacherId,
      _nama: data.nama.trim(),
      _nip: data.nip.trim(),
      _sekolah: data.sekolah.trim(),
      _mapel: data.mapel.trim(),
      _telepon: data.telepon.trim(),
    });

    if (error) {
      return { ok: false, message: error.message };
    }

    return { ok: true, message: `Data guru ${data.nama} berhasil diperbarui.` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal memperbarui profil guru.";
    return { ok: false, message: msg };
  }
}

/**
 * Mengirimkan tautan reset kata sandi resmi ke email guru via Supabase Auth.
 */
export async function sendTeacherPasswordReset(
  email: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      return { ok: false, message: "Alamat email tidak valid." };
    }

    const redirectUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/login`
        : undefined;

    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: redirectUrl,
    });

    if (error) {
      return { ok: false, message: error.message };
    }

    await logSystemEvent(
      "info",
      "admin_triggered_password_reset",
      `Admin mengirim permintaan reset password untuk email: ${cleanEmail}`,
      { email: cleanEmail },
    );

    return {
      ok: true,
      message: `Tautan reset kata sandi telah dikirim ke ${cleanEmail}. Guru dapat memeriksa kotak masuk emailnya.`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal mengirim permintaan reset password.";
    return { ok: false, message: msg };
  }
}

/**
 * Menghapus akun guru secara permanen beserta seluruh data terkait (kelas, modul, penugasan).
 * Membutuhkan hak akses Administrator (is_admin()).
 */
export async function adminDeleteTeacher(
  teacherId: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    if (!teacherId) {
      return { ok: false, message: "ID Guru tidak valid." };
    }

    const { data, error } = await supabase.rpc("admin_delete_teacher", {
      _teacher_id: teacherId,
    });

    if (error) {
      return { ok: false, message: error.message };
    }

    const res = data as { success?: boolean; message?: string } | null;
    return {
      ok: res?.success ?? true,
      message: res?.message ?? "Akun guru berhasil dihapus secara permanen.",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal menghapus akun guru.";
    return { ok: false, message: msg };
  }
}

