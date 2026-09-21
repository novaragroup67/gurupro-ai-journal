-- Migration: 20260919230000_auto_confirm_and_verify_all_users.sql
-- Description: Automatically confirm email and verify teacher/student profiles on signup

-- 1. Trigger BEFORE INSERT on auth.users to auto-confirm email
CREATE OR REPLACE FUNCTION public.auto_confirm_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  NEW.email_confirmed_at := COALESCE(NEW.email_confirmed_at, NOW());
  NEW.confirmation_token := '';
  NEW.raw_user_meta_data := jsonb_set(
    COALESCE(NEW.raw_user_meta_data, '{}'::jsonb),
    '{email_verified}',
    'true'::jsonb
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_confirm_new_user ON auth.users;
CREATE TRIGGER trg_auto_confirm_new_user
BEFORE INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.auto_confirm_new_user();

-- 2. Update handle_new_user() to set status_verifikasi to 'terverifikasi' for all new accounts
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
    v_status := 'terverifikasi';
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
    status_verifikasi = EXCLUDED.status_verifikasi;

  RETURN new;
END;
$function$;
