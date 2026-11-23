"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { changeMaterialStatus } from "@/app/actions";
import { Button } from "@/components/ui/button";
import type { OrderLine } from "@/lib/board-types";
import { formatShopDate } from "@/lib/format";

const VENDOR_ORDER = ["Larson", "Crescent", "Bainbridge", "Artique", "CDNV"];

export function ToOrderView({ lines }: { lines: OrderLine[] }) {
  const [showOrdered, setShowOrdered] = useState(false);
  const visible = lines.filter((line) => (showOrdered ? line.stockStatus === "ordered" : line.stockStatus === "not_in_stock"));
  const groups = useMemo(() => groupLines(visible), [visible]);
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold leading-snug">To order</h1>
            <p className="mt-1 max-w-2xl text-base leading-relaxed text-muted-foreground">
              Every Not In Stock line on an open production card, grouped by vendor. This replaces the vendor card.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant={showOrdered ? "outline" : "default"} onClick={() => setShowOrdered(false)}>
              Not in stock ({lines.filter((line) => line.stockStatus === "not_in_stock").length})
            </Button>
            <Button variant={showOrdered ? "default" : "outline"} onClick={() => setShowOrdered(true)}>
              Ordered ({lines.filter((line) => line.stockStatus === "ordered").length})
            </Button>
          </div>
        </div>
        {groups.length === 0 ? (
          <p className="mt-10 rounded-xl border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            {showOrdered
              ? "Nothing is marked Ordered on an open job."
              : "Nothing to order. Open jobs are in stock, here, or already on a vendor order."}
          </p>
        ) : (
          <div className="mt-6 space-y-6">
            {groups.map((group) => (
              <section key={group.vendor} className="overflow-hidden rounded-xl border bg-card">
                <header className="flex items-center justify-between border-b bg-[#f7f3ea] px-4 py-3">
                  <h2 className="text-2xl font-semibold leading-snug">{group.vendor}</h2>
                  <span className="text-sm text-muted-foreground">{group.lines.length} lines</span>
                </header>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="text-sm font-medium text-zinc-600">
                      <tr>
                        <th className="px-4 py-2 font-medium">Item</th>
                        <th className="px-4 py-2 font-medium">Kind</th>
                        <th className="px-4 py-2 font-medium">Job</th>
                        <th className="px-4 py-2 font-medium">Due</th>
                        <th className="px-4 py-2 font-medium" />
                      </tr>
                    </thead>
                    <tbody>
                      {group.lines.map((line) => (
                        <OrderRow key={line.materialId} line={line} orderedView={showOrdered} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function OrderRow({ line, orderedView }: { line: OrderLine; orderedView: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <tr className="border-t">
      <td className="px-4 py-3 font-medium">{line.itemCode}</td>
      <td className="px-4 py-3">{line.kindLabel}</td>
      <td className="px-4 py-3">
        <Link href={`/cards/${line.cardId}`} className="underline">{line.customerName}</Link>
        <div className="text-sm leading-snug text-zinc-600">
          {line.workOrderNumber ? `W.O.${line.workOrderNumber}` : "No W.O."}
          {line.invoiceNumber ? ` · Inv.${line.invoiceNumber}` : ""}
          {line.pieceCount ? ` · ${line.pieceIndex}/${line.pieceCount}` : ""} {line.size}
          {" · "}{line.listName}
        </div>
      </td>
      <td className={`px-4 py-3 ${line.overdue ? "font-semibold text-red-700" : ""}`}>
        {line.dueDate ? formatShopDate(line.dueDate) : "—"}
        {line.overdue ? " overdue" : ""}
      </td>
      <td className="px-4 py-3 text-right">
        <Button
          size="sm"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              const result = await changeMaterialStatus(line.materialId, orderedView ? "here" : "ordered", line.cardId);
              if (!result.ok) toast.error(result.error);
              else toast.success(orderedView ? "Marked here" : "Marked ordered");
              router.refresh();
            });
          }}
        >
          {orderedView ? "Mark here" : "Mark ordered"}
        </Button>
      </td>
    </tr>
  );
}

function groupLines(lines: OrderLine[]) {
  const map = new Map<string, OrderLine[]>();
  for (const line of lines) {
    const bucket = map.get(line.vendor) ?? [];
    bucket.push(line);
    map.set(line.vendor, bucket);
  }
  return [...map.entries()]
    .sort((a, b) => {
      const ai = VENDOR_ORDER.indexOf(a[0]);
      const bi = VENDOR_ORDER.indexOf(b[0]);
      if (ai === -1 && bi === -1) return a[0].localeCompare(b[0]);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    })
    .map(([vendor, group]) => ({ vendor, lines: group }));
}
