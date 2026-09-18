-- ====================================================================
-- GURUPRO MIGRATION: SECURITY & DATA INTEGRITY REMEDIATION
-- Date: 2026-09-18
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. PROFILES: ROLE & PRIVACY HARDENING
-- --------------------------------------------------------------------

-- Default status_verifikasi guru adalah 'menunggu'
ALTER TABLE public.profiles 
  ALTER COLUMN status_verifikasi SET DEFAULT 'menunggu';

-- Trigger guard: cegah perubahan role & status_verifikasi oleh user biasa
CREATE OR REPLACE FUNCTION public.handle_profile_security_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
BEGIN
  -- Dapatkan role pemanggil jika terautentikasi
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();

  IF TG_OP = 'INSERT' THEN
    -- Guru baru wajib berstatus 'menunggu'
    IF NEW.role = 'guru' THEN
      NEW.status_verifikasi := 'menunggu';
    ELSIF NEW.role = 'siswa' THEN
      NEW.status_verifikasi := 'terverifikasi';
    END IF;

    -- Cegah pembuatan role admin secara langsung dari client
    IF NEW.role NOT IN ('guru', 'siswa') THEN
      NEW.role := 'siswa';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Hanya admin yang boleh mengubah role atau status_verifikasi
    IF (v_caller_role IS NULL OR v_caller_role != 'admin') THEN
      IF NEW.role IS DISTINCT FROM OLD.role THEN
        RAISE EXCEPTION 'Peran pengguna (role) tidak dapat diubah sendiri.';
      END IF;
      IF NEW.status_verifikasi IS DISTINCT FROM OLD.status_verifikasi THEN
        RAISE EXCEPTION 'Status verifikasi akun hanya dapat diubah oleh administrator.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profile_security_guard ON public.profiles;
CREATE TRIGGER trg_profile_security_guard
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_profile_security_guard();

-- RLS Privasi Profiles
DROP POLICY IF EXISTS "read profiles" ON public.profiles;
DROP POLICY IF EXISTS "own profile" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_teacher_students" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_student_teachers" ON public.profiles;

-- 1. Pengguna membaca & memperbarui profilnya sendiri
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 2. Admin membaca semua profil
CREATE POLICY "profiles_select_admin" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- 3. Guru dapat melihat profil siswa yang bergabung atau mendaftar di kelasnya
CREATE POLICY "profiles_select_teacher_students" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.kelas k
      JOIN public.kelas_anggota ka ON ka.kelas_id = k.id
      WHERE k.guru_id = auth.uid() AND ka.siswa_id = profiles.id
    )
  );

-- 4. Siswa dapat melihat profil guru pengampu kelasnya yang aktif
CREATE POLICY "profiles_select_student_teachers" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.kelas k
      JOIN public.kelas_anggota ka ON ka.kelas_id = k.id
      WHERE ka.siswa_id = auth.uid() AND ka.status = 'aktif' AND k.guru_id = profiles.id
    )
  );


-- --------------------------------------------------------------------
-- 2. MODUL & PAKET SOAL: ROLE ENFORCEMENT (STUDENT READ-ONLY)
-- --------------------------------------------------------------------

-- Kolom relasi kelas_id opsional pada moduls
ALTER TABLE public.moduls 
  ADD COLUMN IF NOT EXISTS kelas_id UUID REFERENCES public.kelas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_moduls_kelas_id ON public.moduls(kelas_id);

-- Bersihkan policies lama
DROP POLICY IF EXISTS "own moduls" ON public.moduls;
DROP POLICY IF EXISTS "student_read_published_moduls" ON public.moduls;
DROP POLICY IF EXISTS "admin_read_moduls" ON public.moduls;
DROP POLICY IF EXISTS "guru_select_own_moduls" ON public.moduls;
DROP POLICY IF EXISTS "guru_insert_own_moduls" ON public.moduls;
DROP POLICY IF EXISTS "guru_update_own_moduls" ON public.moduls;
DROP POLICY IF EXISTS "guru_delete_own_moduls" ON public.moduls;
DROP POLICY IF EXISTS "siswa_select_class_moduls" ON public.moduls;
DROP POLICY IF EXISTS "admin_select_moduls" ON public.moduls;

-- Guru: CRUD modul milik sendiri saja
CREATE POLICY "guru_select_own_moduls" ON public.moduls
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id AND EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'guru'
    )
  );

CREATE POLICY "guru_insert_own_moduls" ON public.moduls
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'guru'
    )
  );

CREATE POLICY "guru_update_own_moduls" ON public.moduls
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id AND EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'guru'
    )
  )
  WITH CHECK (
    auth.uid() = user_id AND EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'guru'
    )
  );

