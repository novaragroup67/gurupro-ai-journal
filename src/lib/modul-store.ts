import { supabase } from "@/integrations/supabase/client";
import { createCloudStore, uid } from "./cloud-store";
import { buatIlustrasi } from "./modul-ai";
import type { Modul, ModulSection, ModulStatus, Slide, SumberTipe } from "./modul-types";

type Row = {
  id: string;
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
  sections: unknown;
  slides: unknown;
  created_at: string;
  updated_at: string;
};

function toModul(row: Row): Modul {
  return {
    id: row.id,
    judul: row.judul,
    kelas: row.kelas,
    mapel: row.mapel,
    status: (row.status as ModulStatus) ?? "Draft",
    sumberTipe: (row.sumber_tipe as SumberTipe) ?? "Link Luar",
    sumberInput: row.sumber_input ?? "",
    sumberUrl: row.sumber_url ?? undefined,
    sumberJudul: row.sumber_judul ?? undefined,
    sumberKutipan: row.sumber_kutipan ?? undefined,
    ringkasan: row.ringkasan ?? "",
    sections: (Array.isArray(row.sections) ? row.sections : []) as ModulSection[],
    slides: (Array.isArray(row.slides) ? row.slides : []) as Slide[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRow(modul: Partial<Modul>) {
  return {
    judul: modul.judul ?? "",
    kelas: modul.kelas ?? "",
    mapel: modul.mapel ?? "",
    status: modul.status ?? "Draft",
    sumber_tipe: modul.sumberTipe ?? "Link Luar",
    sumber_input: modul.sumberInput ?? "",
    sumber_url: modul.sumberUrl ?? null,
    sumber_judul: modul.sumberJudul ?? null,
    sumber_kutipan: modul.sumberKutipan ?? null,
    ringkasan: modul.ringkasan ?? "",
    sections: (modul.sections ?? []) as unknown as never,
    slides: (modul.slides ?? []) as unknown as never,
  };
}

const store = createCloudStore<Modul>(async () => {
  const { data, error } = await supabase
    .from("moduls")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as Row[]).map(toModul);
});

export const useModuls = store.useItems;
export const reloadModuls = store.reload;

async function currentUserId() {
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
  if (!id) throw new Error("Sesi berakhir. Silakan masuk kembali.");
  return id;
}

export async function addModul(data: Omit<Modul, "id" | "createdAt" | "updatedAt">) {
  const user_id = await currentUserId();
  const { data: row, error } = await supabase
    .from("moduls")
    .insert({ user_id, ...toRow(data) })
    .select("*")
    .single();
  if (error) throw error;
  const modul = toModul(row as unknown as Row);
  store.set([modul, ...store.get()]);
  return modul;
}

export async function saveModul(modul: Modul) {
  const next = { ...modul, updatedAt: new Date().toISOString() };
  store.set(store.get().map((m) => (m.id === modul.id ? next : m)));
  const { error } = await supabase.from("moduls").update(toRow(modul)).eq("id", modul.id);
  if (error) throw error;
  return next;
}

export async function deleteModul(id: string) {
  store.set(store.get().filter((m) => m.id !== id));
  const { error } = await supabase.from("moduls").delete().eq("id", id);
  if (error) throw error;
}

export async function publishModul(id: string) {
  const found = store.get().find((m) => m.id === id);
  if (!found) return;
  await saveModul({ ...found, status: "Terbit" });
}

export async function setIlustrasi(modulId: string, sectionId: string, ilustrasi: string | undefined) {
  const found = store.get().find((m) => m.id === modulId);
  if (!found) return;
  await saveModul({
    ...found,
    sections: found.sections.map((s) => (s.id === sectionId ? { ...s, ilustrasi } : s)),
  });
}

export async function generateSemuaIlustrasi(modulId: string) {
  const found = store.get().find((m) => m.id === modulId);
  if (!found) return;
  await saveModul({
    ...found,
    sections: found.sections.map((s) => ({ ...s, ilustrasi: buatIlustrasi(s.judul, s.poin) })),
  });
}

export async function setSlides(modulId: string, slides: Slide[]) {
  const found = store.get().find((m) => m.id === modulId);
  if (!found) return;
  await saveModul({ ...found, slides });
}

export { uid };
