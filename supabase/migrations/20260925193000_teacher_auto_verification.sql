-- Migration: 20260925193000_teacher_auto_verification.sql
-- Description: Instant verification for teacher accounts upon registration (frictionless onboarding for national scale).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_raw_role text;
  v_role text;
  v_status text;
BEGIN
  v_raw_role := lower(trim(COALESCE(new.raw_user_meta_data->>'role', '')));

  IF v_raw_role = 'siswa' THEN
    v_role := 'siswa';
    v_status := 'terverifikasi';
  ELSIF v_raw_role = 'guru' THEN
    v_role := 'guru';
    v_status := 'terverifikasi';
  ELSIF lower(trim(new.email)) = 'novaragroup67@gmail.com' THEN
    v_role := 'admin';
    v_status := 'terverifikasi';
  ELSE
    RAISE EXCEPTION 'Peran pendaftaran tidak valid (%). Hanya peran guru atau siswa yang diizinkan.', v_raw_role;
  END IF;

  INSERT INTO public.profiles (
    id,
    nama,
    email,
    nip,
    nisn,
    sekolah,
    mapel,
    kelas,
    telepon,
    bio,
    role,
    status_verifikasi
  )
  VALUES (
    new.id,
    COALESCE(NULLIF(new.raw_user_meta_data->>'nama', ''), split_part(new.email, '@', 1)),
    COALESCE(new.email, ''),
    COALESCE(new.raw_user_meta_data->>'nip', ''),
    COALESCE(new.raw_user_meta_data->>'nisn', ''),
    COALESCE(new.raw_user_meta_data->>'sekolah', ''),
    COALESCE(new.raw_user_meta_data->>'mapel', ''),
    COALESCE(new.raw_user_meta_data->>'jenjang', new.raw_user_meta_data->>'kelas', ''),
    COALESCE(new.raw_user_meta_data->>'telepon', ''),
    '',
    v_role,
    v_status
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    nama = CASE WHEN public.profiles.nama = '' THEN EXCLUDED.nama ELSE public.profiles.nama END,
    status_verifikasi = CASE
      WHEN public.profiles.status_verifikasi IS NOT NULL AND public.profiles.status_verifikasi != ''
      THEN public.profiles.status_verifikasi
      ELSE EXCLUDED.status_verifikasi
    END;

  RETURN new;
END;
$function$;

-- Update existing teacher accounts from 'menunggu' to 'terverifikasi'
UPDATE public.profiles
SET status_verifikasi = 'terverifikasi'
WHERE role = 'guru' AND status_verifikasi = 'menunggu';