CREATE POLICY "guru_delete_own_moduls" ON public.moduls
  FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id AND EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'guru'
    )
  );

-- Siswa: READ-ONLY pada modul terbit kelasnya yang aktif
CREATE POLICY "siswa_select_class_moduls" ON public.moduls
  FOR SELECT TO authenticated
  USING (
    status = 'Terbit' AND EXISTS (
      SELECT 1 FROM public.kelas_anggota ka
      JOIN public.kelas k ON k.id = ka.kelas_id
      WHERE ka.siswa_id = auth.uid()
        AND ka.status = 'aktif'
        AND k.guru_id = moduls.user_id
        AND (
          moduls.kelas_id = k.id
          OR (
            moduls.kelas_id IS NULL AND (
              UPPER(k.tingkat) = UPPER(moduls.kelas)
              OR UPPER(k.nama_kelas) = UPPER(moduls.kelas)
              OR UPPER(k.tingkat || ' ' || k.nama_kelas) = UPPER(moduls.kelas)
              OR moduls.kelas = ''
              OR moduls.kelas IS NULL
            )
          )
        )
    )
  );

-- Admin: Read all moduls
CREATE POLICY "admin_select_moduls" ON public.moduls
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Hardening paket_soal
DROP POLICY IF EXISTS "own paket soal" ON public.paket_soal;
DROP POLICY IF EXISTS "guru_select_own_paket_soal" ON public.paket_soal;
DROP POLICY IF EXISTS "guru_insert_own_paket_soal" ON public.paket_soal;
DROP POLICY IF EXISTS "guru_update_own_paket_soal" ON public.paket_soal;
DROP POLICY IF EXISTS "guru_delete_own_paket_soal" ON public.paket_soal;
DROP POLICY IF EXISTS "siswa_select_assigned_paket_soal" ON public.paket_soal;

CREATE POLICY "guru_select_own_paket_soal" ON public.paket_soal
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id AND EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'guru'
    )
  );

CREATE POLICY "guru_insert_own_paket_soal" ON public.paket_soal
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'guru'
    )
  );

CREATE POLICY "guru_update_own_paket_soal" ON public.paket_soal
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id AND EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'guru'
    )
  )
  WITH CHECK (
    auth.uid() = user_id AND EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'guru'
    )
  );

CREATE POLICY "guru_delete_own_paket_soal" ON public.paket_soal
  FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id AND EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'guru'
    )
  );

-- Siswa hanya bisa melihat paket_soal terbit yang ditugaskan ke kelasnya
CREATE POLICY "siswa_select_assigned_paket_soal" ON public.paket_soal
  FOR SELECT TO authenticated
  USING (
    status = 'Terbit' AND EXISTS (
      SELECT 1 FROM public.penugasan p
      JOIN public.kelas_anggota ka ON ka.kelas_id = p.kelas_id
      WHERE p.paket_soal_id = paket_soal.id
        AND p.status IN ('published', 'closed')
        AND ka.siswa_id = auth.uid()
        AND ka.status = 'aktif'
    )
  );


-- --------------------------------------------------------------------
-- 3. SUBMISSION & JAWABAN: CLOSE BYPASS PATHS & IMMUTABILITY
-- --------------------------------------------------------------------

-- Cegah siswa mengubah status pengumpulan langsung ke 'submitted' melalui UPDATE
DROP POLICY IF EXISTS "siswa update own draft pengumpulan" ON public.penugasan_pengumpulan;
CREATE POLICY "siswa update own draft pengumpulan" ON public.penugasan_pengumpulan
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = siswa_id AND status = 'draft'
  )
  WITH CHECK (
    auth.uid() = siswa_id
    AND status = 'draft'
    AND EXISTS (
      SELECT 1 FROM public.penugasan p
      WHERE p.id = penugasan_pengumpulan.penugasan_id
        AND (p.deadline IS NULL OR p.deadline > now())
    )
  );

