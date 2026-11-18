import Link from "next/link";
import { logout } from "@/app/actions";
import { Button } from "@/components/ui/button";
import type { CurrentUser } from "@/lib/auth";

export function AppShell({
  user,
  active,
  children,
}: {
  user: CurrentUser;
  active: "board" | "order" | "card";
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex shrink-0 items-center gap-3 bg-[#1c2b26] px-3 py-2.5 text-[#f4efe4] sm:px-4">
        <Link href="/" className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-md border border-[#f4efe4]/40">
            <span className="size-3.5 border border-[#f4efe4] bg-[#c4a574]" />
          </span>
          <span className="min-w-0">
            <span className="font-display block text-lg leading-none tracking-tight">Masten</span>
            <span className="text-[11px] tracking-wide text-[#f4efe4]/70 uppercase">Production board</span>
          </span>
        </Link>
        <nav className="ml-auto flex items-center gap-1 sm:ml-4 sm:mr-auto">
          <Link
            href="/"
            className={`rounded-md px-2.5 py-1.5 text-sm ${active === "board" ? "bg-[#f4efe4] text-[#1c2b26]" : "text-[#f4efe4]/80 hover:bg-white/10"}`}
          >
            Board
          </Link>
          <Link
            href="/to-order"
            className={`rounded-md px-2.5 py-1.5 text-sm ${active === "order" ? "bg-[#f4efe4] text-[#1c2b26]" : "text-[#f4efe4]/80 hover:bg-white/10"}`}
          >
            To order
          </Link>
        </nav>
        <div className="hidden text-right sm:block">
          <div className="text-sm leading-tight">{user.name}</div>
          <div className="text-[11px] text-[#f4efe4]/60">{user.role === "admin" ? "Admin" : "Staff"}</div>
        </div>
        <form action={logout}>
          <Button type="submit" variant="outline" className="border-[#f4efe4]/30 bg-transparent text-[#f4efe4] hover:bg-white/10">
            Sign out
          </Button>
        </form>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
