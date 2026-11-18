import { connection } from "next/server";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { ensureDatabase } from "@/lib/seed";
import { getSession } from "@/lib/session";

export default async function LoginPage() {
  await connection();
  await ensureDatabase();
  const session = await getSession();
  if (session) redirect("/");
  return <LoginForm />;
}
