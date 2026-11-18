"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { findUserByEmail, passwordMatches, requireUser } from "@/lib/auth";
import { CardError, type CardInput } from "@/lib/board-types";
import { ensureDatabase } from "@/lib/seed";
import { clearSession, setSession } from "@/lib/session";
import * as writes from "@/lib/writes";

export type ActionResult = { ok: true } | { ok: false; error: string };

function isRedirect(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    String((error as { digest?: string }).digest).startsWith("NEXT_REDIRECT")
  );
}

function refresh(cardId?: string) {
  revalidatePath("/");
  revalidatePath("/to-order");
  if (cardId) revalidatePath(`/cards/${cardId}`);
}

async function run(cardId: string | undefined, fn: () => Promise<void>): Promise<ActionResult> {
  try {
    await ensureDatabase();
    await fn();
    refresh(cardId);
    return { ok: true };
  } catch (error) {
    if (isRedirect(error)) throw error;
    if (error instanceof CardError) return { ok: false, error: error.message };
    console.error(error);
    return { ok: false, error: "That change could not be saved." };
  }
}

export async function login(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await ensureDatabase();
  const user = await findUserByEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  if (!user || !passwordMatches(password, user.passwordHash)) {
    return { ok: false, error: "That email and password don’t match." };
  }
  await setSession({ uid: user.id, name: user.name, role: user.role });
  redirect("/");
}

export async function logout() {
  await clearSession();
  redirect("/login");
}

export async function createCard(input: CardInput): Promise<ActionResult & { id?: string }> {
  try {
    await ensureDatabase();
    const user = await requireUser();
    const created = await writes.createWorkCard(input, { name: user.name, userId: user.id });
    refresh(created.id);
    return { ok: true, id: created.id };
  } catch (error) {
    if (isRedirect(error)) throw error;
    if (error instanceof CardError) return { ok: false, error: error.message };
    console.error(error);
    return { ok: false, error: "The card could not be created." };
  }
}

export async function saveCard(id: string, input: CardInput) {
  const user = await requireUser();
  return run(id, () => writes.updateWorkCard(id, input, { name: user.name, userId: user.id }).then(() => undefined));
}

export async function saveOrder(groups: { listId: string; cardIds: string[] }[]) {
  const user = await requireUser();
  return run(undefined, () => writes.saveOrder(groups, { name: user.name, userId: user.id }));
}

export async function archiveCard(id: string, archived: boolean) {
  const user = await requireUser();
  return run(id, () => writes.setArchived(id, archived, { name: user.name, userId: user.id }));
}

export async function changeMaterialStatus(materialId: string, status: string, cardId: string) {
  const user = await requireUser();
  return run(cardId, () => writes.setMaterialStatus(materialId, status, { name: user.name, userId: user.id }));
}

export async function createMaterial(cardId: string, input: { kind: string; itemCode: string; vendor?: string; stockStatus?: string }) {
  const user = await requireUser();
  return run(cardId, () => writes.addMaterial(cardId, input, { name: user.name, userId: user.id }));
}

export async function editMaterial(cardId: string, materialId: string, input: { itemCode: string; vendor: string; kind: string }) {
  const user = await requireUser();
  return run(cardId, () => writes.updateMaterial(materialId, input, { name: user.name, userId: user.id }));
}

export async function removeMaterial(cardId: string, materialId: string) {
  const user = await requireUser();
  return run(cardId, () => writes.deleteMaterial(materialId, { name: user.name, userId: user.id }));
}

export async function changeField(cardId: string, fieldId: string, value: string) {
  const user = await requireUser();
  return run(cardId, () => writes.setField(cardId, fieldId, value, { name: user.name, userId: user.id }));
}

export async function changeLabel(cardId: string, labelId: string) {
  const user = await requireUser();
  return run(cardId, () => writes.toggleLabel(cardId, labelId, { name: user.name, userId: user.id }));
}

export async function changeAssignee(cardId: string, userId: string) {
  const user = await requireUser();
  return run(cardId, () => writes.toggleAssignee(cardId, userId, { name: user.name, userId: user.id }));
}

export async function changeCheck(cardId: string, itemId: string, checked: boolean) {
  const user = await requireUser();
  return run(cardId, () => writes.toggleCheck(itemId, checked, { name: user.name, userId: user.id }));
}

export async function createCheckItem(cardId: string, text: string) {
  const user = await requireUser();
  return run(cardId, () => writes.addCheckItem(cardId, text, { name: user.name, userId: user.id }));
}

export async function createNote(cardId: string, body: string) {
  const user = await requireUser();
  return run(cardId, () => writes.addNote(cardId, body, { name: user.name, userId: user.id }));
}

export async function uploadCardFile(cardId: string, formData: FormData) {
  const user = await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false as const, error: "Choose a file first." };
  const bytes = Buffer.from(await file.arrayBuffer());
  return run(cardId, () =>
    writes.attachFile(
      cardId,
      { filename: file.name, mimeType: file.type || "application/octet-stream", bytes },
      { name: user.name, userId: user.id },
    ),
  );
}

export async function removeCardFile(cardId: string, attachmentId: string) {
  const user = await requireUser();
  return run(cardId, () => writes.deleteAttachment(attachmentId, { name: user.name, userId: user.id }));
}

export async function moveCardTo(cardId: string, listName: string) {
  const user = await requireUser();
  return run(cardId, () => writes.moveCard(cardId, listName, { name: user.name, userId: user.id }).then(() => undefined));
}
