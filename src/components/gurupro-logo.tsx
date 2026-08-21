import { cn } from "@/lib/utils";

export function GuruProMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      className={cn("h-8 w-8", className)}
      aria-hidden="true"
    >
      {/* panel belakang (terintegrasi) */}
      <path
        d="M31 8 L43 14 V38 L31 33 Z"
        fill="var(--sky)"
        opacity="0.55"
      />
      <path d="M27 10 L37 15 V36 L27 32 Z" fill="var(--primary)" />
      {/* bar fokus */}
      <rect x="21.5" y="19" width="4.5" height="14" rx="2" fill="var(--accent)" />
      {/* pintu utama */}
      <path d="M5 10 L19 6 V42 L5 38 Z" fill="var(--navy)" />
      <circle cx="15" cy="24" r="1.9" fill="var(--accent)" />
    </svg>
  );
}

export function GuruProWordmark({
  className,
  variant = "dark",
}: {
  className?: string;
  variant?: "dark" | "light";
}) {
  return (
    <span
      className={cn(
        "font-display text-lg font-bold tracking-tight",
        variant === "dark" ? "text-navy" : "text-sidebar-foreground",
        className,
      )}
    >
      Guru<span className="text-sky">Pro</span>
    </span>
  );
}

export function GuruProLogo({
  variant = "dark",
  className,
}: {
  variant?: "dark" | "light";
  className?: string;
}) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <GuruProMark className="h-8 w-8 shrink-0" />
      <GuruProWordmark variant={variant} />
    </span>
  );
}
