/**
 * Live Masten board export: 26 lists, 50 labels, 15 custom fields.
 * Source file: src/data/live-board.json
 * Stock status on material lines is separate from these Trello dropdowns.
 */

import liveBoard from "./live-board.json";

export type ListKind = "utility" | "production" | "done";

const UTILITY_LISTS = new Set([
  "Template",
  "Text Messages",
  "Estimates/Quotes",
  "Master Customer List",
  "Sales Leads",
  "Templates",
]);
const DONE_LISTS = new Set(["Completed 🎊", "Ready to be Archived"]);

export const LISTS: { name: string; kind: ListKind }[] = liveBoard.lists.map((name) => ({
  name,
  kind: DONE_LISTS.has(name) ? "done" : UTILITY_LISTS.has(name) ? "utility" : "production",
}));

export const NEW_WORK_ORDERS = "New Work Orders";

export const MATERIAL_KINDS = [
  { id: "frame", label: "Frame / moulding", checkByDefault: true },
  { id: "top_mat", label: "Top mat", checkByDefault: false },
  { id: "second_mat", label: "2nd mat", checkByDefault: false },
  { id: "third_mat", label: "3rd mat", checkByDefault: false },
  { id: "inner_stacked_frame", label: "Inner stacked frame", checkByDefault: false },
  { id: "second_stacked_frame", label: "2nd stacked frame", checkByDefault: false },
  { id: "third_stacked_frame", label: "3rd stacked frame", checkByDefault: false },
  { id: "fillet", label: "Fillet", checkByDefault: false },
  { id: "glazing", label: "Glazing", checkByDefault: true },
  { id: "backing", label: "Backing / mounting", checkByDefault: false },
  { id: "stretcher", label: "Stretcher", checkByDefault: false },
  { id: "fabric", label: "Fabric", checkByDefault: false },
  { id: "engraving", label: "Engraving / typeset", checkByDefault: false },
  { id: "other", label: "Other", checkByDefault: false },
] as const;

export type MaterialKind = (typeof MATERIAL_KINDS)[number]["id"];

export const STOCK_STATUSES = [
  { id: "in_stock", label: "In Stock", short: "In stock" },
  { id: "not_in_stock", label: "Not In Stock", short: "Not in stock" },
  { id: "needs_human_check", label: "Needs Human Check", short: "Check" },
  { id: "ordered", label: "Ordered", short: "Ordered" },
  { id: "here", label: "Here", short: "Here" },
] as const;

export type StockStatus = (typeof STOCK_STATUSES)[number]["id"];

const KIND_ALIASES: Record<string, MaterialKind> = {
  frame: "frame",
  moulding: "frame",
  molding: "frame",
  "frame / moulding": "frame",
  mat: "top_mat",
  "top mat": "top_mat",
  top_mat: "top_mat",
  "2nd mat": "second_mat",
  "second mat": "second_mat",
  second_mat: "second_mat",
  "3rd mat": "third_mat",
  "third mat": "third_mat",
  third_mat: "third_mat",
  "inner stacked frame": "inner_stacked_frame",
  inner_stacked_frame: "inner_stacked_frame",
  "2nd stacked frame": "second_stacked_frame",
  second_stacked_frame: "second_stacked_frame",
  "3rd stacked frame": "third_stacked_frame",
  third_stacked_frame: "third_stacked_frame",
  fillet: "fillet",
  "fillet(s)": "fillet",
  fillets: "fillet",
  glazing: "glazing",
  glass: "glazing",
  backing: "backing",
  mounting: "backing",
  "backing/mounting": "backing",
  "backing / mounting": "backing",
  stretcher: "stretcher",
  fabric: "fabric",
  engraving: "engraving",
  typeset: "engraving",
  "engraving/typeset": "engraving",
  other: "other",
};

const STATUS_ALIASES: Record<string, StockStatus> = {
  in_stock: "in_stock",
  "in stock": "in_stock",
  not_in_stock: "not_in_stock",
  "not in stock": "not_in_stock",
  needs_human_check: "needs_human_check",
  "needs human check": "needs_human_check",
  ordered: "ordered",
  here: "here",
};

export function parseKind(value: string): MaterialKind | null {
  return KIND_ALIASES[value.trim().toLowerCase()] ?? null;
}

export function parseStatus(value: string): StockStatus | null {
  return STATUS_ALIASES[value.trim().toLowerCase()] ?? null;
}

export function kindLabel(kind: string): string {
  return MATERIAL_KINDS.find((item) => item.id === kind)?.label ?? kind;
}

export function statusLabel(status: string): string {
  return STOCK_STATUSES.find((item) => item.id === status)?.label ?? status;
}

export function statusShort(status: string): string {
  return STOCK_STATUSES.find((item) => item.id === status)?.short ?? status;
}

export function defaultStatus(kind: string): StockStatus {
  const found = MATERIAL_KINDS.find((item) => item.id === kind);
  if (found?.checkByDefault) return "needs_human_check";
  return "needs_human_check";
}

export const PRODUCTION_CHECKLIST = {
  title: "Production",
  items: [
    "Art received and photographed",
    "Materials checked against stock",
    "Mats cut",
    "Frame joined",
    "Glazing cut",
    "Fitted, wired, and bumpers on",
    "Customer notified",
  ],
};

export type CustomFieldType = "list" | "number";

export const CUSTOM_FIELDS: { name: string; type: CustomFieldType; options: string[] }[] = liveBoard.customFields.map(
  (field) => ({
    name: field.name,
    type: field.type as CustomFieldType,
    options: field.options,
  }),
);

const TRELLO_LABEL_HEX: Record<string, string> = {
  green: "#216e4e",
  green_dark: "#164b35",
  green_light: "#4bce97",
  yellow: "#7f5f01",
  yellow_dark: "#533f04",
  yellow_light: "#e2b203",
  orange: "#a54800",
  orange_dark: "#702e00",
  orange_light: "#fea362",
  red: "#ae2e24",
  red_dark: "#5d1f1a",
  red_light: "#f87168",
  purple: "#5e4db2",
  purple_dark: "#352c63",
  purple_light: "#9f8fef",
  blue: "#0055cc",
  blue_dark: "#09326c",
  blue_light: "#579dff",
  sky: "#206a83",
  sky_dark: "#164555",
  sky_light: "#6cc3e0",
  lime: "#4c6b1f",
  lime_dark: "#37471f",
  lime_light: "#94c748",
  pink: "#943d73",
  pink_dark: "#50253f",
  pink_light: "#e774bb",
  black: "#626f86",
  black_dark: "#44546f",
  black_light: "#8590a2",
};

const UNCOLORED_LABEL = "#97a0af";

export const LABELS: { name: string; trelloColor: string | null; color: string }[] = liveBoard.labels.map((label) => ({
  name: label.name,
  trelloColor: label.color,
  color: (label.color && TRELLO_LABEL_HEX[label.color]) || UNCOLORED_LABEL,
}));

export function slugId(prefix: string, name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-");
  return `${prefix}-${slug}`;
}
