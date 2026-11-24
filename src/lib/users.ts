import { randomUUID } from "crypto";
import type { Tx } from "./d1";
import { parseLoginEmail } from "./login-email";
import { hashPassword, MIN_PASSWORD_LENGTH, passwordMatches } from "./password";
import { get, transaction } from "./db";

export class AccountError extends Error {}

export type AccountRole = "admin" | "staff";

export type NewUserInput = {
  name: string;
  email: string;
  role: string;
  password: string;
  confirm: string;
};

export type PreparedUser = {
  name: string;
  email: string;
  role: AccountRole;
  passwordHash: string;
};

const EMAIL_HINT = "Enter an email like name@masten.test. It does not have to be a real mailbox.";

export function parseRole(value: string): AccountRole | null {
  const role = value.trim().toLowerCase();
  if (role === "admin" || role === "staff") return role;
  return null;
}

export function parsePersonName(value: string): string | null {
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 80) return null;
  return name;
}

export function prepareNewUser(input: NewUserInput): PreparedUser {
  const name = parsePersonName(input.name);
  if (!name) throw new AccountError("Enter a name.");
  const email = parseLoginEmail(input.email);
  if (!email) throw new AccountError(EMAIL_HINT);
  const role = parseRole(input.role);
  if (!role) throw new AccountError("Choose admin or staff.");
  assertPassword(input.password, input.confirm);
  return { name, email, role, passwordHash: hashPassword(input.password) };
}

export function assertPassword(password: string, confirm: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new AccountError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (password !== confirm) throw new AccountError("Those passwords don’t match.");
}

export async function insertUserRecord(
  tx: Tx,
  user: PreparedUser & { id: string; createdAt: string },
): Promise<void> {
  const email = parseLoginEmail(user.email);
  if (!email) throw new AccountError(EMAIL_HINT);
  const existing = await tx.all<{ id: string }>("select id from users where email = ?", [email]);
  if (existing[0]) throw new AccountError("A user with that email already exists.");
  try {
    await tx.run(
      `insert into users (id, email, name, password_hash, role, created_at) values (?, ?, ?, ?, ?, ?)`,
      [user.id, email, user.name, user.passwordHash, user.role, user.createdAt],
    );
  } catch (error) {
    if (isUniqueConstraint(error)) throw new AccountError("A user with that email already exists.");
    throw error;
  }
}

export async function createManagedUser(input: NewUserInput): Promise<void> {
  const prepared = prepareNewUser(input);
  try {
    await transaction((tx) =>
      insertUserRecord(tx, {
        ...prepared,
        id: randomUUID(),
        createdAt: new Date().toISOString(),
      }),
    );
  } catch (error) {
    if (error instanceof AccountError) throw error;
    if (isUniqueConstraint(error)) throw new AccountError("A user with that email already exists.");
    throw error;
  }
}

export async function changeUserRole(tx: Tx, userId: string, role: AccountRole): Promise<void> {
  const existing = await tx.all<{ id: string; role: string }>("select id, role from users where id = ?", [userId]);
  if (!existing[0]) throw new AccountError("That user is not on the board.");
  if (existing[0].role === role) return;
  await tx.run(
    `update users set role = ?
     where id = ?
       and (
         role != 'admin'
         or ? = 'admin'
         or (select count(*) from users where role = 'admin') > 1
       )`,
    [role, userId, role],
  );
  const after = await tx.all<{ role: string }>("select role from users where id = ?", [userId]);
  if (after[0]?.role !== role) throw new AccountError("The last admin cannot be changed to staff.");
}

export async function setManagedRole(userId: string, role: AccountRole): Promise<void> {
  await transaction((tx) => changeUserRole(tx, userId, role));
}

export async function resetManagedPassword(userId: string, password: string, confirm: string): Promise<void> {
  assertPassword(password, confirm);
  const passwordHash = hashPassword(password);
  await transaction(async (tx) => {
    const existing = await tx.all<{ id: string }>("select id from users where id = ?", [userId]);
    if (!existing[0]) throw new AccountError("That user is not on the board.");
    await tx.run("update users set password_hash = ? where id = ?", [passwordHash, userId]);
  });
}

export async function changeOwnPassword(userId: string, current: string, password: string, confirm: string): Promise<void> {
  assertPassword(password, confirm);
  const row = await get<{ password_hash: string }>("select password_hash from users where id = ?", [userId]);
  if (!row || !passwordMatches(current, row.password_hash)) {
    throw new AccountError("The current password doesn’t match.");
  }
  const passwordHash = hashPassword(password);
  await transaction((tx) => tx.run("update users set password_hash = ? where id = ?", [passwordHash, userId]));
}

export async function removeUserRecord(tx: Tx, userId: string): Promise<void> {
  const existing = await tx.all<{ id: string }>("select id from users where id = ?", [userId]);
  if (!existing[0]) throw new AccountError("That user is not on the board.");
  await tx.run(
    `delete from card_assignees
     where user_id = ?
       and (
         (select role from users where id = ?) != 'admin'
         or (select count(*) from users where role = 'admin') > 1
       )`,
    [userId, userId],
  );
  await tx.run(
    `delete from users
     where id = ?
       and (
         role != 'admin'
         or (select count(*) from users where role = 'admin') > 1
       )`,
    [userId],
  );
  const after = await tx.all<{ id: string }>("select id from users where id = ?", [userId]);
  if (after[0]) throw new AccountError("The last admin cannot be removed.");
}

export async function removeManagedUser(userId: string): Promise<void> {
  await transaction((tx) => removeUserRecord(tx, userId));
}

function isUniqueConstraint(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /unique/i.test(message);
}
