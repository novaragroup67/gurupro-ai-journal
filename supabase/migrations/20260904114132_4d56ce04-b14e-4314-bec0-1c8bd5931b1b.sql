CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  nama TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  nip TEXT NOT NULL DEFAULT '',
  sekolah TEXT NOT NULL DEFAULT '',
  mapel TEXT NOT NULL DEFAULT '',
  kelas TEXT NOT NULL DEFAULT '',
  telepon TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile" ON public.profiles FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.moduls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  judul TEXT NOT NULL DEFAULT '',
  kelas TEXT NOT NULL DEFAULT '',
  mapel TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Draft',
  sumber_tipe TEXT NOT NULL DEFAULT 'Link Luar',
  sumber_input TEXT NOT NULL DEFAULT '',
  sumber_url TEXT,
  sumber_judul TEXT,
  sumber_kutipan TEXT,
  ringkasan TEXT NOT NULL DEFAULT '',
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  slides JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.moduls TO authenticated;
GRANT ALL ON public.moduls TO service_role;
ALTER TABLE public.moduls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own moduls" ON public.moduls FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER moduls_updated_at BEFORE UPDATE ON public.moduls FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX moduls_user_idx ON public.moduls (user_id, updated_at DESC);

CREATE TABLE public.paket_soal (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  judul TEXT NOT NULL DEFAULT '',
  topik TEXT NOT NULL DEFAULT '',
  modul_id UUID REFERENCES public.moduls ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'Draft',
  kelas TEXT[] NOT NULL DEFAULT '{}',
  soal JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.paket_soal TO authenticated;
GRANT ALL ON public.paket_soal TO service_role;
ALTER TABLE public.paket_soal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own paket soal" ON public.paket_soal FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER paket_soal_updated_at BEFORE UPDATE ON public.paket_soal FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX paket_soal_user_idx ON public.paket_soal (user_id, created_at DESC);