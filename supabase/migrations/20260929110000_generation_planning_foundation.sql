-- Migration: 20260929110000_generation_planning_foundation.sql
-- Description: GEN-0 Generation Planning Foundation
-- Creates shared planning tables, versioning, styles, and RLS policies for AI Illustration and AI PPT generation.

-- 1. GENERATION STYLES CATALOG TABLE
CREATE TABLE IF NOT EXISTS public.generation_styles (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('illustration', 'presentation')),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  visual_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  layout_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  typography_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  prompt_modifiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  things_to_avoid JSONB NOT NULL DEFAULT '[]'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS for generation_styles
ALTER TABLE public.generation_styles ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view style definitions
DROP POLICY IF EXISTS "Authenticated users can select generation styles" ON public.generation_styles;
CREATE POLICY "Authenticated users can select generation styles"
  ON public.generation_styles
  FOR SELECT
  TO authenticated
  USING (true);

-- 2. GENERATION PLANS TABLE
CREATE TABLE IF NOT EXISTS public.generation_plans (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('illustration', 'presentation')),
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('draft', 'ready', 'approved', 'generating', 'completed', 'failed', 'archived')),
  current_version INTEGER NOT NULL DEFAULT 1,
  approved_version INTEGER DEFAULT NULL,
  outline JSONB NOT NULL DEFAULT '{}'::jsonb,
  style JSONB DEFAULT NULL,
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  generation_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for plan lookups
CREATE INDEX IF NOT EXISTS idx_generation_plans_owner_id ON public.generation_plans(owner_id);
CREATE INDEX IF NOT EXISTS idx_generation_plans_module_id ON public.generation_plans(module_id);
CREATE INDEX IF NOT EXISTS idx_generation_plans_owner_module ON public.generation_plans(owner_id, module_id);
CREATE INDEX IF NOT EXISTS idx_generation_plans_module_target ON public.generation_plans(module_id, target_type);
CREATE INDEX IF NOT EXISTS idx_generation_plans_status ON public.generation_plans(status);

-- Enable RLS for generation_plans
ALTER TABLE public.generation_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Guru can select own generation plans" ON public.generation_plans;
CREATE POLICY "Guru can select own generation plans"
  ON public.generation_plans
  FOR SELECT
  TO authenticated
  USING (
    owner_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  );

DROP POLICY IF EXISTS "Guru can insert own generation plans" ON public.generation_plans;
CREATE POLICY "Guru can insert own generation plans"
  ON public.generation_plans
  FOR INSERT
  TO authenticated
  WITH CHECK (
    owner_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  );

DROP POLICY IF EXISTS "Guru can update own generation plans" ON public.generation_plans;
CREATE POLICY "Guru can update own generation plans"
  ON public.generation_plans
  FOR UPDATE
  TO authenticated
  USING (
    owner_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  )
  WITH CHECK (
    owner_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  );

DROP POLICY IF EXISTS "Guru can delete own generation plans" ON public.generation_plans;
CREATE POLICY "Guru can delete own generation plans"
  ON public.generation_plans
  FOR DELETE
  TO authenticated
  USING (
    owner_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  );

