-- Migration: Add admin_delete_teacher RPC with cascade cleanup and system log audit
CREATE OR REPLACE FUNCTION public.admin_delete_teacher(_teacher_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_role text;
  v_target_name text;
  v_target_email text;
BEGIN
  -- 1. Security Check: Caller must be admin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Akses ditolak: Hanya administrator yang diizinkan menghapus akun guru.';
  END IF;

  -- 2. Validate teacher existence
  SELECT role, nama, email INTO v_target_role, v_target_name, v_target_email
  FROM public.profiles
  WHERE id = _teacher_id;

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'Data guru tidak ditemukan.';
  END IF;

  -- 3. Prevent deleting admin accounts
  IF v_target_role = 'admin' THEN
    RAISE EXCEPTION 'Akun administrator tidak dapat dihapus melalui fitur ini.';
  END IF;

  -- 4. Audit Log before deletion
  INSERT INTO public.system_logs (level, event_type, message, context)
  VALUES (
    'warn',
    'admin_delete_teacher',
    'Akun guru ' || COALESCE(v_target_name, '') || ' (' || COALESCE(v_target_email, '') || ') dihapus oleh administrator.',
    jsonb_build_object(
      'teacher_id', _teacher_id,
      'email', v_target_email,
      'nama', v_target_name,
      'deleted_by', auth.uid()
    )
  );

  -- 5. Clean up dependencies in exact order to avoid RESTRICT / FK conflicts
  -- a. Submissions & student answers from teacher's assignments
  DELETE FROM public.penugasan_pengumpulan
  WHERE penugasan_id IN (SELECT id FROM public.penugasan WHERE guru_id = _teacher_id);

  -- b. Penugasan created by teacher
  DELETE FROM public.penugasan WHERE guru_id = _teacher_id;

  -- c. Paket soal created by teacher
  DELETE FROM public.paket_soal WHERE user_id = _teacher_id;

  -- d. Moduls created by teacher
  DELETE FROM public.moduls WHERE user_id = _teacher_id;

  -- e. Class members in teacher classes
  DELETE FROM public.kelas_anggota
  WHERE kelas_id IN (SELECT id FROM public.kelas WHERE guru_id = _teacher_id);

  -- f. Classes created by teacher
  DELETE FROM public.kelas WHERE guru_id = _teacher_id;

  -- g. Bug reports submitted by teacher
  DELETE FROM public.bug_reports WHERE reporter_id = _teacher_id;

  -- h. Teacher profile
  DELETE FROM public.profiles WHERE id = _teacher_id;

  -- i. Auth user (cascades identities, sessions, tokens)
  DELETE FROM auth.users WHERE id = _teacher_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Akun guru dan seluruh data terkait berhasil dihapus.',
    'teacher_id', _teacher_id,
    'email', v_target_email
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_teacher(uuid) TO authenticated;
