"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { reapplyDiscontinuedFlags, removeDiscontinued, replaceDiscontinued } from "@/lib/discontinued";
import { ensureDatabase } from "@/lib/seed";

export type DiscResult = { ok: true } | { ok: false; error: string };

export async function addDiscontinuedCode(_prev: DiscResult | null, formData: FormData): Promise<DiscResult> {
  try {
    await ensureDatabase();
    const user = await requireAdmin();
    const code = String(formData.get("code") ?? "");
    const note = String(formData.get("note") ?? "");
    if (!code.trim()) return { ok: false, error: "Enter a mat code." };
    await replaceDiscontinued([{ code, note }], "add");
    await reapplyDiscontinuedFlags({ name: user.name, userId: user.id });
    revalidatePath("/discontinued");
    revalidatePath("/to-order");
    revalidatePath("/");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not save that code." };
  }
}

export async function deleteDiscontinuedCode(code: string): Promise<DiscResult> {
  try {
    await ensureDatabase();
    const user = await requireAdmin();
    await removeDiscontinued([code]);
    await reapplyDiscontinuedFlags({ name: user.name, userId: user.id });
    revalidatePath("/discontinued");
    revalidatePath("/to-order");
    revalidatePath("/");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not remove that code." };
  }
}