-- 3. GENERATION PLAN VERSIONS TABLE (IMMUTABLE HISTORY)
CREATE TABLE IF NOT EXISTS public.generation_plan_versions (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES public.generation_plans(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  outline_snapshot JSONB NOT NULL,
  style_snapshot JSONB DEFAULT NULL,
  change_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_approved BOOLEAN NOT NULL DEFAULT false,
  approved_at TIMESTAMPTZ DEFAULT NULL,
  approved_by TEXT DEFAULT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_generation_plan_versions_plan_num UNIQUE (plan_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_generation_plan_versions_plan_id ON public.generation_plan_versions(plan_id);
CREATE INDEX IF NOT EXISTS idx_generation_plan_versions_lookup ON public.generation_plan_versions(plan_id, version_number DESC);

-- Enable RLS for generation_plan_versions
ALTER TABLE public.generation_plan_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Guru can select own plan versions" ON public.generation_plan_versions;
CREATE POLICY "Guru can select own plan versions"
  ON public.generation_plan_versions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.generation_plans
      WHERE generation_plans.id = generation_plan_versions.plan_id
        AND generation_plans.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Guru can insert own plan versions" ON public.generation_plan_versions;
CREATE POLICY "Guru can insert own plan versions"
  ON public.generation_plan_versions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.generation_plans
      WHERE generation_plans.id = generation_plan_versions.plan_id
        AND generation_plans.owner_id = auth.uid()
    )
  );

-- 4. SEED INITIAL CANONICAL STYLES
INSERT INTO public.generation_styles (id, type, name, description, visual_rules, layout_rules, typography_rules, prompt_modifiers, things_to_avoid, version)
VALUES
  ('style_ill_flat_edu', 'illustration', 'Flat Educational', 'Gaya vektor datar bersih dan modern, sangat mudah dipahami siswa dengan saturasi seimbang.',
   '["Garis kontur bersih", "Warna solid harmonis", "Bebas gradien berlebih", "Karakter bersahabat"]'::jsonb,
   '["Subjek utama di tengah", "Spasi negatif lapang", "Hierarki elemen visual jelas"]'::jsonb,
   '["Label sans-serif tebal jika diperlukan", "Maksimal 3 label teks"]'::jsonb,
   '["clean flat 2D vector educational illustration", "minimalist shapes", "clear silhouette"]'::jsonb,
   '["tekstur bising", "bayangan realistis gelap", "elemen visual berdesakan"]'::jsonb, 1),

  ('style_ill_3d_edu', 'illustration', '3D Educational', 'Render 3D halus dengan pencahayaan lembut bergaya animasi modern yang menarik minat belajar.',
   '["Bentuk 3D rounded lembut", "Pencahayaan difus", "Bahan matte plastisin halus"]'::jsonb,
   '["Kedalaman ruang terukur", "Isometrik atau perspektif 3/4"]'::jsonb,
   '["Label mengambang dengan kartu latar semi-transparan"]'::jsonb,
   '["cute stylized 3D clay-render", "soft studio lighting", "isometric view"]'::jsonb,
   '["fotorealisme menyeramkan", "pencahayaan kontras keras", "tekstur kasar"]'::jsonb, 1),

  ('style_ill_modern_vector', 'illustration', 'Modern Vector', 'Ilustrasi grafis vektor dinamis kontemporer untuk materi sains, teknologi, dan kejuruan.',
   '["Aksen garis geometris presisi", "Palet warna bertema teknologi", "Gradien halus terkontrol"]'::jsonb,
   '["Komposisi grid terstruktur", "Penekanan alur proses"]'::jsonb,
   '["Monospace atau sans-serif modern"]'::jsonb,
   '["crisp modern vector artwork", "infographic feel", "geometric harmony"]'::jsonb,
   '["detail berantakan", "garis sketsa acak"]'::jsonb, 1),

  ('style_ill_hand_drawn', 'illustration', 'Hand Drawn', 'Gaya sketsa tangan artistik dengan tekstur pensil/cat air lembut untuk materi sejarah, sastra, dan seni.',
   '["Garis pensil organik", "Sapuan cat air pastel", "Estetika buku cerita edukatif"]'::jsonb,
   '["Komposisi luwes alami", "Sentuhan ilustrasi buku teks klasik"]'::jsonb,
   '["Font berkarakter tulisan tangan rapi atau serif hangat"]'::jsonb,
   '["warm hand-drawn storybook illustration", "pencil sketch watercolor wash"]'::jsonb,
   '["garis vektor kaku", "warna neon mencolok"]'::jsonb, 1),

  ('style_ill_realistic', 'illustration', 'Realistic', 'Visual realistis presisi tinggi untuk biologi, anatomi, geografi, dan fenomena alam nyata.',
   '["Proporsi anatomi/alam akurat", "Detail permukaan alami", "Pencahayaan natural"]'::jsonb,
   '["Fokus makro pada bagian penting", "Latar belakang kontekstual yang mendukung"]'::jsonb,
   '["Label penunjuk anatomi garis lurus bersih"]'::jsonb,
   '["accurate realistic natural science illustration", "high pedagogical clarity"]'::jsonb,
   '["distorsi karikatur", "fantasi fiktif non-ilmiah"]'::jsonb, 1),

  ('style_ill_infographic', 'illustration', 'Infographic', 'Ilustrasi terstruktur berorientasi data dan perbandingan konsep untuk mempermudah telaah analitis.',
   '["Ikonografi visual konsisten", "Kode warna kategori", "Panah alur kausalitas"]'::jsonb,
   '["Komposisi terbagi per kolom/alur bertingkat", "Perbandingan berdampingan"]'::jsonb,
   '["Hierarki angka dan judul tegas"]'::jsonb,
   '["instructional infographic diagram", "clear step-by-step visual hierarchy"]'::jsonb,
   '["dekorasi tanpa makna", "arah baca membingungkan"]'::jsonb, 1),

  ('style_ill_tech_diagram', 'illustration', 'Technical Diagram', 'Diagram teknik, skema kelistrikan, topologi jaringan, atau mesin dengan akurasi simbolis standar.',
   '["Garis ortogonal rapi", "Simbol teknik standar ISO/IEEE", "Skema terukur"]'::jsonb,
   '["Alur kiri-ke-kanan atau atas-ke-bawah", "Pemisahan blok fungsional"]'::jsonb,
   '["Teks monospaced teknis jelas terbaca"]'::jsonb,
   '["precise engineering schematic diagram", "blueprint technical illustration"]'::jsonb,
   '["elemen artistik hiasan", "garis miring tanpa fungsi"]'::jsonb, 1),

  ('style_ppt_modern_minimal', 'presentation', 'Modern Minimal', 'Slide elegan berfokus pada kekuatan tipografi, spasi lapang, dan satu ide kunci per slide.',
   '["Latar belakang putih/terang bersih", "Kontras tinggi judul vs isi", "Elemen visual terpusat"]'::jsonb,
   '["Spasi margin lebar", "Maksimal 4 baris teks per slide", "Tata letak asimetris seimbang"]'::jsonb,
   '["Font Display Sans-Serif modern", "Ukuran judul minimal 32pt"]'::jsonb,
   '["clean minimalist presentation slide", "ample whitespace", "bold editorial layout"]'::jsonb,
   '["tumpukan teks berulang", "bullet points berjejal", "clipart generik"]'::jsonb, 1),

  ('style_ppt_edu_classroom', 'presentation', 'Educational Classroom', 'Desain ramah pembelajaran kelas dengan kartu konsep berwarna lembut dan penanda visual fokus.',
   '["Palet warna ramah siswa (biru/hijau/emas)", "Bingkai kartu sudut melengkung"]'::jsonb,
   '["Struktur 2 kolom (konsep vs contoh)", "Penomoran langkah yang mencolok"]'::jsonb,
   '["Font sans-serif ramah baca dengan keterbacaan proyektor tinggi"]'::jsonb,
   '["interactive educational slide layout", "concept cards", "friendly instructional hierarchy"]'::jsonb,
   '["kontras rendah yang sulit terbaca proyektor", "huruf serif terlalu tipis"]'::jsonb, 1),

  ('style_ppt_corp_pro', 'presentation', 'Corporate Professional', 'Gaya profesional terstruktur untuk materi manajemen, bisnis, kepemimpinan, dan kejuruan industri.',
   '["Palet navy profesional dan abu-abu netral", "Garis pembatas tegas"]'::jsonb,
   '["Grid korporat 3 kolom", "Header slide formal konsisten"]'::jsonb,
   '["Kombinasi font sans-serif korporat tegas"]'::jsonb,
   '["executive corporate presentation", "structured clean data alignment"]'::jsonb,
   '["warna-warni pelangi tak teratur", "ikon kekanak-kanakan"]'::jsonb, 1),

  ('style_ppt_visual_learning', 'presentation', 'Visual Learning', 'Fokus pada gambar/diagram besar di satu sisi dengan ringkasan poin inti di sisi sebelahnya.',
   '["Rasio 60:40 (visual besar : penjelasan ringkas)", "Penyorot kata kunci berwarna"]'::jsonb,
   '["Pemisahan horizontal atau split-screen vertikal"]'::jsonb,
   '["Teks ringkas butir-butir pendek"]'::jsonb,
   '["visual-first slide deck", "split screen diagram and key takeaways"]'::jsonb,
   '["paragraf panjang tanpa visual", "visual terlalu kecil"]'::jsonb, 1),

  ('style_ppt_technical', 'presentation', 'Technical', 'Cocok untuk materi pemrograman, rekayasa, IPA kuantitatif, dan alur prosedur teknis.',
   '["Blok kode atau rumus dengan kotak terpisah", "Palet warna terminal/slate"]'::jsonb,
   '["Struktur problem-solution atau step-by-step"]'::jsonb,
   '["Font monospaced untuk kode/rumus dan sans-serif untuk deskripsi"]'::jsonb,
   '["technical documentation presentation", "code block layout", "formula callout"]'::jsonb,
   '["format kode tidak beraturan", "tanda kurung hilang"]'::jsonb, 1),

  ('style_ppt_academic', 'presentation', 'Academic', 'Format klasik terstruktur untuk penelitian, studi literatur, telaah sejarah, dan seminar.',
   '["Gaya akademis rapi dengan catatan sitasi di kaki slide", "Palet netral berwibawa"]'::jsonb,
   '["Kolom terstruktur dengan kutipan dan temuan data"]'::jsonb,
   '["Font serif elegan pada judul dan sans-serif pada konten"]'::jsonb,
   '["scholarly academic presentation slide", "formal research layout"]'::jsonb,
   '["animasi berlebihan", "warna norak"]'::jsonb, 1)

ON CONFLICT (id) DO UPDATE SET
  type = EXCLUDED.type,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  visual_rules = EXCLUDED.visual_rules,
  layout_rules = EXCLUDED.layout_rules,
  typography_rules = EXCLUDED.typography_rules,
  prompt_modifiers = EXCLUDED.prompt_modifiers,
  things_to_avoid = EXCLUDED.things_to_avoid,
  version = EXCLUDED.version;
