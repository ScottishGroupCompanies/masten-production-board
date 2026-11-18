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
    `W.O. ${card.workOrderNumber}`,
    `Inv.# ${card.invoiceNumber || "—"}`,
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

export function formatAdded(iso: string, now = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const minutes = Math.round((now.getTime() - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Denver",
  }).format(new Date(iso));
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
