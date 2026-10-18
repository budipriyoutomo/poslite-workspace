"use client";

import { toast } from "sonner";

import { useMe } from "@/features/auth";
import { formatDate } from "@/shared/format";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { ConfirmButton } from "@/shared/ui/confirm-button";
import { TableFrame } from "@/shared/ui/table-frame";

import { useOperators, useSetOperatorDisabled } from "../application/use-operators";
import { NewOperatorDialog } from "./NewOperatorDialog";

export function OperatorsScreen() {
  const operators = useOperators();
  const me = useMe();
  const setDisabled = useSetOperatorDisabled();
  const change = (id: string, disabled: boolean) => setDisabled.mutate({ id, disabled }, { onError: () => toast.error("Gagal mengubah status operator") });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Operator</h1>
          <p className="text-sm text-muted-foreground">Tim internal yang bisa membuka konsol ini. Semua aksi mereka tercatat di Audit Log.</p>
        </div>
        <NewOperatorDialog />
      </div>
      <TableFrame>
        <table aria-label="Operator" className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Nama</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Dibuat</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {operators.data?.map((o) => {
              const isMe = o.id === me.data?.id;
              return (
                <tr key={o.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">
                    {o.name} {isMe && <span className="text-xs text-muted-foreground">Anda</span>}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{o.email}</td>
                  <td className="px-3 py-2">{formatDate(o.created_at)}</td>
                  <td className="px-3 py-2">{o.disabled_at ? <Badge variant="secondary">Nonaktif</Badge> : <Badge>Aktif</Badge>}</td>
                  <td className="px-3 py-2 text-right">
                    {o.disabled_at ? (
                      <Button size="sm" variant="outline" aria-label={`Aktifkan ${o.name}`} onClick={() => change(o.id, false)}>
                        Aktifkan
                      </Button>
                    ) : (
                      !isMe && (
                        <ConfirmButton
                          label={`Nonaktifkan ${o.name}`}
                          title={`Nonaktifkan ${o.name}?`}
                          description="Semua sesi login operator ini langsung berakhir dan ia tidak bisa login sampai diaktifkan lagi."
                          confirm="Nonaktifkan"
                          onConfirm={() => change(o.id, true)}
                        >
                          Nonaktifkan
                        </ConfirmButton>
                      )
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableFrame>
    </div>
  );
}
