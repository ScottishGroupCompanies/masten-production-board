export function isUsersPath(pathname: string): boolean {
  return pathname === "/users" || pathname.startsWith("/users/");
}

export function isDiscontinuedPath(pathname: string): boolean {
  return pathname === "/discontinued" || pathname.startsWith("/discontinued/");
}

export function isAdminPath(pathname: string): boolean {
  return isUsersPath(pathname) || isDiscontinuedPath(pathname);
}

export function canOpenUsers(role: string): boolean {
  return role === "admin";
}

/** Every signed-in admin or staff member can view, edit, and move every card. */
export function canEditBoard(role: string): boolean {
  return role === "admin" || role === "staff";
}
