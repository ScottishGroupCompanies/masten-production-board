import Link from "next/link";
import { logout } from "@/app/actions";
import { MastenWordmark } from "@/components/masten-wordmark";
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
      <header className="flex shrink-0 items-center gap-3 border-b bg-[#f8f5ef] px-3 py-2.5 text-zinc-900 sm:px-4">
        <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="Masten production board">
          <MastenWordmark priority />
          <span className="hidden text-sm font-medium leading-tight text-zinc-700 md:block">Production board</span>
        </Link>
        <nav className="ml-auto flex items-center gap-1 sm:ml-4 sm:mr-auto">
          <Link
            href="/"
            className={`rounded-md px-2.5 py-1.5 text-sm ${active === "board" ? "bg-zinc-100 font-medium text-zinc-900" : "text-zinc-600 hover:bg-zinc-100"}`}
          >
            Board
          </Link>
          <Link
            href="/to-order"
            className={`rounded-md px-2.5 py-1.5 text-sm ${active === "order" ? "bg-zinc-100 font-medium text-zinc-900" : "text-zinc-600 hover:bg-zinc-100"}`}
          >
            To order
          </Link>
        </nav>
        <div className="hidden text-right sm:block">
          <div className="text-sm leading-tight">{user.name}</div>
          <div className="text-xs text-zinc-600">{user.role === "admin" ? "Admin" : "Staff"}</div>
        </div>
        <form action={logout}>
          <Button type="submit" variant="outline">
            Sign out
          </Button>
        </form>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
