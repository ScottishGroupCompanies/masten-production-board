import type { MaterialKind, StockStatus } from "@/data/board-schema";

export type MaterialView = {
  id: string;
  kind: MaterialKind;
  itemCode: string;
  vendor: string;
  stockStatus: StockStatus;
  position: number;
};

export type LabelView = { id: string; name: string; color: string };
export type PersonView = { id: string; name: string };

export type BoardCard = {
  id: string;
  listId: string;
  position: number;
  archived: boolean;
  title: string;
  customerName: string;
  phone: string;
  workOrderNumber: string | null;
  invoiceNumber: string | null;
  pieceIndex: number | null;
  pieceCount: number | null;
  size: string;
  dueDate: string | null;
  startDate: string | null;
  overdue: boolean;
  labels: LabelView[];
  assignees: PersonView[];
  materials: MaterialView[];
  needsReview: boolean;
};

export type BoardData = {
  today: string;
  lists: { id: string; name: string; kind: string; position: number }[];
  labels: LabelView[];
  users: { id: string; name: string; email: string; role: string }[];
  cards: BoardCard[];
};

export type CardDetail = BoardCard & {
  listName: string;
  listKind: string;
  sharedMats: string;
  artDescription: string;
  artLocation: string;
  artCondition: string;
  connectedOrders: string;
  additionalContact: string;
  customerRecordId: string | null;
  customerRecordName: string | null;
  fields: { id: string; name: string; value: string; options: string[] }[];
  notes: { id: string; authorName: string; body: string; createdAt: string }[];
  checklists: { id: string; title: string; items: { id: string; text: string; checked: boolean }[] }[];
  attachments: { id: string; filename: string; mimeType: string; byteSize: number; createdAt: string; isCover: boolean }[];
  activity: { id: string; actorName: string; kind: string; summary: string; createdAt: string }[];
  siblings: { id: string; title: string; listName: string; pieceIndex: number | null }[];
  linkedOrders: { id: string; title: string; listName: string }[];
  customerRecords: { id: string; name: string }[];
};

export type OrderLine = {
  materialId: string;
  kind: string;
  kindLabel: string;
  itemCode: string;
  vendor: string;
  stockStatus: StockStatus;
  cardId: string;
  customerName: string;
  workOrderNumber: string | null;
  invoiceNumber: string | null;
  pieceIndex: number | null;
  pieceCount: number | null;
  size: string;
  dueDate: string | null;
  overdue: boolean;
  listName: string;
  title: string;
};

export type Actor = { name: string; userId: string | null };

export type CardInput = {
  listName?: string;
  listId?: string;
  forceList?: boolean;
  customerName: string;
  phone?: string;
  workOrderNumber?: string | null;
  invoiceNumber?: string | null;
  pieceIndex?: number | null;
  pieceCount?: number | null;
  size?: string;
  dueDate?: string | null;
  startDate?: string | null;
  sharedMats?: string;
  artDescription?: string;
  artLocation?: string;
  artCondition?: string;
  connectedOrders?: string;
  additionalContact?: string;
  customerRecordId?: string | null;
  labelNames?: string[];
  assigneeEmails?: string[];
  customFields?: Record<string, string>;
  materials?: { kind: string; itemCode: string; vendor?: string; stockStatus?: string }[];
  replaceMaterials?: boolean;
  ensureDefaults?: boolean;
};

export class CardError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
