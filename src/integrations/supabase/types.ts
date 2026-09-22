export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      kelas: {
        Row: {
          created_at: string
          guru_id: string
          id: string
          kode_kelas: string
          mapel: string
          nama_kelas: string
          tahun_ajaran: string
          tingkat: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          guru_id: string
          id?: string
          kode_kelas?: string
          mapel?: string
          nama_kelas?: string
          tahun_ajaran?: string
          tingkat?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          guru_id?: string
          id?: string
          kode_kelas?: string
          mapel?: string
          nama_kelas?: string
          tahun_ajaran?: string
          tingkat?: string
          updated_at?: string
        }
        Relationships: []
      }
      kelas_anggota: {
        Row: {
          created_at: string
          id: string
          jenis: string
          kelas_id: string
          siswa_email: string
          siswa_id: string
          siswa_nama: string
          siswa_nisn: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          jenis?: string
          kelas_id: string
          siswa_email?: string
          siswa_id: string
          siswa_nama?: string
          siswa_nisn?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          jenis?: string
          kelas_id?: string
          siswa_email?: string
          siswa_id?: string
          siswa_nama?: string
          siswa_nisn?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kelas_anggota_kelas_id_fkey"
            columns: ["kelas_id"]
            isOneToOne: false
            referencedRelation: "kelas"
            referencedColumns: ["id"]
          },
        ]
      }
      moduls: {
        Row: {
          created_at: string
          id: string
          judul: string
          kelas: string
          kelas_id: string | null
          mapel: string
          ringkasan: string
          sections: Json
          slides: Json
          status: string
          sumber_input: string
          sumber_judul: string | null
          sumber_kutipan: string | null
          sumber_tipe: string
          sumber_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          judul?: string
          kelas?: string
          kelas_id?: string | null
          mapel?: string
          ringkasan?: string
          sections?: Json
          slides?: Json
          status?: string
          sumber_input?: string
          sumber_judul?: string | null
          sumber_kutipan?: string | null
          sumber_tipe?: string
          sumber_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          judul?: string
          kelas?: string
          kelas_id?: string | null
          mapel?: string
          ringkasan?: string
          sections?: Json
          slides?: Json
          status?: string
          sumber_input?: string
          sumber_judul?: string | null
          sumber_kutipan?: string | null
          sumber_tipe?: string
          sumber_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "moduls_kelas_id_fkey"
            columns: ["kelas_id"]
            isOneToOne: false
            referencedRelation: "kelas"
            referencedColumns: ["id"]
          },
        ]
      }
      paket_soal: {
        Row: {
          created_at: string
          id: string
          judul: string
          kelas: string[]
          modul_id: string | null
          soal: Json
          status: string
          topik: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          judul?: string
          kelas?: string[]
          modul_id?: string | null
          soal?: Json
          status?: string
          topik?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          judul?: string
          kelas?: string[]
          modul_id?: string | null
          soal?: Json
          status?: string
          topik?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "paket_soal_modul_id_fkey"
            columns: ["modul_id"]
            isOneToOne: false
            referencedRelation: "moduls"
            referencedColumns: ["id"]
          },
        ]
      }
      penugasan: {
        Row: {
          created_at: string
          deadline: string | null
          guru_id: string
          id: string
          instruksi: string | null
          judul: string
          kelas_id: string
          paket_soal_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deadline?: string | null
          guru_id: string
          id?: string
          instruksi?: string | null
          judul: string
          kelas_id: string
          paket_soal_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deadline?: string | null
          guru_id?: string
          id?: string
          instruksi?: string | null
          judul?: string
          kelas_id?: string
          paket_soal_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "penugasan_kelas_id_fkey"
            columns: ["kelas_id"]
            isOneToOne: false
            referencedRelation: "kelas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "penugasan_paket_soal_id_fkey"
            columns: ["paket_soal_id"]
            isOneToOne: false
            referencedRelation: "paket_soal"
            referencedColumns: ["id"]
          },
        ]
      }
      penugasan_jawaban: {
        Row: {
          catatan: string | null
          created_at: string
          id: string
          is_correct: boolean | null
          jawaban: string | null
          pengumpulan_id: string
          skor: number | null
          soal_id: string
          updated_at: string
        }
        Insert: {
          catatan?: string | null
          created_at?: string
          id?: string
          is_correct?: boolean | null
          jawaban?: string | null
          pengumpulan_id: string
          skor?: number | null
          soal_id: string
          updated_at?: string
        }
        Update: {
          catatan?: string | null
          created_at?: string
          id?: string
          is_correct?: boolean | null
          jawaban?: string | null
          pengumpulan_id?: string
          skor?: number | null
          soal_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "penugasan_jawaban_pengumpulan_id_fkey"
            columns: ["pengumpulan_id"]
            isOneToOne: false
            referencedRelation: "penugasan_pengumpulan"
            referencedColumns: ["id"]
          },
        ]
      }
      penugasan_pengumpulan: {
        Row: {
          catatan_guru: string | null
          created_at: string
          graded_at: string | null
          id: string
          nilai_akhir: number | null
          nilai_essay: number | null
          nilai_pg: number | null
          penugasan_id: string
          siswa_id: string
          status: string
          status_penilaian: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          catatan_guru?: string | null
          created_at?: string
          graded_at?: string | null
          id?: string
          nilai_akhir?: number | null
          nilai_essay?: number | null
          nilai_pg?: number | null
          penugasan_id: string
          siswa_id: string
          status?: string
          status_penilaian?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          catatan_guru?: string | null
          created_at?: string
          graded_at?: string | null
          id?: string
          nilai_akhir?: number | null
          nilai_essay?: number | null
          nilai_pg?: number | null
          penugasan_id?: string
          siswa_id?: string
          status?: string
          status_penilaian?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "penugasan_pengumpulan_penugasan_id_fkey"
            columns: ["penugasan_id"]
            isOneToOne: false
            referencedRelation: "penugasan"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          bio: string
          created_at: string
          email: string
          id: string
          kelas: string
          mapel: string
          nama: string
          nip: string
          nisn: string
          role: string
          sekolah: string
          status_verifikasi: string
          telepon: string
          updated_at: string
        }
        Insert: {
          bio?: string
          created_at?: string
          email?: string
          id: string
          kelas?: string
          mapel?: string
          nama?: string
          nip?: string
          nisn?: string
          role: string
          sekolah?: string
          status_verifikasi?: string
          telepon?: string
          updated_at?: string
        }
        Update: {
          bio?: string
          created_at?: string
          email?: string
          id?: string
          kelas?: string
          mapel?: string
          nama?: string
          nip?: string
          nisn?: string
          role?: string
          sekolah?: string
          status_verifikasi?: string
          telepon?: string
          updated_at?: string
        }
        Relationships: []
      }
      system_logs: {
        Row: {
          context: Json
          created_at: string
          event_type: string
          id: string
          level: string
          message: string
        }
        Insert: {
          context?: Json
          created_at?: string
          event_type: string
          id?: string
          level: string
          message: string
        }
        Update: {
          context?: Json
          created_at?: string
          event_type?: string
          id?: string
          level?: string
          message?: string
        }
        Relationships: []
      }
      tahun_ajaran: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          tahun: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          tahun: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          tahun?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_update_teacher_verification: {
        Args: { _status: string; _teacher_id: string }
        Returns: boolean
      }
      cari_kelas_by_kode: {
        Args: { _kode: string }
        Returns: {
          id: string
          kode_kelas: string
          mapel: string
          nama_kelas: string
          tahun_ajaran: string
          tingkat: string
        }[]
      }
      get_admin_dashboard_stats: { Args: never; Returns: Json }
      get_current_user_role: { Args: never; Returns: string }
      get_penugasan_soal_for_siswa: {
        Args: { _penugasan_id: string }
        Returns: Json
      }
      is_admin: { Args: never; Returns: boolean }
      is_guru_of_kelas: { Args: { p_kelas_id: string }; Returns: boolean }
      is_siswa_can_submit: {
        Args: { p_penugasan_id: string }
        Returns: boolean
      }
      is_siswa_eligible_for_modul: {
        Args: {
          p_modul_kelas: string
          p_modul_kelas_id: string
          p_modul_user_id: string
        }
        Returns: boolean
      }
      is_siswa_eligible_for_paket_soal: {
        Args: { p_paket_soal_id: string }
        Returns: boolean
      }
      is_siswa_of_kelas: { Args: { p_kelas_id: string }; Returns: boolean }
      is_student_of_teacher: {
        Args: { student_id: string; teacher_id: string }
        Returns: boolean
      }
      is_teacher_of_student: {
        Args: { student_id: string; teacher_id: string }
        Returns: boolean
      }
      log_system_event: {
        Args: {
          _context?: Json
          _event_type: string
          _level: string
          _message: string
        }
        Returns: string
      }
      simpan_penilaian_guru: {
        Args: {
          _catatan_guru: string
          _detail_jawaban?: Json
          _nilai_essay: number
          _pengumpulan_id: string
        }
        Returns: Json
      }
      submit_penugasan: { Args: { _pengumpulan_id: string }; Returns: Json }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
