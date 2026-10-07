-- ==============================================================================
-- GURUPRO: AI CORE BASELINE SCHEMA RECOVERY & FORWARD-ONLY RECONCILIATION
-- Migration: 20261007120000_ai_core_baseline_schema_recovery.sql
-- Stage: AI-RECOVERY-01
--
-- Reconciles all AI foundation, planning, illustration, presentation, and
-- telemetry schema definitions with active TypeScript contracts and server functions:
-- 1. ai_source_snapshots (Source material snapshots, hashes, and chunks)
-- 2. generation_styles (Illustration and presentation style catalog)
-- 3. generation_plans (Shared GEN-0 planning state and lifecycle)
-- 4. generation_plan_versions (Audit trail and version history)
-- 5. illustration_generation_requests (VIS-1A prepared prompts and parameters)
-- 6. illustration_generations (VIS-1B generation execution and provider status)
-- 7. illustration_assets (VIS-1C durable binary assets and SHA-256 hashes)
-- 8. illustration_reviews (VIS-1D teacher review and approval state)
-- 9. illustration_quality_evaluations (VIS-1E quality gate evaluations)
-- 10. presentation_generation_requests (PPT-1A/1B generation requests)
-- 11. presentation_generation_results (PPT-1B generated slide content packages)
-- 12. presentation_artifacts (PPT-1C OOXML PPTX binary artifacts and hashes)
-- 13. presentation_reviews (PPT-1E presentation review decisions)
-- 14. presentation_quality_evaluations (PPT-1F presentation quality gate evaluations)
-- 15. product_events (OPS-2 canonical product analytics ledger)
-- 16. user_feedback (OPS-2 user feedback intake and lifecycle)
-- 17. Storage buckets: illustration-assets, presentation-artifacts, ai-source-materials
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
-- 2. GENERATION STYLES CATALOG
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.generation_styles (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('illustration', 'presentation')),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  visual_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  layout_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  typography_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  prompt_modifiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  things_to_avoid JSONB NOT NULL DEFAULT '[]'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.generation_styles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'generation_styles' AND policyname = 'Authenticated users can select generation styles') THEN
    CREATE POLICY "Authenticated users can select generation styles" ON public.generation_styles
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3. GENERATION PLANS (CANONICAL GEN-0 SCHEMA)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.generation_plans (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('illustration', 'presentation')),
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('draft', 'ready', 'approved', 'generating', 'completed', 'failed', 'archived')),
  current_version INTEGER NOT NULL DEFAULT 1,
  approved_version INTEGER DEFAULT NULL,
  outline JSONB NOT NULL DEFAULT '{}'::jsonb,
  style JSONB DEFAULT NULL,
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  generation_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure canonical columns exist if table was previously created with different schema
ALTER TABLE public.generation_plans ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.generation_plans ADD COLUMN IF NOT EXISTS module_id TEXT;
ALTER TABLE public.generation_plans ADD COLUMN IF NOT EXISTS target_type TEXT;
ALTER TABLE public.generation_plans ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ready';
ALTER TABLE public.generation_plans ADD COLUMN IF NOT EXISTS current_version INTEGER DEFAULT 1;
ALTER TABLE public.generation_plans ADD COLUMN IF NOT EXISTS approved_version INTEGER;
ALTER TABLE public.generation_plans ADD COLUMN IF NOT EXISTS outline JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.generation_plans ADD COLUMN IF NOT EXISTS style JSONB;
ALTER TABLE public.generation_plans ADD COLUMN IF NOT EXISTS provenance JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.generation_plans ADD COLUMN IF NOT EXISTS generation_settings JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_generation_plans_owner_id ON public.generation_plans(owner_id);
CREATE INDEX IF NOT EXISTS idx_generation_plans_module_id ON public.generation_plans(module_id);
CREATE INDEX IF NOT EXISTS idx_generation_plans_owner_module ON public.generation_plans(owner_id, module_id);
CREATE INDEX IF NOT EXISTS idx_generation_plans_status ON public.generation_plans(status);

