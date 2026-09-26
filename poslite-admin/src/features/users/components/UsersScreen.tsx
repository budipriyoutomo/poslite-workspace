"use client";

import { Pencil, Plus } from "lucide-react";
import { useState } from "react";

import { useOutlets } from "@/features/outlets";
import { ApiError } from "@/shared/api";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { ConfirmDelete } from "@/shared/ui/confirm-delete";
import { EditDialog } from "@/shared/ui/edit-dialog";

import { roleLabel, type User, useDeleteUser, useUsers } from "../application/use-users";
import { ChangePinDialog } from "./ChangePinDialog";
import { UserForm } from "./UserForm";

const DELETE_ERRORS: Record<string, string> = { CANNOT_DELETE_SELF: "Tidak bisa menghapus akun sendiri" };

export function UsersScreen() {
  const users = useUsers();
  const outlets = useOutlets();
  const remove = useDeleteUser();
  const [editing, setEditing] = useState<User | "new" | null>(null);
  const outletName = new Map(outlets.data?.map((o) => [o.id, o.name]));
  const deleteError = remove.error instanceof ApiError ? (DELETE_ERRORS[remove.error.code] ?? remove.error.message) : remove.error && "Gagal menghapus";

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pengguna</h1>
          <p className="text-sm text-muted-foreground">Kasir masuk di perangkat dengan PIN; manajer dan pemilik juga bisa masuk ke back-office.</p>
        </div>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus /> Tambah pengguna
        </Button>
      </div>
      {deleteError && (
        <p role="alert" className="text-sm text-destructive">
          {deleteError}
        </p>
      )}
      <table aria-label="Pengguna" className="w-full rounded-lg border bg-white text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="px-3 py-2 font-medium">Nama</th>
            <th className="px-3 py-2 font-medium">Peran</th>
            <th className="px-3 py-2 font-medium">Outlet</th>
            <th className="px-3 py-2 font-medium">Login</th>
            <th className="w-32" />
          </tr>
        </thead>
        <tbody>
          {users.data?.map((u) => (
            <tr key={u.id} className="border-b last:border-0">
              <td className="px-3 py-2 font-medium">{u.name}</td>
              <td className="px-3 py-2">
                {u.outlets[0] ? roleLabel(u.outlets[0].role) : "—"} {!u.is_active && <Badge variant="secondary">Nonaktif</Badge>}
              </td>
              <td className="px-3 py-2">{u.outlets.map((o) => outletName.get(o.outlet_id) ?? "—").join(", ")}</td>
              <td className="px-3 py-2 text-muted-foreground">
                {[u.email, u.has_pin ? "PIN" : null].filter(Boolean).join(" · ") || "—"}
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap">
                <Button variant="ghost" size="icon-sm" aria-label={`Ubah ${u.name}`} onClick={() => setEditing(u)}>
                  <Pencil />
                </Button>
                <ChangePinDialog user={u} />
                <ConfirmDelete name={u.name} onConfirm={() => remove.mutate(u.id)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <EditDialog title={editing === "new" ? "Pengguna baru" : "Ubah pengguna"} open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <UserForm user={editing === "new" || editing === null ? undefined : editing} onDone={() => setEditing(null)} />
      </EditDialog>
    </div>
  );
}
