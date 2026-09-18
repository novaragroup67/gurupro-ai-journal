-- Migration: Add grading columns, auto-grading for Multiple Choice, and teacher grading RPC
-- Date: 2026-09-17

-- 1. Add grading columns to penugasan_pengumpulan
ALTER TABLE public.penugasan_pengumpulan
  ADD COLUMN IF NOT EXISTS nilai_pg NUMERIC(5,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS nilai_essay NUMERIC(5,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS nilai_akhir NUMERIC(5,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS status_penilaian TEXT NOT NULL DEFAULT 'belum_dinilai'
    CHECK (status_penilaian IN ('belum_dinilai', 'perlu_penilaian_manual', 'dinilai')),
  ADD COLUMN IF NOT EXISTS catatan_guru TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS graded_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Add grading columns to penugasan_jawaban
ALTER TABLE public.penugasan_jawaban
  ADD COLUMN IF NOT EXISTS is_correct BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS skor NUMERIC(5,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS catatan TEXT DEFAULT NULL;

-- 3. Indices for grading
CREATE INDEX IF NOT EXISTS idx_pengumpulan_status_penilaian ON public.penugasan_pengumpulan(status_penilaian);

-- 4. Update submit_penugasan to include automatic Multiple Choice grading
CREATE OR REPLACE FUNCTION public.submit_penugasan(_pengumpulan_id uuid)
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
  -- 1. Validasi pengumpulan & kepemilikan
  SELECT * INTO v_pengumpulan
  FROM public.penugasan_pengumpulan
  WHERE id = _pengumpulan_id AND siswa_id = auth.uid();

  IF v_pengumpulan IS NULL THEN
    RAISE EXCEPTION 'Data pengumpulan tidak ditemukan atau bukan milik Anda.';
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

  -- 2. Validasi penugasan & tenggat waktu
  SELECT * INTO v_penugasan
  FROM public.penugasan
  WHERE id = v_pengumpulan.penugasan_id;

  IF v_penugasan IS NULL THEN
    RAISE EXCEPTION 'Penugasan tidak ditemukan.';
  END IF;

  IF v_penugasan.deadline IS NOT NULL AND now() >= v_penugasan.deadline THEN
    RAISE EXCEPTION 'Tenggat waktu penugasan telah berakhir. Pengumpulan tidak dapat diterima.';
  END IF;

  -- 3. Ambil paket soal untuk auto-grading PG
  SELECT soal INTO v_soal
  FROM public.paket_soal
  WHERE id = v_penugasan.paket_soal_id;

  IF v_soal IS NOT NULL AND jsonb_array_length(v_soal) > 0 THEN
    FOR v_elem IN SELECT * FROM jsonb_array_elements(v_soal)
    LOOP
      v_soal_id := v_elem->>'id';
      v_jenis := COALESCE(v_elem->>'jenis', 'Pilihan Ganda');

      IF v_jenis = 'Pilihan Ganda' THEN
        v_total_pg := v_total_pg + 1;
        v_kunci := TRIM(COALESCE(v_elem->>'kunci', ''));

        -- Ambil jawaban siswa
        SELECT * INTO v_rec_jawaban
        FROM public.penugasan_jawaban
        WHERE pengumpulan_id = _pengumpulan_id AND soal_id = v_soal_id;

        v_jawaban_teks := TRIM(COALESCE(v_rec_jawaban.jawaban, ''));

        IF v_jawaban_teks = '' OR v_kunci = '' THEN
          v_is_correct := false;
        ELSE
          -- Evaluasi kesesuaian jawaban PG
          v_is_correct := false;
          -- Kasus 1: Tepat sama persis (case-insensitive)
          IF LOWER(v_jawaban_teks) = LOWER(v_kunci) THEN
            v_is_correct := true;
          -- Kasus 2: Kunci adalah satu huruf (A-E) dan jawaban siswa diawali huruf tersebut (misal "A. Konsep...")
          ELSIF LENGTH(v_kunci) = 1 AND (
            UPPER(v_jawaban_teks) LIKE UPPER(v_kunci) || '.%'
            OR UPPER(v_jawaban_teks) = UPPER(v_kunci)
          ) THEN
            v_is_correct := true;
          -- Kasus 3: Jawaban siswa adalah satu huruf dan kunci berupa string panjang yang berawalan huruf tersebut
          ELSIF LENGTH(v_jawaban_teks) = 1 AND (
            UPPER(v_kunci) LIKE UPPER(v_jawaban_teks) || '.%'
          ) THEN
            v_is_correct := true;
          -- Kasus 4: Kunci adalah huruf A-E, cari opsi ke-N apakah cocok dengan jawaban siswa
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

        -- Update penugasan_jawaban jika record jawaban ada
        IF v_rec_jawaban.id IS NOT NULL THEN
          UPDATE public.penugasan_jawaban
          SET is_correct = v_is_correct,
              skor = CASE WHEN v_is_correct THEN 1.00 ELSE 0.00 END,
              updated_at = now()
          WHERE id = v_rec_jawaban.id;
        ELSE
          -- Jika siswa tidak mengisi sama sekali, catat record jawaban kosong dengan is_correct false
          INSERT INTO public.penugasan_jawaban (pengumpulan_id, soal_id, jawaban, is_correct, skor)
          VALUES (_pengumpulan_id, v_soal_id, NULL, false, 0.00)
          ON CONFLICT (pengumpulan_id, soal_id) DO UPDATE
          SET is_correct = false, skor = 0.00, updated_at = now();
        END IF;

      ELSE
        -- Soal Esai
        v_total_essay := v_total_essay + 1;
        -- Pastikan is_correct tetap NULL untuk esai
        UPDATE public.penugasan_jawaban
        SET is_correct = NULL, updated_at = now()
        WHERE pengumpulan_id = _pengumpulan_id AND soal_id = v_soal_id;
      END IF;
    END LOOP;
  END IF;

  -- 4. Kalkulasi Nilai PG & Status Penilaian
  v_total_soal := v_total_pg + v_total_essay;

  IF v_total_soal > 0 THEN
    -- Bobot per butir soal: 100 / total_soal
    v_nilai_pg := ROUND((v_benar_pg::numeric * (100.0 / v_total_soal::numeric)), 2);
  ELSE
    v_nilai_pg := 0.00;
  END IF;

  IF v_total_essay = 0 THEN
    -- Hanya PG: Penilaian langsung tuntas secara otomatis!
    v_nilai_essay := 0.00;
    v_nilai_akhir := v_nilai_pg;
    v_status_penilaian := 'dinilai';
    v_graded_at := now();
  ELSE
    -- Ada Esai: Butuh penilaian manual guru untuk bagian esai
    v_nilai_essay := NULL;
    v_nilai_akhir := NULL;
    v_status_penilaian := 'perlu_penilaian_manual';
    v_graded_at := NULL;
  END IF;

  -- 5. Update data penugasan_pengumpulan
  UPDATE public.penugasan_pengumpulan
  SET status = 'submitted',
      submitted_at = now(),
      nilai_pg = v_nilai_pg,
      nilai_essay = v_nilai_essay,
      nilai_akhir = v_nilai_akhir,
      status_penilaian = v_status_penilaian,
      graded_at = v_graded_at,
      updated_at = now()
  WHERE id = _pengumpulan_id;

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

-- 5. Create RPC simpan_penilaian_guru
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
  v_item jsonb;
  v_soal_id text;
  v_skor numeric;
  v_catatan text;
  v_nilai_akhir numeric(5,2);
  v_clean_essay numeric(5,2);
BEGIN
  -- 1. Validasi caller terautentikasi
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Akses tidak sah. Silakan login terlebih dahulu.';
  END IF;

  -- 2. Validasi pengumpulan & kepemilikan guru
  SELECT pp.*, p.guru_id
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

  -- 3. Update skor & catatan per butir jawaban bila detail disediakan
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

  -- 4. Hitung Nilai Akhir
  v_clean_essay := ROUND(COALESCE(_nilai_essay, 0.00), 2);
  v_nilai_akhir := ROUND(COALESCE(v_pengumpulan.nilai_pg, 0.00) + v_clean_essay, 2);

  IF v_nilai_akhir > 100.00 THEN
    v_nilai_akhir := 100.00;
  ELSIF v_nilai_akhir < 0.00 THEN
    v_nilai_akhir := 0.00;
  END IF;

  -- 5. Update pengumpulan
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

-- 6. RLS Policies for grading update
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
  );

DROP POLICY IF EXISTS "guru update jawaban on own penugasan" ON public.penugasan_jawaban;
CREATE POLICY "guru update jawaban on own penugasan" ON public.penugasan_jawaban
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.penugasan_pengumpulan pp
      JOIN public.penugasan p ON p.id = pp.penugasan_id
      WHERE pp.id = penugasan_jawaban.pengumpulan_id
        AND p.guru_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.penugasan_pengumpulan pp
      JOIN public.penugasan p ON p.id = pp.penugasan_id
      WHERE pp.id = penugasan_jawaban.pengumpulan_id
        AND p.guru_id = auth.uid()
    )
  );
