import { CUSTOM_FIELDS, LABELS, LISTS, PRODUCTION_CHECKLIST, slugId, type MaterialKind, type StockStatus } from "@/data/board-schema";
import { BOT_NAME, adminCredentials, isRemoteDatabase } from "./config";
import { all, transaction } from "./db";
import { hashPassword } from "./password";
import { artSvg, simplePdf } from "./pdf";
import { saveUpload } from "./storage";

type Material = { kind: MaterialKind; itemCode: string; vendor: string; stockStatus: StockStatus };
type Note = { author: string; userId?: string; body: string; at: string };
type Event = { actor: string; userId?: string; kind: string; summary: string; at: string };

type SeedCard = {
  id: string;
  list: string;
  customerName: string;
  phone?: string;
  workOrderNumber?: string;
  invoiceNumber?: string;
  pieceIndex?: number;
  pieceCount?: number;
  size?: string;
  dueDate?: string | null;
  startDate?: string | null;
  labels?: string[];
  assignees?: string[];
  fields?: Record<string, string>;
  materials?: Material[];
  sharedMats?: string;
  artDescription?: string;
  artLocation?: string;
  artCondition?: string;
  connectedOrders?: string;
  additionalContact?: string;
  customerRecordId?: string;
  checked?: number;
  notes?: Note[];
  activity?: Event[];
  archived?: boolean;
  pdf?: boolean;
  photoHue?: number;
  createdAt: string;
};

const AVERY = "user-avery";
const JORDAN = "user-jordan";
const PRIYA = "user-priya";
const LUIS = "user-luis";

