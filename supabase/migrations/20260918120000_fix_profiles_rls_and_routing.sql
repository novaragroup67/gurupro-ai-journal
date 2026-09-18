-- ====================================================================
-- GURUPRO MIGRATION: FIX PROFILES RLS INFINITE RECURSION & ROUTING
-- Date: 2026-09-18
-- ====================================================================

-- 1. SECURITY DEFINER HELPER FUNCTIONS (Eliminates RLS Recursion)
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_teacher_of_student(teacher_id uuid, student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.kelas k
    JOIN public.kelas_anggota ka ON ka.kelas_id = k.id
    WHERE k.guru_id = teacher_id AND ka.siswa_id = student_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_student_of_teacher(student_id uuid, teacher_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.kelas k
    JOIN public.kelas_anggota ka ON ka.kelas_id = k.id
    WHERE ka.siswa_id = student_id AND ka.status = 'aktif' AND k.guru_id = teacher_id
  );
$$;

-- 2. UPDATE PROFILES RLS POLICIES
DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
CREATE POLICY "profiles_select_admin" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "profiles_select_teacher_students" ON public.profiles;
CREATE POLICY "profiles_select_teacher_students" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_teacher_of_student(auth.uid(), profiles.id));

DROP POLICY IF EXISTS "profiles_select_student_teachers" ON public.profiles;
CREATE POLICY "profiles_select_student_teachers" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_student_of_teacher(auth.uid(), profiles.id));

-- Add INSERT policy for authenticated users inserting their own profile
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

-- 3. UPDATE KELAS, MODULS, SYSTEM_LOGS POLICIES TO USE HELPER FUNCTIONS
DROP POLICY IF EXISTS "admin_select_all_kelas" ON public.kelas;
CREATE POLICY "admin_select_all_kelas" ON public.kelas
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "admin_read_system_logs" ON public.system_logs;
CREATE POLICY "admin_read_system_logs" ON public.system_logs
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "admin_select_moduls" ON public.moduls;
CREATE POLICY "admin_select_moduls" ON public.moduls
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "guru_select_own_moduls" ON public.moduls;
CREATE POLICY "guru_select_own_moduls" ON public.moduls
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND public.get_current_user_role() = 'guru');

DROP POLICY IF EXISTS "guru_update_own_moduls" ON public.moduls;
CREATE POLICY "guru_update_own_moduls" ON public.moduls
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND public.get_current_user_role() = 'guru');

DROP POLICY IF EXISTS "guru_delete_own_moduls" ON public.moduls;
CREATE POLICY "guru_delete_own_moduls" ON public.moduls
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND public.get_current_user_role() = 'guru');

DROP POLICY IF EXISTS "guru_select_own_paket_soal" ON public.paket_soal;
CREATE POLICY "guru_select_own_paket_soal" ON public.paket_soal
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND public.get_current_user_role() = 'guru');

DROP POLICY IF EXISTS "guru_update_own_paket_soal" ON public.paket_soal;
CREATE POLICY "guru_update_own_paket_soal" ON public.paket_soal
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND public.get_current_user_role() = 'guru');

DROP POLICY IF EXISTS "guru_delete_own_paket_soal" ON public.paket_soal;
CREATE POLICY "guru_delete_own_paket_soal" ON public.paket_soal
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND public.get_current_user_role() = 'guru');

-- 4. AUTOMATIC USER PROFILE TRIGGER
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_status text;
BEGIN
  IF new.raw_user_meta_data->>'role' = 'siswa' THEN
    v_role := 'siswa';
    v_status := 'terverifikasi';
  ELSE
    v_role := 'guru';
    v_status := 'menunggu';
  END IF;

  INSERT INTO public.profiles (
    id,
    nama,
    email,
    nip,
    nisn,
    sekolah,
    mapel,
    kelas,
    telepon,
    bio,
    role,
    status_verifikasi
  )
  VALUES (
    new.id,
    COALESCE(NULLIF(new.raw_user_meta_data->>'nama', ''), split_part(new.email, '@', 1)),
    COALESCE(new.email, ''),
    COALESCE(new.raw_user_meta_data->>'nip', ''),
    COALESCE(new.raw_user_meta_data->>'nisn', ''),
    COALESCE(new.raw_user_meta_data->>'sekolah', ''),
    COALESCE(new.raw_user_meta_data->>'mapel', ''),
    COALESCE(new.raw_user_meta_data->>'jenjang', new.raw_user_meta_data->>'kelas', ''),
    COALESCE(new.raw_user_meta_data->>'telepon', ''),
    '',
    v_role,
    v_status
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    nama = CASE WHEN public.profiles.nama = '' THEN EXCLUDED.nama ELSE public.profiles.nama END;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 5. COMPATIBILITY BACKFILL FOR EXISTING AUTH USERS WITHOUT PROFILES
INSERT INTO public.profiles (
  id,
  nama,
  email,
  nip,
  nisn,
  sekolah,
  mapel,
  kelas,
  telepon,
  bio,
  role,
  status_verifikasi
)
SELECT
  u.id,
  COALESCE(NULLIF(u.raw_user_meta_data->>'nama', ''), split_part(u.email, '@', 1)),
  COALESCE(u.email, ''),
  COALESCE(u.raw_user_meta_data->>'nip', ''),
  COALESCE(u.raw_user_meta_data->>'nisn', ''),
  COALESCE(u.raw_user_meta_data->>'sekolah', ''),
  COALESCE(u.raw_user_meta_data->>'mapel', ''),
  COALESCE(u.raw_user_meta_data->>'jenjang', u.raw_user_meta_data->>'kelas', ''),
  COALESCE(u.raw_user_meta_data->>'telepon', ''),
  '',
  CASE
    -- 1. Trusted database evidence as Guru
    WHEN EXISTS (SELECT 1 FROM public.kelas k WHERE k.guru_id = u.id) THEN 'guru'
    WHEN EXISTS (SELECT 1 FROM public.moduls m WHERE m.user_id = u.id) THEN 'guru'
    WHEN EXISTS (SELECT 1 FROM public.paket_soal ps WHERE ps.user_id = u.id) THEN 'guru'
    -- 2. Trusted database evidence as Siswa
    WHEN EXISTS (SELECT 1 FROM public.kelas_anggota ka WHERE ka.siswa_id = u.id) THEN 'siswa'
    WHEN EXISTS (SELECT 1 FROM public.penugasan_pengumpulan pp WHERE pp.siswa_id = u.id) THEN 'siswa'
    -- 3. If registered via registration form, initial role assignment
    WHEN u.raw_user_meta_data->>'role' = 'siswa' THEN 'siswa'
    WHEN u.raw_user_meta_data->>'role' = 'guru' THEN 'guru'
    ELSE ''
  END,
  CASE
    WHEN EXISTS (SELECT 1 FROM public.kelas_anggota ka WHERE ka.siswa_id = u.id) OR u.raw_user_meta_data->>'role' = 'siswa' THEN 'terverifikasi'
    ELSE 'menunggu'
  END
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = u.id
)
ON CONFLICT (id) DO NOTHING;
