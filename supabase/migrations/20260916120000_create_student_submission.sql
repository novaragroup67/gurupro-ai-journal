-- Migration: Create student submission tables, RLS policies, and sanitized RPCs
-- Date: 2026-09-16

-- 1. Tabel Penugasan Pengumpulan (Submission)
CREATE TABLE IF NOT EXISTS public.penugasan_pengumpulan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  penugasan_id UUID NOT NULL REFERENCES public.penugasan(id) ON DELETE CASCADE,
  siswa_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_penugasan_siswa UNIQUE (penugasan_id, siswa_id)
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_pengumpulan_penugasan ON public.penugasan_pengumpulan(penugasan_id);
CREATE INDEX IF NOT EXISTS idx_pengumpulan_siswa ON public.penugasan_pengumpulan(siswa_id);
CREATE INDEX IF NOT EXISTS idx_pengumpulan_status ON public.penugasan_pengumpulan(status);

-- 2. Tabel Penugasan Jawaban (Answers)
CREATE TABLE IF NOT EXISTS public.penugasan_jawaban (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pengumpulan_id UUID NOT NULL REFERENCES public.penugasan_pengumpulan(id) ON DELETE CASCADE,
  soal_id TEXT NOT NULL,
  jawaban TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_pengumpulan_soal UNIQUE (pengumpulan_id, soal_id)
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_jawaban_pengumpulan ON public.penugasan_jawaban(pengumpulan_id);
CREATE INDEX IF NOT EXISTS idx_jawaban_soal ON public.penugasan_jawaban(soal_id);

-- 3. Trigger Auto-Updated At
DROP TRIGGER IF EXISTS set_pengumpulan_updated_at ON public.penugasan_pengumpulan;
CREATE TRIGGER set_pengumpulan_updated_at
  BEFORE UPDATE ON public.penugasan_pengumpulan
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_jawaban_updated_at ON public.penugasan_jawaban;
CREATE TRIGGER set_jawaban_updated_at
  BEFORE UPDATE ON public.penugasan_jawaban
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 4. Trigger Submitted Timestamp
CREATE OR REPLACE FUNCTION public.handle_submission_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'submitted' AND (OLD.status IS NULL OR OLD.status != 'submitted') THEN
    NEW.submitted_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_submission_status_change ON public.penugasan_pengumpulan;
CREATE TRIGGER trg_submission_status_change
  BEFORE INSERT OR UPDATE ON public.penugasan_pengumpulan
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_submission_status_change();

-- 5. Row Level Security & Permissions
ALTER TABLE public.penugasan_pengumpulan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.penugasan_jawaban ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.penugasan_pengumpulan FROM anon;
REVOKE ALL ON public.penugasan_jawaban FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.penugasan_pengumpulan TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.penugasan_jawaban TO authenticated;
GRANT ALL ON public.penugasan_pengumpulan TO service_role;
GRANT ALL ON public.penugasan_jawaban TO service_role;

-- Policies for penugasan_pengumpulan:
DROP POLICY IF EXISTS "siswa select own pengumpulan" ON public.penugasan_pengumpulan;
CREATE POLICY "siswa select own pengumpulan" ON public.penugasan_pengumpulan
  FOR SELECT TO authenticated
  USING (auth.uid() = siswa_id);

DROP POLICY IF EXISTS "siswa insert own draft pengumpulan" ON public.penugasan_pengumpulan;
CREATE POLICY "siswa insert own draft pengumpulan" ON public.penugasan_pengumpulan
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = siswa_id
    AND status = 'draft'
    AND EXISTS (
      SELECT 1 FROM public.penugasan p
      JOIN public.kelas_anggota ka ON ka.kelas_id = p.kelas_id
      WHERE p.id = penugasan_id
        AND p.status = 'published'
        AND ka.siswa_id = auth.uid()
        AND ka.status = 'aktif'
        AND (p.deadline IS NULL OR p.deadline > now())
    )
  );

DROP POLICY IF EXISTS "siswa update own draft pengumpulan" ON public.penugasan_pengumpulan;
CREATE POLICY "siswa update own draft pengumpulan" ON public.penugasan_pengumpulan
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = siswa_id
    AND status = 'draft'
  )
  WITH CHECK (
    auth.uid() = siswa_id
    AND EXISTS (
      SELECT 1 FROM public.penugasan p
      WHERE p.id = penugasan_pengumpulan.penugasan_id
        AND (p.deadline IS NULL OR p.deadline > now())
    )
  );

DROP POLICY IF EXISTS "guru select submissions of own penugasan" ON public.penugasan_pengumpulan;
CREATE POLICY "guru select submissions of own penugasan" ON public.penugasan_pengumpulan
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.penugasan p
      WHERE p.id = penugasan_pengumpulan.penugasan_id
        AND p.guru_id = auth.uid()
    )
  );

