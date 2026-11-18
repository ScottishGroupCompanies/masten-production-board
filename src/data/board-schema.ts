/**
 * Shop-floor catalog for Masten Production Board.
 *
 * The live Trello export (lists, 50 labels, 15 custom-field dropdowns) was not
 * in this workspace, and the connected Trello account cannot read the private
 * board. Names the request spelled out are used in that order. The production
 * lists between "On Order Sheet" and "Completed 🎊", the label set, and the
 * dropdown options are a working catalog so the floor can run. Replace this
 * file and run `npm run db:reset` to load the real export.
 */

export type ListKind = "utility" | "production" | "done";

export const LISTS: { name: string; kind: ListKind }[] = [
  { name: "Template", kind: "utility" },
  { name: "New Work Orders", kind: "production" },
  { name: "On Order Sheet", kind: "production" },
  { name: "Hold", kind: "production" },
  { name: "Waiting on Customer", kind: "production" },
  { name: "Waiting on Art", kind: "production" },
  { name: "Materials to Check", kind: "production" },
  { name: "Mat Ordered", kind: "production" },
  { name: "Frame Ordered", kind: "production" },
  { name: "Frame & Mat Ordered", kind: "production" },
  { name: "On Order with Vendor", kind: "production" },
  { name: "Backordered", kind: "production" },
  { name: "Chop & Join", kind: "production" },
  { name: "All Materials Here", kind: "production" },
  { name: "In Progress", kind: "production" },
  { name: "Fitting", kind: "production" },
  { name: "Assembled", kind: "production" },
  { name: "Quality Check", kind: "production" },
  { name: "Ready for Pickup", kind: "production" },
  { name: "Completed 🎊", kind: "done" },
  { name: "Ready to be Archived", kind: "done" },
  { name: "Text Messages", kind: "utility" },
  { name: "Estimates/Quotes", kind: "utility" },
  { name: "Master Customer List", kind: "utility" },
  { name: "Sales Leads", kind: "utility" },
  { name: "Templates", kind: "utility" },
];

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

const MAT_OPTIONS = ["Crescent", "Bainbridge", "Artique", "Fabric", "8-ply", "None", "Special order"];
const STACK_OPTIONS = ["Wood liner", "Metal liner", "Fillet liner", "None", "Special order"];

export const CUSTOM_FIELDS: { name: string; options: string[] }[] = [
  {
    name: "Frame",
    options: ["Wood", "Metal", "Floater", "Canvas float", "Shadow box", "Ready-made", "Stacked", "None", "Special order"],
  },
  { name: "Top Mat", options: MAT_OPTIONS },
  { name: "2nd Mat", options: MAT_OPTIONS },
  { name: "3rd Mat", options: MAT_OPTIONS },
  { name: "Inner Stacked Frame", options: STACK_OPTIONS },
  { name: "2nd Stacked Frame", options: STACK_OPTIONS },
  { name: "3rd Stacked Frame", options: STACK_OPTIONS },
  { name: "Fillet(s)", options: ["Larson", "CDNV", "Omega", "None", "Special order"] },
  {
    name: "Glazing",
    options: ["Regular glass", "Conservation UV", "Museum glass", "Optium acrylic", "Regular acrylic", "None"],
  },
  {
    name: "Backing/Mounting",
    options: ["Foam core", "Artcare foam", "Gatorboard", "Dibond", "Coroplast", "Dry mount", "Hinge mount", "Stretch", "None"],
  },
  { name: "Stretcher", options: ['3/4" gallery', '1-1/2" heavy', '2" extra deep', "None"] },
  { name: "Fabric", options: ["Linen", "Cotton", "Silk", "Suede", "None"] },
  { name: "Engraving/Typeset", options: ["Brass plate", "Black plate", "Typeset only", "None"] },
  {
    name: "Art",
    options: ["Original", "Limited print", "Open print", "Photograph", "Canvas", "Textile", "Object", "Document"],
  },
  { name: "DO (Quantity)", options: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "12", "15", "20+"] },
];

export const LABELS: { name: string; color: string }[] = [
  { name: "Rush", color: "#ae2e24" },
  { name: "Hold", color: "#5d1f1a" },
  { name: "Overdue", color: "#ae2e24" },
  { name: "Backordered", color: "#702e00" },
  { name: "Waiting on mat", color: "#a54800" },
  { name: "Waiting on frame", color: "#c2410c" },
  { name: "Waiting on fillet", color: "#7f5f01" },
  { name: "Waiting on glass", color: "#533f04" },
  { name: "Waiting on art", color: "#fea362" },
  { name: "Waiting on customer", color: "#a16207" },
  { name: "All materials here", color: "#216e4e" },
  { name: "In house", color: "#4bce97" },
  { name: "Verified — Brendon", color: "#0055cc" },
  { name: "Verified — Reed", color: "#206a83" },
  { name: "Needs review", color: "#e2b203" },
  { name: "Balance due", color: "#f87168" },
  { name: "Paid", color: "#216e4e" },
  { name: "Deposit", color: "#ca8a04" },
  { name: "Pickup", color: "#4c6b1f" },
  { name: "Delivery", color: "#164b35" },
  { name: "Install", color: "#164555" },
  { name: "Ship", color: "#579dff" },
  { name: "Designer", color: "#5e4db2" },
  { name: "Gallery", color: "#352c63" },
  { name: "Wholesale", color: "#09326c" },
  { name: "Corporate", color: "#1d4ed8" },
  { name: "Conservation", color: "#0e7490" },
  { name: "Restoration", color: "#943d73" },
  { name: "Redo", color: "#be123c" },
  { name: "Gift", color: "#e774bb" },
  { name: "Needlepoint", color: "#37471f" },
  { name: "Textile", color: "#65a30d" },
  { name: "Jersey", color: "#c2410c" },
  { name: "Canvas", color: "#d97706" },
  { name: "Shadow box", color: "#9f8fef" },
  { name: "Object box", color: "#44546f" },
  { name: "Float mount", color: "#6cc3e0" },
  { name: "French mat", color: "#db2777" },
  { name: "Museum glass", color: "#206a83" },
  { name: "Acrylic", color: "#0284c7" },
  { name: "UV glass", color: "#1d4ed8" },
  { name: "Stretch only", color: "#a16207" },
  { name: "Frame only", color: "#ea580c" },
  { name: "Mat only", color: "#4d7c0f" },
  { name: "Dry mount", color: "#15803d" },
  { name: "Hinge mount", color: "#166534" },
  { name: "Multi-piece", color: "#6d28d9" },
  { name: "Quote", color: "#0891b2" },
  { name: "VIP", color: "#1d2125" },
  { name: "Holiday", color: "#9d174d" },
];

export function slugId(prefix: string, name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-");
  return `${prefix}-${slug}`;
}
