export function isUsersPath(pathname: string): boolean {
  return pathname === "/users" || pathname.startsWith("/users/");
}

export function canOpenUsers(role: string): boolean {
  return role === "admin";
}
