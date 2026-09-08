ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'guru';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('guru','siswa'));

CREATE TABLE IF NOT EXISTS public.kelas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  guru_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nama_kelas text NOT NULL DEFAULT '',
  tingkat text NOT NULL DEFAULT '',
  mapel text NOT NULL DEFAULT '',
  tahun_ajaran text NOT NULL DEFAULT '',
  kode_kelas text NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.kelas TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kelas TO authenticated;
GRANT ALL ON public.kelas TO service_role;

ALTER TABLE public.kelas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kelas readable for invitation lookup" ON public.kelas;
CREATE POLICY "kelas readable for invitation lookup" ON public.kelas
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "guru insert own kelas" ON public.kelas;
CREATE POLICY "guru insert own kelas" ON public.kelas
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = guru_id);

DROP POLICY IF EXISTS "guru update own kelas" ON public.kelas;
CREATE POLICY "guru update own kelas" ON public.kelas
  FOR UPDATE TO authenticated USING (auth.uid() = guru_id) WITH CHECK (auth.uid() = guru_id);

DROP POLICY IF EXISTS "guru delete own kelas" ON public.kelas;
CREATE POLICY "guru delete own kelas" ON public.kelas
  FOR DELETE TO authenticated USING (auth.uid() = guru_id);

CREATE TRIGGER kelas_updated_at BEFORE UPDATE ON public.kelas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.kelas_anggota (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kelas_id uuid NOT NULL REFERENCES public.kelas(id) ON DELETE CASCADE,
  siswa_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  siswa_nama text NOT NULL DEFAULT '',
  siswa_email text NOT NULL DEFAULT '',
  siswa_nisn text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'menunggu',
  jenis text NOT NULL DEFAULT 'tambah-kelas',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (kelas_id, siswa_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kelas_anggota TO authenticated;
GRANT ALL ON public.kelas_anggota TO service_role;

ALTER TABLE public.kelas_anggota ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "siswa select own membership" ON public.kelas_anggota;
CREATE POLICY "siswa select own membership" ON public.kelas_anggota
  FOR SELECT TO authenticated USING (auth.uid() = siswa_id);

DROP POLICY IF EXISTS "siswa insert own membership" ON public.kelas_anggota;
CREATE POLICY "siswa insert own membership" ON public.kelas_anggota
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = siswa_id);

DROP POLICY IF EXISTS "siswa update own membership" ON public.kelas_anggota;
CREATE POLICY "siswa update own membership" ON public.kelas_anggota
  FOR UPDATE TO authenticated USING (auth.uid() = siswa_id) WITH CHECK (auth.uid() = siswa_id);

DROP POLICY IF EXISTS "guru select membership of own kelas" ON public.kelas_anggota;
CREATE POLICY "guru select membership of own kelas" ON public.kelas_anggota
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.kelas k WHERE k.id = kelas_id AND k.guru_id = auth.uid())
  );

DROP POLICY IF EXISTS "guru update membership of own kelas" ON public.kelas_anggota;
CREATE POLICY "guru update membership of own kelas" ON public.kelas_anggota
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.kelas k WHERE k.id = kelas_id AND k.guru_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.kelas k WHERE k.id = kelas_id AND k.guru_id = auth.uid())
  );

DROP POLICY IF EXISTS "guru delete membership of own kelas" ON public.kelas_anggota;
CREATE POLICY "guru delete membership of own kelas" ON public.kelas_anggota
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.kelas k WHERE k.id = kelas_id AND k.guru_id = auth.uid())
  );

CREATE TRIGGER kelas_anggota_updated_at BEFORE UPDATE ON public.kelas_anggota
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS kelas_guru_id_idx ON public.kelas(guru_id);
CREATE INDEX IF NOT EXISTS kelas_anggota_kelas_id_idx ON public.kelas_anggota(kelas_id);
CREATE INDEX IF NOT EXISTS kelas_anggota_siswa_id_idx ON public.kelas_anggota(siswa_id);