-- Trigger keamanan integritas jawaban (penugasan_jawaban)
CREATE OR REPLACE FUNCTION public.handle_jawaban_security_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_deadline timestamptz;
  v_guru_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Immutabilitas pengumpulan_id dan soal_id
    IF NEW.pengumpulan_id != OLD.pengumpulan_id OR NEW.soal_id != OLD.soal_id THEN
      RAISE EXCEPTION 'Identitas jawaban (pengumpulan_id dan soal_id) bersifat permanen dan tidak dapat diubah.';
    END IF;
  END IF;

  -- Periksa status pengumpulan dan batas waktu penugasan
  SELECT pp.status, p.deadline, p.guru_id
  INTO v_status, v_deadline, v_guru_id
  FROM public.penugasan_pengumpulan pp
  JOIN public.penugasan p ON p.id = pp.penugasan_id
  WHERE pp.id = NEW.pengumpulan_id;

  -- Jika operasi dilakukan oleh siswa
  IF auth.uid() != v_guru_id THEN
    IF v_status != 'draft' THEN
      RAISE EXCEPTION 'Jawaban tidak dapat diubah karena tugas telah dikumpulkan.';
    END IF;
    IF v_deadline IS NOT NULL AND now() >= v_deadline THEN
      RAISE EXCEPTION 'Tenggat waktu penugasan telah berakhir.';
    END IF;

    -- Siswa tidak boleh mengubah nilai atau koreksi
    IF TG_OP = 'UPDATE' THEN
      IF NEW.is_correct IS DISTINCT FROM OLD.is_correct OR
         NEW.skor IS DISTINCT FROM OLD.skor OR
         NEW.catatan IS DISTINCT FROM OLD.catatan THEN
        NEW.is_correct := OLD.is_correct;
        NEW.skor := OLD.skor;
        NEW.catatan := OLD.catatan;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_jawaban_security_guard ON public.penugasan_jawaban;
CREATE TRIGGER trg_jawaban_security_guard
  BEFORE INSERT OR UPDATE ON public.penugasan_jawaban
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_jawaban_security_guard();


-- --------------------------------------------------------------------
-- 4. GRADING SECURITY: RPC simpan_penilaian_guru HARDENING
-- --------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.simpan_penilaian_guru(
  _pengumpulan_id uuid,
  _nilai_essay numeric,
  _catatan_guru text,
  _detail_jawaban jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pengumpulan record;
  v_penugasan record;
  v_paket record;
  v_item jsonb;
  v_soal_id text;
  v_skor numeric;
  v_catatan text;
  v_nilai_akhir numeric(5,2);
  v_clean_essay numeric(5,2);
  v_total_soal integer := 0;
  v_total_essay integer := 0;
  v_max_essay numeric(5,2) := 100.00;
BEGIN
  -- 1. Validasi caller terautentikasi
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Akses tidak sah. Silakan login terlebih dahulu.';
  END IF;

  -- 2. Validasi pengumpulan & kepemilikan guru
  SELECT pp.*, p.guru_id, p.paket_soal_id
  INTO v_pengumpulan
  FROM public.penugasan_pengumpulan pp
  JOIN public.penugasan p ON p.id = pp.penugasan_id
  WHERE pp.id = _pengumpulan_id;

  IF v_pengumpulan IS NULL THEN
    RAISE EXCEPTION 'Data pengumpulan tugas tidak ditemukan.';
  END IF;

  IF v_pengumpulan.guru_id != auth.uid() THEN
    RAISE EXCEPTION 'Akses ditolak: Anda bukan guru pemilik penugasan ini.';
  END IF;

  -- 3. VALIDASI WAJIB: Submission harus sudah submitted (tidak boleh menilai draf)
  IF v_pengumpulan.status != 'submitted' THEN
    RAISE EXCEPTION 'Pengumpulan tugas masih berstatus draf dan belum dikirimkan oleh siswa.';
  END IF;

  -- 4. Hitung bobot skor esai maksimum dari paket soal
  SELECT * INTO v_paket FROM public.paket_soal WHERE id = v_pengumpulan.paket_soal_id;
  IF v_paket.soal IS NOT NULL AND jsonb_array_length(v_paket.soal) > 0 THEN
    v_total_soal := jsonb_array_length(v_paket.soal);
    SELECT count(*) INTO v_total_essay
    FROM jsonb_array_elements(v_paket.soal) elem
    WHERE elem->>'jenis' = 'Esai';

    IF v_total_soal > 0 THEN
      v_max_essay := ROUND((v_total_essay::numeric * (100.0 / v_total_soal::numeric)), 2);
    END IF;
  END IF;

  -- 5. Validasi nilai esai terhadap batas maksimum
  v_clean_essay := ROUND(COALESCE(_nilai_essay, 0.00), 2);
  IF v_clean_essay < 0.00 THEN
    v_clean_essay := 0.00;
  ELSIF v_clean_essay > v_max_essay THEN
    RAISE EXCEPTION 'Nilai esai (%) melebihi skor maksimum yang diizinkan (%).', v_clean_essay, v_max_essay;
  END IF;

  -- 6. Update skor & catatan per butir jawaban bila detail disediakan
  IF _detail_jawaban IS NOT NULL AND jsonb_array_length(_detail_jawaban) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(_detail_jawaban)
    LOOP
      v_soal_id := v_item->>'soal_id';
      v_skor := (v_item->>'skor')::numeric;
      v_catatan := v_item->>'catatan';

      UPDATE public.penugasan_jawaban
      SET skor = v_skor,
          catatan = v_catatan,
          updated_at = now()
      WHERE pengumpulan_id = _pengumpulan_id AND soal_id = v_soal_id;
    END LOOP;
  END IF;

  -- 7. Hitung Nilai Akhir & Clamp 0 - 100
  v_nilai_akhir := ROUND(COALESCE(v_pengumpulan.nilai_pg, 0.00) + v_clean_essay, 2);
  IF v_nilai_akhir > 100.00 THEN
    v_nilai_akhir := 100.00;
  ELSIF v_nilai_akhir < 0.00 THEN
    v_nilai_akhir := 0.00;
  END IF;

  -- 8. Update pengumpulan
  UPDATE public.penugasan_pengumpulan
  SET nilai_essay = v_clean_essay,
      nilai_akhir = v_nilai_akhir,
      status_penilaian = 'dinilai',
      catatan_guru = TRIM(_catatan_guru),
      graded_at = now(),
      updated_at = now()
  WHERE id = _pengumpulan_id;

  RETURN jsonb_build_object(
    'ok', true,
    'nilai_pg', v_pengumpulan.nilai_pg,
    'nilai_essay', v_clean_essay,
    'nilai_akhir', v_nilai_akhir,
    'status_penilaian', 'dinilai',
    'catatan_guru', TRIM(_catatan_guru),
    'graded_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.simpan_penilaian_guru(uuid, numeric, text, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.simpan_penilaian_guru(uuid, numeric, text, jsonb) FROM anon;

-- Batasi broad update pada pengumpulan agar guru tidak bisa mengubah siswa_id / penugasan_id
DROP POLICY IF EXISTS "guru update grading on own penugasan submissions" ON public.penugasan_pengumpulan;
CREATE POLICY "guru update grading on own penugasan submissions" ON public.penugasan_pengumpulan
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.penugasan p
      WHERE p.id = penugasan_pengumpulan.penugasan_id
        AND p.guru_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.penugasan p
      WHERE p.id = penugasan_pengumpulan.penugasan_id
        AND p.guru_id = auth.uid()
    )
    AND siswa_id = penugasan_pengumpulan.siswa_id
    AND penugasan_id = penugasan_pengumpulan.penugasan_id
  );


