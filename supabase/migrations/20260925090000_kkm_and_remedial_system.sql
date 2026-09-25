-- Migration: KKM Configuration and Teacher-Controlled Remedial System
-- Date: 2026-09-25

-- 1. Extend penugasan with KKM and remedial configuration
ALTER TABLE public.penugasan
  ADD COLUMN IF NOT EXISTS kkm NUMERIC(5,2) NOT NULL DEFAULT 75.00 CHECK (kkm >= 0 AND kkm <= 100),
  ADD COLUMN IF NOT EXISTS remedial_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS remedial_paket_soal_id UUID REFERENCES public.paket_soal(id) ON DELETE SET NULL;

-- Ensure remedial question package is distinct from the original package
ALTER TABLE public.penugasan
  DROP CONSTRAINT IF EXISTS chk_penugasan_remedial_paket_distinct;

ALTER TABLE public.penugasan
  ADD CONSTRAINT chk_penugasan_remedial_paket_distinct
  CHECK (remedial_paket_soal_id IS NULL OR remedial_paket_soal_id <> paket_soal_id);

CREATE INDEX IF NOT EXISTS idx_penugasan_remedial_paket ON public.penugasan(remedial_paket_soal_id);

-- 2. Update Teacher Penugasan RLS Policies to validate remedial_paket_soal_id
DROP POLICY IF EXISTS "guru insert own penugasan" ON public.penugasan;
CREATE POLICY "guru insert own penugasan" ON public.penugasan
  FOR INSERT TO authenticated
  WITH CHECK (
    guru_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.kelas k
      WHERE k.id = kelas_id
        AND k.guru_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.paket_soal ps
      WHERE ps.id = paket_soal_id
        AND ps.user_id = auth.uid()
    )
    AND (
      remedial_paket_soal_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.paket_soal ps2
        WHERE ps2.id = remedial_paket_soal_id
          AND ps2.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "guru update own penugasan" ON public.penugasan;
CREATE POLICY "guru update own penugasan" ON public.penugasan
  FOR UPDATE TO authenticated
  USING (guru_id = auth.uid())
  WITH CHECK (
    guru_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.kelas k
      WHERE k.id = kelas_id
        AND k.guru_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.paket_soal ps
      WHERE ps.id = paket_soal_id
        AND ps.user_id = auth.uid()
    )
    AND (
      remedial_paket_soal_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.paket_soal ps2
        WHERE ps2.id = remedial_paket_soal_id
          AND ps2.user_id = auth.uid()
      )
    )
  );

-- 3. Dedicated Remedial Submissions Table
CREATE TABLE IF NOT EXISTS public.penugasan_remedial_pengumpulan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  penugasan_id UUID NOT NULL REFERENCES public.penugasan(id) ON DELETE CASCADE,
  siswa_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  original_pengumpulan_id UUID REFERENCES public.penugasan_pengumpulan(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  nilai_pg NUMERIC(5,2) DEFAULT NULL,
  nilai_essay NUMERIC(5,2) DEFAULT NULL,
  nilai_akhir NUMERIC(5,2) DEFAULT NULL,
  status_penilaian TEXT NOT NULL DEFAULT 'belum_dinilai' CHECK (status_penilaian IN ('belum_dinilai', 'perlu_penilaian_manual', 'dinilai')),
  catatan_guru TEXT DEFAULT NULL,
  submitted_at TIMESTAMPTZ DEFAULT NULL,
  graded_at TIMESTAMPTZ DEFAULT NULL,
  graded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_penugasan_remedial_siswa UNIQUE (penugasan_id, siswa_id)
);

CREATE INDEX IF NOT EXISTS idx_remedial_pengumpulan_penugasan ON public.penugasan_remedial_pengumpulan(penugasan_id);
CREATE INDEX IF NOT EXISTS idx_remedial_pengumpulan_siswa ON public.penugasan_remedial_pengumpulan(siswa_id);
CREATE INDEX IF NOT EXISTS idx_remedial_pengumpulan_status ON public.penugasan_remedial_pengumpulan(status);
CREATE INDEX IF NOT EXISTS idx_remedial_pengumpulan_status_penilaian ON public.penugasan_remedial_pengumpulan(status_penilaian);

