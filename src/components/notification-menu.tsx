import { Link } from "@tanstack/react-router";
import { Bell, BookOpen, ClipboardList, Info, UserCheck } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth-store";
import { useKelas } from "@/lib/kelas-store";

interface RealNotif {
  id: string;
  judul: string;
  detail: string;
  tipe: "tugas" | "modul" | "verifikasi";
  url: string;
}

const ICONS = {
  tugas: ClipboardList,
  modul: BookOpen,
  verifikasi: UserCheck,
} as const;

export function NotificationMenu() {
  const { user, profile } = useAuth();
  const { kelasList, anggotaList } = useKelas();
  const [read, setRead] = useState<string[]>([]);

  const notifications = useMemo(() => {
    const list: RealNotif[] = [];
    const userId = user?.id || profile.id;

    if (profile.role === "guru") {
      const myClasses = kelasList.filter((k) => k.guruId === userId);
      const myClassIds = new Set(myClasses.map((c) => c.id));
      const pendingMembers = anggotaList.filter(
        (a) => myClassIds.has(a.kelasId) && a.status === "menunggu",
      );

      if (pendingMembers.length > 0) {
        list.push({
          id: `pending-${pendingMembers.length}`,
          judul: `${pendingMembers.length} siswa menunggu verifikasi`,
          detail: `Permohonan bergabung ke kelas Anda perlu persetujuan.`,
          tipe: "verifikasi",
          url: "/verifikasi",
        });
      }
    } else if (profile.role === "siswa") {
      // Notifikasi siswa jika ada kelas berstatus disetujui atau tugas
      const joinedPending = anggotaList.filter(
        (a) => a.siswaId === userId && a.status === "menunggu",
      );
      if (joinedPending.length > 0) {
        list.push({
          id: `joined-pending-${joinedPending.length}`,
          judul: `${joinedPending.length} kelas dalam verifikasi`,
          detail: "Guru pengampu sedang memproses permohonan Anda.",
          tipe: "verifikasi",
          url: "/",
        });
      }
    }

    return list;
  }, [user?.id, profile.id, profile.role, kelasList, anggotaList]);

  const unread = notifications.filter((n) => !read.includes(n.id));

  const markRead = (n: RealNotif) =>
    setRead((prev) => (prev.includes(n.id) ? prev : [...prev, n.id]));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notifikasi" className="relative">
          <Bell className="h-4 w-4" />
          {unread.length > 0 ? (
            <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground">
              {unread.length}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(20rem,calc(100vw-2rem))]">
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          <span>Notifikasi</span>
          {unread.length > 0 ? (
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={(e) => {
                e.preventDefault();
                setRead(notifications.map((n) => n.id));
              }}
            >
              Tandai dibaca
            </button>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            <Info className="mx-auto h-6 w-6 text-muted-foreground/40 mb-1" />
            Tidak ada notifikasi baru
          </div>
        ) : (
          notifications.map((n) => {
            const Icon = ICONS[n.tipe];
            const isRead = read.includes(n.id);
            return (
              <DropdownMenuItem key={n.id} asChild onSelect={() => markRead(n)}>
                <Link to={n.url} className="items-start gap-3 py-2.5">
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span
                        className={
                          isRead ? "text-sm text-muted-foreground" : "text-sm font-semibold"
                        }
                      >
                        {n.judul}
                      </span>
                      {!isRead ? (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                      ) : null}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {n.detail}
                    </span>
                  </span>
                </Link>
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
