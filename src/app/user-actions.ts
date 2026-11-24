"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { requireAdmin, requireUser } from "@/lib/auth";
import { ensureDatabase } from "@/lib/seed";
import { clearSession, setSession } from "@/lib/session";
import {
  AccountError,
  changeOwnPassword,
  createManagedUser,
  parseRole,
  removeManagedUser,
  resetManagedPassword,
  setManagedRole,
} from "@/lib/users";

export type UserActionResult = { ok: true; message: string } | { ok: false; error: string };

function failure(error: unknown): UserActionResult {
  unstable_rethrow(error);
  if (error instanceof AccountError) return { ok: false, error: error.message };
  console.error(error);
  return { ok: false, error: "That change could not be saved." };
}

function refreshBoard() {
  revalidatePath("/users");
  revalidatePath("/");
  revalidatePath("/to-order");
}

export async function addUser(_prev: UserActionResult | null, formData: FormData): Promise<UserActionResult> {
  try {
    await ensureDatabase();
    await requireAdmin();
    await createManagedUser({
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      role: String(formData.get("role") ?? ""),
      password: String(formData.get("password") ?? ""),
      confirm: String(formData.get("confirm") ?? ""),
    });
    refreshBoard();
    return { ok: true, message: "User added." };
  } catch (error) {
    return failure(error);
  }
}

export async function setUserRole(_prev: UserActionResult | null, formData: FormData): Promise<UserActionResult> {
  try {
    await ensureDatabase();
    const actor = await requireAdmin();
    const userId = String(formData.get("userId") ?? "");
    const role = parseRole(String(formData.get("role") ?? ""));
    if (!role) return { ok: false, error: "Choose admin or staff." };
    await setManagedRole(userId, role);
    refreshBoard();
    if (actor.id === userId && role !== actor.role) {
      await setSession({ uid: actor.id, name: actor.name, role });
      if (role !== "admin") redirect("/");
    }
    return { ok: true, message: "Role saved." };
  } catch (error) {
    return failure(error);
  }
}

export async function resetUserPassword(_prev: UserActionResult | null, formData: FormData): Promise<UserActionResult> {
  try {
    await ensureDatabase();
    await requireAdmin();
    await resetManagedPassword(
      String(formData.get("userId") ?? ""),
      String(formData.get("password") ?? ""),
      String(formData.get("confirm") ?? ""),
    );
    refreshBoard();
    return { ok: true, message: "Password reset." };
  } catch (error) {
    return failure(error);
  }
}

export async function removeUser(_prev: UserActionResult | null, formData: FormData): Promise<UserActionResult> {
  try {
    await ensureDatabase();
    const actor = await requireAdmin();
    const userId = String(formData.get("userId") ?? "");
    await removeManagedUser(userId);
    refreshBoard();
    if (actor.id === userId) {
      await clearSession();
      redirect("/login");
    }
    return { ok: true, message: "User removed." };
  } catch (error) {
    return failure(error);
  }
}

export async function changePassword(_prev: UserActionResult | null, formData: FormData): Promise<UserActionResult> {
  try {
    await ensureDatabase();
    const user = await requireUser();
    await changeOwnPassword(
      user.id,
      String(formData.get("current") ?? ""),
      String(formData.get("password") ?? ""),
      String(formData.get("confirm") ?? ""),
    );
    revalidatePath("/account");
    return { ok: true, message: "Password saved." };
  } catch (error) {
    return failure(error);
  }
}
