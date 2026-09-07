import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => search,
  beforeLoad: ({ search }) => {
    if (search?.["mode"] === "daftar") {
      throw redirect({ to: "/daftar" });
    }
    throw redirect({ to: "/login" });
  },
  component: () => null,
});
