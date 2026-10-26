"use client";

import { Armchair, ShoppingBag } from "lucide-react";
import { useState } from "react";

import { useSession } from "@/features/auth";
import { getDb } from "@/shared/db";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";

import { useServiceMode } from "../application/shared-bills";
import { useDiningTables } from "../application/use-bills";
import { useTables } from "../application/use-tables";
import { copy } from "../copy";
import { TableBoard } from "./TableBoard";
import { TableDetail } from "./TableDetail";
import { TablePicker } from "./TablePicker";
import { useTableActions } from "./use-table-actions";

/** The table screen (15 · UX-04): every table's status, the chosen table's order and what to do next. */
export function TablesScreen() {
  const data = useTables();
  const diningTables = useDiningTables();
  const serviceMode = useServiceMode();
  const role = useSession((s) => s.user?.role);
  const actions = useTableActions(data?.pricing);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  if (!data || !diningTables) return null;
  const selected = data.tiles.find((t) => t.key === selectedKey) ?? null;

  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold">{copy.title}</h1>
          <p className="text-sm text-muted-foreground">{actions.isShared ? copy.sharedHint : copy.localTables}</p>
        </div>
        <Button variant="outline" onClick={actions.withoutTable}>
          <ShoppingBag /> {copy.noTable}
        </Button>
      </div>
      {serviceMode?.pending && (
        <p role="status" className="rounded-md bg-warning/10 p-3 text-sm text-warning">
          {copy.modePending}
        </p>
      )}
      {data.tiles.length === 0 ? (
        <EmptyState icon={Armchair} title={copy.empty} />
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-[1fr_20rem]">
          <TableBoard tiles={data.tiles} areas={data.areas} totalOf={data.totalOf} selectedKey={selectedKey} onSelect={(t) => setSelectedKey(t.key)} />
          <div className="md:sticky md:top-0">
            {selected ? (
              <TableDetail
                tile={selected}
                total={selected.bill ? data.totalOf(selected.bill) : 0}
                canPay={role !== "waiter"}
                onOpen={() => actions.open({ tableId: selected.tableId, label: selected.label })}
                onAddOrder={() => selected.bill && void actions.resume(selected.bill, "/sell")}
                onPrint={() => selected.bill && void actions.print(selected.bill)}
                onPay={() => selected.bill && void actions.resume(selected.bill, "/checkout")}
                onSplit={() => selected.bill && void actions.resume(selected.bill, "/checkout?split=1")}
                onMove={() => actions.setMoving(selected.bill)}
                onCancel={() => selected.bill && void actions.cancel(selected.bill)}
                onDismissConflict={() => selected.bill && void getDb().openBills.update(selected.bill.id, { conflict: null })}
              />
            ) : (
              <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{copy.chooseTable}</p>
            )}
          </div>
        </div>
      )}
      {actions.moving && (
        <TablePicker
          tables={diningTables}
          bills={data.bills}
          totalOf={data.totalOf}
          onPick={(table) => actions.moving && void actions.move(actions.moving, table)}
          onClose={() => actions.setMoving(null)}
        />
      )}
      {actions.voidDialog}
    </div>
  );
}
