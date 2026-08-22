import { Link, useRouterState } from "@tanstack/react-router";
import {
  Archive,
  BookOpen,
  ClipboardList,
  FileQuestion,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Sparkles,
  UserRound,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";

import { GuruProLogo } from "@/components/gurupro-logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const mainItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, exact: true },
  { title: "Modul Ajar", url: "/modul-ajar", icon: BookOpen },
  { title: "Soal", url: "/soal", icon: FileQuestion },
  { title: "Penugasan", url: "/penugasan", icon: ClipboardList },
  { title: "Penilaian", url: "/penilaian", icon: GraduationCap },
] as const;

const secondaryItems = [
  { title: "Verifikasi Akun Siswa", url: "/verifikasi", icon: UserCheck },
  { title: "Arsip Data", url: "/arsip", icon: Archive },
  { title: "Profil", url: "/profil", icon: UserRound },
] as const;

export function AppSidebar() {
  const { isMobile, setOpenMobile } = useSidebar();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const isActive = (url: string, exact?: boolean) =>
    exact ? pathname === url : pathname === url || pathname.startsWith(url + "/");

  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  const renderItems = (items: ReadonlyArray<(typeof mainItems)[number] | (typeof secondaryItems)[number]>) => (
    <SidebarMenu>
      {items.map((item) => (
        <SidebarMenuItem key={item.title}>
          <SidebarMenuButton
            asChild
            isActive={isActive(item.url, "exact" in item ? item.exact : false)}
            tooltip={item.title}
          >
            <Link to={item.url} onClick={closeOnMobile} className="gap-3">
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.title}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-3 py-4">
        <Link to="/" onClick={closeOnMobile} className="flex min-w-0 items-center">
          <GuruProLogo variant="light" className="group-data-[collapsible=icon]:gap-0" />
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-1">
        <SidebarGroup>
          <SidebarGroupLabel>Menu Utama</SidebarGroupLabel>
          <SidebarGroupContent>{renderItems(mainItems)}</SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Lainnya</SidebarGroupLabel>
          <SidebarGroupContent>
            {renderItems(secondaryItems)}
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Log Out"
                  className="gap-3 text-sidebar-foreground/80"
                  onClick={() => {
                    closeOnMobile();
                    toast.success("Anda telah keluar (prototipe).");
                  }}
                >
                  <LogOut className="h-4 w-4 shrink-0" />
                  <span className="truncate">Log Out</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3 group-data-[collapsible=icon]:hidden">
        <Link
          to="/modul-ajar"
          onClick={closeOnMobile}
          className="block rounded-xl bg-sidebar-accent p-3 transition-colors hover:bg-sidebar-primary/25"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-sidebar-accent-foreground">
            <Sparkles className="h-4 w-4 text-accent" />
            GuruPro AI
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-sidebar-foreground/70">
            Susun modul, ilustrasi, PPT, dan soal secara otomatis.
          </span>
        </Link>
      </SidebarFooter>
    </Sidebar>
  );
}
