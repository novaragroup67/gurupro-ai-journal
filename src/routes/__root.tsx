import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { GuruProMark } from "@/components/gurupro-logo";
import { NotificationMenu } from "@/components/notification-menu";
import { Button } from "@/components/ui/button";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";

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
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-xl font-semibold tracking-tight">
          Halaman ini gagal dimuat
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Terjadi kesalahan. Coba muat ulang atau kembali ke dashboard.
        </p>
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

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isLoginRoute = pathname === "/login";

  return (
    <QueryClientProvider client={queryClient}>
      {isLoginRoute ? (
        <Outlet />
      ) : (
        <AppShell>
          <Outlet />
        </AppShell>
      )}
      <Toaster position="bottom-right" richColors />
    </QueryClientProvider>
  );
}

function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { ready, signedIn, profile } = useAuth();

  useEffect(() => {
    if (ready && !signedIn) navigate({ to: "/login", replace: true });
  }, [ready, signedIn, navigate]);

  if (ready && !signedIn) {
    return (
      <div className="grid min-h-screen place-items-center px-4">
        <p className="text-sm text-muted-foreground">Mengalihkan ke halaman login…</p>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-card/85 px-4 backdrop-blur sm:px-6">
            <SidebarTrigger className="shrink-0" />
            <div className="flex min-w-0 flex-1 items-center gap-2 md:hidden">
              <GuruProMark className="h-7 w-7 shrink-0" />
              <span className="font-display text-base font-bold text-navy">
                Guru<span className="text-primary">Pro</span>
              </span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="ghost" size="icon" aria-label="Cari" className="hidden sm:inline-flex">
                <Search className="h-4 w-4" />
              </Button>
              <NotificationMenu />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex min-w-0 items-center gap-2 rounded-full border bg-background py-1 pl-1 pr-3 transition-colors hover:bg-muted/60"
                    aria-label="Menu akun"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-gradient text-xs font-bold text-navy-foreground">
                      {initials(profile.nama)}
                    </span>
                    <span className="hidden min-w-0 text-left leading-tight sm:block">
                      <span className="block truncate text-xs font-semibold">{profile.nama}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {profile.mapel || "Guru"}
                      </span>
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="truncate">{profile.email}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/profil">
                      <UserRound className="h-4 w-4" />
                      Profil Saya
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onSelect={() => {
                      logout();
                      toast.success("Anda telah keluar dari GuruPro.");
                      navigate({ to: "/login", replace: true });
                    }}
                  >
                    <LogOut className="h-4 w-4" />
                    Log Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-6xl">
              {/* Required: nested routes render here. */}
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
