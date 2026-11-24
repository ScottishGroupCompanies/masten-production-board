/**
 * Login emails are a shape check only. Reserved domains such as `.test` are
 * valid. There is no mailbox, MX, or public-suffix lookup.
 *
 * The pattern matches the HTML `<input type="email">` rule after the address
 * is trimmed and lowercased.
 */
const LOGIN_EMAIL =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;

export function parseLoginEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  if (!email || email.length > 254) return null;
  if (!LOGIN_EMAIL.test(email)) return null;
  return email;
}