const CARDS: SeedCard[] = [
  {
    id: "card-templates-copy",
    list: "Templates",
    customerName: "Fitting notes template",
    artDescription: "Wire, bumpers, hanging hardware, and any “do not trim” instruction go in the notes log, not in the art description.",
    artCondition: "Photograph the piece before it is de-framed.",
    checked: 0,
    createdAt: "2026-10-02T15:00:00.000Z",
  },
  {
    id: "card-customer-elena",
    list: "Master Customer List",
    customerName: "Elena Vasquez",
    phone: "303-555-0174",
    additionalContact: "Designer Harper Quinn, 720-555-0199. Prefers texts to calls.",
    artDescription: "Collector. Usually museum glass, warm white mats, and a fillet on watercolors.",
    notes: [
      { author: "Priya Nandakumar", userId: PRIYA, body: "Likes to approve the fillet in person before we join the frame.", at: "2026-11-02T18:10:00.000Z" },
    ],
    createdAt: "2026-09-14T16:00:00.000Z",
  },
  {
    id: "card-customer-maya",
    list: "Master Customer List",
    customerName: "Maya Ellison",
    phone: "303-555-0148",
    additionalContact: "Spouse Andre Ellison, 303-555-0149.",
    artDescription: "Photographs from a High Line Canal series. Pickup at the studio.",
    createdAt: "2026-08-20T16:00:00.000Z",
  },
  {
    id: "card-maya",
    list: "New Work Orders",
    customerName: "Maya Ellison",
    phone: "303-555-0148",
    workOrderNumber: "51002",
    invoiceNumber: "20402",
    pieceIndex: 1,
    pieceCount: 1,
    size: "16x20",
    dueDate: "2026-11-04",
    startDate: "2026-11-16",
    labels: ["RUSH", "See work order notes", "Return Customer"],
    assignees: [AVERY],
    customerRecordId: "card-customer-maya",
    fields: { Frame: "On Order Sheet", "Top Mat": "Here", Glazing: "VERIFY", Art: "Here", "DO (Quantity)": "1", "Backing/Mounting": "Here" },
    materials: [
      { kind: "frame", itemCode: "LJ-2240", vendor: "Larson", stockStatus: "not_in_stock" },
      { kind: "top_mat", itemCode: "C-1634", vendor: "Crescent", stockStatus: "in_stock" },
      { kind: "glazing", itemCode: "Conservation UV 16x20", vendor: "Larson", stockStatus: "needs_human_check" },
      { kind: "backing", itemCode: "Dry mount tissue", vendor: "Larson", stockStatus: "in_stock" },
    ],
    sharedMats: "None",
    artDescription: "Black-and-white photograph of the High Line Canal, edition 4/25.",
    artLocation: "Drawer D-2",
    artCondition: "Good. No surface damage. Hinges from a previous mat still on the reverse.",
    connectedOrders: "None",
    additionalContact: "Andre Ellison, 303-555-0149, if Maya does not answer.",
    checked: 1,
    pdf: true,
    photoHue: 28,
    notes: [
      { author: "Avery Chen", userId: AVERY, body: "Promised a rush. Frame length is not on the Larson rack — it has to go on the order.", at: "2026-11-16T16:20:00.000Z" },
    ],
    createdAt: "2026-11-16T16:05:00.000Z",
  },
  {
    id: "card-theo",
    list: "New Work Orders",
    customerName: "Theo Brennan",
    phone: "720-555-0116",
    workOrderNumber: "51044",
    invoiceNumber: "20440",
    pieceIndex: 1,
    pieceCount: 1,
    size: "11x14",
    dueDate: "2026-11-25",
    startDate: "2026-11-18",
    labels: ["See Reed", "TIM ATTACHED NEW WO"],
    assignees: [JORDAN],
    fields: { Frame: "On Order Sheet", "Top Mat": "VERIFY", Glazing: "VERIFY", Art: "Here", "DO (Quantity)": "1" },
    materials: [
      { kind: "frame", itemCode: "Metal 11", vendor: "Larson", stockStatus: "needs_human_check" },
      { kind: "top_mat", itemCode: "B-8456", vendor: "Bainbridge", stockStatus: "in_stock" },
      { kind: "glazing", itemCode: "Regular 11x14", vendor: "Larson", stockStatus: "needs_human_check" },
    ],
    sharedMats: "None",
    artDescription: "Open-edition print of a Denver alley in winter.",
    artLocation: "Bin A-4",
    artCondition: "Good. Flat. No foxing.",
    connectedOrders: "None",
    checked: 1,
    notes: [
      { author: BOT_NAME, body: "Loaded from Lifesaver after verification. Frame and glass still need a human stock check.", at: "2026-11-18T15:05:00.000Z" },
    ],
    activity: [
      { actor: BOT_NAME, kind: "created", summary: "Masten Orders bot created this card in New Work Orders.", at: "2026-11-18T15:04:00.000Z" },
    ],
    createdAt: "2026-11-18T15:04:00.000Z",
  },
  {
    id: "card-camille",
    list: "On Order Sheet",
    customerName: "Camille Ortiz",
    phone: "303-555-0190",
    workOrderNumber: "50977",
    invoiceNumber: "20390",
    pieceIndex: 1,
    pieceCount: 1,
    size: "20x24",
    dueDate: "2026-11-21",
    startDate: "2026-11-12",
    labels: ["See work order notes", "Call Vendor"],
    assignees: [PRIYA],
    fields: { Frame: "On Order Sheet", "Top Mat": "On Order Sheet", "2nd Mat": "Here", Glazing: "Here", Art: "Here", "DO (Quantity)": "1" },
    materials: [
      { kind: "frame", itemCode: "LJ-510", vendor: "Larson", stockStatus: "in_stock" },
      { kind: "top_mat", itemCode: "B-8644", vendor: "Bainbridge", stockStatus: "not_in_stock" },
      { kind: "second_mat", itemCode: "C-963", vendor: "Crescent", stockStatus: "in_stock" },
      { kind: "glazing", itemCode: "Museum 20x24", vendor: "Larson", stockStatus: "here" },
    ],
    sharedMats: "None",
    artDescription: "Oil sketch of a cottonwood, unframed, signed lower right.",
    artLocation: "Wall rack 3",
    artCondition: "Slightly cupped. No paint loss.",
    pdf: true,
    checked: 1,
    createdAt: "2026-11-12T17:00:00.000Z",
    notes: [
      { author: "Priya Nandakumar", userId: PRIYA, body: "Bainbridge 8644 is not in the mat rack. Added to the vendor order.", at: "2026-11-14T18:40:00.000Z" },
    ],
  },
  {
    id: "card-ruth",
    list: "Past Due - PRIORITY",
    customerName: "Ruth Adelman",
    phone: "303-555-0162",
    workOrderNumber: "50810",
    invoiceNumber: "20220",
    pieceIndex: 1,
    pieceCount: 1,
    size: "8x10",
    dueDate: "2026-10-28",
    startDate: "2026-10-20",
    labels: ["On Hold. Do not move", "See Notes"],
    assignees: [AVERY],
    fields: { Frame: "On Order Sheet", Glazing: "VERIFY", Art: "Contact Client for Art", "DO (Quantity)": "1", "Backing/Mounting": "Verify" },
    materials: [
      { kind: "frame", itemCode: "Unspecified", vendor: "", stockStatus: "needs_human_check" },
      { kind: "glazing", itemCode: "Conservation UV 8x10", vendor: "Larson", stockStatus: "needs_human_check" },
    ],
    artDescription: "Marriage certificate. Customer is deciding between a 4-ply and an 8-ply mat.",
    artLocation: "Safe drawer",
    artCondition: "Fragile paper. Do not dry mount.",
    checked: 1,
    createdAt: "2026-10-20T16:00:00.000Z",
    notes: [
      { author: "Avery Chen", userId: AVERY, body: "On hold until Ruth emails the mat color. Due date has already passed.", at: "2026-10-27T19:00:00.000Z" },
    ],
  },
  {
    id: "card-samir",
    list: "Stretch",
    customerName: "Samir Qureshi",
    phone: "720-555-0188",
    workOrderNumber: "51033",
    invoiceNumber: "20430",
    pieceIndex: 1,
    pieceCount: 1,
    size: "18x24",
    dueDate: "2026-12-02",
    startDate: "2026-11-17",
    labels: ["Stretched", "See Reed"],
    assignees: [LUIS],
    fields: { Frame: "Order After Stretch", Glazing: "On Order Sheet", Art: "Contact Client for Art", "DO (Quantity)": "1", Stretcher: "Order Placed" },
    materials: [
      { kind: "frame", itemCode: "Float 18", vendor: "Larson", stockStatus: "in_stock" },
      { kind: "glazing", itemCode: "Optium 18x24", vendor: "Larson", stockStatus: "ordered" },
      { kind: "stretcher", itemCode: "1.5 gallery", vendor: "Larson", stockStatus: "in_stock" },
    ],
    artDescription: "Canvas of a night market. The designer is bringing it Thursday.",
    artLocation: "Not in house",
    artCondition: "Unknown until it arrives.",
    additionalContact: "Designer: North Studio, 303-555-0108.",
    checked: 0,
    createdAt: "2026-11-17T20:00:00.000Z",
  },
  {
    id: "card-helen",
    list: "Verify Mat Before Ordering",
    customerName: "Helen Cho",
    phone: "303-555-0133",
    workOrderNumber: "51018",
    invoiceNumber: "20411",
    pieceIndex: 1,
    pieceCount: 1,
    size: "12x16",
    dueDate: "2026-11-27",
    startDate: "2026-11-15",
    labels: ["Tim needs to order CDNV", "Fillet"],
    assignees: [JORDAN, PRIYA],
    fields: { Frame: "On Order Sheet", "Top Mat": "VERIFY", "Fillet(s)": "VERIFY", Glazing: "VERIFY", Art: "Here", "DO (Quantity)": "1" },
    materials: [
      { kind: "frame", itemCode: "LJ-118", vendor: "Larson", stockStatus: "needs_human_check" },
      { kind: "top_mat", itemCode: "C-9893", vendor: "Crescent", stockStatus: "not_in_stock" },
      { kind: "fillet", itemCode: "L151", vendor: "CDNV", stockStatus: "not_in_stock" },
      { kind: "glazing", itemCode: "Museum 12x16", vendor: "Larson", stockStatus: "needs_human_check" },
    ],
    sharedMats: "None",
    artDescription: "Limited print, botanical, deckled edge. Keep the deckle outside the window.",
    artLocation: "Bin C-14",
    artCondition: "Good. Deckled edges, do not trim.",
    checked: 1,
    createdAt: "2026-11-15T18:00:00.000Z",
  },
  {
    id: "card-owen",
    list: "On Spreadsheet",
    customerName: "Owen Park",
    phone: "303-555-0177",
    workOrderNumber: "50955",
    invoiceNumber: "20370",
    pieceIndex: 1,
    pieceCount: 1,
    size: "16x20",
    dueDate: "2026-11-24",
    startDate: "2026-11-08",
    labels: ["See work order notes"],
    assignees: [PRIYA],
    fields: { Frame: "Here Needs Join", "Top Mat": "Order Placed", Glazing: "Here", Art: "Here", "DO (Quantity)": "1" },
    materials: [
      { kind: "frame", itemCode: "LJ-330", vendor: "Larson", stockStatus: "here" },
      { kind: "top_mat", itemCode: "C-9893", vendor: "Crescent", stockStatus: "ordered" },
      { kind: "glazing", itemCode: "Regular 16x20", vendor: "Larson", stockStatus: "here" },
    ],
    artDescription: "Color photograph, family portrait.",
    artLocation: "Bin B-1",
    artCondition: "Good.",
    checked: 2,
    createdAt: "2026-11-08T17:00:00.000Z",
  },
  {
    id: "card-lila",
    list: "Order(s) Placed",
    customerName: "Lila Brooks",
    phone: "720-555-0104",
    workOrderNumber: "50940",
    invoiceNumber: "20355",
    pieceIndex: 1,
    pieceCount: 1,
    size: "24x30",
    dueDate: "2026-11-26",
    startDate: "2026-11-06",
    labels: ["Call Vendor", "See Notes"],
    assignees: [LUIS],
    fields: { Frame: "Order Placed", Glazing: "Here", Art: "Here", "DO (Quantity)": "1" },
    materials: [
      { kind: "frame", itemCode: "LJ-450", vendor: "Larson", stockStatus: "ordered" },
      { kind: "glazing", itemCode: "Museum 24x30", vendor: "Larson", stockStatus: "here" },
    ],
    artDescription: "Charcoal portrait. Floated on a warm white rag.",
    artLocation: "Drawer D-9",
    artCondition: "Friable charcoal. Do not wipe the surface.",
    checked: 2,
    createdAt: "2026-11-06T17:30:00.000Z",
  },
  {
    id: "card-noah-1",
    list: "Chop and Join",
    customerName: "Noah Park",
    phone: "303-555-0121",
    workOrderNumber: "50990",
    invoiceNumber: "20388",
    pieceIndex: 1,
    pieceCount: 2,
    size: "14x18",
    dueDate: "2026-11-28",
    startDate: "2026-11-10",
    labels: ["Join Immediately", "DO 2"],
    assignees: [JORDAN],
    fields: { Frame: "Order Placed", "Top Mat": "Here", Glazing: "Here", Art: "Here", "DO (Quantity)": "2" },
    materials: [
      { kind: "frame", itemCode: "LJ-2240", vendor: "Larson", stockStatus: "ordered" },
      { kind: "top_mat", itemCode: "C-1634", vendor: "Crescent", stockStatus: "in_stock" },
      { kind: "glazing", itemCode: "Regular 14x18", vendor: "Larson", stockStatus: "in_stock" },
    ],
    sharedMats: "Same Crescent 1634 top mat as piece 2. Cut both from one sheet.",
    artDescription: "Left photograph of a pair. Keep the window the same height as piece 2.",
    artLocation: "Bin B-7",
    artCondition: "Good.",
    connectedOrders: "WO 50990 piece 2 of 2.",
    pdf: true,
    checked: 2,
    createdAt: "2026-11-10T16:00:00.000Z",
  },
  {
    id: "card-noah-2",
    list: "Chop and Join",
    customerName: "Noah Park",
    phone: "303-555-0121",
    workOrderNumber: "50990",
    invoiceNumber: "20388",
    pieceIndex: 2,
    pieceCount: 2,
    size: "14x18",
    dueDate: "2026-11-28",
    startDate: "2026-11-10",
    labels: ["Join Immediately", "DO 2"],
    assignees: [JORDAN],
    fields: { Frame: "Order Placed", "Top Mat": "Here", Glazing: "Here", Art: "Here", "DO (Quantity)": "2" },
    materials: [
      { kind: "frame", itemCode: "LJ-2240", vendor: "Larson", stockStatus: "ordered" },
      { kind: "top_mat", itemCode: "C-1634", vendor: "Crescent", stockStatus: "in_stock" },
      { kind: "glazing", itemCode: "Regular 14x18", vendor: "Larson", stockStatus: "in_stock" },
    ],
    sharedMats: "Shares the Crescent 1634 sheet with piece 1.",
    artDescription: "Right photograph of the pair.",
    artLocation: "Bin B-7",
    artCondition: "Good.",
    connectedOrders: "WO 50990 piece 1 of 2.",
    checked: 2,
    createdAt: "2026-11-10T16:01:00.000Z",
  },
  {
    id: "card-imani",
    list: "Backorders",
    customerName: "Imani Brooks",
    phone: "720-555-0166",
    workOrderNumber: "50888",
    invoiceNumber: "20290",
    pieceIndex: 1,
    pieceCount: 1,
    size: "11x14",
    dueDate: "2026-11-09",
    startDate: "2026-10-30",
    labels: ["BO or O/S", "ORDER DELAYED Text Sent"],
    assignees: [AVERY],
    fields: { Frame: "Here Needs Join", "Top Mat": "B.O. / O.S.", Fabric: "On Order Sheet", Glazing: "Here", Art: "Here", "DO (Quantity)": "1" },
    materials: [
      { kind: "frame", itemCode: "Shadow 11", vendor: "Larson", stockStatus: "here" },
      { kind: "top_mat", itemCode: "Suede 4", vendor: "Artique", stockStatus: "not_in_stock" },
      { kind: "fabric", itemCode: "Suede 4", vendor: "Artique", stockStatus: "not_in_stock" },
      { kind: "glazing", itemCode: "Acrylic 11x14", vendor: "Larson", stockStatus: "here" },
    ],
    artDescription: "Embroidered patch. Build a shadow box with the suede showing as the mat.",
    artLocation: "Bin C-2",
    artCondition: "Thread is loose at one corner. Do not press.",
    checked: 2,
    createdAt: "2026-10-30T16:00:00.000Z",
    notes: [
      { author: "Avery Chen", userId: AVERY, body: "Artique says suede 4 is backordered. Customer knows the due date slipped.", at: "2026-11-08T17:15:00.000Z" },
    ],
  },
  {
    id: "card-jonah",
    list: "Special Orders",
    customerName: "Jonah Keller",
    phone: "303-555-0182",
    workOrderNumber: "51008",
    invoiceNumber: "20408",
    pieceIndex: 1,
    pieceCount: 1,
    size: "22x28",
    dueDate: "2026-11-20",
    startDate: "2026-11-11",
    labels: ["All Materials Here", "PAID IN FULL"],
    assignees: [LUIS],
    fields: { Frame: "Here & Joined", "Top Mat": "Here", Glazing: "Here", Art: "Here", "DO (Quantity)": "1", "Backing/Mounting": "Here" },
    materials: [
      { kind: "frame", itemCode: "LJ-775", vendor: "Larson", stockStatus: "here" },
      { kind: "top_mat", itemCode: "B-960", vendor: "Bainbridge", stockStatus: "here" },
      { kind: "glazing", itemCode: "Conservation UV 22x28", vendor: "Larson", stockStatus: "here" },
    ],
    artDescription: "Watercolor map of Washington Park.",
    artLocation: "Wall rack 1",
    artCondition: "Good. Slight cockling along the top edge.",
    checked: 2,
    createdAt: "2026-11-11T16:30:00.000Z",
  },
  {
    id: "card-elena-1",
    list: "Measure Stacked Frame",
    customerName: "Elena Vasquez",
    phone: "303-555-0174",
    workOrderNumber: "51021",
    invoiceNumber: "20418",
    pieceIndex: 1,
    pieceCount: 3,
    size: "18x24",
    dueDate: "2026-11-22",
    startDate: "2026-11-09",
    labels: ["Frame Fillet", "See work order photos", "VIP"],
    assignees: [PRIYA, LUIS],
    customerRecordId: "card-customer-elena",
    fields: {
      Frame: "Here Needs Join",
      "Top Mat": "Shared",
      "2nd Mat": "Here",
      "Fillet(s)": "Here",
      "Inner Stacked Frame": "Here Needs Join",
      Glazing: "Here",
      Art: "Here",
      "DO (Quantity)": "3",
      "Backing/Mounting": "Here",
    },
    materials: [
      { kind: "frame", itemCode: "LJ-90", vendor: "Larson", stockStatus: "here" },
      { kind: "top_mat", itemCode: "B-8649", vendor: "Bainbridge", stockStatus: "here" },
      { kind: "second_mat", itemCode: "C-1013", vendor: "Crescent", stockStatus: "here" },
      { kind: "fillet", itemCode: "L-27", vendor: "Larson", stockStatus: "here" },
      { kind: "glazing", itemCode: "Museum 18x24", vendor: "Larson", stockStatus: "here" },
    ],
    sharedMats: "Top mat and fillet are shared across WO 51021 pieces 1–3. Keep the reveal equal.",
    artDescription: "Watercolor, left panel of a triptych. South Platte in flood.",
    artLocation: "Bin B-7",
    artCondition: "Good. Signed lower right.",
    connectedOrders: "WO 51021 pieces 2 and 3.",
    additionalContact: "Designer Harper Quinn, 720-555-0199.",
    pdf: true,
    photoHue: 200,
    checked: 3,
    createdAt: "2026-11-09T16:00:00.000Z",
    notes: [
      { author: "Priya Nandakumar", userId: PRIYA, body: "Mats are cut. Luis has the left panel on the bench.", at: "2026-11-17T21:10:00.000Z" },
    ],
    activity: [
      { actor: "Jordan Hale", userId: JORDAN, kind: "moved", summary: "Jordan Hale moved this from On Order Sheet to Measure Stacked Frame.", at: "2026-11-16T15:00:00.000Z" },
    ],
  },
  {
    id: "card-elena-2",
    list: "Matting",
    customerName: "Elena Vasquez",
    phone: "303-555-0174",
    workOrderNumber: "51021",
    invoiceNumber: "20418",
    pieceIndex: 2,
    pieceCount: 3,
    size: "18x24",
    dueDate: "2026-11-22",
    startDate: "2026-11-09",
    labels: ["Frame Fillet", "See work order photos", "VIP"],
    assignees: [LUIS],
    customerRecordId: "card-customer-elena",
    fields: { Frame: "Here & Joined", "Top Mat": "Shared", "2nd Mat": "Here", "Fillet(s)": "Cut & Join", Glazing: "Here", Art: "Here", "DO (Quantity)": "3" },
    materials: [
      { kind: "frame", itemCode: "LJ-90", vendor: "Larson", stockStatus: "here" },
      { kind: "top_mat", itemCode: "B-8649", vendor: "Bainbridge", stockStatus: "here" },
      { kind: "fillet", itemCode: "L-27", vendor: "Larson", stockStatus: "here" },
      { kind: "glazing", itemCode: "Museum 18x24", vendor: "Larson", stockStatus: "here" },
    ],
    sharedMats: "Shared with pieces 1 and 3.",
    artDescription: "Watercolor, center panel. The bridge.",
    artLocation: "Bench",
    artCondition: "Good.",
    connectedOrders: "WO 51021 pieces 1 and 3.",
    additionalContact: "Designer Harper Quinn, 720-555-0199.",
    checked: 5,
    createdAt: "2026-11-09T16:02:00.000Z",
  },
  {
    id: "card-elena-3",
    list: "Reed Projects",
    customerName: "Elena Vasquez",
    phone: "303-555-0174",
    workOrderNumber: "51021",
    invoiceNumber: "20418",
    pieceIndex: 3,
    pieceCount: 3,
    size: "18x24",
    dueDate: "2026-11-22",
    startDate: "2026-11-09",
    labels: ["Frame Fillet", "See work order photos", "VIP"],
    assignees: [LUIS],
    customerRecordId: "card-customer-elena",
    fields: { Frame: "Here & Joined", "Top Mat": "Here", "Fillet(s)": "Done", Glazing: "Here", Art: "Here", "DO (Quantity)": "3" },
    materials: [
      { kind: "frame", itemCode: "LJ-90", vendor: "Larson", stockStatus: "here" },
      { kind: "top_mat", itemCode: "B-8649", vendor: "Bainbridge", stockStatus: "here" },
      { kind: "glazing", itemCode: "Museum 18x24", vendor: "Larson", stockStatus: "here" },
    ],
    sharedMats: "Shared with pieces 1 and 2.",
    artDescription: "Watercolor, right panel. Cottonwoods.",
    artLocation: "Fitting wall",
    artCondition: "Good.",
    connectedOrders: "WO 51021 pieces 1 and 2. Do not release one panel alone.",
    additionalContact: "Designer Harper Quinn, 720-555-0199.",
    checked: 6,
    createdAt: "2026-11-09T16:03:00.000Z",
  },
  {
    id: "card-adele",
    list: "XStitch/Special Mount/Repairs",
    customerName: "Adele Fraser",
    phone: "303-555-0111",
    workOrderNumber: "50912",
    invoiceNumber: "20340",
    pieceIndex: 1,
    pieceCount: 1,
    size: "16x20",
    dueDate: "2026-11-19",
    startDate: "2026-11-04",
    labels: ["PAID IN FULL", "SANDWICH READY"],
    assignees: [AVERY],
    fields: { Frame: "Here (Metal Frame)", "Top Mat": "Here", Glazing: "Here", Art: "Here", "DO (Quantity)": "1" },
    materials: [
      { kind: "frame", itemCode: "Metal 16", vendor: "Larson", stockStatus: "here" },
      { kind: "top_mat", itemCode: "C-1013", vendor: "Crescent", stockStatus: "here" },
      { kind: "glazing", itemCode: "Regular 16x20", vendor: "Larson", stockStatus: "here" },
    ],
    artDescription: "Cross-stitch sampler. Special mount. Do not press the stitches.",
    artLocation: "Quality rack",
    artCondition: "Good.",
    checked: 6,
    createdAt: "2026-11-04T16:00:00.000Z",
    notes: [
      { author: "Avery Chen", userId: AVERY, body: "Check the lower-left corner. The mat looked slightly short on the bench.", at: "2026-11-18T14:10:00.000Z" },
    ],
  },
  {
    id: "card-chris",
    list: "Jersey Re-Do's",
    customerName: "Chris Daley",
    phone: "720-555-0194",
    workOrderNumber: "50770",
    invoiceNumber: "20190",
    pieceIndex: 1,
    pieceCount: 1,
    size: "20x30",
    dueDate: "2026-11-15",
    startDate: "2026-11-01",
    labels: ["RUSH", "See Notes"],
    assignees: [JORDAN],
    fields: { Frame: "Here & Joined", Glazing: "Customer", Art: "Here", "DO (Quantity)": "1" },
    materials: [
      { kind: "frame", itemCode: "LJ-12", vendor: "Larson", stockStatus: "here" },
      { kind: "glazing", itemCode: "Acrylic 20x30", vendor: "Larson", stockStatus: "here" },
    ],
    artDescription: "Game jersey redo. Lettering was crooked. Ready at the front counter.",
    artLocation: "Pickup wall",
    artCondition: "Good.",
    checked: 7,
    createdAt: "2026-11-01T16:00:00.000Z",
    notes: [
      { author: "Jordan Hale", userId: JORDAN, body: "Left a voicemail on the 15th. Texted again this morning.", at: "2026-11-18T15:30:00.000Z" },
    ],
  },
  {
    id: "card-naomi",
    list: "Completed 🎊",
    customerName: "Naomi Feldman",
    phone: "303-555-0107",
    workOrderNumber: "50601",
    invoiceNumber: "20080",
    pieceIndex: 1,
    pieceCount: 1,
    size: "9x12",
    dueDate: "2026-11-01",
    startDate: "2026-10-18",
    labels: ["PAID IN FULL", "SANDWICH READY"],
    assignees: [PRIYA],
    fields: { Frame: "Here & Joined", Glazing: "Here", Art: "Here", "DO (Quantity)": "1" },
    materials: [
      { kind: "frame", itemCode: "LJ-14", vendor: "Larson", stockStatus: "here" },
      { kind: "glazing", itemCode: "Regular 9x12", vendor: "Larson", stockStatus: "here" },
    ],
    artDescription: "Diploma. Picked up November 2.",
    artLocation: "Released",
    artCondition: "Good.",
    checked: 7,
    createdAt: "2026-10-18T16:00:00.000Z",
  },
  {
    id: "card-ready-archive",
    list: "Ready to be Archived",
    customerName: "Greta Holm",
    phone: "303-555-0155",
    workOrderNumber: "50540",
    invoiceNumber: "20040",
    pieceIndex: 1,
    pieceCount: 1,
    size: "11x14",
    dueDate: "2026-10-20",
    startDate: "2026-10-08",
    labels: ["Completed", "PAID IN FULL"],
    fields: { Frame: "Here (Metal Frame)", Glazing: "Here", Art: "Here", "DO (Quantity)": "1" },
    materials: [
      { kind: "frame", itemCode: "Metal 11", vendor: "Larson", stockStatus: "here" },
      { kind: "glazing", itemCode: "Regular 11x14", vendor: "Larson", stockStatus: "here" },
    ],
    artDescription: "Picked up. Waiting on Avery to archive the card.",
    checked: 7,
    createdAt: "2026-10-08T16:00:00.000Z",
  },
  {
    id: "card-archived",
    list: "Completed 🎊",
    customerName: "Paul Nguyen",
    phone: "720-555-0128",
    workOrderNumber: "50412",
    invoiceNumber: "19990",
    pieceIndex: 1,
    pieceCount: 1,
    size: "8x10",
    dueDate: "2026-09-30",
    startDate: "2026-09-12",
    labels: ["Completed", "PAID IN FULL"],
    archived: true,
    fields: { Frame: "Here & Joined", Art: "Here", "DO (Quantity)": "1" },
    materials: [
      { kind: "frame", itemCode: "LJ-14", vendor: "Larson", stockStatus: "here" },
      { kind: "glazing", itemCode: "Regular 8x10", vendor: "Larson", stockStatus: "here" },
    ],
    artDescription: "Archived after pickup.",
    checked: 7,
    createdAt: "2026-09-12T16:00:00.000Z",
    activity: [
      { actor: "Avery Chen", userId: AVERY, kind: "archived", summary: "Avery Chen archived this card.", at: "2026-10-05T16:00:00.000Z" },
    ],
  },
  {
    id: "card-text",
    list: "Text Messages",
    customerName: "Text · Elena Vasquez",
    phone: "303-555-0174",
    artDescription: "Thread about the triptych pickup.",
    notes: [
      { author: "Jordan Hale", userId: JORDAN, body: "Texted Elena that the center panel is in fitting and the set will be ready together.", at: "2026-11-18T16:45:00.000Z" },
      { author: "Elena Vasquez", body: "Reply: Thursday after 4 is perfect. Harper may come with me.", at: "2026-11-18T17:05:00.000Z" },
    ],
    createdAt: "2026-11-18T16:40:00.000Z",
  },
  {
    id: "card-estimate",
    list: "Estimates/Quotes",
    customerName: "Estimate · Northfield condo",
    phone: "303-555-0130",
    labels: ["Estimate", "Warm Lead"],
    artDescription: "Three photographs, 16x20, white metal, single mat, conservation glass. Not a work order yet.",
    additionalContact: "Designer: Mara Singh, 720-555-0170.",
    dueDate: "2026-11-20",
    checked: 0,
    createdAt: "2026-11-13T18:00:00.000Z",
    notes: [
      { author: "Avery Chen", userId: AVERY, body: "Quote sent. Waiting to hear if they want museum glass instead.", at: "2026-11-13T19:12:00.000Z" },
    ],
  },
  {
    id: "card-lead",
    list: "Sales Leads",
    customerName: "Lead · Jordan Ellis",
    phone: "303-555-0186",
    labels: ["Sales Lead", "Cool Lead"],
    artDescription: "Cherry Creek consult. 24x36 landscape, asked about museum glass and a linen mat.",
    artLocation: "Not in house",
    createdAt: "2026-11-17T21:00:00.000Z",
  },
];

