-- ====================================================================
-- GURUPRO MIGRATION: FIX CROSS-TABLE RLS RECURSION & INSERT POLICIES
-- Date: 2026-09-18
-- ====================================================================

-- 1. SECURITY DEFINER HELPER FUNCTIONS (Eliminates Cross-Table RLS Recursion)
CREATE OR REPLACE FUNCTION public.is_guru_of_kelas(p_kelas_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.kelas WHERE id = p_kelas_id AND guru_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_siswa_of_kelas(p_kelas_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.kelas_anggota
    WHERE kelas_id = p_kelas_id AND siswa_id = auth.uid() AND status = 'aktif'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_siswa_eligible_for_modul(p_modul_user_id uuid, p_modul_kelas_id uuid, p_modul_kelas text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.kelas_anggota ka
    JOIN public.kelas k ON k.id = ka.kelas_id
    WHERE ka.siswa_id = auth.uid()
      AND ka.status = 'aktif'
      AND k.guru_id = p_modul_user_id
      AND (
        p_modul_kelas_id = k.id
        OR (
          p_modul_kelas_id IS NULL AND (
            UPPER(k.tingkat) = UPPER(p_modul_kelas)
            OR UPPER(k.nama_kelas) = UPPER(p_modul_kelas)
            OR UPPER(k.tingkat || ' ' || k.nama_kelas) = UPPER(p_modul_kelas)
            OR p_modul_kelas = ''
            OR p_modul_kelas IS NULL
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_siswa_eligible_for_paket_soal(p_paket_soal_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.penugasan p
    JOIN public.kelas_anggota ka ON ka.kelas_id = p.kelas_id
    WHERE p.paket_soal_id = p_paket_soal_id
      AND p.status = ANY (ARRAY['published'::text, 'closed'::text])
      AND ka.siswa_id = auth.uid()
      AND ka.status = 'aktif'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_siswa_can_submit(p_penugasan_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.penugasan p
    JOIN public.kelas_anggota ka ON ka.kelas_id = p.kelas_id
    WHERE p.id = p_penugasan_id
      AND p.status = 'published'
      AND ka.siswa_id = auth.uid()
      AND ka.status = 'aktif'
      AND (p.deadline IS NULL OR p.deadline > now())
  );
$$;

-- 2. KELAS Policies
DROP POLICY IF EXISTS "siswa select joined kelas" ON public.kelas;
CREATE POLICY "siswa select joined kelas" ON public.kelas
  FOR SELECT TO authenticated
  USING (public.is_siswa_of_kelas(id));

-- 3. KELAS_ANGGOTA Policies
DROP POLICY IF EXISTS "guru select membership of own kelas" ON public.kelas_anggota;
CREATE POLICY "guru select membership of own kelas" ON public.kelas_anggota
  FOR SELECT TO authenticated
  USING (public.is_guru_of_kelas(kelas_id));

DROP POLICY IF EXISTS "guru update membership of own kelas" ON public.kelas_anggota;
CREATE POLICY "guru update membership of own kelas" ON public.kelas_anggota
  FOR UPDATE TO authenticated
  USING (public.is_guru_of_kelas(kelas_id))
  WITH CHECK (public.is_guru_of_kelas(kelas_id));

DROP POLICY IF EXISTS "guru delete membership of own kelas" ON public.kelas_anggota;
CREATE POLICY "guru delete membership of own kelas" ON public.kelas_anggota
  FOR DELETE TO authenticated
  USING (public.is_guru_of_kelas(kelas_id));

DROP POLICY IF EXISTS "admin_all_kelas_anggota" ON public.kelas_anggota;
CREATE POLICY "admin_all_kelas_anggota" ON public.kelas_anggota
  FOR ALL TO authenticated
  USING (public.is_admin());

-- 4. MODULS Policies
DROP POLICY IF EXISTS "guru_insert_own_moduls" ON public.moduls;
CREATE POLICY "guru_insert_own_moduls" ON public.moduls
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.get_current_user_role() = 'guru');

DROP POLICY IF EXISTS "siswa_select_class_moduls" ON public.moduls;
CREATE POLICY "siswa_select_class_moduls" ON public.moduls
  FOR SELECT TO authenticated
  USING (status = 'Terbit' AND public.is_siswa_eligible_for_modul(user_id, kelas_id, kelas));

-- 5. PAKET_SOAL Policies
DROP POLICY IF EXISTS "guru_insert_own_paket_soal" ON public.paket_soal;
CREATE POLICY "guru_insert_own_paket_soal" ON public.paket_soal
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.get_current_user_role() = 'guru');

DROP POLICY IF EXISTS "siswa_select_assigned_paket_soal" ON public.paket_soal;
CREATE POLICY "siswa_select_assigned_paket_soal" ON public.paket_soal
  FOR SELECT TO authenticated
  USING (status = 'Terbit' AND public.is_siswa_eligible_for_paket_soal(id));

DROP POLICY IF EXISTS "admin_select_paket_soal" ON public.paket_soal;
CREATE POLICY "admin_select_paket_soal" ON public.paket_soal
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- 6. PENUGASAN Policies
DROP POLICY IF EXISTS "guru insert own penugasan" ON public.penugasan;
CREATE POLICY "guru insert own penugasan" ON public.penugasan
  FOR INSERT TO authenticated
  WITH CHECK (
    guru_id = auth.uid() 
    AND public.is_guru_of_kelas(penugasan.kelas_id)
    AND EXISTS (
      SELECT 1 FROM public.paket_soal ps 
      WHERE ps.id = penugasan.paket_soal_id AND ps.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "guru update own penugasan" ON public.penugasan;
CREATE POLICY "guru update own penugasan" ON public.penugasan
  FOR UPDATE TO authenticated
  USING (guru_id = auth.uid())
  WITH CHECK (
    guru_id = auth.uid() 
    AND public.is_guru_of_kelas(penugasan.kelas_id)
    AND EXISTS (
      SELECT 1 FROM public.paket_soal ps 
      WHERE ps.id = penugasan.paket_soal_id AND ps.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "siswa select published penugasan of joined kelas" ON public.penugasan;
CREATE POLICY "siswa select published penugasan of joined kelas" ON public.penugasan
  FOR SELECT TO authenticated
  USING (
    status = ANY (ARRAY['published'::text, 'closed'::text])
    AND public.is_siswa_of_kelas(penugasan.kelas_id)
  );

-- 7. PENUGASAN_PENGUMPULAN Policies
DROP POLICY IF EXISTS "siswa insert own draft pengumpulan" ON public.penugasan_pengumpulan;
CREATE POLICY "siswa insert own draft pengumpulan" ON public.penugasan_pengumpulan
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = siswa_id 
    AND status = 'draft'
    AND public.is_siswa_can_submit(penugasan_id)
  );
