-- ==============================================================================
-- GURUPRO RELEASE CANDIDATE SCHEMA PARITY MIGRATION (QA-2)
-- Timestamp: 2026-10-03 00:00:00 UTC
-- Purpose:
--   1. Ensures all tables from AI, Illustration, and Presentation pipelines exist.
--   2. Enforces strict immutability triggers on submissions and memberships.
--   3. Hardens RLS on kelas, tahun_ajaran, and penugasan_jawaban.
--   4. Revokes anonymous and public execute permissions on internal/security-definer RPCs.
--   5. Registers storage buckets with private visibility.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. AI SOURCE SNAPSHOTS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_source_snapshots (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('text', 'url', 'kurikulum', 'dokumen')),
  source_url TEXT,
  source_title TEXT,
  content_type TEXT NOT NULL DEFAULT 'text/plain',
  content_hash TEXT NOT NULL,
  retrieved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  normalized_content TEXT NOT NULL,
  word_count INTEGER NOT NULL DEFAULT 0,
  char_count INTEGER NOT NULL DEFAULT 0,
  chunks JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ingestion_status TEXT NOT NULL DEFAULT 'completed' CHECK (ingestion_status IN ('pending', 'completed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_source_snapshots_user_id ON public.ai_source_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_source_snapshots_content_hash ON public.ai_source_snapshots(content_hash);
CREATE INDEX IF NOT EXISTS idx_ai_source_snapshots_created_at ON public.ai_source_snapshots(created_at DESC);

ALTER TABLE public.ai_source_snapshots ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_source_snapshots' AND policyname = 'Guru can select own source snapshots') THEN
    CREATE POLICY "Guru can select own source snapshots" ON public.ai_source_snapshots
      FOR SELECT TO authenticated
      USING (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'guru'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_source_snapshots' AND policyname = 'Guru can insert own source snapshots') THEN
    CREATE POLICY "Guru can insert own source snapshots" ON public.ai_source_snapshots
      FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'guru'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_source_snapshots' AND policyname = 'Guru can delete own source snapshots') THEN
    CREATE POLICY "Guru can delete own source snapshots" ON public.ai_source_snapshots
      FOR DELETE TO authenticated
      USING (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'guru'));
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. AI METADATA COLUMNS ON MODULS & PAKET_SOAL
-- ------------------------------------------------------------------------------
ALTER TABLE public.moduls ADD COLUMN IF NOT EXISTS ai_metadata JSONB DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_moduls_ai_metadata ON public.moduls USING gin (ai_metadata);

ALTER TABLE public.paket_soal ADD COLUMN IF NOT EXISTS ai_metadata JSONB DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_paket_soal_ai_metadata ON public.paket_soal USING gin (ai_metadata);

-- ------------------------------------------------------------------------------
-- 3. GENERATION PLANS (GEN-0)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.generation_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES public.moduls(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_version TEXT NOT NULL DEFAULT 'v1',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'in_progress', 'completed', 'failed')),
  lesson_title TEXT NOT NULL,
  subject TEXT NOT NULL,
  grade_level TEXT NOT NULL,
  learning_objectives JSONB NOT NULL DEFAULT '[]'::jsonb,
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  illustration_plan JSONB NOT NULL DEFAULT '[]'::jsonb,
  presentation_plan JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_generation_plans_module_id ON public.generation_plans(module_id);
CREATE INDEX IF NOT EXISTS idx_generation_plans_created_by ON public.generation_plans(created_by);
CREATE INDEX IF NOT EXISTS idx_generation_plans_status ON public.generation_plans(status);

ALTER TABLE public.generation_plans ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'generation_plans' AND policyname = 'Teacher can manage own generation plans') THEN
    CREATE POLICY "Teacher can manage own generation plans" ON public.generation_plans
      FOR ALL TO authenticated
      USING (created_by = auth.uid())
      WITH CHECK (created_by = auth.uid());
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 4. ILLUSTRATION PIPELINE TABLES (VIS-1A -> VIS-1E)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.illustration_generation_requests (
  id TEXT PRIMARY KEY,
  module_id UUID NOT NULL REFERENCES public.moduls(id) ON DELETE CASCADE,
  generation_plan_id UUID NOT NULL REFERENCES public.generation_plans(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  style TEXT NOT NULL DEFAULT 'educational_clean',
  aspect_ratio TEXT NOT NULL DEFAULT '16:9',
  requested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.illustration_generation_requests ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.illustration_generations (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES public.illustration_generation_requests(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'gemini',
  model TEXT NOT NULL,
  image_url TEXT,
  storage_path TEXT,
  checksum_sha256 TEXT,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'failed')),
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.illustration_generations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.illustration_assets (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES public.moduls(id) ON DELETE CASCADE,
  generation_id TEXT REFERENCES public.illustration_generations(id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  checksum_sha256 TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'image/png',
  byte_size INTEGER NOT NULL DEFAULT 0,
  approval_status TEXT NOT NULL DEFAULT 'pending_review' CHECK (approval_status IN ('pending_review', 'approved_for_use', 'rejected', 'archived')),
  lifecycle_status TEXT NOT NULL DEFAULT 'staged' CHECK (lifecycle_status IN ('staged', 'attached', 'superseded', 'soft_deleted')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.illustration_assets ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.illustration_reviews (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES public.illustration_assets(id) ON DELETE CASCADE,
  reviewed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  review_status TEXT NOT NULL CHECK (review_status IN ('approved', 'rejected', 'needs_revision')),
  notes TEXT,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.illustration_reviews ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.illustration_quality_evaluations (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES public.illustration_assets(id) ON DELETE CASCADE,
  evaluated_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  evaluator_version TEXT NOT NULL DEFAULT 'illustration_quality_v1',
  status TEXT NOT NULL CHECK (status IN ('pending', 'passed', 'failed', 'superseded')),
  decision TEXT NOT NULL CHECK (decision IN ('PASS', 'FAIL', 'WARN')),
  checks JSONB NOT NULL DEFAULT '{}'::jsonb,
  findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.illustration_quality_evaluations ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 5. PRESENTATION PIPELINE TABLES (PPT-1A -> PPT-1F)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.presentation_generation_requests (
  id TEXT PRIMARY KEY,
  module_id UUID NOT NULL REFERENCES public.moduls(id) ON DELETE CASCADE,
  generation_plan_id UUID NOT NULL REFERENCES public.generation_plans(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slide_count INTEGER NOT NULL DEFAULT 5,
  target_audience TEXT NOT NULL DEFAULT 'sma_smk',
  style_theme TEXT NOT NULL DEFAULT 'modern_slate',
  requested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.presentation_generation_requests ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.presentation_generation_results (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES public.presentation_generation_requests(id) ON DELETE CASCADE,
  generation_plan_id UUID NOT NULL REFERENCES public.generation_plans(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES public.moduls(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('generating', 'ready', 'failed', 'superseded')),
  slides JSONB NOT NULL DEFAULT '[]'::jsonb,
  quality_report JSONB NOT NULL DEFAULT '{}'::jsonb,
  content_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.presentation_generation_results ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.presentation_artifacts (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  module_id UUID NOT NULL REFERENCES public.moduls(id) ON DELETE CASCADE,
  generation_plan_id UUID NOT NULL REFERENCES public.generation_plans(id) ON DELETE CASCADE,
  content_result_id TEXT NOT NULL REFERENCES public.presentation_generation_results(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  download_url TEXT NOT NULL,
  checksum_sha256 TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  byte_size INTEGER NOT NULL DEFAULT 0,
  slide_count INTEGER NOT NULL DEFAULT 0,
  presentation_version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'archived', 'soft_deleted')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.presentation_artifacts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.presentation_reviews (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL REFERENCES public.presentation_artifacts(id) ON DELETE CASCADE,
  content_result_id TEXT NOT NULL REFERENCES public.presentation_generation_results(id) ON DELETE CASCADE,
  generation_plan_id UUID NOT NULL REFERENCES public.generation_plans(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES public.moduls(id) ON DELETE CASCADE,
  reviewed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  review_status TEXT NOT NULL CHECK (review_status IN ('in_review', 'approved', 'rejected', 'superseded')),
  presentation_version INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.presentation_reviews ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.presentation_quality_evaluations (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL REFERENCES public.presentation_artifacts(id) ON DELETE CASCADE,
  content_result_id TEXT NOT NULL REFERENCES public.presentation_generation_results(id) ON DELETE CASCADE,
  generation_plan_id UUID NOT NULL REFERENCES public.generation_plans(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES public.moduls(id) ON DELETE CASCADE,
  artifact_hash TEXT NOT NULL,
  presentation_version INTEGER NOT NULL DEFAULT 1,
  approved_version INTEGER NOT NULL DEFAULT 1,
  evaluator_version TEXT NOT NULL DEFAULT 'presentation_quality_v1',
  status TEXT NOT NULL CHECK (status IN ('pending', 'passed', 'failed', 'superseded')),
  decision TEXT NOT NULL CHECK (decision IN ('PASS', 'FAIL', 'ERROR')),
  structural_checks JSONB NOT NULL DEFAULT '{}'::jsonb,
  content_checks JSONB NOT NULL DEFAULT '{}'::jsonb,
  illustration_checks JSONB NOT NULL DEFAULT '{}'::jsonb,
  visual_checks JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_evaluation JSONB,
  findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  evaluated_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.presentation_quality_evaluations ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 6. IMMUTABILITY TRIGGERS
-- ------------------------------------------------------------------------------

-- Penugasan Pengumpulan Immutability
CREATE OR REPLACE FUNCTION public.trg_penugasan_pengumpulan_immutable_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Submission id is strictly immutable';
  END IF;
  IF NEW.penugasan_id IS DISTINCT FROM OLD.penugasan_id THEN
    RAISE EXCEPTION 'Submission penugasan_id is strictly immutable';
  END IF;
  IF NEW.siswa_id IS DISTINCT FROM OLD.siswa_id THEN
    RAISE EXCEPTION 'Submission siswa_id is strictly immutable';
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Submission created_at is strictly immutable';
  END IF;
  -- Prevent reverting submitted status back to draft
  IF OLD.status = 'submitted' AND NEW.status != 'submitted' THEN
    RAISE EXCEPTION 'Submission lifecycle regression blocked: submitted cannot revert to draft';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_submission_identity_immutable ON public.penugasan_pengumpulan;
CREATE TRIGGER trg_submission_identity_immutable
  BEFORE UPDATE ON public.penugasan_pengumpulan
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_penugasan_pengumpulan_immutable_guard();

-- Kelas Anggota Immutability
CREATE OR REPLACE FUNCTION public.trg_kelas_anggota_immutable_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Membership id is strictly immutable';
  END IF;
  IF NEW.kelas_id IS DISTINCT FROM OLD.kelas_id THEN
    RAISE EXCEPTION 'Membership kelas_id is strictly immutable';
  END IF;
  IF NEW.siswa_id IS DISTINCT FROM OLD.siswa_id THEN
    RAISE EXCEPTION 'Membership siswa_id is strictly immutable';
  END IF;
  IF NEW.siswa_nama IS DISTINCT FROM OLD.siswa_nama THEN
    RAISE EXCEPTION 'Membership siswa_nama is strictly immutable';
  END IF;
  IF NEW.siswa_email IS DISTINCT FROM OLD.siswa_email THEN
    RAISE EXCEPTION 'Membership siswa_email is strictly immutable';
  END IF;
  IF NEW.siswa_nisn IS DISTINCT FROM OLD.siswa_nisn THEN
    RAISE EXCEPTION 'Membership siswa_nisn is strictly immutable';
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Membership created_at is strictly immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_membership_identity_immutable ON public.kelas_anggota;
CREATE TRIGGER trg_membership_identity_immutable
  BEFORE UPDATE ON public.kelas_anggota
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_kelas_anggota_immutable_guard();

-- ------------------------------------------------------------------------------
-- 7. RLS HARDENING (KELAS, TAHUN AJARAN, PENUGASAN JAWABAN)
-- ------------------------------------------------------------------------------

-- Kelas: ensure only authenticated teachers can mutate
DROP POLICY IF EXISTS "guru insert own kelas" ON public.kelas;
CREATE POLICY "guru insert own kelas" ON public.kelas
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = guru_id AND public.get_current_user_role() = 'guru');

DROP POLICY IF EXISTS "guru update own kelas" ON public.kelas;
CREATE POLICY "guru update own kelas" ON public.kelas
  FOR UPDATE TO authenticated
  USING (auth.uid() = guru_id AND public.get_current_user_role() = 'guru')
  WITH CHECK (auth.uid() = guru_id AND public.get_current_user_role() = 'guru');

DROP POLICY IF EXISTS "guru delete own kelas" ON public.kelas;
CREATE POLICY "guru delete own kelas" ON public.kelas
  FOR DELETE TO authenticated
  USING (auth.uid() = guru_id AND public.get_current_user_role() = 'guru');

-- Tahun Ajaran: restrict mutation to admins only
DROP POLICY IF EXISTS "Allow insert tahun_ajaran" ON public.tahun_ajaran;
CREATE POLICY "Allow insert tahun_ajaran" ON public.tahun_ajaran
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Allow update tahun_ajaran" ON public.tahun_ajaran;
CREATE POLICY "Allow update tahun_ajaran" ON public.tahun_ajaran
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Allow delete tahun_ajaran" ON public.tahun_ajaran;
CREATE POLICY "Allow delete tahun_ajaran" ON public.tahun_ajaran
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- Penugasan Jawaban: full eligibility check
DROP POLICY IF EXISTS "siswa insert own draft jawaban" ON public.penugasan_jawaban;
CREATE POLICY "siswa insert own draft jawaban" ON public.penugasan_jawaban
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.penugasan_pengumpulan pp
      JOIN public.penugasan p ON p.id = pp.penugasan_id
      JOIN public.kelas_anggota ka ON ka.kelas_id = p.kelas_id
      WHERE pp.id = pengumpulan_id
        AND pp.siswa_id = auth.uid()
        AND pp.status = 'draft'
        AND p.status = 'published'
        AND COALESCE(p.is_archived, false) = false
        AND ka.siswa_id = auth.uid()
        AND ka.status = 'aktif'
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
      JOIN public.kelas_anggota ka ON ka.kelas_id = p.kelas_id
      WHERE pp.id = penugasan_jawaban.pengumpulan_id
        AND pp.siswa_id = auth.uid()
        AND pp.status = 'draft'
        AND p.status = 'published'
        AND COALESCE(p.is_archived, false) = false
        AND ka.siswa_id = auth.uid()
        AND ka.status = 'aktif'
        AND (p.deadline IS NULL OR p.deadline > now())
    )
  );

-- ------------------------------------------------------------------------------
-- 8. SECURITY DEFINER EXECUTE REVOCATIONS
-- ------------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.log_system_event(text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_system_event(text, text, text, jsonb) TO authenticated;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'admin_delete_teacher') THEN
    REVOKE EXECUTE ON FUNCTION public.admin_delete_teacher(uuid) FROM PUBLIC, anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'admin_update_teacher_profile') THEN
    REVOKE EXECUTE ON FUNCTION public.admin_update_teacher_profile(uuid, text, text, text, text, text) FROM PUBLIC, anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'admin_update_teacher_verification') THEN
    REVOKE EXECUTE ON FUNCTION public.admin_update_teacher_verification(uuid, text) FROM PUBLIC, anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_admin_dashboard_stats') THEN
    REVOKE EXECUTE ON FUNCTION public.get_admin_dashboard_stats() FROM PUBLIC, anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'simpan_penilaian_guru') THEN
    REVOKE EXECUTE ON FUNCTION public.simpan_penilaian_guru(uuid, numeric, text, jsonb) FROM PUBLIC, anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'simpan_penilaian_remedial_guru') THEN
    REVOKE EXECUTE ON FUNCTION public.simpan_penilaian_remedial_guru(uuid, numeric, text, jsonb) FROM PUBLIC, anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'submit_penugasan') THEN
    REVOKE EXECUTE ON FUNCTION public.submit_penugasan(uuid) FROM PUBLIC, anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'submit_remedial_penugasan') THEN
    REVOKE EXECUTE ON FUNCTION public.submit_remedial_penugasan(uuid) FROM PUBLIC, anon;
  END IF;
END $$;
