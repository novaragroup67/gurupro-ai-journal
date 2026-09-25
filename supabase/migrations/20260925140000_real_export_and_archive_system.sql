-- Migration: Real Export and Archive System
-- Adds persistent archive columns, student isolation, audit logging, and teacher archive RPCs.

-- 1. Moduls Table Archive Columns
ALTER TABLE public.moduls
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_moduls_user_archived ON public.moduls(user_id, is_archived);

-- 2. Paket Soal Table Archive Columns
ALTER TABLE public.paket_soal
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_paket_soal_user_archived ON public.paket_soal(user_id, is_archived);

-- 3. Penugasan Table Archive Columns
ALTER TABLE public.penugasan
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_penugasan_guru_archived ON public.penugasan(guru_id, is_archived);

-- 4. Update Student RLS for Moduls (Archived items hidden from students)
DROP POLICY IF EXISTS "siswa_select_class_moduls" ON public.moduls;
CREATE POLICY "siswa_select_class_moduls" ON public.moduls
  FOR SELECT
  TO authenticated
  USING (
    status = 'Terbit'
    AND COALESCE(is_archived, false) = false
    AND is_siswa_eligible_for_modul(user_id, kelas_id, kelas)
  );

-- 5. Update Student RLS for Penugasan (Archived items hidden from students)
DROP POLICY IF EXISTS "siswa select published penugasan of joined kelas" ON public.penugasan;
CREATE POLICY "siswa select published penugasan of joined kelas" ON public.penugasan
  FOR SELECT
  TO authenticated
  USING (
    status = ANY (ARRAY['published'::text, 'closed'::text])
    AND COALESCE(is_archived, false) = false
    AND is_siswa_of_kelas(kelas_id)
  );

