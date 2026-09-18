-- ====================================================================
-- GURUPRO MIGRATION: DASHBOARD, ADMIN SYSTEM, LOGS & ROLE ISOLATION
-- ====================================================================

-- 1. Status verifikasi guru di profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS status_verifikasi TEXT NOT NULL DEFAULT 'terverifikasi'
CHECK (status_verifikasi IN ('menunggu', 'terverifikasi', 'ditolak'));

-- 2. Tabel system_logs
CREATE TABLE IF NOT EXISTS public.system_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error', 'auth_failure')),
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index untuk sorting/filter performa
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON public.system_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_level ON public.system_logs(level);

-- RLS pada system_logs
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

-- Hanya admin yang boleh membaca logs
DROP POLICY IF EXISTS "admin_read_system_logs" ON public.system_logs;
CREATE POLICY "admin_read_system_logs"
ON public.system_logs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
  )
);

-- 3. Sanitized log_system_event function
CREATE OR REPLACE FUNCTION public.log_system_event(
  _level text,
  _event_type text,
  _message text,
  _context jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _log_id uuid;
  _sanitized_context jsonb;
BEGIN
  -- Validasi level
  IF _level NOT IN ('info', 'warn', 'error', 'auth_failure') THEN
    _level := 'error';
  END IF;

  -- Sanitasi data sensitif: hapus token, password, secret, kunci, authorization, cookie
  _sanitized_context := _context - 'password' - 'kata_sandi' - 'token' - 'secret' - 'authorization' - 'kunci' - 'cookie';

  INSERT INTO public.system_logs (level, event_type, message, context, created_at)
  VALUES (_level, _event_type, _message, coalesce(_sanitized_context, '{}'::jsonb), now())
  RETURNING id INTO _log_id;

  RETURN _log_id;
END;
$$;

-- Grant access ke log_system_event
GRANT EXECUTE ON FUNCTION public.log_system_event(text, text, text, jsonb) TO anon, authenticated;

-- 4. RLS moduls untuk Siswa membaca modul terbit milik guru kelasnya
DROP POLICY IF EXISTS "student_read_published_moduls" ON public.moduls;
CREATE POLICY "student_read_published_moduls"
ON public.moduls
FOR SELECT
TO authenticated
USING (
  status = 'Terbit' AND (
    EXISTS (
      SELECT 1 FROM public.kelas_anggota ka
      JOIN public.kelas k ON k.id = ka.kelas_id
      WHERE ka.siswa_id = auth.uid()
        AND ka.status = 'aktif'
        AND k.guru_id = moduls.user_id
    )
  )
);

-- RLS moduls untuk Admin
DROP POLICY IF EXISTS "admin_read_moduls" ON public.moduls;
CREATE POLICY "admin_read_moduls"
ON public.moduls
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
  )
);

-- 5. RLS kelas untuk Admin
DROP POLICY IF EXISTS "admin_select_all_kelas" ON public.kelas;
CREATE POLICY "admin_select_all_kelas"
ON public.kelas
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
  )
);

-- 6. RPC Admin Dashboard Stats
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_admin boolean;
  _stats jsonb;
BEGIN
  -- Cek apakah pemanggil adalah admin
  SELECT (role = 'admin') INTO _is_admin
  FROM public.profiles
  WHERE id = auth.uid();

  IF coalesce(_is_admin, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Akses ditolak. Hanya admin yang berhak mengakses fungsi ini.';
  END IF;

  SELECT jsonb_build_object(
    'total_users', (SELECT count(*) FROM public.profiles),
    'total_teachers', (SELECT count(*) FROM public.profiles WHERE role = 'guru'),
    'total_students', (SELECT count(*) FROM public.profiles WHERE role = 'siswa'),
    'total_admins', (SELECT count(*) FROM public.profiles WHERE role = 'admin'),
    'total_classes', (SELECT count(*) FROM public.kelas),
    'total_modules', (SELECT count(*) FROM public.moduls),
    'total_assignments', (SELECT count(*) FROM public.penugasan),
    'pending_teachers', (SELECT count(*) FROM public.profiles WHERE role = 'guru' AND status_verifikasi = 'menunggu')
  ) INTO _stats;

  RETURN _stats;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_stats() TO authenticated;

-- 7. RPC Admin Update Teacher Verification
CREATE OR REPLACE FUNCTION public.admin_update_teacher_verification(
  _teacher_id uuid,
  _status text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_admin boolean;
BEGIN
  SELECT (role = 'admin') INTO _is_admin
  FROM public.profiles
  WHERE id = auth.uid();

  IF coalesce(_is_admin, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Akses ditolak. Hanya admin yang berwenang mengubah status verifikasi.';
  END IF;

  IF _status NOT IN ('menunggu', 'terverifikasi', 'ditolak') THEN
    RAISE EXCEPTION 'Status verifikasi tidak valid. Pilihan: menunggu, terverifikasi, ditolak.';
  END IF;

  UPDATE public.profiles
  SET status_verifikasi = _status,
      updated_at = now()
  WHERE id = _teacher_id AND role = 'guru';

  -- Log kegiatan
  PERFORM public.log_system_event(
    'info',
    'teacher_verification_update',
    'Admin mengubah status verifikasi guru menjadi ' || _status,
    jsonb_build_object('teacher_id', _teacher_id, 'new_status', _status)
  );

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_teacher_verification(uuid, text) TO authenticated;
