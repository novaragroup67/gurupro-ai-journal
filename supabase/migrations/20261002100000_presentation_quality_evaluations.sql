-- Migration: 20261002100000_presentation_quality_evaluations.sql
-- Description: PPT-1F Final PPTX Quality, Security & End-to-End Gate
-- Creates the table for storing deterministic and advisory quality evaluations
-- bound to exact PPTX artifact hashes, approved versions, and teacher approval states with strict RLS policies.

CREATE TABLE IF NOT EXISTS public.presentation_quality_evaluations (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL REFERENCES public.presentation_artifacts(id) ON DELETE CASCADE,
  content_result_id TEXT NOT NULL REFERENCES public.presentation_generation_results(id) ON DELETE CASCADE,
  generation_plan_id TEXT NOT NULL REFERENCES public.generation_plans(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL REFERENCES public.moduls(id) ON DELETE CASCADE,
  artifact_hash TEXT NOT NULL,
  presentation_version INTEGER NOT NULL DEFAULT 1,
  approved_version INTEGER NOT NULL DEFAULT 1,
  evaluator_version TEXT NOT NULL DEFAULT 'presentation_quality_v1',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'passed', 'failed', 'superseded')),
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

-- Indexes for performance, cache lookups, and multi-tenant isolation
CREATE INDEX IF NOT EXISTS idx_ppt_qual_artifact_id ON public.presentation_quality_evaluations(artifact_id);
CREATE INDEX IF NOT EXISTS idx_ppt_qual_content_result_id ON public.presentation_quality_evaluations(content_result_id);
CREATE INDEX IF NOT EXISTS idx_ppt_qual_plan_id ON public.presentation_quality_evaluations(generation_plan_id);
CREATE INDEX IF NOT EXISTS idx_ppt_qual_module_id ON public.presentation_quality_evaluations(module_id);
CREATE INDEX IF NOT EXISTS idx_ppt_qual_artifact_hash ON public.presentation_quality_evaluations(artifact_hash);
CREATE INDEX IF NOT EXISTS idx_ppt_qual_eval_by ON public.presentation_quality_evaluations(evaluated_by);
CREATE INDEX IF NOT EXISTS idx_ppt_qual_status ON public.presentation_quality_evaluations(status);
CREATE INDEX IF NOT EXISTS idx_ppt_qual_decision ON public.presentation_quality_evaluations(decision);
CREATE INDEX IF NOT EXISTS idx_ppt_qual_lookup ON public.presentation_quality_evaluations(artifact_id, artifact_hash, approved_version, evaluator_version);
CREATE INDEX IF NOT EXISTS idx_ppt_qual_created_at ON public.presentation_quality_evaluations(created_at);

-- Enable Row Level Security
ALTER TABLE public.presentation_quality_evaluations ENABLE ROW LEVEL SECURITY;

-- 1. SELECT Policy: Guru can select only their own presentation quality evaluations
DROP POLICY IF EXISTS "Guru can select own presentation quality evaluations" ON public.presentation_quality_evaluations;
CREATE POLICY "Guru can select own presentation quality evaluations"
  ON public.presentation_quality_evaluations
  FOR SELECT
  TO authenticated
  USING (
    evaluated_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  );

-- 2. INSERT Policy: Guru can insert only their own presentation quality evaluations
DROP POLICY IF EXISTS "Guru can insert own presentation quality evaluations" ON public.presentation_quality_evaluations;
CREATE POLICY "Guru can insert own presentation quality evaluations"
  ON public.presentation_quality_evaluations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    evaluated_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  );

-- 3. UPDATE Policy: Guru can update only their own presentation quality evaluations
DROP POLICY IF EXISTS "Guru can update own presentation quality evaluations" ON public.presentation_quality_evaluations;
CREATE POLICY "Guru can update own presentation quality evaluations"
  ON public.presentation_quality_evaluations
  FOR UPDATE
  TO authenticated
  USING (
    evaluated_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  )
  WITH CHECK (
    evaluated_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  );

-- 4. DELETE Policy: Guru can delete only their own presentation quality evaluations
DROP POLICY IF EXISTS "Guru can delete own presentation quality evaluations" ON public.presentation_quality_evaluations;
CREATE POLICY "Guru can delete own presentation quality evaluations"
  ON public.presentation_quality_evaluations
  FOR DELETE
  TO authenticated
  USING (
    evaluated_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  );
