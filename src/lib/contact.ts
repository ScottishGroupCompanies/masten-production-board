const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

function samePhone(chunk: string, digits: string): boolean {
  const found = phoneDigits(chunk);
  if (found.length < 7 || digits.length < 7) return false;
  return found === digits || found.endsWith(digits) || digits.endsWith(found);
}

/**
 * Keep the customer email in its own field and drop the customer phone from
 * Additional Contact Info. A different number, such as a spouse or designer, stays.
 */
export function tidyContact(additional: string, phone: string, email: string): { email: string; additional: string } {
  let text = additional ?? "";
  let found = email.trim();
  if (!found) {
    const match = text.match(EMAIL);
    if (match) found = match[0];
  }
  if (found) {
    text = text.replace(new RegExp(found.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " ");
  }
  const digits = phoneDigits(phone);
  if (digits.length >= 7) {
    text = text.replace(/\+?\d[\d\s().-]{6,}\d/g, (chunk) => (samePhone(chunk, digits) ? " " : chunk));
  }
  text = text
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,;])/g, "$1")
    .replace(/^[\s,;|/.-]+|[\s,;|/.-]+$/g, "")
    .trim();
  return { email: found, additional: text };
}