-- Policies for penugasan_jawaban:
DROP POLICY IF EXISTS "siswa select own jawaban" ON public.penugasan_jawaban;
CREATE POLICY "siswa select own jawaban" ON public.penugasan_jawaban
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.penugasan_pengumpulan pp
      WHERE pp.id = pengumpulan_id
        AND pp.siswa_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "siswa insert own draft jawaban" ON public.penugasan_jawaban;
CREATE POLICY "siswa insert own draft jawaban" ON public.penugasan_jawaban
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.penugasan_pengumpulan pp
      JOIN public.penugasan p ON p.id = pp.penugasan_id
      WHERE pp.id = pengumpulan_id
        AND pp.siswa_id = auth.uid()
        AND pp.status = 'draft'
        AND (p.deadline IS NULL OR p.deadline > now())
    )
  );

DROP POLICY IF EXISTS "siswa update own draft jawaban" ON public.penugasan_jawaban;
CREATE POLICY "siswa update own draft jawaban" ON public.penugasan_jawaban
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.penugasan_pengumpulan pp
      WHERE pp.id = penugasan_jawaban.pengumpulan_id
        AND pp.siswa_id = auth.uid()
        AND pp.status = 'draft'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.penugasan_pengumpulan pp
      JOIN public.penugasan p ON p.id = pp.penugasan_id
      WHERE pp.id = penugasan_jawaban.pengumpulan_id
        AND pp.siswa_id = auth.uid()
        AND pp.status = 'draft'
        AND (p.deadline IS NULL OR p.deadline > now())
    )
  );

DROP POLICY IF EXISTS "guru select jawaban of own penugasan" ON public.penugasan_jawaban;
CREATE POLICY "guru select jawaban of own penugasan" ON public.penugasan_jawaban
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.penugasan_pengumpulan pp
      JOIN public.penugasan p ON p.id = pp.penugasan_id
      WHERE pp.id = penugasan_jawaban.pengumpulan_id
        AND p.guru_id = auth.uid()
    )
  );

-- 6. RPC: Ambil butir soal tersanitasi untuk siswa (membuang 'kunci' agar tidak bocor)
CREATE OR REPLACE FUNCTION public.get_penugasan_soal_for_siswa(_penugasan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paket_id uuid;
  v_soal jsonb;
  v_sanitized jsonb;
BEGIN
  -- Pastikan penugasan berstatus published/closed dan siswa adalah anggota aktif kelas terkait
  SELECT p.paket_soal_id INTO v_paket_id
  FROM public.penugasan p
  JOIN public.kelas_anggota ka ON ka.kelas_id = p.kelas_id
  WHERE p.id = _penugasan_id
    AND p.status IN ('published', 'closed')
    AND ka.siswa_id = auth.uid()
    AND ka.status = 'aktif';

  IF v_paket_id IS NULL THEN
    RAISE EXCEPTION 'Penugasan tidak ditemukan atau Anda tidak memiliki akses ke kelas ini.';
  END IF;

  SELECT soal INTO v_soal
  FROM public.paket_soal
  WHERE id = v_paket_id;

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

GRANT EXECUTE ON FUNCTION public.get_penugasan_soal_for_siswa(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_penugasan_soal_for_siswa(uuid) FROM anon;

-- 7. RPC: Submit Penugasan secara atomik dengan validasi tenggat waktu di server
CREATE OR REPLACE FUNCTION public.submit_penugasan(_pengumpulan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pengumpulan record;
  v_penugasan record;
BEGIN
  SELECT * INTO v_pengumpulan
  FROM public.penugasan_pengumpulan
  WHERE id = _pengumpulan_id AND siswa_id = auth.uid();

  IF v_pengumpulan IS NULL THEN
    RAISE EXCEPTION 'Data pengumpulan tidak ditemukan atau bukan milik Anda.';
  END IF;

  IF v_pengumpulan.status = 'submitted' THEN
    RETURN jsonb_build_object('ok', true, 'already_submitted', true, 'submitted_at', v_pengumpulan.submitted_at);
  END IF;

  SELECT * INTO v_penugasan
  FROM public.penugasan
  WHERE id = v_pengumpulan.penugasan_id;

  IF v_penugasan IS NULL THEN
    RAISE EXCEPTION 'Penugasan tidak ditemukan.';
  END IF;

  -- Validasi batas waktu pengerjaan di server
  IF v_penugasan.deadline IS NOT NULL AND now() >= v_penugasan.deadline THEN
    RAISE EXCEPTION 'Tenggat waktu penugasan telah berakhir. Pengumpulan tidak dapat diterima.';
  END IF;

  UPDATE public.penugasan_pengumpulan
  SET status = 'submitted', submitted_at = now()
  WHERE id = _pengumpulan_id;

  RETURN jsonb_build_object('ok', true, 'already_submitted', false, 'submitted_at', now());
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_penugasan(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.submit_penugasan(uuid) FROM anon;