-- 6. RPC: Archive Academic Item (Modul, Paket Soal, Penugasan)
CREATE OR REPLACE FUNCTION public.archive_academic_item(
  _item_type text,
  _item_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_found boolean := false;
  v_title text := '';
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Akses ditolak: Tidak terautentikasi';
  END IF;

  v_role := get_current_user_role();
  IF v_role <> 'guru' AND NOT is_admin() THEN
    RAISE EXCEPTION 'Hanya guru pemilik atau admin yang dapat mengarsipkan data ini';
  END IF;

  IF _item_type = 'modul' THEN
    UPDATE public.moduls
    SET is_archived = true,
        archived_at = now(),
        archived_by = v_user_id
    WHERE id = _item_id
      AND (user_id = v_user_id OR is_admin())
    RETURNING judul INTO v_title;

    IF FOUND THEN
      v_found := true;
    END IF;

  ELSIF _item_type = 'paket_soal' THEN
    UPDATE public.paket_soal
    SET is_archived = true,
        archived_at = now(),
        archived_by = v_user_id
    WHERE id = _item_id
      AND (user_id = v_user_id OR is_admin())
    RETURNING judul INTO v_title;

    IF FOUND THEN
      v_found := true;
    END IF;

  ELSIF _item_type = 'penugasan' THEN
    UPDATE public.penugasan
    SET is_archived = true,
        archived_at = now(),
        archived_by = v_user_id
    WHERE id = _item_id
      AND (guru_id = v_user_id OR is_admin())
    RETURNING judul INTO v_title;

    IF FOUND THEN
      v_found := true;
    END IF;

  ELSE
    RAISE EXCEPTION 'Tipe item tidak valid: %. Harus modul, paket_soal, atau penugasan', _item_type;
  END IF;

  IF NOT v_found THEN
    RAISE EXCEPTION 'Data tidak ditemukan atau Anda tidak memiliki akses untuk mengarsipkan data ini';
  END IF;

  -- Log action into system_logs
  INSERT INTO public.system_logs (user_id, action, context, created_at)
  VALUES (
    v_user_id,
    'ARCHIVE_ITEM',
    jsonb_build_object(
      'item_type', _item_type,
      'item_id', _item_id,
      'title', v_title,
      'archived_at', now()
    ),
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'item_type', _item_type,
    'item_id', _item_id,
    'title', v_title,
    'is_archived', true
  );
END;
$$;

-- 7. RPC: Restore Academic Item
CREATE OR REPLACE FUNCTION public.restore_academic_item(
  _item_type text,
  _item_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_found boolean := false;
  v_title text := '';
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Akses ditolak: Tidak terautentikasi';
  END IF;

  v_role := get_current_user_role();
  IF v_role <> 'guru' AND NOT is_admin() THEN
    RAISE EXCEPTION 'Hanya guru pemilik atau admin yang dapat memulihkan data ini';
  END IF;

  IF _item_type = 'modul' THEN
    UPDATE public.moduls
    SET is_archived = false,
        archived_at = null,
        archived_by = null
    WHERE id = _item_id
      AND (user_id = v_user_id OR is_admin())
    RETURNING judul INTO v_title;

    IF FOUND THEN
      v_found := true;
    END IF;

  ELSIF _item_type = 'paket_soal' THEN
    UPDATE public.paket_soal
    SET is_archived = false,
        archived_at = null,
        archived_by = null
    WHERE id = _item_id
      AND (user_id = v_user_id OR is_admin())
    RETURNING judul INTO v_title;

    IF FOUND THEN
      v_found := true;
    END IF;

  ELSIF _item_type = 'penugasan' THEN
    UPDATE public.penugasan
    SET is_archived = false,
        archived_at = null,
        archived_by = null
    WHERE id = _item_id
      AND (guru_id = v_user_id OR is_admin())
    RETURNING judul INTO v_title;

    IF FOUND THEN
      v_found := true;
    END IF;

  ELSE
    RAISE EXCEPTION 'Tipe item tidak valid: %. Harus modul, paket_soal, atau penugasan', _item_type;
  END IF;

  IF NOT v_found THEN
    RAISE EXCEPTION 'Data tidak ditemukan atau Anda tidak memiliki akses untuk memulihkan data ini';
  END IF;

  -- Log action into system_logs
  INSERT INTO public.system_logs (user_id, action, context, created_at)
  VALUES (
    v_user_id,
    'RESTORE_ITEM',
    jsonb_build_object(
      'item_type', _item_type,
      'item_id', _item_id,
      'title', v_title,
      'restored_at', now()
    ),
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'item_type', _item_type,
    'item_id', _item_id,
    'title', v_title,
    'is_archived', false
  );
END;
$$;

-- 8. RPC: Get Teacher Archived Items
CREATE OR REPLACE FUNCTION public.get_teacher_archived_items()
RETURNS TABLE (
  id uuid,
  item_type text,
  judul text,
  deskripsi text,
  mapel text,
  kelas_nama text,
  tahun_ajaran text,
  archived_at timestamp with time zone,
  extra_info jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_adm boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Akses ditolak: Tidak terautentikasi';
  END IF;

  v_is_adm := is_admin();

  RETURN QUERY
  -- 1. Moduls
  SELECT
    m.id,
    'modul'::text AS item_type,
    m.judul,
    m.ringkasan AS deskripsi,
    m.mapel,
    COALESCE(k.nama_kelas, m.kelas) AS kelas_nama,
    COALESCE(k.tahun_ajaran, 'Tidak Terikat') AS tahun_ajaran,
    m.archived_at,
    jsonb_build_object(
      'status', m.status,
      'sections_count', jsonb_array_length(COALESCE(m.sections, '[]'::jsonb)),
      'slides_count', jsonb_array_length(COALESCE(m.slides, '[]'::jsonb))
    ) AS extra_info
  FROM public.moduls m
  LEFT JOIN public.kelas k ON k.id = m.kelas_id
  WHERE m.is_archived = true
    AND (m.user_id = v_user_id OR v_is_adm)

  UNION ALL

  -- 2. Paket Soal
  SELECT
    ps.id,
    'paket_soal'::text AS item_type,
    ps.judul,
    ps.topik AS deskripsi,
    ''::text AS mapel,
    array_to_string(COALESCE(ps.kelas, ARRAY[]::text[]), ', ') AS kelas_nama,
    'Semua'::text AS tahun_ajaran,
    ps.archived_at,
    jsonb_build_object(
      'status', ps.status,
      'soal_count', jsonb_array_length(COALESCE(ps.soal, '[]'::jsonb))
    ) AS extra_info
  FROM public.paket_soal ps
  WHERE ps.is_archived = true
    AND (ps.user_id = v_user_id OR v_is_adm)

  UNION ALL

  -- 3. Penugasan
  SELECT
    p.id,
    'penugasan'::text AS item_type,
    p.judul,
    COALESCE(p.instruksi, '') AS deskripsi,
    COALESCE(k.mapel, '') AS mapel,
    COALESCE(k.nama_kelas, '') AS kelas_nama,
    COALESCE(k.tahun_ajaran, 'Tidak Terikat') AS tahun_ajaran,
    p.archived_at,
    jsonb_build_object(
      'kkm', p.kkm,
      'remedial_enabled', p.remedial_enabled,
      'status', p.status,
      'deadline', p.deadline
    ) AS extra_info
  FROM public.penugasan p
  LEFT JOIN public.kelas k ON k.id = p.kelas_id
  WHERE p.is_archived = true
    AND (p.guru_id = v_user_id OR v_is_adm)

  ORDER BY archived_at DESC NULLS LAST;
END;
$$;
