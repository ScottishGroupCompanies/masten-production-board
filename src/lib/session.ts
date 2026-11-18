import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { SESSION_COOKIE, sessionSecret } from "./config";

export type SessionPayload = {
  uid: string;
  name: string;
  role: string;
};

function key() {
  return new TextEncoder().encode(sessionSecret());
}

export async function sealSession(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(key());
}

export async function readSessionToken(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    if (typeof payload.uid !== "string" || typeof payload.name !== "string" || typeof payload.role !== "string") {
      return null;
    }
    return { uid: payload.uid, name: payload.name, role: payload.role };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  return readSessionToken(jar.get(SESSION_COOKIE)?.value);
}

export async function setSession(payload: SessionPayload): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await sealSession(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}
