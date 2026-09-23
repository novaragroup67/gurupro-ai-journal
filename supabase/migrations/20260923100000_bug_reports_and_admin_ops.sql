-- ====================================================================
-- GURUPRO MIGRATION: BUG REPORTS & ADMIN OPERATIONS ENHANCEMENT
-- ====================================================================

-- 1. Create table public.bug_reports
CREATE TABLE IF NOT EXISTS public.bug_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reporter_role TEXT NOT NULL DEFAULT 'guru' CHECK (reporter_role IN ('guru', 'siswa', 'admin')),
  reporter_name TEXT NOT NULL DEFAULT '',
  reporter_email TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  route TEXT,
  priority TEXT NOT NULL DEFAULT 'sedang' CHECK (priority IN ('rendah', 'sedang', 'tinggi', 'kritis')),
  status TEXT NOT NULL DEFAULT 'baru' CHECK (status IN ('baru', 'diproses', 'selesai')),
  admin_notes TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for querying and filtering bug reports
CREATE INDEX IF NOT EXISTS idx_bug_reports_reporter_id ON public.bug_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_bug_reports_status ON public.bug_reports(status);
CREATE INDEX IF NOT EXISTS idx_bug_reports_created_at ON public.bug_reports(created_at DESC);

-- Enable RLS on bug_reports
ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "users_insert_own_bug_reports" ON public.bug_reports;
DROP POLICY IF EXISTS "reporters_and_admins_select_bug_reports" ON public.bug_reports;
DROP POLICY IF EXISTS "admins_update_bug_reports" ON public.bug_reports;
DROP POLICY IF EXISTS "admins_delete_bug_reports" ON public.bug_reports;

-- Policy 1: Authenticated users can insert their own reports (reporter_id must match auth.uid())
CREATE POLICY "users_insert_own_bug_reports"
ON public.bug_reports
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL AND reporter_id = auth.uid()
);

-- Policy 2: Reporters can select their own reports; Admins can select all reports
CREATE POLICY "reporters_and_admins_select_bug_reports"
ON public.bug_reports
FOR SELECT
TO authenticated
USING (
  auth.uid() = reporter_id
  OR is_admin()
);

-- Policy 3: Only Admins can update bug reports (e.g. status, admin_notes, resolved_at)
CREATE POLICY "admins_update_bug_reports"
ON public.bug_reports
FOR UPDATE
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

-- Policy 4: Only Admins can delete bug reports
CREATE POLICY "admins_delete_bug_reports"
ON public.bug_reports
FOR DELETE
TO authenticated
USING (is_admin());

-- 2. RPC submit_bug_report: Secure submission with server-derived identity
CREATE OR REPLACE FUNCTION public.submit_bug_report(
  _title text,
  _description text,
  _route text DEFAULT NULL,
  _priority text DEFAULT 'sedang'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid;
  _role text;
  _name text;
  _email text;
  _report_id uuid;
BEGIN
  _uid := auth.uid();
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Akses ditolak. Pengguna harus login untuk mengirim laporan.';
  END IF;

  IF coalesce(trim(_title), '') = '' THEN
    RAISE EXCEPTION 'Judul laporan tidak boleh kosong.';
  END IF;

  IF coalesce(trim(_description), '') = '' THEN
    RAISE EXCEPTION 'Deskripsi kendala tidak boleh kosong.';
  END IF;

  IF _priority NOT IN ('rendah', 'sedang', 'tinggi', 'kritis') THEN
    _priority := 'sedang';
  END IF;

  -- Server-side SSOT: fetch reporter details from profiles
  SELECT role, nama, email INTO _role, _name, _email
  FROM public.profiles
  WHERE id = _uid;

  INSERT INTO public.bug_reports (
    reporter_id,
    reporter_role,
    reporter_name,
    reporter_email,
    title,
    description,
    route,
    priority,
    status,
    created_at,
    updated_at
  ) VALUES (
    _uid,
    coalesce(_role, 'guru'),
    coalesce(_name, 'Pengguna'),
    coalesce(_email, ''),
    trim(_title),
    trim(_description),
    _route,
    _priority,
    'baru',
    now(),
    now()
  )
  RETURNING id INTO _report_id;

  -- Log system event
  PERFORM public.log_system_event(
    'info',
    'bug_report_created',
    'Laporan kendala baru: ' || trim(_title),
    jsonb_build_object('report_id', _report_id, 'reporter_id', _uid, 'priority', _priority, 'route', _route)
  );

  RETURN _report_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_bug_report(text, text, text, text) TO authenticated;

-- 3. RPC admin_update_teacher_profile: Admin editing teacher profile
CREATE OR REPLACE FUNCTION public.admin_update_teacher_profile(
  _teacher_id uuid,
  _nama text,
  _nip text,
  _sekolah text,
  _mapel text,
  _telepon text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Akses ditolak. Hanya administrator yang berwenang mengubah profil pengajar.';
  END IF;

  UPDATE public.profiles
  SET nama = _nama,
      nip = _nip,
      sekolah = _sekolah,
      mapel = _mapel,
      telepon = _telepon,
      updated_at = now()
  WHERE id = _teacher_id AND role = 'guru';

  PERFORM public.log_system_event(
    'info',
    'teacher_profile_updated_by_admin',
    'Admin memperbarui profil guru: ' || coalesce(_nama, ''),
    jsonb_build_object('teacher_id', _teacher_id, 'nama', _nama)
  );

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_teacher_profile(uuid, text, text, text, text, text) TO authenticated;