ALTER TABLE public.generation_plans ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'generation_plans' AND policyname = 'Guru can select own generation plans') THEN
    CREATE POLICY "Guru can select own generation plans" ON public.generation_plans
      FOR SELECT TO authenticated
      USING (owner_id = auth.uid() AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'guru'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'generation_plans' AND policyname = 'Guru can insert own generation plans') THEN
    CREATE POLICY "Guru can insert own generation plans" ON public.generation_plans
      FOR INSERT TO authenticated
      WITH CHECK (owner_id = auth.uid() AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'guru'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'generation_plans' AND policyname = 'Guru can update own generation plans') THEN
    CREATE POLICY "Guru can update own generation plans" ON public.generation_plans
      FOR UPDATE TO authenticated
      USING (owner_id = auth.uid() AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'guru'))
      WITH CHECK (owner_id = auth.uid() AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'guru'));
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 4. GENERATION PLAN VERSIONS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.generation_plan_versions (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES public.generation_plans(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  outline_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  style_snapshot JSONB DEFAULT NULL,
  change_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_approved BOOLEAN NOT NULL DEFAULT false,
  approved_at TIMESTAMPTZ DEFAULT NULL,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_plan_version UNIQUE (plan_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_generation_plan_versions_plan_id ON public.generation_plan_versions(plan_id);
ALTER TABLE public.generation_plan_versions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'generation_plan_versions' AND policyname = 'Guru can select own plan versions') THEN
    CREATE POLICY "Guru can select own plan versions" ON public.generation_plan_versions
      FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.generation_plans gp WHERE gp.id = plan_id AND gp.owner_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'generation_plan_versions' AND policyname = 'Guru can insert own plan versions') THEN
    CREATE POLICY "Guru can insert own plan versions" ON public.generation_plan_versions
      FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM public.generation_plans gp WHERE gp.id = plan_id AND gp.owner_id = auth.uid()));
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 5. ILLUSTRATION GENERATION REQUESTS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.illustration_generation_requests (
  id TEXT PRIMARY KEY,
  generation_plan_id TEXT NOT NULL REFERENCES public.generation_plans(id) ON DELETE CASCADE,
  approved_version INTEGER NOT NULL,
  style_id TEXT NOT NULL REFERENCES public.generation_styles(id),
  style_version INTEGER NOT NULL DEFAULT 1,
  request_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared', 'submitted', 'processing', 'succeeded', 'failed', 'cancelled')),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ill_gen_req_plan_id ON public.illustration_generation_requests(generation_plan_id);
ALTER TABLE public.illustration_generation_requests ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'illustration_generation_requests' AND policyname = 'Guru can manage own illustration requests') THEN
    CREATE POLICY "Guru can manage own illustration requests" ON public.illustration_generation_requests
      FOR ALL TO authenticated
      USING (created_by = auth.uid())
      WITH CHECK (created_by = auth.uid());
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 6. ILLUSTRATION GENERATIONS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.illustration_generations (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES public.illustration_generation_requests(id) ON DELETE CASCADE,
  generation_plan_id TEXT NOT NULL REFERENCES public.generation_plans(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  provider_request_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'succeeded', 'failed')),
  asset_url TEXT,
  image_data TEXT,
  mime_type TEXT NOT NULL DEFAULT 'image/png',
  width INTEGER NOT NULL DEFAULT 1024,
  height INTEGER NOT NULL DEFAULT 1024,
  byte_size INTEGER NOT NULL DEFAULT 0,
  retry_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ill_gen_request_id ON public.illustration_generations(request_id);
