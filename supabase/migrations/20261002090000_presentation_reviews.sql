-- Migration: 20261002090000_presentation_reviews.sql
-- Description: PPT-1E Teacher Review & Approval for Presentation Generation
-- Creates the table for storing teacher review records, decisions, feedback notes,
-- and approval states for generated presentation content packages with strict RLS policies.

CREATE TABLE IF NOT EXISTS public.presentation_reviews (
  id TEXT PRIMARY KEY,
  presentation_id TEXT NOT NULL,
  content_result_id TEXT NOT NULL REFERENCES public.presentation_generation_results(id) ON DELETE CASCADE,
  generation_plan_id TEXT NOT NULL REFERENCES public.generation_plans(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL REFERENCES public.moduls(id) ON DELETE CASCADE,
  approved_version INTEGER NOT NULL DEFAULT 1,
  review_status TEXT NOT NULL DEFAULT 'generated' CHECK (review_status IN ('generated', 'in_review', 'approved', 'rejected', 'superseded')),
  teacher_notes TEXT,
  validation_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  reviewed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance and multi-tenant isolation lookup
CREATE INDEX IF NOT EXISTS idx_ppt_reviews_content_result_id ON public.presentation_reviews(content_result_id);
CREATE INDEX IF NOT EXISTS idx_ppt_reviews_plan_id ON public.presentation_reviews(generation_plan_id);
CREATE INDEX IF NOT EXISTS idx_ppt_reviews_module_id ON public.presentation_reviews(module_id);
CREATE INDEX IF NOT EXISTS idx_ppt_reviews_reviewer ON public.presentation_reviews(reviewed_by);
CREATE INDEX IF NOT EXISTS idx_ppt_reviews_status ON public.presentation_reviews(review_status);
CREATE INDEX IF NOT EXISTS idx_ppt_reviews_created_at ON public.presentation_reviews(created_at);

-- Enable Row Level Security
ALTER TABLE public.presentation_reviews ENABLE ROW LEVEL SECURITY;

-- 1. SELECT Policy: Guru can select only their own presentation reviews
DROP POLICY IF EXISTS "Guru can select own presentation reviews" ON public.presentation_reviews;
CREATE POLICY "Guru can select own presentation reviews"
  ON public.presentation_reviews
  FOR SELECT
  TO authenticated
  USING (
    reviewed_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  );

-- 2. INSERT Policy: Guru can insert only their own presentation reviews
DROP POLICY IF EXISTS "Guru can insert own presentation reviews" ON public.presentation_reviews;
CREATE POLICY "Guru can insert own presentation reviews"
  ON public.presentation_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (
    reviewed_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  );

-- 3. UPDATE Policy: Guru can update only their own presentation reviews
DROP POLICY IF EXISTS "Guru can update own presentation reviews" ON public.presentation_reviews;
CREATE POLICY "Guru can update own presentation reviews"
  ON public.presentation_reviews
  FOR UPDATE
  TO authenticated
  USING (
    reviewed_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  )
  WITH CHECK (
    reviewed_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  );

-- 4. DELETE Policy: Guru can delete only their own presentation reviews
DROP POLICY IF EXISTS "Guru can delete own presentation reviews" ON public.presentation_reviews;
CREATE POLICY "Guru can delete own presentation reviews"
  ON public.presentation_reviews
  FOR DELETE
  TO authenticated
  USING (
    reviewed_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  );
