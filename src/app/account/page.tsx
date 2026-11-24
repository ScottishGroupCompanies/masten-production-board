import { AppShell } from "@/components/app-shell";
import { PasswordForm } from "@/components/password-form";
import { requireUser } from "@/lib/auth";
import { ensureDatabase } from "@/lib/seed";

export const metadata = { title: "Password · Masten Production Board" };

export default async function AccountPage() {
  await ensureDatabase();
  const user = await requireUser();
  return (
    <AppShell user={user} active="account">
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-md px-4 py-6 sm:px-6">
          <h1 className="text-3xl font-semibold leading-snug">Password</h1>
          <p className="mt-1 text-base leading-relaxed text-muted-foreground">
            Change the password for {user.name}. The login stays {user.email}.
          </p>
          <PasswordForm email={user.email} />
        </div>
      </div>
    </AppShell>
  );
}