CREATE INDEX IF NOT EXISTS idx_ill_gen_owner_id ON public.illustration_generations(owner_id);
ALTER TABLE public.illustration_generations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'illustration_generations' AND policyname = 'Guru can manage own illustration generations') THEN
    CREATE POLICY "Guru can manage own illustration generations" ON public.illustration_generations
      FOR ALL TO authenticated
      USING (owner_id = auth.uid())
      WITH CHECK (owner_id = auth.uid());
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 7. ILLUSTRATION ASSETS (PERMANENT BINARY ASSETS)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.illustration_assets (
  id TEXT PRIMARY KEY,
  generation_id TEXT NOT NULL REFERENCES public.illustration_generations(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL REFERENCES public.illustration_generation_requests(id) ON DELETE CASCADE,
  generation_plan_id TEXT NOT NULL REFERENCES public.generation_plans(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sha256_hash TEXT NOT NULL,
  storage_provider TEXT NOT NULL DEFAULT 'supabase_storage',
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'image/png',
  width INTEGER NOT NULL DEFAULT 1024,
  height INTEGER NOT NULL DEFAULT 1024,
  byte_size INTEGER NOT NULL DEFAULT 0,
  lifecycle_status TEXT NOT NULL DEFAULT 'staged' CHECK (lifecycle_status IN ('staged', 'attached', 'superseded', 'archived', 'soft_deleted')),
  attached_section_id TEXT,
  attached_at TIMESTAMPTZ,
  style_id TEXT NOT NULL,
  style_version INTEGER NOT NULL DEFAULT 1,
  style_name TEXT NOT NULL,
  prompt_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  grounding_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  pedagogical_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ill_assets_owner_id ON public.illustration_assets(owner_id);
CREATE INDEX IF NOT EXISTS idx_ill_assets_module_id ON public.illustration_assets(module_id);
CREATE INDEX IF NOT EXISTS idx_ill_assets_sha256_hash ON public.illustration_assets(sha256_hash);
ALTER TABLE public.illustration_assets ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'illustration_assets' AND policyname = 'Guru can select own illustration assets') THEN
    CREATE POLICY "Guru can select own illustration assets" ON public.illustration_assets
      FOR SELECT TO authenticated USING (owner_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'illustration_assets' AND policyname = 'Guru can insert own illustration assets') THEN
    CREATE POLICY "Guru can insert own illustration assets" ON public.illustration_assets
      FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'illustration_assets' AND policyname = 'Guru can update own illustration assets') THEN
    CREATE POLICY "Guru can update own illustration assets" ON public.illustration_assets
      FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 8. ILLUSTRATION REVIEWS & QUALITY EVALUATIONS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.illustration_reviews (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES public.illustration_assets(id) ON DELETE CASCADE,
  generation_plan_id TEXT NOT NULL REFERENCES public.generation_plans(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('approved_for_use', 'rejected', 'archived', 'revoked')),
  rejection_reason TEXT,
  feedback_notes TEXT,
  review_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.illustration_reviews ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'illustration_reviews' AND policyname = 'Guru can manage own illustration reviews') THEN
    CREATE POLICY "Guru can manage own illustration reviews" ON public.illustration_reviews
      FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.illustration_quality_evaluations (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES public.illustration_assets(id) ON DELETE CASCADE,
  generation_id TEXT NOT NULL REFERENCES public.illustration_generations(id) ON DELETE CASCADE,
  generation_plan_id TEXT NOT NULL REFERENCES public.generation_plans(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'evaluated' CHECK (status IN ('evaluated', 'superseded', 'failed')),
  decision TEXT NOT NULL CHECK (decision IN ('PASS', 'WARN', 'FAIL')),
  overall_score NUMERIC(5,2),
  findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.illustration_quality_evaluations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'illustration_quality_evaluations' AND policyname = 'Guru can select own quality evaluations') THEN
    CREATE POLICY "Guru can select own quality evaluations" ON public.illustration_quality_evaluations
      FOR SELECT TO authenticated USING (owner_id = auth.uid());
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 9. PRESENTATION GENERATION REQUESTS & RESULTS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.presentation_generation_requests (
  id TEXT PRIMARY KEY,
  generation_plan_id TEXT NOT NULL REFERENCES public.generation_plans(id) ON DELETE CASCADE,
  approved_version INTEGER NOT NULL,
  style_id TEXT NOT NULL REFERENCES public.generation_styles(id),
  style_version INTEGER NOT NULL DEFAULT 1,
  request_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared', 'submitted', 'processing', 'succeeded', 'failed', 'cancelled')),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.presentation_generation_requests ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'presentation_generation_requests' AND policyname = 'Guru can manage own presentation requests') THEN
    CREATE POLICY "Guru can manage own presentation requests" ON public.presentation_generation_requests
      FOR ALL TO authenticated USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.presentation_generation_results (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES public.presentation_generation_requests(id) ON DELETE CASCADE,
  generation_plan_id TEXT NOT NULL REFERENCES public.generation_plans(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'succeeded', 'failed')),
  content_package JSONB NOT NULL DEFAULT '{}'::jsonb,
  slide_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.presentation_generation_results ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'presentation_generation_results' AND policyname = 'Guru can manage own presentation results') THEN
    CREATE POLICY "Guru can manage own presentation results" ON public.presentation_generation_results
      FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 10. PRESENTATION ARTIFACTS (PERMANENT OOXML PPTX ARTIFACTS)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.presentation_artifacts (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES public.presentation_generation_requests(id) ON DELETE CASCADE,
  content_result_id TEXT NOT NULL REFERENCES public.presentation_generation_results(id) ON DELETE CASCADE,
  generation_plan_id TEXT NOT NULL REFERENCES public.generation_plans(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  storage_reference TEXT NOT NULL,
  storage_provider TEXT NOT NULL DEFAULT 'supabase_storage',
  public_url TEXT NOT NULL,
  download_url TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  byte_size INTEGER NOT NULL DEFAULT 0,
  file_hash TEXT NOT NULL,
  slide_count INTEGER NOT NULL DEFAULT 1,
  outline_version INTEGER NOT NULL DEFAULT 1,
  style_id TEXT NOT NULL REFERENCES public.generation_styles(id),
  style_version INTEGER NOT NULL DEFAULT 1,
  renderer_version TEXT NOT NULL DEFAULT 'v1.0.0',
  status TEXT NOT NULL DEFAULT 'generating' CHECK (status IN ('generating', 'ready', 'failed', 'archived')),
  render_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ppt_artifacts_owner_id ON public.presentation_artifacts(owner_id);
CREATE INDEX IF NOT EXISTS idx_ppt_artifacts_file_hash ON public.presentation_artifacts(file_hash);
ALTER TABLE public.presentation_artifacts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'presentation_artifacts' AND policyname = 'Guru can select own presentation artifacts') THEN
    CREATE POLICY "Guru can select own presentation artifacts" ON public.presentation_artifacts
      FOR SELECT TO authenticated USING (owner_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'presentation_artifacts' AND policyname = 'Guru can insert own presentation artifacts') THEN
    CREATE POLICY "Guru can insert own presentation artifacts" ON public.presentation_artifacts
      FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 11. PRESENTATION REVIEWS & QUALITY EVALUATIONS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.presentation_reviews (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL REFERENCES public.presentation_artifacts(id) ON DELETE CASCADE,
  generation_plan_id TEXT NOT NULL REFERENCES public.generation_plans(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('approved_for_download', 'rejected', 'archived')),
  rejection_reason TEXT,
  feedback_notes TEXT,
  review_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.presentation_reviews ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'presentation_reviews' AND policyname = 'Guru can manage own presentation reviews') THEN
    CREATE POLICY "Guru can manage own presentation reviews" ON public.presentation_reviews
      FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.presentation_quality_evaluations (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL REFERENCES public.presentation_artifacts(id) ON DELETE CASCADE,
  content_result_id TEXT NOT NULL REFERENCES public.presentation_generation_results(id) ON DELETE CASCADE,
  generation_plan_id TEXT NOT NULL REFERENCES public.generation_plans(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'evaluated' CHECK (status IN ('evaluated', 'superseded', 'failed')),
  decision TEXT NOT NULL CHECK (decision IN ('PASS', 'WARN', 'FAIL')),
  overall_score NUMERIC(5,2),
  findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  technical_checks JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.presentation_quality_evaluations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'presentation_quality_evaluations' AND policyname = 'Guru can select own presentation quality evaluations') THEN
    CREATE POLICY "Guru can select own presentation quality evaluations" ON public.presentation_quality_evaluations
      FOR SELECT TO authenticated USING (owner_id = auth.uid());
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 12. PRODUCT TELEMETRY & FEEDBACK TABLES (OPS-2)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id TEXT,
  user_role TEXT,
  feature TEXT,
  entity_type TEXT,
  entity_id TEXT,
  duration_ms INTEGER,
  status TEXT DEFAULT 'success',
  error_code TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_events_type_created ON public.product_events(event_type, created_at DESC);
ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'product_events' AND policyname = 'Authenticated users can insert product events') THEN
    CREATE POLICY "Authenticated users can insert product events" ON public.product_events
      FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR user_id IS NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'product_events' AND policyname = 'Admins can view all product events') THEN
    CREATE POLICY "Admins can view all product events" ON public.product_events
      FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.user_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_role TEXT NOT NULL DEFAULT 'guru',
  category TEXT NOT NULL CHECK (category IN ('bug', 'usability', 'suggestion', 'ai_quality', 'other')),
  message TEXT NOT NULL,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'triaged', 'in_progress', 'resolved', 'closed')),
  route TEXT,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_feedback_user_id ON public.user_feedback(user_id);
ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_feedback' AND policyname = 'Users can view own feedback') THEN
    CREATE POLICY "Users can view own feedback" ON public.user_feedback
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_feedback' AND policyname = 'Users can insert own feedback') THEN
    CREATE POLICY "Users can insert own feedback" ON public.user_feedback
      FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_feedback' AND policyname = 'Admins can manage all feedback') THEN
    CREATE POLICY "Admins can manage all feedback" ON public.user_feedback
      FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
      WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 13. STORAGE BUCKETS REGISTRATION
-- ------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('illustration-assets', 'illustration-assets', false, 10485760, ARRAY['image/png', 'image/jpeg']),
  ('presentation-artifacts', 'presentation-artifacts', false, 52428800, ARRAY['application/vnd.openxmlformats-officedocument.presentationml.presentation']),
  ('ai-source-materials', 'ai-source-materials', false, 10485760, ARRAY['text/plain', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Teachers can manage own illustration objects') THEN
    CREATE POLICY "Teachers can manage own illustration objects" ON storage.objects
      FOR ALL TO authenticated
      USING (bucket_id = 'illustration-assets' AND (storage.foldername(name))[1] = auth.uid()::text)
      WITH CHECK (bucket_id = 'illustration-assets' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Teachers can manage own presentation objects') THEN
    CREATE POLICY "Teachers can manage own presentation objects" ON storage.objects
      FOR ALL TO authenticated
      USING (bucket_id = 'presentation-artifacts' AND (storage.foldername(name))[1] = auth.uid()::text)
      WITH CHECK (bucket_id = 'presentation-artifacts' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
END $$;