-- 4. Dedicated Remedial Answers Table
CREATE TABLE IF NOT EXISTS public.penugasan_remedial_jawaban (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pengumpulan_remedial_id UUID NOT NULL REFERENCES public.penugasan_remedial_pengumpulan(id) ON DELETE CASCADE,
  soal_id TEXT NOT NULL,
  jawaban TEXT,
  is_correct BOOLEAN DEFAULT NULL,
  skor NUMERIC(5,2) DEFAULT NULL,
  catatan TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_remedial_jawaban_soal UNIQUE (pengumpulan_remedial_id, soal_id)
);

CREATE INDEX IF NOT EXISTS idx_remedial_jawaban_pengumpulan ON public.penugasan_remedial_jawaban(pengumpulan_remedial_id);
CREATE INDEX IF NOT EXISTS idx_remedial_jawaban_soal ON public.penugasan_remedial_jawaban(soal_id);

-- 5. Updated_at triggers
DROP TRIGGER IF EXISTS set_remedial_pengumpulan_updated_at ON public.penugasan_remedial_pengumpulan;
CREATE TRIGGER set_remedial_pengumpulan_updated_at
  BEFORE UPDATE ON public.penugasan_remedial_pengumpulan
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_remedial_jawaban_updated_at ON public.penugasan_remedial_jawaban;
CREATE TRIGGER set_remedial_jawaban_updated_at
  BEFORE UPDATE ON public.penugasan_remedial_jawaban
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 6. Row Level Security & Permissions
ALTER TABLE public.penugasan_remedial_pengumpulan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.penugasan_remedial_jawaban ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.penugasan_remedial_pengumpulan FROM anon;
REVOKE ALL ON public.penugasan_remedial_jawaban FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.penugasan_remedial_pengumpulan TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.penugasan_remedial_jawaban TO authenticated;
GRANT ALL ON public.penugasan_remedial_pengumpulan TO service_role;
GRANT ALL ON public.penugasan_remedial_jawaban TO service_role;

-- Policies for penugasan_remedial_pengumpulan
DROP POLICY IF EXISTS "siswa select own remedial pengumpulan" ON public.penugasan_remedial_pengumpulan;
CREATE POLICY "siswa select own remedial pengumpulan" ON public.penugasan_remedial_pengumpulan
  FOR SELECT TO authenticated
  USING (auth.uid() = siswa_id);

DROP POLICY IF EXISTS "guru select remedial pengumpulan of own penugasan" ON public.penugasan_remedial_pengumpulan;
CREATE POLICY "guru select remedial pengumpulan of own penugasan" ON public.penugasan_remedial_pengumpulan
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.penugasan p
      WHERE p.id = penugasan_remedial_pengumpulan.penugasan_id
        AND p.guru_id = auth.uid()
    )
  );

-- Policies for penugasan_remedial_jawaban
DROP POLICY IF EXISTS "siswa select own remedial jawaban" ON public.penugasan_remedial_jawaban;
CREATE POLICY "siswa select own remedial jawaban" ON public.penugasan_remedial_jawaban
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.penugasan_remedial_pengumpulan prp
      WHERE prp.id = pengumpulan_remedial_id
        AND prp.siswa_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "siswa manage own draft remedial jawaban" ON public.penugasan_remedial_jawaban;
CREATE POLICY "siswa manage own draft remedial jawaban" ON public.penugasan_remedial_jawaban
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.penugasan_remedial_pengumpulan prp
      WHERE prp.id = pengumpulan_remedial_id
        AND prp.siswa_id = auth.uid()
        AND prp.status = 'draft'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.penugasan_remedial_pengumpulan prp
      WHERE prp.id = pengumpulan_remedial_id
        AND prp.siswa_id = auth.uid()
        AND prp.status = 'draft'
    )
  );

