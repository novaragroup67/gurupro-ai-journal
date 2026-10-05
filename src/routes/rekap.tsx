import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/rekap")({
  beforeLoad: () => {
    throw redirect({ to: "/penilaian" });
  },
  component: () => null,
});
