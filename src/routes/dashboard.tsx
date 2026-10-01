import { createFileRoute } from "@tanstack/react-router";
import { DashboardSwitcher } from "./index";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — GuruPro" },
      {
        name: "description",
        content: "Dashboard administrasi pembelajaran GuruPro.",
      },
    ],
  }),
  component: DashboardSwitcher,
});