-- --------------------------------------------------------------------
-- 5. CLASS MEMBERSHIP: VALIDATE SISWA & IDENTITY INTEGRITY
-- --------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_kelas_anggota_student_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile record;
BEGIN
  -- 1. Peran pengguna wajib siswa
  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
  IF v_profile IS NULL OR v_profile.role != 'siswa' THEN
    RAISE EXCEPTION 'Hanya akun dengan peran siswa yang dapat mengajukan bergabung ke kelas.';
  END IF;

  -- 2. Enforce identitas dari data profil terautentikasi (mencegah manipulasi client)
  NEW.siswa_id := auth.uid();
  NEW.siswa_nama := COALESCE(NULLIF(v_profile.nama, ''), NEW.siswa_nama);
  NEW.siswa_email := COALESCE(NULLIF(v_profile.email, ''), NEW.siswa_email);
  NEW.siswa_nisn := COALESCE(NULLIF(v_profile.nisn, ''), NEW.siswa_nisn);
  NEW.status := 'menunggu';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kelas_anggota_student_guard ON public.kelas_anggota;
CREATE TRIGGER trg_kelas_anggota_student_guard
  BEFORE INSERT ON public.kelas_anggota
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_kelas_anggota_student_guard();


-- --------------------------------------------------------------------
-- 6. SYSTEM LOGS: REVOKE ANON & ENHANCE SANITIZATION
-- --------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.log_system_event(text, text, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.log_system_event(text, text, text, jsonb) TO authenticated;

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

  -- Sanitasi kata-kata rahasia secara menyeluruh
  _sanitized_context := _context
    - 'password'
    - 'kata_sandi'
    - 'token'
    - 'secret'
    - 'authorization'
    - 'kunci'
    - 'pembahasan'
    - 'cookie'
    - 'api_key'
    - 'apikey'
    - 'jwt';

  -- Sertakan id pemanggil untuk akuntabilitas
  _sanitized_context := jsonb_set(
    coalesce(_sanitized_context, '{}'::jsonb),
    '{actor_id}',
    to_jsonb(coalesce(auth.uid()::text, 'system'))
  );

  INSERT INTO public.system_logs (level, event_type, message, context, created_at)
  VALUES (_level, _event_type, _message, _sanitized_context, now())
  RETURNING id INTO _log_id;

  RETURN _log_id;
END;
$$;
