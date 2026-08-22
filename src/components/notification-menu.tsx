import { Link } from "@tanstack/react-router";
import { Bell, BookOpen, ClipboardList, UserCheck } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NOTIFIKASI, type Notifikasi } from "@/lib/notifications";

const ICONS = {
  tugas: ClipboardList,
  modul: BookOpen,
  verifikasi: UserCheck,
} as const;

const LINKS = {
  tugas: "/penugasan",
  modul: "/modul-ajar",
  verifikasi: "/verifikasi",
} as const;

export function NotificationMenu() {
  const [read, setRead] = useState<string[]>([]);
  const unread = NOTIFIKASI.filter((n) => !read.includes(n.id));

  const markRead = (n: Notifikasi) => setRead((prev) => (prev.includes(n.id) ? prev : [...prev, n.id]));

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
                setRead(NOTIFIKASI.map((n) => n.id));
              }}
            >
              Tandai dibaca
            </button>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {NOTIFIKASI.map((n) => {
          const Icon = ICONS[n.tipe];
          const isRead = read.includes(n.id);
          return (
            <DropdownMenuItem key={n.id} asChild onSelect={() => markRead(n)}>
              <Link to={LINKS[n.tipe]} className="items-start gap-3 py-2.5">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className={isRead ? "text-sm text-muted-foreground" : "text-sm font-semibold"}>
                      {n.judul}
                    </span>
                    {!isRead ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" /> : null}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">{n.detail}</span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground/80">{n.waktu}</span>
                </span>
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
