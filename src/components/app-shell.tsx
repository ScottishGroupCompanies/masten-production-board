import Link from "next/link";
import { logout } from "@/app/actions";
import { MastenWordmark } from "@/components/masten-wordmark";
import { Button } from "@/components/ui/button";
import type { CurrentUser } from "@/lib/auth";

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-md px-2.5 py-1.5 text-sm ${active ? "bg-zinc-100 font-medium text-zinc-900" : "text-zinc-600 hover:bg-zinc-100"}`}
    >
      {children}
    </Link>
  );
}

export function AppShell({
  user,
  active,
  children,
}: {
  user: CurrentUser;
  active: "board" | "order" | "card" | "users" | "account";
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b bg-[#f8f5ef] px-3 py-2.5 text-zinc-900 sm:px-4">
        <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="Masten production board">
          <MastenWordmark priority />
          <span className="hidden text-sm font-medium leading-tight text-zinc-700 md:block">Production board</span>
        </Link>
        <nav className="ml-auto flex flex-wrap items-center gap-1 sm:ml-4 sm:mr-auto">
          <NavLink href="/" active={active === "board"}>
            Board
          </NavLink>
          <NavLink href="/to-order" active={active === "order"}>
            To order
          </NavLink>
          {user.role === "admin" ? (
            <NavLink href="/users" active={active === "users"}>
              Users
            </NavLink>
          ) : null}
          <NavLink href="/account" active={active === "account"}>
            Password
          </NavLink>
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
