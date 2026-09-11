DROP POLICY IF EXISTS "kelas readable for invitation lookup" ON public.kelas;

CREATE POLICY "guru select own kelas" ON public.kelas
FOR SELECT TO authenticated
USING (auth.uid() = guru_id);

CREATE POLICY "siswa select joined kelas" ON public.kelas
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.kelas_anggota ka
  WHERE ka.kelas_id = kelas.id AND ka.siswa_id = auth.uid()
));

CREATE OR REPLACE FUNCTION public.cari_kelas_by_kode(_kode text)
RETURNS TABLE (
  id uuid,
  nama_kelas text,
  tingkat text,
  mapel text,
  tahun_ajaran text,
  kode_kelas text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT k.id, k.nama_kelas, k.tingkat, k.mapel, k.tahun_ajaran, k.kode_kelas
  FROM public.kelas k
  WHERE upper(k.kode_kelas) = upper(btrim(_kode))
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.cari_kelas_by_kode(text) TO anon, authenticated;