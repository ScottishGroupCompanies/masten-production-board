import { NextResponse, type NextRequest } from "next/server";
import { canOpenUsers, isAdminPath } from "@/lib/access";
import { SESSION_COOKIE } from "@/lib/config";
import { readSessionToken } from "@/lib/session";

const FORBIDDEN_USERS_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="robots" content="noindex">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Admins only</title>
</head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#f8f5ef;color:#3f3a33;font-family:system-ui,sans-serif">
  <main style="max-width:28rem;padding:1.5rem;text-align:center">
    <h1 style="font-size:1.75rem;font-weight:600;line-height:1.3">Admins only</h1>
    <p style="line-height:1.5">That page is only available to admin accounts.</p>
    <p><a href="/">Back to the board</a></p>
  </main>
</body>
</html>`;

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/intake")) return NextResponse.next();
  const session = await readSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (pathname === "/login") {
    if (session) return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }
  if (!session) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (isAdminPath(pathname) && !canOpenUsers(session.role)) {
    return new NextResponse(FORBIDDEN_USERS_HTML, {
      status: 403,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-robots-tag": "noindex",
      },
    });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|webp|svg|ico|jpe?g|gif)$).*)"],
};
