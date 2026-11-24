"use client";

import { useActionState } from "react";
import { login, type ActionResult } from "@/app/actions";
import { MastenWordmark } from "@/components/masten-wordmark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, null as ActionResult | null);

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_0.9fr]">
      <section className="hidden flex-col justify-between border-r bg-[#f6f3ec] p-10 text-zinc-900 lg:flex">
        <MastenWordmark size="login" priority />
        <div>
          <h1 className="max-w-md text-4xl font-semibold leading-snug">The floor board for every piece in the shop.</h1>
          <p className="mt-4 max-w-md text-lg leading-relaxed text-zinc-700">
            Work orders, mats, moulding, and pickup. Greenwood Village. One card per piece.
          </p>
        </div>
        <p className="text-base text-zinc-600">2500 E Orchard Rd, Suite A</p>
      </section>
      <section className="flex items-center justify-center px-5 py-10">
        <form className="w-full max-w-sm" action={action}>
          <MastenWordmark size="login" priority className="lg:hidden" />
          <h2 className="mt-4 text-2xl font-semibold leading-snug lg:mt-0">Sign in</h2>
          <p className="mt-1 text-base text-muted-foreground">Staff accounts for the production board.</p>
          <div className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                className="min-h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required className="min-h-10" />
            </div>
            {state && !state.ok ? <p className="text-sm text-destructive">{state.error}</p> : null}
            <Button type="submit" className="min-h-10 w-full" disabled={pending}>
              {pending ? "Signing in…" : "Sign in"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
