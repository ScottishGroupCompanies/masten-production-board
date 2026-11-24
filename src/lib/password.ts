import { compareSync, hashSync } from "bcryptjs";

/** bcrypt cost used for every account, including the first admin. */
const BCRYPT_ROUNDS = 8;

export const MIN_PASSWORD_LENGTH = 8;

export function hashPassword(password: string): string {
  return hashSync(password, BCRYPT_ROUNDS);
}

export function passwordMatches(password: string, hash: string): boolean {
  return compareSync(password, hash);
}
