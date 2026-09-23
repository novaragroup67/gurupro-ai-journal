import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useNavigate,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Calendar, Search } from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { GuruProMark } from "@/components/gurupro-logo";
import { NotificationMenu } from "@/components/notification-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { initials, isAuthPublicPath, shortName, useAuth } from "@/lib/auth-store";
import { useTahunAjaran } from "@/lib/tahun-ajaran-store";
import { cn } from "@/lib/utils";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl font-bold text-navy">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Halaman tidak ditemukan</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Halaman yang Anda cari tidak tersedia atau sudah dipindahkan.
        </p>
        <div className="mt-6">
          <Button asChild>
            <Link to="/">Kembali ke Dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error("[TanStack ErrorComponent]", error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="max-w-xl text-center">
        <h1 className="font-display text-xl font-semibold tracking-tight">
          Halaman ini gagal dimuat
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Terjadi kesalahan. Coba muat ulang atau kembali ke dashboard.
        </p>
        {error && (
          <div className="mt-4 max-h-64 overflow-auto rounded-lg border border-red-200 bg-red-50 p-4 text-left font-mono text-xs text-red-900 shadow-inner">
            <p className="font-bold text-red-700">{error.name}: {error.message}</p>
            {error.stack && (
              <pre className="mt-2 whitespace-pre-wrap text-[11px] text-red-800/90 leading-relaxed">
                {error.stack}
              </pre>
            )}
          </div>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button
            onClick={() => {
              router.invalidate();
              reset();
            }}
          >
            Coba lagi
          </Button>
          <Button asChild variant="outline">
            <a href="/">Ke Dashboard</a>
          </Button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "GuruPro — Satu Pintu, Semua Administrasi" },
      {
        name: "description",
        content:
          "GuruPro membantu guru SMK menyusun jurnal mengajar, modul ajar, dan administrasi pembelajaran lebih cepat.",
      },
      { name: "author", content: "GuruPro" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700;800&family=Inter:wght@400;500;600;700&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function AuthGate({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { ready, signedIn } = useAuth();
  const publicAuth = isAuthPublicPath(pathname);

  useEffect(() => {
    if (!ready) return;
    if (!signedIn && !publicAuth) {
      void navigate({ to: "/login", replace: true });
    }
    if (signedIn && (pathname === "/login" || pathname === "/daftar")) {
      void navigate({ to: "/", replace: true });
    }
  }, [ready, signedIn, publicAuth, pathname, navigate]);

  if (
    !ready ||
    (!signedIn && !publicAuth) ||
    (signedIn && (pathname === "/login" || pathname === "/daftar"))
  ) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">
        Memuat sesi GuruPro…
      </div>
    );
  }

  return <>{children}</>;
}

export function TahunAjaranHeaderSelector({ userId }: { userId?: string }) {
  const { availableYears, selectedYear, setSelectedYear } = useTahunAjaran(userId);

  const displayYear = selectedYear || availableYears[0]?.tahun || "2026/2027";

  return (
    <div
      className="flex shrink-0 items-center gap-1.5 sm:gap-2"
      data-testid="tahun-ajaran-header-selector"
    >
      <span className="hidden text-xs font-medium text-muted-foreground sm:inline-flex items-center gap-1 shrink-0">
        <Calendar className="h-3.5 w-3.5 text-primary shrink-0" />
        Tahun Ajaran:
      </span>
      <Select value={displayYear} onValueChange={setSelectedYear}>
        <SelectTrigger
          data-testid="tahun-ajaran-select-trigger"
          aria-label="Pilih Tahun Ajaran"
          className="h-8.5 w-auto min-w-[105px] sm:min-w-[125px] gap-1.5 px-2.5 text-xs font-semibold text-navy bg-background border-border shadow-xs hover:bg-muted/50 hover:border-primary/40 focus:ring-2 focus:ring-primary/20 shrink-0 cursor-pointer rounded-lg transition-all"
        >
          <span className="sm:hidden">
            <Calendar className="h-3.5 w-3.5 text-primary shrink-0" />
          </span>
          <SelectValue placeholder="Pilih Tahun">
            {displayYear}
          </SelectValue>
        </SelectTrigger>
        <SelectContent align="start" className="min-w-[150px] sm:min-w-[165px] z-50">
          {availableYears.map((y) => {
            const isCurrent = y.tahun === displayYear;
            return (
              <SelectItem
                key={y.id || y.tahun}
                value={y.tahun}
                className="text-xs font-medium cursor-pointer py-2"
              >
                <div className="flex items-center justify-between w-full gap-2">
                  <span className={cn(isCurrent && "font-semibold text-primary")}>
                    {y.tahun}
                  </span>
                  {y.isActive ? (
                    <Badge
                      variant="secondary"
                      className="h-4 px-1 text-[10px] font-semibold bg-primary/10 text-primary border-primary/20 shrink-0"
                    >
                      Aktif
                    </Badge>
                  ) : null}
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}

function AppShell() {
  const { profile, user, isGuru: authIsGuru } = useAuth();
  
  // Robust teacher role detection across store, auth metadata, and profile
  const isTeacher =
    Boolean(authIsGuru) ||
    profile?.role?.toLowerCase()?.trim() === "guru" ||
    (user?.user_metadata?.role as string)?.toLowerCase()?.trim() === "guru" ||
    (Boolean(user) &&
      profile?.role !== "siswa" &&
      profile?.role !== "admin");

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-2 sm:gap-3 border-b bg-card/85 px-3 sm:px-6 backdrop-blur">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <SidebarTrigger className="shrink-0" />
              <div className="flex items-center gap-1.5 md:hidden shrink-0">
                <GuruProMark className="h-7 w-7 shrink-0" />
                <span className="font-display text-sm font-bold text-navy hidden xs:inline sm:text-base">
                  Guru<span className="text-primary">Pro</span>
                </span>
              </div>
              <div className="h-5 w-px bg-border/80 hidden sm:block shrink-0" />
              {isTeacher ? <TahunAjaranHeaderSelector userId={user?.id || profile?.id} /> : null}
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">

              <Button
                variant="ghost"
                size="icon"
                aria-label="Cari"
                className="hidden sm:inline-flex shrink-0"
              >
                <Search className="h-4 w-4" />
              </Button>
              <NotificationMenu />

              <Link
                to="/profil"
                className="flex shrink-0 items-center gap-2 rounded-full border bg-background py-1 pl-1 pr-1.5 sm:pr-3 max-w-[140px] sm:max-w-[200px]"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-gradient text-xs font-bold text-navy-foreground">
                  {initials(profile?.nama)}
                </span>
                <span className="hidden min-w-0 leading-tight sm:block">
                  <span className="block truncate text-xs font-semibold">
                    {shortName(profile?.nama)}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {profile?.mapel}
                  </span>
                </span>
              </Link>
            </div>
          </header>

          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-6xl">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const publicAuth = isAuthPublicPath(pathname);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthGate>{publicAuth ? <Outlet /> : <AppShell />}</AuthGate>
      <Toaster position="bottom-right" richColors />
    </QueryClientProvider>
  );
}
