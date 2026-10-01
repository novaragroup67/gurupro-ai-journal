-- Migration: 20260930130000_presentation_generation_requests.sql
-- Description: PPT-1A Presentation Generation Contract & Outline-to-Slide Planning
-- Creates the table for storing prepared and validated presentation generation requests
-- with strict RLS policies bound to authenticated guru ownership.

CREATE TABLE IF NOT EXISTS public.presentation_generation_requests (
  id TEXT PRIMARY KEY,
  generation_plan_id TEXT NOT NULL REFERENCES public.generation_plans(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL REFERENCES public.moduls(id) ON DELETE CASCADE,
  approved_version INTEGER NOT NULL,
  style_id TEXT NOT NULL REFERENCES public.generation_styles(id),
  style_version INTEGER NOT NULL,
  request_snapshot JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared', 'ready_for_generation', 'cancelled')),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for query performance and multi-tenant lookup
CREATE INDEX IF NOT EXISTS idx_ppt_gen_requests_plan_id ON public.presentation_generation_requests(generation_plan_id);
CREATE INDEX IF NOT EXISTS idx_ppt_gen_requests_module_id ON public.presentation_generation_requests(module_id);
CREATE INDEX IF NOT EXISTS idx_ppt_gen_requests_created_by ON public.presentation_generation_requests(created_by);
CREATE INDEX IF NOT EXISTS idx_ppt_gen_requests_status ON public.presentation_generation_requests(status);

-- Enable Row Level Security
ALTER TABLE public.presentation_generation_requests ENABLE ROW LEVEL SECURITY;

-- 1. SELECT Policy: Guru can select only their own presentation generation requests
DROP POLICY IF EXISTS "Guru can select own presentation generation requests" ON public.presentation_generation_requests;
CREATE POLICY "Guru can select own presentation generation requests"
  ON public.presentation_generation_requests
  FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  );

-- 2. INSERT Policy: Guru can insert their own presentation generation requests
DROP POLICY IF EXISTS "Guru can insert own presentation generation requests" ON public.presentation_generation_requests;
CREATE POLICY "Guru can insert own presentation generation requests"
  ON public.presentation_generation_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  );

-- 3. UPDATE Policy: Guru can update their own presentation generation requests
DROP POLICY IF EXISTS "Guru can update own presentation generation requests" ON public.presentation_generation_requests;
CREATE POLICY "Guru can update own presentation generation requests"
  ON public.presentation_generation_requests
  FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  )
  WITH CHECK (
    created_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  );