export async function seedDemo(): Promise<{ inserted: number; skipped: boolean }> {
  const { ensureDatabase } = await import("./seed");
  await ensureDatabase();
  if ((process.env.NODE_ENV === "production" || isRemoteDatabase()) && process.env.ALLOW_DEMO_SEED !== "1") {
    throw new Error("Refusing to load demo cards into production or a remote database. Set ALLOW_DEMO_SEED=1 to override.");
  }

  const existing = await all<{ id: string }>("select id from cards");
  const demoIds = new Set(CARDS.map((card) => card.id));
  const foreign = existing.filter((row) => !demoIds.has(row.id));
  if (foreign.length) {
    throw new Error(`Refusing to add demo cards. This database already has ${foreign.length} card(s) that are not demo data.`);
  }
  const present = new Set(existing.map((row) => row.id));
  const pending = CARDS.filter((card) => !present.has(card.id));
  if (pending.length === 0) return { inserted: 0, skipped: true };

  const passwordHash = hashPassword(adminCredentials().password);
  const now = "2026-11-18T15:00:00.000Z";
  const users = [
    { id: AVERY, email: "avery.chen@masten.test", name: "Avery Chen", role: "staff" },
    { id: JORDAN, email: "jordan.hale@masten.test", name: "Jordan Hale", role: "staff" },
    { id: PRIYA, email: "priya.nandakumar@masten.test", name: "Priya Nandakumar", role: "staff" },
    { id: LUIS, email: "luis.ortega@masten.test", name: "Luis Ortega", role: "staff" },
  ];

  const listIds = new Map(LISTS.map((list) => [list.name, slugId("list", list.name)]));
  const labelIds = new Map(LABELS.map((label, index) => [label.name, `${slugId("label", label.name)}-${index}`]));
  const fieldIds = new Map(CUSTOM_FIELDS.map((field) => [field.name, slugId("field", field.name)]));

  const fileSizes = new Map<string, number>();
  for (const card of pending) {
    if (card.pdf && card.invoiceNumber) {
      const pdf = simplePdf(`Work order ${card.workOrderNumber}`, [
        `Customer: ${card.customerName}`,
        `Phone: ${card.phone ?? ""}`,
        `Invoice: ${card.invoiceNumber}`,
        `Piece: ${card.pieceIndex ?? 1} of ${card.pieceCount ?? 1}`,
        `Size: ${card.size ?? ""}`,
        `Due: ${card.dueDate ?? ""}`,
        `Art: ${card.artDescription ?? ""}`,
        `Location: ${card.artLocation ?? ""}`,
        `Condition: ${card.artCondition ?? ""}`,
        "Shop copy. Not a Lifesaver original.",
      ]);
      await saveUpload(`seed/${card.id}.pdf`, pdf);
      fileSizes.set(`seed/${card.id}.pdf`, pdf.length);
    }
    if (card.photoHue) {
      const svg = artSvg(card.customerName, `${card.size ?? ""}  ·  WO ${card.workOrderNumber ?? ""}`, card.photoHue);
      await saveUpload(`seed/${card.id}.svg`, svg);
      fileSizes.set(`seed/${card.id}.svg`, svg.length);
    }
  }

  await transaction(async (tx) => {
    const tops = await tx.all<{ list_id: string; max_position: number | null }>(
      "select list_id, max(position) as max_position from cards group by list_id",
    );
    const positionInList = new Map<string, number>();
    for (const row of tops) {
      positionInList.set(row.list_id, Number(row.max_position ?? 0) + 1000);
    }

    for (const user of users) {
      await tx.run(
        `insert into users (id, email, name, password_hash, role, created_at)
         select ?, ?, ?, ?, ?, ?
         where not exists (select 1 from users where email = ? or id = ?)`,
        [user.id, user.email, user.name, passwordHash, user.role, now, user.email, user.id],
      );
    }

    for (const card of pending) {
      const listId = listIds.get(card.list);
      if (!listId) throw new Error(`Unknown list ${card.list}`);
      const position = positionInList.get(listId) ?? 0;
      positionInList.set(listId, position + 1000);
      await tx.run(
        `insert into cards (
          id, list_id, position, archived, customer_name, phone, work_order_number, invoice_number,
          piece_index, piece_count, size, due_date, start_date, shared_mats, art_description,
          art_location, art_condition, connected_orders, additional_contact, customer_record_id,
          created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          card.id,
          listId,
          position,
          card.archived ? 1 : 0,
          card.customerName,
          card.phone ?? "",
          card.workOrderNumber ?? null,
          card.invoiceNumber ?? null,
          card.workOrderNumber ? (card.pieceIndex ?? 1) : null,
          card.workOrderNumber ? (card.pieceCount ?? 1) : null,
          card.size ?? "",
          card.dueDate ?? null,
          card.startDate ?? null,
          card.sharedMats ?? "",
          card.artDescription ?? "",
          card.artLocation ?? "",
          card.artCondition ?? "",
          card.connectedOrders ?? "",
          card.additionalContact ?? "",
          card.customerRecordId ?? null,
          card.createdAt,
          card.createdAt,
        ],
      );

      for (const labelName of card.labels ?? []) {
        const labelId = labelIds.get(labelName);
        if (!labelId) throw new Error(`Unknown label ${labelName}`);
        await tx.run("insert into card_labels (card_id, label_id) values (?, ?)", [card.id, labelId]);
      }
      for (const userId of card.assignees ?? []) {
        await tx.run("insert into card_assignees (card_id, user_id) values (?, ?)", [card.id, userId]);
      }
      for (const [fieldName, optionLabel] of Object.entries(card.fields ?? {})) {
        const fieldId = fieldIds.get(fieldName);
        if (!fieldId) throw new Error(`Unknown field ${fieldName}`);
        await tx.run("insert into card_field_values (card_id, field_id, option_label) values (?, ?, ?)", [
          card.id,
          fieldId,
          optionLabel,
        ]);
      }
      for (const [index, line] of (card.materials ?? []).entries()) {
        await tx.run(
          "insert into material_lines (id, card_id, position, kind, item_code, vendor, stock_status) values (?, ?, ?, ?, ?, ?, ?)",
          [`${card.id}-m${index}`, card.id, index, line.kind, line.itemCode, line.vendor, line.stockStatus],
        );
      }
      if (card.workOrderNumber || card.checked !== undefined) {
        const checklistId = `${card.id}-check`;
        await tx.run("insert into checklists (id, card_id, title, position) values (?, ?, ?, ?)", [
          checklistId,
          card.id,
          PRODUCTION_CHECKLIST.title,
          0,
        ]);
        for (const [index, text] of PRODUCTION_CHECKLIST.items.entries()) {
          await tx.run(
            "insert into checklist_items (id, checklist_id, text, checked, position) values (?, ?, ?, ?, ?)",
            [`${checklistId}-${index}`, checklistId, text, index < (card.checked ?? 0) ? 1 : 0, index],
          );
        }
      }
      for (const [index, note] of (card.notes ?? []).entries()) {
        await tx.run(
          "insert into notes (id, card_id, author_name, author_user_id, body, created_at) values (?, ?, ?, ?, ?, ?)",
          [`${card.id}-n${index}`, card.id, note.author, note.userId ?? null, note.body, note.at],
        );
      }
      const events: Event[] = [
        ...(card.activity ?? [
          {
            actor: "Avery Chen",
            userId: AVERY,
            kind: "created",
            summary: "Avery Chen created this card.",
            at: card.createdAt,
          },
        ]),
      ];
      for (const [index, event] of events.entries()) {
        await tx.run(
          "insert into activity (id, card_id, actor_name, actor_user_id, kind, summary, created_at) values (?, ?, ?, ?, ?, ?, ?)",
          [`${card.id}-a${index}`, card.id, event.actor, event.userId ?? null, event.kind, event.summary, event.at],
        );
      }
      if (card.pdf && card.invoiceNumber) {
        await tx.run(
          "insert into attachments (id, card_id, filename, mime_type, byte_size, storage_key, is_cover, created_at) values (?, ?, ?, ?, ?, ?, 0, ?)",
          [`${card.id}-pdf`, card.id, `${card.invoiceNumber}.pdf`, "application/pdf", fileSizes.get(`seed/${card.id}.pdf`) ?? 0, `seed/${card.id}.pdf`, card.createdAt],
        );
      }
      if (card.photoHue) {
        await tx.run(
          "insert into attachments (id, card_id, filename, mime_type, byte_size, storage_key, is_cover, created_at) values (?, ?, ?, ?, ?, ?, 1, ?)",
          [`${card.id}-photo`, card.id, `art-${card.workOrderNumber}.svg`, "image/svg+xml", fileSizes.get(`seed/${card.id}.svg`) ?? 0, `seed/${card.id}.svg`, card.createdAt],
        );
      }
    }
  });

  return { inserted: pending.length, skipped: false };
}
