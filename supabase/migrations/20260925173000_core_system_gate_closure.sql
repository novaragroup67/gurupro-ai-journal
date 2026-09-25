-- Migration: Core System Gate Closure
-- Description:
-- 1. Adds nilai_murni column to penugasan_remedial_pengumpulan for immutable historical snapshot.
-- 2. Hardens RPCs to enforce archive state at server level (blocking archived assignments for questions, submissions, answers, and remedial).
-- 3. Protects question bank dependencies (blocks archiving paket_soal actively used by published assignments).
-- 4. Protects module dependencies (blocks archiving published/active student-facing modules).
-- 5. Corrects archive Tahun Ajaran context derivation for paket_soal without hardcoded 'Semua'.

-- 1. Schema extension: nilai_murni on penugasan_remedial_pengumpulan
ALTER TABLE public.penugasan_remedial_pengumpulan
  ADD COLUMN IF NOT EXISTS nilai_murni numeric(5,2) DEFAULT NULL
  CHECK (nilai_murni IS NULL OR (nilai_murni >= 0 AND nilai_murni <= 100));

-- Backfill existing remedial records from penugasan_pengumpulan.nilai_akhir
UPDATE public.penugasan_remedial_pengumpulan prp
SET nilai_murni = pp.nilai_akhir
FROM public.penugasan_pengumpulan pp
WHERE prp.original_pengumpulan_id = pp.id
  AND prp.nilai_murni IS NULL
  AND pp.nilai_akhir IS NOT NULL;

-- 2. Server-level submission eligibility guard: is_siswa_can_submit
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
      AND COALESCE(p.is_archived, false) = false
      AND ka.siswa_id = auth.uid()
      AND ka.status = 'aktif'
      AND (p.deadline IS NULL OR p.deadline > now())
  );
$$;

-- 3. Server-level answer security guard: handle_jawaban_security_guard
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
  v_is_archived boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Immutabilitas pengumpulan_id dan soal_id
    IF NEW.pengumpulan_id != OLD.pengumpulan_id OR NEW.soal_id != OLD.soal_id THEN
      RAISE EXCEPTION 'Identitas jawaban (pengumpulan_id dan soal_id) bersifat permanen dan tidak dapat diubah.';
    END IF;
  END IF;

  -- Periksa status pengumpulan, batas waktu penugasan, dan status arsip
  SELECT pp.status, p.deadline, p.guru_id, COALESCE(p.is_archived, false)
  INTO v_status, v_deadline, v_guru_id, v_is_archived
  FROM public.penugasan_pengumpulan pp
  JOIN public.penugasan p ON p.id = pp.penugasan_id
  WHERE pp.id = NEW.pengumpulan_id;

  IF v_is_archived THEN
    RAISE EXCEPTION 'Penugasan telah diarsipkan dan jawaban tidak dapat diubah.';
  END IF;

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

-- 4. Server-level remedial answer security guard
CREATE OR REPLACE FUNCTION public.handle_remedial_jawaban_security_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_guru_id uuid;
  v_is_archived boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.pengumpulan_remedial_id != OLD.pengumpulan_remedial_id OR NEW.soal_id != OLD.soal_id THEN
      RAISE EXCEPTION 'Identitas jawaban remedial bersifat permanen dan tidak dapat diubah.';
    END IF;
  END IF;

  SELECT prp.status, p.guru_id, COALESCE(p.is_archived, false)
  INTO v_status, v_guru_id, v_is_archived
  FROM public.penugasan_remedial_pengumpulan prp
  JOIN public.penugasan p ON p.id = prp.penugasan_id
  WHERE prp.id = NEW.pengumpulan_remedial_id;

  IF v_is_archived THEN
    RAISE EXCEPTION 'Penugasan telah diarsipkan dan jawaban remedial tidak dapat diubah.';
  END IF;

  IF auth.uid() != v_guru_id THEN
    IF v_status != 'draft' THEN
      RAISE EXCEPTION 'Jawaban remedial tidak dapat diubah karena remedial telah dikumpulkan.';
    END IF;
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

