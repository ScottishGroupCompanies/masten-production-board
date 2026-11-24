"use client";

import { addUser, removeUser, resetUserPassword, setUserRole, type UserActionResult } from "@/app/user-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useKeptForm } from "@/components/use-kept-form";

export type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

const selectClass =
  "h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";

export function UsersManager({
  users,
  currentUserId,
  soleAdminId,
}: {
  users: ManagedUser[];
  currentUserId: string;
  soleAdminId: string | null;
}) {
  return (
    <div className="flex flex-col gap-8">
      <AddUserForm />
      <ul className="flex flex-col gap-3">
        {users.map((user) => (
          <UserRow key={user.id} user={user} current={user.id === currentUserId} soleAdmin={user.id === soleAdminId} />
        ))}
      </ul>
    </div>
  );
}

function AddUserForm() {
  const { state, pending, formRef, onSubmit } = useKeptForm(addUser);

  return (
    <form ref={formRef} onSubmit={onSubmit} autoComplete="off" className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <h2 className="text-lg font-semibold leading-snug">Add a user</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          The email is their login. A placeholder such as name@masten.test is fine.
        </p>
      </div>
      <Field id="new-name" label="Name">
        <Input id="new-name" name="name" autoComplete="off" required maxLength={80} />
      </Field>
      <Field id="new-email" label="Email">
        <Input
          id="new-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={254}
          placeholder="name@masten.test"
        />
      </Field>
      <Field id="new-password" label="Password">
        <Input id="new-password" name="password" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Field id="new-confirm" label="Confirm password">
        <Input id="new-confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Field id="new-role" label="Role">
        <select id="new-role" name="role" defaultValue="staff" required className={selectClass}>
          <option value="staff">Staff</option>
          <option value="admin">Admin</option>
        </select>
      </Field>
      <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:items-center">
        <Button type="submit" className="h-10" disabled={pending}>
          {pending ? "Adding…" : "Add user"}
        </Button>
        <ActionNote state={state} />
      </div>
    </form>
  );
}

function UserRow({ user, current, soleAdmin }: { user: ManagedUser; current: boolean; soleAdmin: boolean }) {
  const roleLabel = user.role === "admin" ? "Admin" : "Staff";
  return (
    <li className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-base font-semibold leading-snug">
          {user.name}
          {current ? <span className="font-normal text-muted-foreground"> (you)</span> : null}
        </h3>
        <p className="text-sm text-muted-foreground">{user.email}</p>
        <p className="text-sm">{roleLabel}</p>
      </div>
      {soleAdmin ? (
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Last admin. This role stays admin, and the account can’t be removed.
        </p>
      ) : (
        <RoleForm user={user} />
      )}
      <PasswordResetForm userId={user.id} />
      {soleAdmin ? null : <RemoveForm user={user} />}
    </li>
  );
}

function RoleForm({ user }: { user: ManagedUser }) {
  const { state, pending, onSubmit } = useKeptForm(setUserRole);
  return (
    <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
      <input type="hidden" name="userId" value={user.id} />
      <Field id={`role-${user.id}`} label="Role">
        <select
          key={user.role}
          id={`role-${user.id}`}
          name="role"
          defaultValue={user.role === "admin" ? "admin" : "staff"}
          className={`${selectClass} sm:w-40`}
        >
          <option value="staff">Staff</option>
          <option value="admin">Admin</option>
        </select>
      </Field>
      <Button type="submit" variant="outline" className="h-10" disabled={pending}>
        {pending ? "Saving…" : "Save role"}
      </Button>
      <ActionNote state={state} />
    </form>
  );
}

function PasswordResetForm({ userId }: { userId: string }) {
  const { state, pending, formRef, onSubmit } = useKeptForm(resetUserPassword);

  return (
    <form ref={formRef} onSubmit={onSubmit} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <input type="hidden" name="userId" value={userId} />
      <Field id={`password-${userId}`} label="New password">
        <Input id={`password-${userId}`} name="password" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Field id={`confirm-${userId}`} label="Confirm password">
        <Input id={`confirm-${userId}`} name="confirm" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Button type="submit" variant="outline" className="h-10" disabled={pending}>
        {pending ? "Saving…" : "Reset password"}
      </Button>
      <div className="sm:col-span-3">
        <ActionNote state={state} />
      </div>
    </form>
  );
}

function RemoveForm({ user }: { user: ManagedUser }) {
  const { state, pending, onSubmit } = useKeptForm(removeUser);
  return (
    <form
      className="mt-4 flex flex-col items-start gap-2"
      onSubmit={(event) => {
        if (!window.confirm(`Remove ${user.name}? They will not be able to sign in.`)) {
          event.preventDefault();
          return;
        }
        onSubmit(event);
      }}
    >
      <input type="hidden" name="userId" value={user.id} />
      <Button type="submit" variant="destructive" className="h-10" disabled={pending}>
        {pending ? "Removing…" : "Remove"}
      </Button>
      <ActionNote state={state} />
    </form>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function ActionNote({ state }: { state: UserActionResult | null }) {
  if (!state) return null;
  if (state.ok) return <p className="text-sm text-primary">{state.message}</p>;
  return (
    <p role="alert" className="text-sm text-destructive">
      {state.error}
    </p>
  );
}
