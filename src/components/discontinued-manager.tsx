"use client";

import { useActionState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addDiscontinuedCode, deleteDiscontinuedCode, type DiscResult } from "@/app/discontinued-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DiscontinuedManager({ codes }: { codes: { code: string; rawCode: string; note: string }[] }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(addDiscontinuedCode, null as DiscResult | null);
  const [removing, startRemove] = useTransition();
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);
  return (
    <div className="space-y-6">
      <form action={action} className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="disc-code">Mat code</Label>
          <Input id="disc-code" name="code" required placeholder="C9893D" className="min-h-10" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="disc-note">Note</Label>
          <Input id="disc-note" name="note" placeholder="Optional" className="min-h-10" />
        </div>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Add code"}</Button>
        {state && !state.ok ? <p className="text-sm text-destructive sm:col-span-3">{state.error}</p> : null}
      </form>
      {codes.length === 0 ? (
        <p className="rounded-xl border bg-card px-4 py-8 text-center text-sm text-muted-foreground">No discontinued mat codes yet.</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {codes.map((entry) => (
            <li key={entry.code} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="font-medium">{entry.rawCode}</p>
                {entry.note ? <p className="text-sm text-muted-foreground">{entry.note}</p> : null}
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={removing}
                onClick={() => {
                  startRemove(async () => {
                    const result = await deleteDiscontinuedCode(entry.code);
                    if (!result.ok) toast.error(result.error);
                    else router.refresh();
                  });
                }}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
