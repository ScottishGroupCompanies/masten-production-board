"use client";

import { changePassword } from "@/app/user-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useKeptForm } from "@/components/use-kept-form";

export function PasswordForm({ email }: { email: string }) {
  const { state, pending, formRef, onSubmit } = useKeptForm(changePassword);

  return (
    <form ref={formRef} onSubmit={onSubmit} className="mt-6 space-y-4">
      <input className="hidden" type="text" name="username" autoComplete="username" value={email} readOnly tabIndex={-1} />
      <div className="space-y-1.5">
        <Label htmlFor="current-password">Current password</Label>
        <Input id="current-password" name="current" type="password" autoComplete="current-password" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new-password">New password</Label>
        <Input id="new-password" name="password" type="password" autoComplete="new-password" required minLength={8} />
        <p className="text-sm text-muted-foreground">At least 8 characters.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm-password">Confirm password</Label>
        <Input id="confirm-password" name="confirm" type="password" autoComplete="new-password" required minLength={8} />
      </div>
      {state && !state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {state?.ok ? <p className="text-sm text-primary">{state.message}</p> : null}
      <Button type="submit" className="h-10" disabled={pending}>
        {pending ? "Saving…" : "Save password"}
      </Button>
    </form>
  );
}
