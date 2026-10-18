"use client";

import { Plus, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { useBrands } from "@/features/brands";
import { useAllOutlets } from "@/features/outlets";
import { ApiError } from "@/shared/api";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { FormField, selectClass } from "@/shared/ui/form-field";
import { Input } from "@/shared/ui/input";

import { isValidPin, ROLES, type Role, type User, useCreateUser, useUpdateUser } from "../application/use-users";
import { type AssignmentRow, fromRow, problem, scopeOptions, toRow } from "../domain/assignments";

const ERRORS: Record<string, string> = {
  EMAIL_TAKEN: "Email sudah terdaftar",
  LAST_OWNER: "Perusahaan butuh pemilik lain dulu",
  INVALID_ASSIGNMENT: "Periksa kembali penugasan",
};

/**
 * Roles over the whole company, a brand, or an outlet (ADR-022). Cashiers get only a PIN;
 * managers and owners also log in to the back-office, so they need an email and password.
 */
export function UserForm({ user, onDone }: { user?: User; onDone: () => void }) {
  const brands = useBrands();
  const outlets = useAllOutlets();
  const create = useCreateUser();
  const update = useUpdateUser();
  const options = scopeOptions(brands.data ?? [], outlets.data ?? []);
  const firstOutlet = options.find((o) => o.value.startsWith("outlet:"))?.value;
  const [name, setName] = useState(user?.name ?? "");
  const [rows, setRows] = useState<AssignmentRow[] | null>(user ? user.assignments.map(toRow) : null);
  const [isActive, setIsActive] = useState(user?.is_active ?? true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  // A new user starts as a cashier at the first outlet, once the outlets have loaded.
  const current = rows ?? (firstOutlet ? [{ role: "cashier" as Role, scope: firstOutlet }] : []);
  const needsLogin = !user && current.some((r) => r.role !== "cashier");
  const onlyCashier = current.every((r) => r.role === "cashier");
  const pinOk = pin === "" ? !onlyCashier : isValidPin(pin);
  const rowsOk = current.length > 0 && current.every((r) => problem(r) === null);
  const canSave = name.trim() !== "" && rowsOk && (user !== undefined || (pinOk && (!needsLogin || (email.includes("@") && password.length >= 8))));
  const pending = create.isPending || update.isPending;
  const failure = create.error ?? update.error;
  const error = failure instanceof ApiError ? (ERRORS[failure.code] ?? failure.message) : failure && "Gagal menyimpan";

  const change = (i: number, patch: Partial<AssignmentRow>) => setRows(current.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    const assignments = current.map(fromRow);
    const callbacks = { onSuccess: () => (toast.success("Pengguna disimpan"), onDone()) };
    if (user) {
      update.mutate({ id: user.id, body: { name: name.trim(), is_active: isActive }, assignments }, callbacks);
    } else {
      const login = needsLogin ? { email: email.trim(), password } : { email: null, password: null };
      // `outlets` is the older per-outlet form of roles; this form sends assignments only.
      create.mutate({ name: name.trim(), ...login, pin: pin || null, assignments, outlets: [] }, callbacks);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <FormField id="user-name" label="Nama">
        <Input id="user-name" value={name} onChange={(e) => setName(e.target.value)} />
      </FormField>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Penugasan</legend>
        {current.map((row, i) => (
          <div key={i} className="space-y-1">
            <div className="flex gap-2">
              <select aria-label={`Peran ${i + 1}`} className={`${selectClass} w-32`} value={row.role} onChange={(e) => change(i, { role: e.target.value as Role })}>
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <select aria-label={`Cakupan ${i + 1}`} className={selectClass} value={row.scope} onChange={(e) => change(i, { scope: e.target.value })}>
                {options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Hapus penugasan ${i + 1}`} disabled={current.length === 1} onClick={() => setRows(current.filter((_, j) => j !== i))}>
                <X />
              </Button>
            </div>
            {problem(row) && <p className="text-xs text-destructive">{problem(row)}</p>}
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setRows([...current, { role: "cashier", scope: firstOutlet ?? "company" }])}>
          <Plus /> Tambah penugasan
        </Button>
      </fieldset>
      {needsLogin && (
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField id="user-email" label="Email">
            <Input id="user-email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
          </FormField>
          <FormField id="user-password" label="Password">
            <Input id="user-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </FormField>
        </div>
      )}
      {!user && (
        <FormField id="user-pin" label="PIN">
          <Input
            id="user-pin"
            inputMode="numeric"
            autoComplete="off"
            placeholder={onlyCashier ? "4–6 angka" : "Opsional, untuk login di kasir"}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          />
        </FormField>
      )}
      {user && (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox aria-label="Aktif" checked={isActive} onCheckedChange={(on) => setIsActive(on === true)} /> Aktif
        </label>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={!canSave || pending}>
        Simpan
      </Button>
    </form>
  );
}
