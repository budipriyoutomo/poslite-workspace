"use client";

import { Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ApiError } from "@/shared/api";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { ConfirmButton } from "@/shared/ui/confirm-button";
import { EditDialog } from "@/shared/ui/edit-dialog";
import { TableFrame } from "@/shared/ui/table-frame";

import { type TenantUser, useResetPassword, useSetUserActive } from "../application/use-tenants";
import { errorMessage, roleLabels } from "../domain/labels";

const failure = (error: unknown, fallback: string) => errorMessage(error instanceof ApiError ? error.code : undefined, error instanceof ApiError ? error.message : fallback);

/** Support actions on a tenant's users; a reset password is shown once and never kept. */
export function TenantUsersTable({ tenantId, users }: { tenantId: string; users: TenantUser[] }) {
  const reset = useResetPassword(tenantId);
  const setActive = useSetUserActive(tenantId);
  const [problem, setProblem] = useState<string | null>(null);
  const [temporary, setTemporary] = useState<{ name: string; password: string } | null>(null);

  const resetPassword = (user: TenantUser) => {
    setProblem(null);
    reset.mutate(user.id, {
      onSuccess: (r) => setTemporary({ name: user.name, password: r.password }),
      onError: (error) => setProblem(failure(error, "Gagal mereset password")),
    });
  };
  const toggle = (user: TenantUser) => {
    setProblem(null);
    setActive.mutate(
      { userId: user.id, active: !user.is_active },
      {
        onSuccess: () => toast.success(user.is_active ? `${user.name} dinonaktifkan` : `${user.name} diaktifkan`),
        onError: (error) => setProblem(failure(error, "Gagal mengubah status user")),
      },
    );
  };

  return (
    <div className="space-y-2">
      {problem && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {problem}
        </p>
      )}
      <TableFrame>
        <table aria-label="Pengguna" className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Nama</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Peran</th>
              <th className="px-3 py-2 font-medium">Login</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} data-user={u.name} className="border-b last:border-0">
                <td className="px-3 py-2 font-medium">{u.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{u.email ?? "—"}</td>
                <td className="px-3 py-2">{roleLabels(u.roles)}</td>
                <td className="px-3 py-2">{u.has_login ? "Email & password" : "PIN saja"}</td>
                <td className="px-3 py-2">{u.is_active ? <Badge>Aktif</Badge> : <Badge variant="secondary">Nonaktif</Badge>}</td>
                <td className="space-x-2 px-3 py-2 text-right whitespace-nowrap">
                  {u.has_login && (
                    <ConfirmButton
                      label={`Reset password ${u.name}`}
                      title={`Reset password ${u.name}?`}
                      description="Password lama langsung tidak berlaku dan semua sesi login user ini berakhir. Password sementara hanya ditampilkan sekali."
                      confirm="Reset password"
                      onConfirm={() => resetPassword(u)}
                    >
                      Reset password
                    </ConfirmButton>
                  )}
                  {u.is_active ? (
                    <ConfirmButton
                      label={`Nonaktifkan ${u.name}`}
                      title={`Nonaktifkan ${u.name}?`}
                      description="User tidak bisa login di back-office maupun POS sampai diaktifkan lagi."
                      confirm="Nonaktifkan"
                      onConfirm={() => toggle(u)}
                    >
                      Nonaktifkan
                    </ConfirmButton>
                  ) : (
                    <Button size="sm" variant="outline" aria-label={`Aktifkan ${u.name}`} onClick={() => toggle(u)}>
                      Aktifkan
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableFrame>
      <EditDialog title="Password sementara" open={temporary !== null} onOpenChange={(open) => !open && setTemporary(null)}>
        {temporary && (
          <div className="space-y-3">
            <p className="text-sm">
              Berikan password ini ke <strong>{temporary.name}</strong> lewat kanal yang aman, lalu minta ia menggantinya. Password tidak bisa ditampilkan lagi.
            </p>
            <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
              <code className="flex-1 font-mono text-base">{temporary.password}</code>
              <Button
                size="sm"
                variant="ghost"
                aria-label="Salin password"
                onClick={() => navigator.clipboard?.writeText(temporary.password).then(() => toast.success("Password disalin"))}
              >
                <Copy />
              </Button>
            </div>
          </div>
        )}
      </EditDialog>
    </div>
  );
}