DROP TRIGGER IF EXISTS trg_remedial_jawaban_security_guard ON public.penugasan_remedial_jawaban;
CREATE TRIGGER trg_remedial_jawaban_security_guard
  BEFORE INSERT OR UPDATE ON public.penugasan_remedial_jawaban
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_remedial_jawaban_security_guard();

-- 5. Server-level question retrieval guard: get_penugasan_soal_for_siswa
CREATE OR REPLACE FUNCTION public.get_penugasan_soal_for_siswa(_penugasan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_penugasan record;
  v_is_member boolean := false;
  v_soal jsonb;
  v_sanitized jsonb;
BEGIN
  SELECT * INTO v_penugasan
  FROM public.penugasan
  WHERE id = _penugasan_id;

  IF v_penugasan IS NULL THEN
    RAISE EXCEPTION 'Penugasan tidak ditemukan.';
  END IF;

  -- Block archived assignment from retrieving questions
  IF COALESCE(v_penugasan.is_archived, false) = true THEN
    RAISE EXCEPTION 'Penugasan telah diarsipkan dan tidak dapat diakses.';
  END IF;

  IF v_penugasan.status NOT IN ('published', 'closed') THEN
    RAISE EXCEPTION 'Penugasan belum diterbitkan.';
  END IF;

  -- Verifikasi keanggotaan siswa di kelas penugasan
  SELECT EXISTS (
    SELECT 1 FROM public.kelas_anggota ka
    WHERE ka.kelas_id = v_penugasan.kelas_id
      AND ka.siswa_id = auth.uid()
      AND ka.status = 'aktif'
  ) INTO v_is_member;

  IF NOT v_is_member AND v_penugasan.guru_id <> auth.uid() AND NOT is_admin() THEN
    RAISE EXCEPTION 'Anda tidak memiliki akses ke kelas penugasan ini.';
  END IF;

  SELECT soal INTO v_soal
  FROM public.paket_soal
  WHERE id = v_penugasan.paket_soal_id;

  IF v_soal IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Sanitasi: kembalikan hanya id, pertanyaan, jenis, dan opsi (tanpa kunci)
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

-- 6. Server-level submission guard: submit_penugasan
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

  -- 2. Validasi penugasan & tenggat waktu & status arsip
  SELECT * INTO v_penugasan
  FROM public.penugasan
  WHERE id = v_pengumpulan.penugasan_id;

  IF v_penugasan IS NULL THEN
    RAISE EXCEPTION 'Penugasan tidak ditemukan.';
  END IF;

  -- Block submission on archived assignments
  IF COALESCE(v_penugasan.is_archived, false) = true THEN
    RAISE EXCEPTION 'Penugasan telah diarsipkan dan tidak lagi menerima pengumpulan.';
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
        v_kunci := v_elem->>'kunci';

        -- Ambil jawaban siswa dari penugasan_jawaban
        SELECT * INTO v_rec_jawaban
        FROM public.penugasan_jawaban
        WHERE pengumpulan_id = _pengumpulan_id AND soal_id = v_soal_id;

        v_jawaban_teks := v_rec_jawaban.jawaban;
        v_is_correct := false;

        IF v_jawaban_teks IS NOT NULL AND v_kunci IS NOT NULL THEN
          -- Cek apakah jawaban cocok dengan teks kunci
          IF TRIM(v_jawaban_teks) = TRIM(v_kunci) THEN
            v_is_correct := true;
          -- Cek jika jawaban siswa berupa huruf/index misal 'A', 'B' dan kunci adalah teksnya
          ELSIF v_jawaban_teks ~* '^[A-E]$' AND v_elem->'opsi' IS NOT NULL THEN
            v_opsi_idx := ASCII(UPPER(v_jawaban_teks)) - 65;
            v_opt_text := v_elem->'opsi'->>v_opsi_idx;
            IF v_opt_text IS NOT NULL AND TRIM(v_opt_text) = TRIM(v_kunci) THEN
              v_is_correct := true;
            END IF;
          -- Cek jika kunci berupa indeks huruf dan jawaban berupa teksnya
          ELSIF v_kunci ~* '^[A-E]$' AND v_elem->'opsi' IS NOT NULL THEN
            v_opsi_idx := ASCII(UPPER(v_kunci)) - 65;
            v_opt_text := v_elem->'opsi'->>v_opsi_idx;
            IF v_opt_text IS NOT NULL AND TRIM(v_opt_text) = TRIM(v_jawaban_teks) THEN
              v_is_correct := true;
            END IF;
          END IF;
        END IF;

        IF v_is_correct THEN
          v_benar_pg := v_benar_pg + 1;
        END IF;

        -- Simpan hasil koreksi PG
        IF v_rec_jawaban.id IS NOT NULL THEN
          UPDATE public.penugasan_jawaban
          SET is_correct = v_is_correct,
              skor = CASE WHEN v_is_correct THEN 100.00 ELSE 0.00 END
          WHERE id = v_rec_jawaban.id;
        ELSE
          INSERT INTO public.penugasan_jawaban (
            pengumpulan_id,
            soal_id,
            jawaban,
            is_correct,
            skor
          ) VALUES (
            _pengumpulan_id,
            v_soal_id,
            NULL,
            false,
            0.00
          );
        END IF;

      ELSIF v_jenis = 'Esai' THEN
        v_total_essay := v_total_essay + 1;
      END IF;
    END LOOP;
  END IF;

  -- 4. Hitung Nilai & Status Penilaian
  v_total_soal := v_total_pg + v_total_essay;

  IF v_total_pg > 0 THEN
    v_nilai_pg := ROUND((v_benar_pg::numeric / v_total_pg::numeric) * 100.00, 2);
  ELSE
    v_nilai_pg := 0.00;
  END IF;

  IF v_total_essay = 0 THEN
    -- Murni PG: Penilaian selesai otomatis
    v_status_penilaian := 'dinilai';
    v_nilai_akhir := v_nilai_pg;
    v_graded_at := now();
  ELSE
    -- Mengandung Esai: Butuh penilaian manual guru
    v_status_penilaian := 'perlu_penilaian_manual';
    v_nilai_akhir := NULL;
    v_graded_at := NULL;
  END IF;

  -- 5. Update data penugasan_pengumpulan
  UPDATE public.penugasan_pengumpulan
  SET status = 'submitted',
      submitted_at = now(),
      status_penilaian = v_status_penilaian,
      nilai_pg = v_nilai_pg,
      nilai_essay = v_nilai_essay,
      nilai_akhir = v_nilai_akhir,
      graded_at = v_graded_at
  WHERE id = _pengumpulan_id;

  RETURN jsonb_build_object(
    'ok', true,
    'submitted_at', now(),
    'status_penilaian', v_status_penilaian,
    'total_pg', v_total_pg,
    'benar_pg', v_benar_pg,
    'nilai_pg', v_nilai_pg,
    'total_essay', v_total_essay,
    'nilai_akhir', v_nilai_akhir
  );
END;
$$;

-- 7. Server-level remedial eligibility guard: check_remedial_eligibility
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

  -- Block archived assignment from remedial
  IF COALESCE(v_penugasan.is_archived, false) = true THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'reason', 'Penugasan telah diarsipkan dan tidak lagi menyediakan remedial.',
      'is_archived', true
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

  -- 3. Cek pengumpulan asli (original submission) siswa
  SELECT * INTO v_original
  FROM public.penugasan_pengumpulan
  WHERE penugasan_id = _penugasan_id AND siswa_id = v_target_siswa;

  IF v_original IS NULL THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'reason', 'Anda belum mengumpulkan tugas utama.',
      'has_submitted_original', false,
      'kkm', v_penugasan.kkm
    );
  END IF;

  IF v_original.status <> 'submitted' THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'reason', 'Tugas utama Anda masih berupa draf dan belum diserahkan.',
      'original_status', v_original.status,
      'kkm', v_penugasan.kkm
    );
  END IF;

  IF v_original.status_penilaian <> 'dinilai' THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'reason', 'Tugas utama Anda sedang diperiksa dan belum dinilai oleh guru.',
      'status_penilaian', v_original.status_penilaian,
      'kkm', v_penugasan.kkm
    );
  END IF;

  -- 4. Cek nilai terhadap KKM
  IF v_original.nilai_akhir IS NOT NULL AND v_original.nilai_akhir >= v_penugasan.kkm THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'reason', 'Nilai Anda telah mencapai atau melampaui KKM (' || v_penugasan.kkm || '). Anda tidak memerlukan remedial.',
      'nilai_murni', v_original.nilai_akhir,
      'kkm', v_penugasan.kkm,
      'is_tuntas', true
    );
  END IF;

  -- 5. Cek apakah siswa sudah pernah mengerjakan remedial sebelumnya
  SELECT * INTO v_remedial
  FROM public.penugasan_remedial_pengumpulan
  WHERE penugasan_id = _penugasan_id AND siswa_id = v_target_siswa;

  IF v_remedial IS NOT NULL AND v_remedial.status = 'submitted' THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'reason', 'Anda telah menyelesaikan pengumpulan tugas remedial ini.',
      'remedial_submitted', true,
      'nilai_murni', v_original.nilai_akhir,
      'nilai_remedial', v_remedial.nilai_akhir,
      'kkm', v_penugasan.kkm
    );
  END IF;

  -- Eligible untuk remedial
  RETURN jsonb_build_object(
    'eligible', true,
    'reason', 'Nilai tugas Anda di bawah KKM. Silakan kerjakan tugas remedial.',
    'nilai_murni', v_original.nilai_akhir,
    'kkm', v_penugasan.kkm,
    'remedial_paket_soal_id', v_penugasan.remedial_paket_soal_id,
    'remedial_draft_exists', (v_remedial IS NOT NULL)
  );
