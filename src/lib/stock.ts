import {
  MAT_ORDER_SIZES,
  type MaterialKind,
  type StockStatus,
} from "@/data/board-schema";

/** Frames, including stacked frames. They default to To Order until someone marks them In Stock. */
export const FRAME_KINDS = new Set<MaterialKind>([
  "frame",
  "inner_stacked_frame",
  "second_stacked_frame",
  "third_stacked_frame",
]);

/** Mats whose stock comes from the mats-in-stock sheet. */
export const MAT_KINDS = new Set<MaterialKind>(["top_mat", "second_mat", "third_mat"]);

/**
 * Glass and foam are bought in standard packs, not per work order.
 * `glazing` is glass. `backing` is foam (the intake also accepts kind "foam").
 */
export const PACK_KINDS = new Set<MaterialKind>(["glazing", "backing"]);

const TILE_RANK: Record<StockStatus, number> = {
  not_in_stock: 0,
  discontinued_attention: 1,
  ordered: 2,
  needs_human_check: 3,
  here: 4,
  in_stock: 5,
};

export function defaultStatusFor(kind: string): StockStatus {
  if (FRAME_KINDS.has(kind as MaterialKind)) return "not_in_stock";
  if (PACK_KINDS.has(kind as MaterialKind)) return "in_stock";
  return "needs_human_check";
}

export function isOrderableKind(kind: string): boolean {
  return !PACK_KINDS.has(kind as MaterialKind);
}

/** Letters and digits only, uppercased. Hyphens and spaces do not affect a match. */
export function codeKey(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Every stored discontinued code matches with or without a trailing D.
 * "C9893D" and "C-9893" are the same mat.
 */
export function discontinuedStems(codes: string[]): Set<string> {
  const stems = new Set<string>();
  for (const code of codes) {
    const key = codeKey(code);
    if (!key) continue;
    stems.add(key);
    if (key.length > 1 && key.endsWith("D")) stems.add(key.slice(0, -1));
    else stems.add(`${key}D`);
  }
  return stems;
}

export function matchesDiscontinued(itemCode: string, stems: Set<string>): boolean {
  const key = codeKey(itemCode);
  return Boolean(key) && stems.has(key);
}

export function descriptionSaysDiscontinued(description: string | undefined): boolean {
  return Boolean(description && /discontinued/i.test(description));
}

const KEPT_WHEN_DISCONTINUED = new Set<StockStatus>(["in_stock", "here"]);

/** Discontinued mats can only come from stock already on hand. They never become To Order or On Order. */
export function coerceStatus(kind: string, itemCode: string, status: StockStatus, stems: Set<string>): StockStatus {
  if (PACK_KINDS.has(kind as MaterialKind) && (status === "not_in_stock" || status === "ordered")) return "in_stock";
  if (MAT_KINDS.has(kind as MaterialKind) && matchesDiscontinued(itemCode, stems) && !KEPT_WHEN_DISCONTINUED.has(status)) {
    return "discontinued_attention";
  }
  return status;
}

/**
 * Next status for one mat or fillet during a sheet re-check.
 * Returns null when the line should stay as it is.
 *
 * A code on the sheet becomes In Stock, including a line that was On Order.
 * A code missing from the sheet becomes To Order, except On Order and Here
 * (already purchased or received) and discontinued mats.
 */
export function statusFromSheet(args: {
  kind: string;
  itemCode: string;
  current: StockStatus;
  inStock: Set<string>;
  stems: Set<string>;
}): StockStatus | null {
  if (PACK_KINDS.has(args.kind as MaterialKind) || FRAME_KINDS.has(args.kind as MaterialKind)) return null;
  const onSheet = matchesDiscontinued(args.itemCode, args.inStock);
  const discontinued = MAT_KINDS.has(args.kind as MaterialKind) && matchesDiscontinued(args.itemCode, args.stems);
  if (onSheet) return args.current === "in_stock" ? null : "in_stock";
  if (discontinued) {
    return args.current === "discontinued_attention" || args.current === "here" ? null : "discontinued_attention";
  }
  if (!MAT_KINDS.has(args.kind as MaterialKind) && args.kind !== "fillet") return null;
  if (args.current === "ordered" || args.current === "here" || args.current === "not_in_stock") return null;
  return "not_in_stock";
}

const DIMENSIONS = /(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i;

export function parseDimensions(size: string): { width: number; height: number } | null {
  const match = size.match(DIMENSIONS);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { width, height };
}

export function compactSize(size: string): string {
  const parsed = parseDimensions(size);
  if (!parsed) return size.trim();
  const width = Number.isInteger(parsed.width) ? String(parsed.width) : String(parsed.width);
  const height = Number.isInteger(parsed.height) ? String(parsed.height) : String(parsed.height);
  return `${width}x${height}`;
}

/** Fill the dimensions field from an explicit size, a `dimensions` value, or the first size in the art description. */
export function resolveDimensions(input: {
  size?: string | null;
  dimensions?: string | null;
  artDescription?: string | null;
}): string {
  const explicit = (input.dimensions ?? input.size ?? "").trim();
  if (explicit) return compactSize(explicit);
  const described = input.artDescription?.match(DIMENSIONS);
  if (!described) return "";
  return compactSize(`${described[1]}x${described[2]}`);
}

function fits(pieceWidth: number, pieceHeight: number, stockWidth: number, stockHeight: number): boolean {
  return (
    (pieceWidth <= stockWidth && pieceHeight <= stockHeight) ||
    (pieceWidth <= stockHeight && pieceHeight <= stockWidth)
  );
}

/**
 * Mat sheet size to purchase. Nothing smaller than 32x40 is ordered.
 * Add the next stock sheet to MAT_ORDER_SIZES when the shop starts buying it.
 */
export function matOrderSizeLabel(size: string): string {
  const parsed = parseDimensions(size);
  if (!parsed) return "check size";
  for (const stock of MAT_ORDER_SIZES) {
    if (fits(parsed.width, parsed.height, stock.width, stock.height)) return stock.label;
  }
  return "check size";
}

export function orderSizeFor(kind: string, size: string): string {
  if (MAT_KINDS.has(kind as MaterialKind)) return matOrderSizeLabel(size);
  return size;
}

export function urgentLine<T extends { kind: string; stockStatus: StockStatus }>(lines: T[], kind: string): T | null {
  const matches = lines.filter((line) => line.kind === kind);
  if (!matches.length) return null;
  return [...matches].sort((a, b) => TILE_RANK[a.stockStatus] - TILE_RANK[b.stockStatus])[0];
}
