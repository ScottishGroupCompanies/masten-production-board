import { AppShell } from "@/components/app-shell";
import { UsersManager } from "@/components/users-manager";
import { listStaff, requireAdmin } from "@/lib/auth";
import { ensureDatabase } from "@/lib/seed";

export const metadata = { title: "Users · Masten Production Board" };

export default async function UsersPage() {
  await ensureDatabase();
  const user = await requireAdmin();
  const users = await listStaff();
  const admins = users.filter((item) => item.role === "admin");
  return (
    <AppShell user={user} active="users">
      <div className="h-full overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6">
          <div>
            <h1 className="text-3xl font-semibold leading-snug">Users</h1>
            <p className="mt-1 max-w-2xl text-base leading-relaxed text-muted-foreground">
              Add a staff or admin account. The email is the login and does not have to be a real mailbox.
            </p>
          </div>
          <UsersManager users={users} currentUserId={user.id} soleAdminId={admins.length === 1 ? admins[0].id : null} />
        </div>
      </div>
    </AppShell>
  );
}
