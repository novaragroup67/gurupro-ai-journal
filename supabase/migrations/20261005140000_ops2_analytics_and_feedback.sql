-- ====================================================================
-- GURUPRO MIGRATION (OPS-2): PRODUCT ANALYTICS & REAL-USER FEEDBACK
-- ====================================================================

-- 1. Create table public.product_events
CREATE TABLE IF NOT EXISTS public.product_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  role TEXT,
  event_name TEXT NOT NULL,
  feature TEXT NOT NULL,
  session_id TEXT,
  correlation_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance and funnel aggregation
CREATE INDEX IF NOT EXISTS idx_product_events_created_at ON public.product_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_events_event_name ON public.product_events(event_name);
CREATE INDEX IF NOT EXISTS idx_product_events_feature ON public.product_events(feature);
CREATE INDEX IF NOT EXISTS idx_product_events_actor_id ON public.product_events(actor_id);
CREATE INDEX IF NOT EXISTS idx_product_events_correlation_id ON public.product_events(correlation_id);

-- Enable RLS on product_events
ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "anyone_can_insert_product_events" ON public.product_events;
DROP POLICY IF EXISTS "admin_can_select_product_events" ON public.product_events;
DROP POLICY IF EXISTS "admin_can_manage_product_events" ON public.product_events;

-- RLS Policy: Authenticated and anonymous users can append events non-blockingly
CREATE POLICY "anyone_can_insert_product_events"
ON public.product_events
FOR INSERT
TO authenticated, anon
WITH CHECK (true);

-- RLS Policy: Only Admin can read raw events
CREATE POLICY "admin_can_select_product_events"
ON public.product_events
FOR SELECT
TO authenticated
USING (public.is_admin());

-- 2. Create table public.user_feedback
CREATE TABLE IF NOT EXISTS public.user_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'guru' CHECK (role IN ('guru', 'siswa', 'admin')),
  category TEXT NOT NULL CHECK (category IN ('bug', 'usability', 'ai_output', 'performance', 'suggestion')),
  priority TEXT NOT NULL DEFAULT 'sedang' CHECK (priority IN ('rendah', 'sedang', 'tinggi', 'kritis')),
  feature TEXT NOT NULL,
  message TEXT NOT NULL,
  correlation_id TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'triaged', 'in_progress', 'resolved', 'closed')),
  admin_notes TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for feedback querying
CREATE INDEX IF NOT EXISTS idx_user_feedback_user_id ON public.user_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_user_feedback_category ON public.user_feedback(category);
CREATE INDEX IF NOT EXISTS idx_user_feedback_status ON public.user_feedback(status);
CREATE INDEX IF NOT EXISTS idx_user_feedback_feature ON public.user_feedback(feature);
CREATE INDEX IF NOT EXISTS idx_user_feedback_created_at ON public.user_feedback(created_at DESC);

-- Enable RLS on user_feedback
ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "users_insert_own_feedback" ON public.user_feedback;
DROP POLICY IF EXISTS "users_select_own_or_admin_feedback" ON public.user_feedback;
DROP POLICY IF EXISTS "admins_update_feedback" ON public.user_feedback;

-- RLS Policy: Authenticated users can submit their own feedback
CREATE POLICY "users_insert_own_feedback"
ON public.user_feedback
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

-- RLS Policy: Users see own feedback; Admins see all feedback
CREATE POLICY "users_select_own_or_admin_feedback"
ON public.user_feedback
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.is_admin());

-- RLS Policy: Only Admin can update feedback status or admin_notes
CREATE POLICY "admins_update_feedback"
ON public.user_feedback
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 3. RPC: submit_user_feedback
CREATE OR REPLACE FUNCTION public.submit_user_feedback(
  _category TEXT,
  _feature TEXT,
  _message TEXT,
  _priority TEXT DEFAULT 'sedang',
  _correlation_id TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT := 'guru';
  v_feedback_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Akses ditolak: Hanya pengguna terotentikasi yang dapat mengirimkan umpan balik.';
  END IF;

  -- Determine user role safely
  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id LIMIT 1;
  IF v_role IS NULL THEN
    v_role := 'guru';
  END IF;

  INSERT INTO public.user_feedback (
    user_id,
    role,
    category,
    priority,
    feature,
    message,
    correlation_id,
    status,
    created_at,
    updated_at
  )
  VALUES (
    v_user_id,
    v_role,
    _category,
    COALESCE(_priority, 'sedang'),
    _feature,
    _message,
    _correlation_id,
    'new',
    now(),
    now()
  )
  RETURNING id INTO v_feedback_id;

  RETURN v_feedback_id;
END;
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.submit_user_feedback(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
