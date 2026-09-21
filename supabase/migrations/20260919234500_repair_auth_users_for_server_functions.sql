-- Repair Auth user rows so every existing (and future) account can call
-- authenticated server functions such as Analisis Sumber.
-- Typical gaps vs a "normal" signup: email_confirmed_at NULL, empty
-- raw_user_meta_data, missing email identity, incomplete app_metadata.

-- 1. Confirm every existing email account and stamp verified flag.
UPDATE auth.users
SET
  email_confirmed_at = COALESCE(email_confirmed_at, now()),
  confirmation_token = COALESCE(NULLIF(confirmation_token, ''), ''),
  raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('email_verified', true),
  raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object(
      'provider', COALESCE(NULLIF(raw_app_meta_data->>'provider', ''), 'email'),
      'providers', COALESCE(raw_app_meta_data->'providers', '["email"]'::jsonb)
    )
;

-- 2. Copy profile fields into Auth user_metadata so Dashboard → Users
--    matches the in-app profile (nama, role, sekolah, mapel, nip/nisn).
UPDATE auth.users u
SET raw_user_meta_data = COALESCE(u.raw_user_meta_data, '{}'::jsonb) || jsonb_strip_nulls(
  jsonb_build_object(
    'email_verified', true,
    'nama', NULLIF(p.nama, ''),
    'role', NULLIF(p.role, ''),
    'sekolah', NULLIF(p.sekolah, ''),
    'mapel', NULLIF(p.mapel, ''),
    'nip', NULLIF(p.nip, ''),
    'nisn', NULLIF(p.nisn, ''),
    'jenjang', NULLIF(p.kelas, ''),
    'kelas', NULLIF(p.kelas, ''),
    'telepon', NULLIF(p.telepon, '')
  )
)
FROM public.profiles p
WHERE p.id = u.id;

-- 3. Backfill profiles that Auth users are still missing.
INSERT INTO public.profiles (
  id, nama, email, nip, nisn, sekolah, mapel, kelas, telepon, bio, role, status_verifikasi
)
SELECT
  u.id,
  COALESCE(NULLIF(u.raw_user_meta_data->>'nama', ''), split_part(COALESCE(u.email, ''), '@', 1), 'Pengguna'),
  COALESCE(u.email, ''),
  COALESCE(u.raw_user_meta_data->>'nip', ''),
  COALESCE(u.raw_user_meta_data->>'nisn', ''),
  COALESCE(u.raw_user_meta_data->>'sekolah', ''),
  COALESCE(u.raw_user_meta_data->>'mapel', ''),
  COALESCE(u.raw_user_meta_data->>'jenjang', u.raw_user_meta_data->>'kelas', ''),
  COALESCE(u.raw_user_meta_data->>'telepon', ''),
  '',
  CASE
    WHEN u.raw_user_meta_data->>'role' IN ('guru', 'siswa', 'admin') THEN u.raw_user_meta_data->>'role'
    ELSE 'guru'
  END,
  'terverifikasi'
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;

-- 4. Ensure email identities exist. Accounts created from the dashboard / SQL
--    often have no identity row, so refreshSession() and getUser() fail with
--    "Invalid token" even though the user can still browse the app.
DO $$
BEGIN
  IF to_regclass('auth.identities') IS NULL THEN
    RETURN;
  END IF;

  BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'auth'
      AND table_name = 'identities'
      AND column_name = 'provider_id'
  ) THEN
    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    )
    SELECT
      gen_random_uuid(),
      u.id,
      jsonb_build_object(
        'sub', u.id::text,
        'email', u.email,
        'email_verified', true,
        'phone_verified', false
      ),
      'email',
      u.id::text,
      COALESCE(u.last_sign_in_at, u.created_at, now()),
      COALESCE(u.created_at, now()),
      now()
    FROM auth.users u
    WHERE u.email IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM auth.identities i
        WHERE i.user_id = u.id AND i.provider = 'email'
      );
  ELSE
    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    )
    SELECT
      u.id::text,
      u.id,
      jsonb_build_object(
        'sub', u.id::text,
        'email', u.email,
        'email_verified', true
      ),
      'email',
      COALESCE(u.last_sign_in_at, u.created_at, now()),
      COALESCE(u.created_at, now()),
      now()
    FROM auth.users u
    WHERE u.email IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM auth.identities i WHERE i.user_id = u.id
      );
  END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'auth.identities backfill skipped: %', SQLERRM;
  END;
END $$;

-- 5. Keep future signups consistent: confirm email + fill metadata gaps.
CREATE OR REPLACE FUNCTION public.auto_confirm_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  NEW.email_confirmed_at := COALESCE(NEW.email_confirmed_at, NOW());
  NEW.confirmation_token := '';
  NEW.raw_user_meta_data := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb)
    || jsonb_build_object('email_verified', true);
  NEW.raw_app_meta_data := COALESCE(NEW.raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object(
      'provider', COALESCE(NULLIF(NEW.raw_app_meta_data->>'provider', ''), 'email'),
      'providers', COALESCE(NEW.raw_app_meta_data->'providers', '["email"]'::jsonb)
    );
  RETURN NEW;
END;
$$;

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
  ELSIF new.raw_user_meta_data->>'role' = 'admin' THEN
    v_role := 'admin';
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
    COALESCE(NULLIF(new.raw_user_meta_data->>'nama', ''), split_part(COALESCE(new.email, ''), '@', 1), 'Pengguna'),
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
    role = CASE WHEN public.profiles.role = '' THEN EXCLUDED.role ELSE public.profiles.role END,
    status_verifikasi = CASE
      WHEN public.profiles.status_verifikasi = 'ditolak' THEN public.profiles.status_verifikasi
      ELSE EXCLUDED.status_verifikasi
    END;

  RETURN new;
END;
$function$;
