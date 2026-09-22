-- Migration: 20260922090000_stabilize_auth_and_roles.sql
-- Description: Stabilize authentication, profile creation, and role verification.
-- Ensures newly registered teachers start with status_verifikasi = 'menunggu'
-- while students start with status_verifikasi = 'terverifikasi'.
-- Protects status_verifikasi from being reset on profile update / conflict.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
  v_status text;
BEGIN
  IF new.raw_user_meta_data->>'role' = 'siswa' THEN
    v_role := 'siswa';
    v_status := 'terverifikasi';
  ELSE
    v_role := 'guru';
    v_status := 'menunggu';
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
