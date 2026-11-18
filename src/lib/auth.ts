import { compareSync } from "bcryptjs";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { all, get } from "./db";
import { getSession } from "./session";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: string;
};

export async function findUserByEmail(email: string): Promise<(CurrentUser & { passwordHash: string }) | undefined> {
  const row = await get<{
    id: string;
    email: string;
    name: string;
    role: string;
    password_hash: string;
  }>("select id, email, name, role, password_hash from users where email = ?", [email.trim().toLowerCase()]);
  if (!row) return undefined;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    passwordHash: row.password_hash,
  };
}

export function passwordMatches(password: string, hash: string): boolean {
  return compareSync(password, hash);
}

export async function requireUser(): Promise<CurrentUser> {
  await connection();
  const session = await getSession();
  if (!session) redirect("/login");
  const row = await get<CurrentUser>("select id, email, name, role from users where id = ?", [session.uid]);
  if (!row) redirect("/login");
  return row;
}

export async function listStaff(): Promise<CurrentUser[]> {
  return all<CurrentUser>("select id, email, name, role from users order by name");
}
