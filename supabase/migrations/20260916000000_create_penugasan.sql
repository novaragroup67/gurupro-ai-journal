-- Migration: Create public.penugasan table and RLS policies
-- Date: 2026-09-16

CREATE TABLE IF NOT EXISTS public.penugasan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kelas_id UUID NOT NULL REFERENCES public.kelas(id) ON DELETE CASCADE,
  paket_soal_id UUID NOT NULL REFERENCES public.paket_soal(id) ON DELETE RESTRICT,
  guru_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  judul TEXT NOT NULL,
  instruksi TEXT,
  deadline TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Performance indices
CREATE INDEX IF NOT EXISTS idx_penugasan_guru_id ON public.penugasan(guru_id);
CREATE INDEX IF NOT EXISTS idx_penugasan_kelas_id ON public.penugasan(kelas_id);
CREATE INDEX IF NOT EXISTS idx_penugasan_paket_soal_id ON public.penugasan(paket_soal_id);
CREATE INDEX IF NOT EXISTS idx_penugasan_status ON public.penugasan(status);

-- Auto-update updated_at trigger
DROP TRIGGER IF EXISTS set_penugasan_updated_at ON public.penugasan;
CREATE TRIGGER set_penugasan_updated_at
  BEFORE UPDATE ON public.penugasan
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE public.penugasan ENABLE ROW LEVEL SECURITY;

-- Permissions
REVOKE ALL ON public.penugasan FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.penugasan TO authenticated;
GRANT ALL ON public.penugasan TO service_role;

-- Policies: Guru
DROP POLICY IF EXISTS "guru select own penugasan" ON public.penugasan;
CREATE POLICY "guru select own penugasan" ON public.penugasan
  FOR SELECT TO authenticated
  USING (guru_id = auth.uid());

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
  );

DROP POLICY IF EXISTS "guru delete own penugasan" ON public.penugasan;
CREATE POLICY "guru delete own penugasan" ON public.penugasan
  FOR DELETE TO authenticated
  USING (guru_id = auth.uid());

-- Policies: Siswa (Read-only for approved class members, published or closed assignments only)
DROP POLICY IF EXISTS "siswa select published penugasan of joined kelas" ON public.penugasan;
CREATE POLICY "siswa select published penugasan of joined kelas" ON public.penugasan
  FOR SELECT TO authenticated
  USING (
    status IN ('published', 'closed')
    AND EXISTS (
      SELECT 1 FROM public.kelas_anggota ka
      WHERE ka.kelas_id = penugasan.kelas_id
        AND ka.siswa_id = auth.uid()
        AND ka.status = 'aktif'
    )
  );
