-- Migration: 20260922103000_strict_role_registration.sql
-- Description: Enforce strict role validation during registration.
-- Only 'guru' and 'siswa' roles are accepted.
-- 'admin' and unknown/invalid roles are strictly rejected with an exception.
-- Preserves existing verified status on conflict/update.

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
    v_status := 'menunggu';
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

CREATE OR REPLACE FUNCTION public.handle_profile_security_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_role text;
BEGIN
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();

  IF TG_OP = 'INSERT' THEN
    IF NEW.role = 'guru' THEN
      NEW.status_verifikasi := 'menunggu';
    ELSIF NEW.role = 'siswa' THEN
      NEW.status_verifikasi := 'terverifikasi';
    ELSE
      RAISE EXCEPTION 'Peran pengguna tidak valid (%). Hanya peran guru atau siswa yang diizinkan saat pendaftaran.', NEW.role;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF (v_caller_role IS NULL OR v_caller_role != 'admin') THEN
      IF NEW.role IS DISTINCT FROM OLD.role THEN
        RAISE EXCEPTION 'Peran pengguna (role) tidak dapat diubah sendiri.';
      END IF;
      IF NEW.status_verifikasi IS DISTINCT FROM OLD.status_verifikasi THEN
        RAISE EXCEPTION 'Status verifikasi akun hanya dapat diubah oleh administrator.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
