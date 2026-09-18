-- GuruPro Security & Data Integrity Migration
-- Date: 2026-09-15

-- 1. PROFILES TABLE HARDENING & DEDICATED NISN
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nisn text NOT NULL DEFAULT '';

-- Safely migrate existing student NISN from 'nip' to 'nisn'
UPDATE public.profiles
SET nisn = nip, nip = ''
WHERE role = 'siswa' AND (nisn = '' OR nisn IS NULL) AND nip != '';

-- Remove default 'guru' role to prevent role escalation on unspecified input
ALTER TABLE public.profiles ALTER COLUMN role DROP DEFAULT;

-- Revoke anonymous access to profiles; only authenticated users may select profiles
REVOKE ALL ON public.profiles FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

DROP POLICY IF EXISTS "read profiles" ON public.profiles;
CREATE POLICY "read profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (true);

-- 2. KELAS TABLE RLS & CLASS LOOKUP PRIVACY
REVOKE ALL ON public.kelas FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kelas TO authenticated;
GRANT ALL ON public.kelas TO service_role;

DROP POLICY IF EXISTS "kelas readable for invitation lookup" ON public.kelas;

DROP POLICY IF EXISTS "guru select own kelas" ON public.kelas;
CREATE POLICY "guru select own kelas" ON public.kelas
  FOR SELECT TO authenticated
  USING (auth.uid() = guru_id);

DROP POLICY IF EXISTS "siswa select joined kelas" ON public.kelas;
CREATE POLICY "siswa select joined kelas" ON public.kelas
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.kelas_anggota ka
      WHERE ka.kelas_id = id AND ka.siswa_id = auth.uid()
    )
  );

-- 3. KELAS_ANGGOTA (MEMBERSHIP) AUTHORIZATION
-- Students MUST NOT be able to update their own membership status
DROP POLICY IF EXISTS "siswa update own membership" ON public.kelas_anggota;

-- Students may only insert a join request for themselves with status 'menunggu'
DROP POLICY IF EXISTS "siswa insert own membership" ON public.kelas_anggota;
CREATE POLICY "siswa insert own membership" ON public.kelas_anggota
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = siswa_id
    AND status = 'menunggu'
    AND (jenis = 'tambah-kelas' OR jenis = 'akun-baru')
  );

-- Teachers can update membership only for classes they own
DROP POLICY IF EXISTS "guru update membership of own kelas" ON public.kelas_anggota;
CREATE POLICY "guru update membership of own kelas" ON public.kelas_anggota
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.kelas k WHERE k.id = kelas_id AND k.guru_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.kelas k WHERE k.id = kelas_id AND k.guru_id = auth.uid())
  );

-- Teachers can delete membership only for classes they own
DROP POLICY IF EXISTS "guru delete membership of own kelas" ON public.kelas_anggota;
CREATE POLICY "guru delete membership of own kelas" ON public.kelas_anggota
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.kelas k WHERE k.id = kelas_id AND k.guru_id = auth.uid())
  );

-- 4. PUBLIC CLASS LOOKUP RPC (MINIMAL EXPOSURE)
CREATE OR REPLACE FUNCTION public.cari_kelas_by_kode(_kode text)
RETURNS TABLE (
  id uuid,
  nama_kelas text,
  tingkat text,
  mapel text,
  tahun_ajaran text,
  kode_kelas text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT k.id, k.nama_kelas, k.tingkat, k.mapel, k.tahun_ajaran, k.kode_kelas
  FROM public.kelas k
  WHERE UPPER(k.kode_kelas) = UPPER(TRIM(_kode))
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cari_kelas_by_kode(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cari_kelas_by_kode(text) FROM anon;