END;
$$;

-- 8. Server-level remedial start/get with immutable nilai_murni snapshot
CREATE OR REPLACE FUNCTION public.start_or_get_remedial_submission(_penugasan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_penugasan record;
  v_eligibility jsonb;
  v_original record;
  v_remedial record;
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

  -- Block archived assignment from remedial
  IF COALESCE(v_penugasan.is_archived, false) = true THEN
    RAISE EXCEPTION 'Penugasan telah diarsipkan dan tidak lagi menerima remedial.';
  END IF;

  -- Verifikasi kelayakan via check_remedial_eligibility
  v_eligibility := public.check_remedial_eligibility(_penugasan_id, auth.uid());

  -- Ambil draft jika sudah ada
  SELECT * INTO v_remedial
  FROM public.penugasan_remedial_pengumpulan
  WHERE penugasan_id = _penugasan_id AND siswa_id = auth.uid();

  IF v_remedial IS NOT NULL THEN
    -- Pastikan nilai_murni terisi jika sebelumnya belum tersnapshot
    IF v_remedial.nilai_murni IS NULL THEN
      SELECT nilai_akhir INTO v_original
      FROM public.penugasan_pengumpulan
      WHERE id = v_remedial.original_pengumpulan_id;

      IF v_original.nilai_akhir IS NOT NULL THEN
        UPDATE public.penugasan_remedial_pengumpulan
        SET nilai_murni = v_original.nilai_akhir
        WHERE id = v_remedial.id
        RETURNING * INTO v_remedial;
      END IF;
    END IF;

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

  -- Ambil original_pengumpulan_id dan nilai_akhir untuk snapshot nilai_murni
  SELECT id, nilai_akhir INTO v_original
  FROM public.penugasan_pengumpulan
  WHERE penugasan_id = _penugasan_id AND siswa_id = auth.uid();

  -- Buat baris baru draf remedial dengan snapshot nilai_murni yang permanen
  INSERT INTO public.penugasan_remedial_pengumpulan (
    penugasan_id,
    siswa_id,
    original_pengumpulan_id,
    nilai_murni,
    status
  )
  VALUES (
    _penugasan_id,
    auth.uid(),
    v_original.id,
    v_original.nilai_akhir,
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

-- 9. Server-level sanitized remedial question retrieval guard
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

  -- Block archived assignment
  IF COALESCE(v_penugasan.is_archived, false) = true THEN
    RAISE EXCEPTION 'Penugasan telah diarsipkan dan soal remedial tidak dapat diakses.';
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
    RAISE EXCEPTION 'Paket soal remedial belum disetel untuk penugasan ini.';
  END IF;

  SELECT soal INTO v_soal
  FROM public.paket_soal
  WHERE id = v_remedial_paket_id;

  IF v_soal IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Sanitasi soal remedial: hilangkan jawaban kunci
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

-- 10. Server-level remedial submission guard: submit_remedial_penugasan
CREATE OR REPLACE FUNCTION public.submit_remedial_penugasan(_pengumpulan_remedial_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remedial record;
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
  -- 1. Validasi pengumpulan remedial & kepemilikan
  SELECT * INTO v_remedial
  FROM public.penugasan_remedial_pengumpulan
  WHERE id = _pengumpulan_remedial_id AND siswa_id = auth.uid();

  IF v_remedial IS NULL THEN
    RAISE EXCEPTION 'Data remedial tidak ditemukan atau bukan milik Anda.';
  END IF;

  IF v_remedial.status = 'submitted' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already_submitted', true,
      'submitted_at', v_remedial.submitted_at,
      'status_penilaian', v_remedial.status_penilaian,
      'nilai_akhir', v_remedial.nilai_akhir
    );
  END IF;

  -- 2. Validasi penugasan & status arsip
  SELECT * INTO v_penugasan
  FROM public.penugasan
  WHERE id = v_remedial.penugasan_id;

  IF v_penugasan IS NULL THEN
    RAISE EXCEPTION 'Penugasan tidak ditemukan.';
  END IF;

  -- Block submission on archived assignments
  IF COALESCE(v_penugasan.is_archived, false) = true THEN
    RAISE EXCEPTION 'Penugasan telah diarsipkan dan remedial tidak lagi menerima pengumpulan.';
  END IF;

  IF v_penugasan.remedial_paket_soal_id IS NULL THEN
    RAISE EXCEPTION 'Paket soal remedial belum disetel.';
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
        v_kunci := v_elem->>'kunci';

        -- Ambil jawaban remedial siswa
        SELECT * INTO v_rec_jawaban
        FROM public.penugasan_remedial_jawaban
        WHERE pengumpulan_remedial_id = _pengumpulan_remedial_id AND soal_id = v_soal_id;

        v_jawaban_teks := v_rec_jawaban.jawaban;
        v_is_correct := false;

        IF v_jawaban_teks IS NOT NULL AND v_kunci IS NOT NULL THEN
          IF TRIM(v_jawaban_teks) = TRIM(v_kunci) THEN
            v_is_correct := true;
          ELSIF v_jawaban_teks ~* '^[A-E]$' AND v_elem->'opsi' IS NOT NULL THEN
            v_opsi_idx := ASCII(UPPER(v_jawaban_teks)) - 65;
            v_opt_text := v_elem->'opsi'->>v_opsi_idx;
            IF v_opt_text IS NOT NULL AND TRIM(v_opt_text) = TRIM(v_kunci) THEN
              v_is_correct := true;
            END IF;
          ELSIF v_kunci ~* '^[A-E]$' AND v_elem->'opsi' IS NOT NULL THEN
            v_opsi_idx := ASCII(UPPER(v_kunci)) - 65;
            v_opt_text := v_elem->'opsi'->>v_opsi_idx;
            IF v_opt_text IS NOT NULL AND TRIM(v_opt_text) = TRIM(v_jawaban_teks) THEN
              v_is_correct := true;
            END IF;
          END IF;
        END IF;

        IF v_is_correct THEN
          v_benar_pg := v_benar_pg + 1;
        END IF;

        -- Simpan hasil koreksi PG remedial
        IF v_rec_jawaban.id IS NOT NULL THEN
          UPDATE public.penugasan_remedial_jawaban
          SET is_correct = v_is_correct,
              skor = CASE WHEN v_is_correct THEN 100.00 ELSE 0.00 END
          WHERE id = v_rec_jawaban.id;
        ELSE
          INSERT INTO public.penugasan_remedial_jawaban (
            pengumpulan_remedial_id,
            soal_id,
            jawaban,
            is_correct,
            skor
          ) VALUES (
            _pengumpulan_remedial_id,
            v_soal_id,
            NULL,
            false,
            0.00
          );
        END IF;

      ELSIF v_jenis = 'Esai' THEN
        v_total_essay := v_total_essay + 1;
      END IF;
    END LOOP;
  END IF;

  -- 4. Hitung Nilai & Status Penilaian Remedial
  v_total_soal := v_total_pg + v_total_essay;

  IF v_total_pg > 0 THEN
    v_nilai_pg := ROUND((v_benar_pg::numeric / v_total_pg::numeric) * 100.00, 2);
  ELSE
    v_nilai_pg := 0.00;
  END IF;

  IF v_total_essay = 0 THEN
    v_status_penilaian := 'dinilai';
    v_nilai_akhir := v_nilai_pg;
    v_graded_at := now();
  ELSE
    v_status_penilaian := 'perlu_penilaian_manual';
    v_nilai_akhir := NULL;
    v_graded_at := NULL;
  END IF;

  UPDATE public.penugasan_remedial_pengumpulan
  SET status = 'submitted',
      submitted_at = now(),
      status_penilaian = v_status_penilaian,
      nilai_pg = v_nilai_pg,
      nilai_essay = v_nilai_essay,
      nilai_akhir = v_nilai_akhir,
      graded_at = v_graded_at
  WHERE id = _pengumpulan_remedial_id;

  RETURN jsonb_build_object(
    'ok', true,
    'submitted_at', now(),
    'status_penilaian', v_status_penilaian,
    'total_pg', v_total_pg,
    'benar_pg', v_benar_pg,
    'nilai_pg', v_nilai_pg,
    'total_essay', v_total_essay,
    'nilai_akhir', v_nilai_akhir
  );
END;
$$;

-- 11. Hardened archive_academic_item with dependency protection
CREATE OR REPLACE FUNCTION public.archive_academic_item(
  _item_type text,
  _item_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_found boolean := false;
  v_title text := '';
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Akses ditolak: Tidak terautentikasi';
  END IF;

  v_role := get_current_user_role();
  IF v_role <> 'guru' AND NOT is_admin() THEN
    RAISE EXCEPTION 'Hanya guru pemilik atau admin yang dapat mengarsipkan data ini';
  END IF;

  IF _item_type = 'modul' THEN
    -- Protect active student-facing modules: reject if 'Terbit'
    IF EXISTS (
      SELECT 1 FROM public.moduls m
      WHERE m.id = _item_id
        AND m.status = 'Terbit'
        AND (m.user_id = v_user_id OR is_admin())
    ) THEN
      RAISE EXCEPTION 'Modul ajar masih berstatus terbit dan aktif digunakan siswa. Ubah status menjadi Draf terlebih dahulu sebelum mengarsipkan.';
    END IF;

    UPDATE public.moduls
    SET is_archived = true,
        archived_at = now(),
        archived_by = v_user_id
    WHERE id = _item_id
      AND (user_id = v_user_id OR is_admin())
    RETURNING judul INTO v_title;

    IF FOUND THEN
      v_found := true;
    END IF;

  ELSIF _item_type = 'paket_soal' THEN
    -- Protect active question bank dependencies:
    -- Reject if referenced by an active/published unarchived penugasan (primary or remedial)
    IF EXISTS (
      SELECT 1 FROM public.penugasan p
      WHERE (p.paket_soal_id = _item_id OR (p.remedial_paket_soal_id = _item_id AND COALESCE(p.remedial_enabled, false) = true))
        AND p.status = 'published'
        AND COALESCE(p.is_archived, false) = false
    ) THEN
      RAISE EXCEPTION 'Paket soal masih digunakan oleh penugasan aktif dan belum dapat diarsipkan.';
    END IF;

    UPDATE public.paket_soal
    SET is_archived = true,
        archived_at = now(),
        archived_by = v_user_id
    WHERE id = _item_id
      AND (user_id = v_user_id OR is_admin())
    RETURNING judul INTO v_title;

    IF FOUND THEN
      v_found := true;
    END IF;

  ELSIF _item_type = 'penugasan' THEN
    UPDATE public.penugasan
    SET is_archived = true,
        archived_at = now(),
        archived_by = v_user_id
    WHERE id = _item_id
      AND (guru_id = v_user_id OR is_admin())
    RETURNING judul INTO v_title;

    IF FOUND THEN
      v_found := true;
    END IF;

  ELSE
    RAISE EXCEPTION 'Tipe item tidak valid: %. Harus modul, paket_soal, atau penugasan', _item_type;
  END IF;

  IF NOT v_found THEN
    RAISE EXCEPTION 'Data tidak ditemukan atau Anda tidak memiliki akses untuk mengarsipkan data ini';
  END IF;

  -- Log action into system_logs
  INSERT INTO public.system_logs (level, event_type, message, context, created_at)
  VALUES (
    'info',
    'ARCHIVE_ITEM',
    format('Item %s (%s) diarsipkan oleh pengguna %s', _item_type, v_title, v_user_id),
    jsonb_build_object(
      'user_id', v_user_id,
      'item_type', _item_type,
      'item_id', _item_id,
      'title', v_title,
      'archived_at', now()
    ),
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'item_type', _item_type,
    'item_id', _item_id,
    'title', v_title,
    'is_archived', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_academic_item(
  _item_type text,
  _item_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_found boolean := false;
  v_title text := '';
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Akses ditolak: Tidak terautentikasi';
  END IF;

  v_role := get_current_user_role();
  IF v_role <> 'guru' AND NOT is_admin() THEN
    RAISE EXCEPTION 'Hanya guru pemilik atau admin yang dapat memulihkan data ini';
  END IF;

  IF _item_type = 'modul' THEN
    UPDATE public.moduls
    SET is_archived = false,
        archived_at = null,
        archived_by = null
    WHERE id = _item_id
      AND (user_id = v_user_id OR is_admin())
    RETURNING judul INTO v_title;

    IF FOUND THEN
      v_found := true;
    END IF;

  ELSIF _item_type = 'paket_soal' THEN
    UPDATE public.paket_soal
    SET is_archived = false,
        archived_at = null,
        archived_by = null
    WHERE id = _item_id
      AND (user_id = v_user_id OR is_admin())
    RETURNING judul INTO v_title;

    IF FOUND THEN
      v_found := true;
    END IF;

  ELSIF _item_type = 'penugasan' THEN
    UPDATE public.penugasan
    SET is_archived = false,
        archived_at = null,
        archived_by = null
    WHERE id = _item_id
      AND (guru_id = v_user_id OR is_admin())
    RETURNING judul INTO v_title;

    IF FOUND THEN
      v_found := true;
    END IF;

  ELSE
    RAISE EXCEPTION 'Tipe item tidak valid: %. Harus modul, paket_soal, atau penugasan', _item_type;
  END IF;

  IF NOT v_found THEN
    RAISE EXCEPTION 'Data tidak ditemukan atau Anda tidak memiliki akses untuk memulihkan data ini';
  END IF;

  -- Log action into system_logs
  INSERT INTO public.system_logs (level, event_type, message, context, created_at)
  VALUES (
    'info',
    'RESTORE_ITEM',
    format('Item %s (%s) dipulihkan oleh pengguna %s', _item_type, v_title, v_user_id),
    jsonb_build_object(
      'user_id', v_user_id,
      'item_type', _item_type,
      'item_id', _item_id,
      'title', v_title,
      'restored_at', now()
    ),
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'item_type', _item_type,
    'item_id', _item_id,
    'title', v_title,
    'is_archived', false
  );
END;
$$;

-- 12. Correct Tahun Ajaran context derivation in get_teacher_archived_items
CREATE OR REPLACE FUNCTION public.get_teacher_archived_items()
RETURNS TABLE (
  id uuid,
  item_type text,
  judul text,
  deskripsi text,
  mapel text,
  kelas_nama text,
  tahun_ajaran text,
  archived_at timestamp with time zone,
  extra_info jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_adm boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Akses ditolak: Tidak terautentikasi';
  END IF;

  v_is_adm := is_admin();

  RETURN QUERY
  -- 1. Moduls
  SELECT
    m.id,
    'modul'::text AS item_type,
    m.judul,
    m.ringkasan AS deskripsi,
    m.mapel,
    COALESCE(k.nama_kelas, m.kelas) AS kelas_nama,
    COALESCE(
      k.tahun_ajaran,
      (
        SELECT k2.tahun_ajaran
        FROM public.kelas k2
        WHERE (k2.guru_id = m.user_id OR v_is_adm)
          AND k2.nama_kelas = m.kelas
          AND k2.tahun_ajaran IS NOT NULL AND k2.tahun_ajaran <> ''
        ORDER BY k2.created_at DESC
        LIMIT 1
      ),
      'Tidak Terikat'
    ) AS tahun_ajaran,
    m.archived_at,
    jsonb_build_object(
      'status', m.status,
      'sections_count', jsonb_array_length(COALESCE(m.sections, '[]'::jsonb)),
      'slides_count', jsonb_array_length(COALESCE(m.slides, '[]'::jsonb))
    ) AS extra_info
  FROM public.moduls m
  LEFT JOIN public.kelas k ON k.id = m.kelas_id
  WHERE m.is_archived = true
    AND (m.user_id = v_user_id OR v_is_adm)

  UNION ALL

  -- 2. Paket Soal (Derive academic year via linked assignment, linked module, or teacher class)
  SELECT
    ps.id,
    'paket_soal'::text AS item_type,
    ps.judul,
    ps.topik AS deskripsi,
    ''::text AS mapel,
    array_to_string(COALESCE(ps.kelas, ARRAY[]::text[]), ', ') AS kelas_nama,
    COALESCE(
      -- Priority 1: From linked Penugasan (most recent assignment for this package)
      (
        SELECT kp.tahun_ajaran
        FROM public.penugasan p
        JOIN public.kelas kp ON kp.id = p.kelas_id
        WHERE (p.paket_soal_id = ps.id OR p.remedial_paket_soal_id = ps.id)
          AND (p.guru_id = ps.user_id OR v_is_adm)
          AND kp.tahun_ajaran IS NOT NULL AND kp.tahun_ajaran <> ''
        ORDER BY p.created_at DESC
        LIMIT 1
      ),
      -- Priority 2: From linked Modul Ajar
      (
        SELECT km.tahun_ajaran
        FROM public.moduls m
        JOIN public.kelas km ON km.id = m.kelas_id
        WHERE m.id = ps.modul_id
          AND km.tahun_ajaran IS NOT NULL AND km.tahun_ajaran <> ''
        LIMIT 1
      ),
      -- Priority 3: From matching class names in ps.kelas for this teacher
      (
        SELECT kc.tahun_ajaran
        FROM public.kelas kc
        WHERE (kc.guru_id = ps.user_id OR v_is_adm)
          AND kc.nama_kelas = ANY(ps.kelas)
          AND kc.tahun_ajaran IS NOT NULL AND kc.tahun_ajaran <> ''
        ORDER BY kc.created_at DESC
        LIMIT 1
      ),
      -- Priority 4: Explicit fallback when year cannot be derived
      'Tidak Terikat'
    ) AS tahun_ajaran,
    ps.archived_at,
    jsonb_build_object(
      'status', ps.status,
      'soal_count', jsonb_array_length(COALESCE(ps.soal, '[]'::jsonb))
    ) AS extra_info
  FROM public.paket_soal ps
  WHERE ps.is_archived = true
    AND (ps.user_id = v_user_id OR v_is_adm)

  UNION ALL

  -- 3. Penugasan
  SELECT
    p.id,
    'penugasan'::text AS item_type,
    p.judul,
    COALESCE(p.instruksi, '') AS deskripsi,
    COALESCE(k.mapel, '') AS mapel,
    COALESCE(k.nama_kelas, '') AS kelas_nama,
    COALESCE(k.tahun_ajaran, 'Tidak Terikat') AS tahun_ajaran,
    p.archived_at,
    jsonb_build_object(
      'kkm', p.kkm,
      'remedial_enabled', p.remedial_enabled,
      'status', p.status,
      'deadline', p.deadline
    ) AS extra_info
  FROM public.penugasan p
  LEFT JOIN public.kelas k ON k.id = p.kelas_id
  WHERE p.is_archived = true
    AND (p.guru_id = v_user_id OR v_is_adm)

  ORDER BY archived_at DESC NULLS LAST;
END;
$$;
