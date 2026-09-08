export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          nama: string;
          email: string;
          nip: string;
          sekolah: string;
          mapel: string;
          kelas: string;
          telepon: string;
          bio: string;
          role: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          nama?: string;
          email?: string;
          nip?: string;
          sekolah?: string;
          mapel?: string;
          kelas?: string;
          telepon?: string;
          bio?: string;
          role?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          nama?: string;
          email?: string;
          nip?: string;
          sekolah?: string;
          mapel?: string;
          kelas?: string;
          telepon?: string;
          bio?: string;
          role?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      kelas: {
        Row: {
          id: string;
          guru_id: string;
          nama_kelas: string;
          tingkat: string;
          mapel: string;
          tahun_ajaran: string;
          kode_kelas: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          guru_id: string;
          nama_kelas?: string;
          tingkat?: string;
          mapel?: string;
          tahun_ajaran?: string;
          kode_kelas?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          guru_id?: string;
          nama_kelas?: string;
          tingkat?: string;
          mapel?: string;
          tahun_ajaran?: string;
          kode_kelas?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "kelas_guru_id_fkey";
            columns: ["guru_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      kelas_anggota: {
        Row: {
          id: string;
          kelas_id: string;
          siswa_id: string;
          status: string;
          jenis: string;
          siswa_email: string;
          siswa_nama: string;
          siswa_nisn: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          kelas_id: string;
          siswa_id: string;
          status?: string;
          jenis?: string;
          siswa_email?: string;
          siswa_nama?: string;
          siswa_nisn?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          kelas_id?: string;
          siswa_id?: string;
          status?: string;
          jenis?: string;
          siswa_email?: string;
          siswa_nama?: string;
          siswa_nisn?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "kelas_anggota_kelas_id_fkey";
            columns: ["kelas_id"];
            isOneToOne: false;
            referencedRelation: "kelas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kelas_anggota_siswa_id_fkey";
            columns: ["siswa_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      moduls: {
        Row: {
          id: string;
          user_id: string;
          judul: string;
          kelas: string;
          mapel: string;
          status: string;
          sumber_tipe: string;
          sumber_input: string;
          sumber_url: string | null;
          sumber_judul: string | null;
          sumber_kutipan: string | null;
          ringkasan: string;
          sections: Json;
          slides: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          judul?: string;
          kelas?: string;
          mapel?: string;
          status?: string;
          sumber_tipe?: string;
          sumber_input?: string;
          sumber_url?: string | null;
          sumber_judul?: string | null;
          sumber_kutipan?: string | null;
          ringkasan?: string;
          sections?: Json;
          slides?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          judul?: string;
          kelas?: string;
          mapel?: string;
          status?: string;
          sumber_tipe?: string;
          sumber_input?: string;
          sumber_url?: string | null;
          sumber_judul?: string | null;
          sumber_kutipan?: string | null;
          ringkasan?: string;
          sections?: Json;
          slides?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      paket_soal: {
        Row: {
          id: string;
          user_id: string;
          judul: string;
          topik: string;
          modul_id: string | null;
          status: string;
          kelas: string[];
          soal: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          judul?: string;
          topik?: string;
          modul_id?: string | null;
          status?: string;
          kelas?: string[];
          soal?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          judul?: string;
          topik?: string;
          modul_id?: string | null;
          status?: string;
          kelas?: string[];
          soal?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
