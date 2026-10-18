"use client";

import { toast } from "sonner";

import { useAllOutlets } from "@/features/outlets";
import { Checkbox } from "@/shared/ui/checkbox";
import { TableFrame } from "@/shared/ui/table-frame";

import { type PaymentMethod, useSetMethodOutlets } from "../application/use-payment-methods";

/** Methods × outlets of every brand: a tick = the outlet takes the method. */
export function OutletMatrix({ methods }: { methods: PaymentMethod[] }) {
  const outlets = useAllOutlets();
  const setOutlets = useSetMethodOutlets();
  if (!outlets.data || outlets.data.length === 0) return null;

  const toggle = (m: PaymentMethod, outletId: string, on: boolean) =>
    setOutlets.mutate(
      { id: m.id, outletIds: on ? [...m.outlet_ids, outletId] : m.outlet_ids.filter((o) => o !== outletId) },
      { onError: () => toast.error("Gagal menyimpan") },
    );

  return (
    <div className="space-y-2">
      <h2 className="font-semibold">Dipakai di outlet</h2>
      <TableFrame>
        <table aria-label="Metode bayar per outlet" className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Metode</th>
              {outlets.data.map((o) => (
                <th key={o.id} className="px-3 py-2 text-center font-medium">
                  {o.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {methods.map((m) => (
              <tr key={m.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-medium">{m.name}</td>
                {outlets.data.map((o) => (
                  <td key={o.id} className="px-3 py-2 text-center">
                    <Checkbox className="mx-auto" aria-label={`${m.name} di ${o.name}`} checked={m.outlet_ids.includes(o.id)} onCheckedChange={(on) => toggle(m, o.id, on === true)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </TableFrame>
    </div>
  );
}
