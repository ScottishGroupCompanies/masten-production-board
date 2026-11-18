export function cardTitle(card: {
  customerName: string;
  workOrderNumber: string | null;
  invoiceNumber: string | null;
  pieceIndex: number | null;
  pieceCount: number | null;
  size: string;
  phone: string;
}): string {
  if (!card.workOrderNumber) return card.customerName;
  const parts = [
    card.customerName,
    `W.O.${card.workOrderNumber}`,
    `Inv.${card.invoiceNumber || "—"}`,
    `(${card.pieceIndex || 1}/${card.pieceCount || 1})`,
    card.size,
    card.phone,
  ].filter((part) => part && part.trim().length > 0);
  return parts.join(" ");
}

export function shopToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Denver",
  }).format(now);
}

export function formatShopDate(iso: string | null): string {
  if (!iso) return "No due date";
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatStamp(iso: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return iso;
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
  return `${formatted} MT`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

export function isOverdue(dueDate: string | null, listKind: string, archived: boolean, today: string): boolean {
  if (!dueDate || archived || listKind !== "production") return false;
  return dueDate < today;
}
