import { supabase } from "@/integrations/supabase/client";
import { createCloudStore, uid } from "./cloud-store";
import type { PaketSoal, Soal, SoalStatus } from "./soal-types";

type Row = {
  id: string;
  judul: string;
  topik: string;
  modul_id: string | null;
  status: string;
  kelas: string[] | null;
  soal: unknown;
  created_at: string;
};

function toPaket(row: Row): PaketSoal {
  return {
    id: row.id,
    judul: row.judul,
    topik: row.topik,
    modulId: row.modul_id ?? undefined,
    status: (row.status as SoalStatus) ?? "Draft",
    kelas: row.kelas ?? [],
    soal: (Array.isArray(row.soal) ? row.soal : []) as Soal[],
    createdAt: row.created_at,
  };
}

function toRow(paket: Partial<PaketSoal>) {
  const row: Record<string, unknown> = {};
  if (paket.judul !== undefined) row["judul"] = paket.judul;
  if (paket.topik !== undefined) row["topik"] = paket.topik;
  if (paket.modulId !== undefined) row["modul_id"] = paket.modulId ?? null;
  if (paket.status !== undefined) row["status"] = paket.status;
  if (paket.kelas !== undefined) row["kelas"] = paket.kelas;
  if (paket.soal !== undefined) row["soal"] = paket.soal;
  return row;
}

const store = createCloudStore<PaketSoal>(async () => {
  const { data, error } = await supabase
    .from("paket_soal")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as Row[]).map(toPaket);
});

export const usePaketSoal = store.useItems;
export const reloadPaketSoal = store.reload;

async function currentUserId() {
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
  if (!id) throw new Error("Sesi berakhir. Silakan masuk kembali.");
  return id;
}

export async function addPaket(data: Omit<PaketSoal, "id" | "createdAt">) {
  const user_id = await currentUserId();
  const { data: row, error } = await supabase
    .from("paket_soal")
    .insert({ user_id, ...toRow(data) } as never)
    .select("*")
    .single();
  if (error) throw error;
  const paket = toPaket(row as unknown as Row);
  store.set([paket, ...store.get()]);
  return paket;
}

export async function updatePaket(id: string, patch: Partial<PaketSoal>) {
  store.set(store.get().map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const { error } = await supabase.from("paket_soal").update(toRow(patch) as never).eq("id", id);
  if (error) throw error;
}

export async function deletePaket(id: string) {
  store.set(store.get().filter((p) => p.id !== id));
  const { error } = await supabase.from("paket_soal").delete().eq("id", id);
  if (error) throw error;
}

export async function publishPaket(id: string) {
  await updatePaket(id, { status: "Terbit" });
}

export async function duplicatePaket(id: string) {
  const found = store.get().find((p) => p.id === id);
  if (!found) return;
  await addPaket({
    judul: `${found.judul} (Salinan)`,
    topik: found.topik,
    modulId: found.modulId,
    status: "Draft",
    kelas: [],
    soal: found.soal.map((s) => ({ ...s, id: uid() })),
  });
}

export async function terbitkanSebagaiTugas(id: string, kelas: string[]) {
  const found = store.get().find((p) => p.id === id);
  if (!found) return;
  const merged = Array.from(new Set([...found.kelas, ...kelas]));
  await updatePaket(id, { kelas: merged, status: "Terbit" });
}

export { uid };