DROP POLICY IF EXISTS "guru select remedial jawaban of own penugasan" ON public.penugasan_remedial_jawaban;
CREATE POLICY "guru select remedial jawaban of own penugasan" ON public.penugasan_remedial_jawaban
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.penugasan_remedial_pengumpulan prp
      JOIN public.penugasan p ON p.id = prp.penugasan_id
      WHERE prp.id = penugasan_remedial_jawaban.pengumpulan_remedial_id
        AND p.guru_id = auth.uid()
    )
  );

-- 7. RPC: Check Remedial Eligibility
CREATE OR REPLACE FUNCTION public.check_remedial_eligibility(
  _penugasan_id uuid,
  _siswa_id uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_penugasan record;
  v_original record;
  v_remedial record;
  v_target_siswa uuid;
  v_is_guru boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Akses tidak sah. Silakan login terlebih dahulu.';
  END IF;

  v_target_siswa := COALESCE(_siswa_id, auth.uid());

  SELECT * INTO v_penugasan
  FROM public.penugasan
  WHERE id = _penugasan_id;

  IF v_penugasan IS NULL THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'reason', 'Penugasan tidak ditemukan.'
    );
  END IF;

  IF v_penugasan.guru_id = auth.uid() THEN
    v_is_guru := true;
  END IF;

  -- Jika bukan guru dan target siswa bukan diri sendiri
  IF NOT v_is_guru AND auth.uid() <> v_target_siswa THEN
    RAISE EXCEPTION 'Akses ditolak: Anda hanya dapat memeriksa kelayakan diri sendiri.';
  END IF;

  -- 1. Cek apakah remedial diaktifkan oleh guru
  IF NOT COALESCE(v_penugasan.remedial_enabled, false) THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'reason', 'Remedial tidak diaktifkan oleh guru untuk penugasan ini.',
      'remedial_enabled', false,
      'kkm', v_penugasan.kkm
    );
  END IF;

  -- 2. Cek apakah paket soal remedial telah disetel
  IF v_penugasan.remedial_paket_soal_id IS NULL THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'reason', 'Paket soal remedial belum disetel oleh guru.',
      'remedial_enabled', true,
      'has_remedial_soal', false,
      'kkm', v_penugasan.kkm
    );
  END IF;

  -- 3. Cek pengumpulan tugas utama
  SELECT * INTO v_original
  FROM public.penugasan_pengumpulan
  WHERE penugasan_id = _penugasan_id AND siswa_id = v_target_siswa;

  IF v_original IS NULL OR v_original.status <> 'submitted' THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'reason', 'Tugas utama belum dikumpulkan.',
      'remedial_enabled', true,
      'has_remedial_soal', true,
      'kkm', v_penugasan.kkm,
      'original_submitted', false
    );
  END IF;

  -- 4. Cek status penilaian tugas utama
  IF v_original.status_penilaian <> 'dinilai' OR v_original.nilai_akhir IS NULL THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'reason', 'Tugas utama belum selesai dinilai oleh guru.',
      'remedial_enabled', true,
      'has_remedial_soal', true,
      'kkm', v_penugasan.kkm,
      'original_submitted', true,
      'original_graded', false
    );
  END IF;

  -- 5. Cek apakah nilai murni < KKM
  IF v_original.nilai_akhir >= v_penugasan.kkm THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'reason', 'Nilai murni Anda telah mencapai KKM (Tuntas). Remedial tidak diperlukan.',
      'remedial_enabled', true,
      'has_remedial_soal', true,
      'kkm', v_penugasan.kkm,
      'nilai_murni', v_original.nilai_akhir,
      'original_submitted', true,
      'original_graded', true,
      'is_tuntas', true
    );
  END IF;

  -- 6. Cek pengumpulan remedial yang sudah ada
  SELECT * INTO v_remedial
  FROM public.penugasan_remedial_pengumpulan
  WHERE penugasan_id = _penugasan_id AND siswa_id = v_target_siswa;

  IF v_remedial IS NOT NULL AND v_remedial.status = 'submitted' THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'reason', 'Remedial telah berhasil dikumpulkan.',
      'remedial_enabled', true,
      'has_remedial_soal', true,
      'kkm', v_penugasan.kkm,
      'nilai_murni', v_original.nilai_akhir,
      'original_submitted', true,
      'original_graded', true,
      'remedial_submitted', true,
      'remedial_pengumpulan_id', v_remedial.id,
      'remedial_status_penilaian', v_remedial.status_penilaian,
      'remedial_nilai_akhir', v_remedial.nilai_akhir
    );
  END IF;

  -- Siswa ELIGIBLE!
  RETURN jsonb_build_object(
    'eligible', true,
    'reason', 'Siswa berhak mengikuti remedial.',
    'remedial_enabled', true,
    'has_remedial_soal', true,
    'kkm', v_penugasan.kkm,
    'nilai_murni', v_original.nilai_akhir,
    'original_submitted', true,
    'original_graded', true,
    'remedial_submitted', false,
    'remedial_pengumpulan_id', CASE WHEN v_remedial IS NOT NULL THEN v_remedial.id ELSE NULL END,
    'remedial_status', CASE WHEN v_remedial IS NOT NULL THEN v_remedial.status ELSE NULL END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_remedial_eligibility(uuid, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.check_remedial_eligibility(uuid, uuid) FROM anon;

-- 8. RPC: Start or Get Remedial Submission Draft
CREATE OR REPLACE FUNCTION public.start_or_get_remedial_submission(_penugasan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_eligibility jsonb;
  v_original record;
  v_remedial record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Akses tidak sah. Silakan login terlebih dahulu.';
  END IF;

  -- Verifikasi kelayakan via check_remedial_eligibility
  v_eligibility := public.check_remedial_eligibility(_penugasan_id, auth.uid());

  -- Ambil draft jika sudah ada
  SELECT * INTO v_remedial
  FROM public.penugasan_remedial_pengumpulan
  WHERE penugasan_id = _penugasan_id AND siswa_id = auth.uid();

  IF v_remedial IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'submission', to_jsonb(v_remedial),
      'already_existed', true
    );
  END IF;

  -- Jika belum ada, pastikan eligible
  IF NOT COALESCE((v_eligibility->>'eligible')::boolean, false) THEN
    RAISE EXCEPTION '%', COALESCE(v_eligibility->>'reason', 'Anda tidak memenuhi syarat untuk mengikuti remedial.');
  END IF;

  -- Ambil original_pengumpulan_id
  SELECT id INTO v_original
  FROM public.penugasan_pengumpulan
  WHERE penugasan_id = _penugasan_id AND siswa_id = auth.uid();

  -- Buat baris baru draf remedial
  INSERT INTO public.penugasan_remedial_pengumpulan (
    penugasan_id,
    siswa_id,
    original_pengumpulan_id,
    status
  )
  VALUES (
    _penugasan_id,
    auth.uid(),
    v_original.id,
    'draft'
  )
  RETURNING * INTO v_remedial;

  RETURN jsonb_build_object(
    'ok', true,
    'submission', to_jsonb(v_remedial),
    'already_existed', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_or_get_remedial_submission(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.start_or_get_remedial_submission(uuid) FROM anon;

-- 9. RPC: Sanitized Remedial Questions for Siswa
CREATE OR REPLACE FUNCTION public.get_remedial_soal_for_siswa(_penugasan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remedial_paket_id uuid;
  v_soal jsonb;
  v_sanitized jsonb;
  v_penugasan record;
  v_eligibility jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Akses tidak sah. Silakan login terlebih dahulu.';
  END IF;

  SELECT * INTO v_penugasan
  FROM public.penugasan
  WHERE id = _penugasan_id;

  IF v_penugasan IS NULL THEN
    RAISE EXCEPTION 'Penugasan tidak ditemukan.';
  END IF;

  -- Guru pemilik tugas dapat melihat soal remedial kapan saja
  IF v_penugasan.guru_id <> auth.uid() THEN
    -- Siswa: validasi kelayakan remedial
    v_eligibility := public.check_remedial_eligibility(_penugasan_id, auth.uid());
    IF NOT COALESCE((v_eligibility->>'eligible')::boolean, false) AND NOT COALESCE((v_eligibility->>'remedial_submitted')::boolean, false) THEN
      RAISE EXCEPTION '%', COALESCE(v_eligibility->>'reason', 'Anda tidak berhak mengakses soal remedial ini.');
    END IF;
  END IF;

  v_remedial_paket_id := v_penugasan.remedial_paket_soal_id;
  IF v_remedial_paket_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT soal INTO v_soal
  FROM public.paket_soal
  WHERE id = v_remedial_paket_id;

  IF v_soal IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Sanitasi soal: kembalikan tanpa kunci jawaban
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', elem->>'id',
      'pertanyaan', elem->>'pertanyaan',
      'jenis', elem->>'jenis',
      'opsi', elem->'opsi'
    )
  ) INTO v_sanitized
  FROM jsonb_array_elements(v_soal) AS elem;

  RETURN COALESCE(v_sanitized, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_remedial_soal_for_siswa(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_remedial_soal_for_siswa(uuid) FROM anon;

-- 10. RPC: Submit Remedial Penugasan
CREATE OR REPLACE FUNCTION public.submit_remedial_penugasan(_pengumpulan_remedial_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pengumpulan record;
  v_penugasan record;
  v_soal jsonb;
  v_elem jsonb;
  v_soal_id text;
  v_jenis text;
  v_kunci text;
  v_jawaban_teks text;
  v_rec_jawaban record;
  v_is_correct boolean;
  v_total_pg integer := 0;
  v_benar_pg integer := 0;
  v_total_essay integer := 0;
  v_total_soal integer := 0;
  v_nilai_pg numeric(5,2) := 0.00;
  v_nilai_essay numeric(5,2) := NULL;
  v_nilai_akhir numeric(5,2) := NULL;
  v_status_penilaian text := 'belum_dinilai';
  v_graded_at timestamptz := NULL;
  v_opsi_idx integer;
  v_opt_text text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Akses tidak sah. Silakan login terlebih dahulu.';
  END IF;

  -- 1. Validasi pengumpulan remedial & kepemilikan
  SELECT * INTO v_pengumpulan
  FROM public.penugasan_remedial_pengumpulan
  WHERE id = _pengumpulan_remedial_id AND siswa_id = auth.uid();

  IF v_pengumpulan IS NULL THEN
    RAISE EXCEPTION 'Data pengumpulan remedial tidak ditemukan atau bukan milik Anda.';
  END IF;

  IF v_pengumpulan.status = 'submitted' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already_submitted', true,
      'submitted_at', v_pengumpulan.submitted_at,
      'status_penilaian', v_pengumpulan.status_penilaian,
      'nilai_akhir', v_pengumpulan.nilai_akhir
    );
  END IF;

  -- 2. Validasi penugasan & remedial setting
  SELECT * INTO v_penugasan
  FROM public.penugasan
  WHERE id = v_pengumpulan.penugasan_id;

  IF v_penugasan IS NULL THEN
    RAISE EXCEPTION 'Penugasan tidak ditemukan.';
  END IF;

  IF NOT COALESCE(v_penugasan.remedial_enabled, false) OR v_penugasan.remedial_paket_soal_id IS NULL THEN
    RAISE EXCEPTION 'Fitur remedial tidak aktif untuk penugasan ini.';
  END IF;

  -- 3. Ambil paket soal remedial untuk auto-grading PG
  SELECT soal INTO v_soal
  FROM public.paket_soal
  WHERE id = v_penugasan.remedial_paket_soal_id;

  IF v_soal IS NOT NULL AND jsonb_array_length(v_soal) > 0 THEN
    FOR v_elem IN SELECT * FROM jsonb_array_elements(v_soal)
    LOOP
      v_soal_id := v_elem->>'id';
      v_jenis := COALESCE(v_elem->>'jenis', 'Pilihan Ganda');

      IF v_jenis = 'Pilihan Ganda' THEN
        v_total_pg := v_total_pg + 1;
        v_kunci := TRIM(COALESCE(v_elem->>'kunci', ''));

        -- Ambil jawaban remedial siswa
        SELECT * INTO v_rec_jawaban
        FROM public.penugasan_remedial_jawaban
        WHERE pengumpulan_remedial_id = _pengumpulan_remedial_id AND soal_id = v_soal_id;

        v_jawaban_teks := TRIM(COALESCE(v_rec_jawaban.jawaban, ''));

        IF v_jawaban_teks = '' OR v_kunci = '' THEN
          v_is_correct := false;
        ELSE
          v_is_correct := false;
          IF LOWER(v_jawaban_teks) = LOWER(v_kunci) THEN
            v_is_correct := true;
          ELSIF LENGTH(v_kunci) = 1 AND (
            UPPER(v_jawaban_teks) LIKE UPPER(v_kunci) || '.%'
            OR UPPER(v_jawaban_teks) = UPPER(v_kunci)
          ) THEN
            v_is_correct := true;
          ELSIF LENGTH(v_jawaban_teks) = 1 AND (
            UPPER(v_kunci) LIKE UPPER(v_jawaban_teks) || '.%'
          ) THEN
            v_is_correct := true;
          ELSIF LENGTH(v_kunci) = 1 AND v_elem->'opsi' IS NOT NULL THEN
            v_opsi_idx := ASCII(UPPER(v_kunci)) - 65;
            IF v_opsi_idx >= 0 AND v_opsi_idx < jsonb_array_length(v_elem->'opsi') THEN
              v_opt_text := TRIM(v_elem->'opsi'->>v_opsi_idx);
              IF LOWER(v_jawaban_teks) = LOWER(v_opt_text) OR
                 LOWER(v_jawaban_teks) = LOWER(v_kunci || '. ' || v_opt_text) THEN
                v_is_correct := true;
              END IF;
            END IF;
          END IF;
        END IF;

        IF v_is_correct THEN
          v_benar_pg := v_benar_pg + 1;
        END IF;

        IF v_rec_jawaban.id IS NOT NULL THEN
          UPDATE public.penugasan_remedial_jawaban
          SET is_correct = v_is_correct,
              skor = CASE WHEN v_is_correct THEN 1.00 ELSE 0.00 END,
              updated_at = now()
          WHERE id = v_rec_jawaban.id;
        ELSE
          INSERT INTO public.penugasan_remedial_jawaban (pengumpulan_remedial_id, soal_id, jawaban, is_correct, skor)
          VALUES (_pengumpulan_remedial_id, v_soal_id, NULL, false, 0.00)
          ON CONFLICT (pengumpulan_remedial_id, soal_id) DO UPDATE
          SET is_correct = false, skor = 0.00, updated_at = now();
        END IF;

      ELSE
        -- Soal Esai
        v_total_essay := v_total_essay + 1;
        UPDATE public.penugasan_remedial_jawaban
        SET is_correct = NULL, updated_at = now()
        WHERE pengumpulan_remedial_id = _pengumpulan_remedial_id AND soal_id = v_soal_id;
      END IF;
    END LOOP;
  END IF;

  v_total_soal := v_total_pg + v_total_essay;
  IF v_total_soal > 0 THEN
    v_nilai_pg := ROUND((v_benar_pg::numeric * (100.0 / v_total_soal::numeric)), 2);
  ELSE
    v_nilai_pg := 0.00;
  END IF;

  IF v_total_essay = 0 THEN
    v_nilai_essay := 0.00;
    v_nilai_akhir := v_nilai_pg;
    v_status_penilaian := 'dinilai';
    v_graded_at := now();
  ELSE
    v_nilai_essay := NULL;
    v_nilai_akhir := NULL;
    v_status_penilaian := 'perlu_penilaian_manual';
    v_graded_at := NULL;
  END IF;

  UPDATE public.penugasan_remedial_pengumpulan
  SET status = 'submitted',
      submitted_at = now(),
      nilai_pg = v_nilai_pg,
      nilai_essay = v_nilai_essay,
      nilai_akhir = v_nilai_akhir,
      status_penilaian = v_status_penilaian,
      graded_at = v_graded_at,
      updated_at = now()
  WHERE id = _pengumpulan_remedial_id;

  RETURN jsonb_build_object(
    'ok', true,
    'already_submitted', false,
    'submitted_at', now(),
    'nilai_pg', v_nilai_pg,
    'nilai_essay', v_nilai_essay,
    'nilai_akhir', v_nilai_akhir,
    'status_penilaian', v_status_penilaian,
    'graded_at', v_graded_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_remedial_penugasan(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.submit_remedial_penugasan(uuid) FROM anon;

-- 11. RPC: Simpan Penilaian Remedial Guru
CREATE OR REPLACE FUNCTION public.simpan_penilaian_remedial_guru(
  _pengumpulan_remedial_id uuid,
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
  v_item jsonb;
  v_soal_id text;
  v_skor numeric;
  v_catatan text;
  v_nilai_akhir numeric(5,2);
  v_clean_essay numeric(5,2);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Akses tidak sah. Silakan login terlebih dahulu.';
  END IF;

  SELECT prp.*, p.guru_id
  INTO v_pengumpulan
  FROM public.penugasan_remedial_pengumpulan prp
  JOIN public.penugasan p ON p.id = prp.penugasan_id
  WHERE prp.id = _pengumpulan_remedial_id;

  IF v_pengumpulan IS NULL THEN
    RAISE EXCEPTION 'Data pengumpulan remedial tidak ditemukan.';
  END IF;

  IF v_pengumpulan.guru_id != auth.uid() THEN
    RAISE EXCEPTION 'Akses ditolak: Anda bukan guru pemilik penugasan ini.';
  END IF;

  IF _detail_jawaban IS NOT NULL AND jsonb_array_length(_detail_jawaban) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(_detail_jawaban)
    LOOP
      v_soal_id := v_item->>'soal_id';
      v_skor := (v_item->>'skor')::numeric;
      v_catatan := v_item->>'catatan';

      UPDATE public.penugasan_remedial_jawaban
      SET skor = v_skor,
          catatan = v_catatan,
          updated_at = now()
      WHERE pengumpulan_remedial_id = _pengumpulan_remedial_id AND soal_id = v_soal_id;
    END LOOP;
  END IF;

  v_clean_essay := GREATEST(0.00, LEAST(100.00, ROUND(COALESCE(_nilai_essay, 0.00), 2)));
  v_nilai_akhir := LEAST(100.00, GREATEST(0.00, ROUND((COALESCE(v_pengumpulan.nilai_pg, 0.00) + v_clean_essay), 2)));

  UPDATE public.penugasan_remedial_pengumpulan
  SET nilai_essay = v_clean_essay,
      nilai_akhir = v_nilai_akhir,
      status_penilaian = 'dinilai',
      catatan_guru = _catatan_guru,
      graded_at = now(),
      graded_by = auth.uid(),
      updated_at = now()
  WHERE id = _pengumpulan_remedial_id;

  RETURN jsonb_build_object(
    'ok', true,
    'id', _pengumpulan_remedial_id,
    'nilai_pg', v_pengumpulan.nilai_pg,
    'nilai_essay', v_clean_essay,
    'nilai_akhir', v_nilai_akhir,
    'status_penilaian', 'dinilai',
    'catatan_guru', _catatan_guru,
    'graded_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.simpan_penilaian_remedial_guru(uuid, numeric, text, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.simpan_penilaian_remedial_guru(uuid, numeric, text, jsonb) FROM anon;
