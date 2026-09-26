"use client";

import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { useOutlets } from "@/features/outlets";
import { ApiError } from "@/shared/api";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { FormField, selectClass } from "@/shared/ui/form-field";
import { Input } from "@/shared/ui/input";

import { isValidPin, ROLES, type Role, type User, useCreateUser, useUpdateUser } from "../application/use-users";

const ERRORS: Record<string, string> = { EMAIL_TAKEN: "Email sudah terdaftar" };

/**
 * One role for all of the user's outlets (the common case). Cashiers get only a PIN; managers and
 * owners also log in to the back-office, so they need an email and password.
 */
export function UserForm({ user, onDone }: { user?: User; onDone: () => void }) {
  const outlets = useOutlets();
  const create = useCreateUser();
  const update = useUpdateUser();
  const [name, setName] = useState(user?.name ?? "");
  const [role, setRole] = useState<Role>(user?.outlets[0]?.role ?? "cashier");
  const [outletIds, setOutletIds] = useState<string[]>(user?.outlets.map((o) => o.outlet_id) ?? []);
  const [isActive, setIsActive] = useState(user?.is_active ?? true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const needsLogin = !user && role !== "cashier";
  const pinOk = pin === "" ? role !== "cashier" : isValidPin(pin);
  const canSave = name.trim() !== "" && outletIds.length > 0 && (user !== undefined || (pinOk && (!needsLogin || (email.includes("@") && password.length >= 8))));
  const pending = create.isPending || update.isPending;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    const assignments = (outlets.data ?? []).filter((o) => outletIds.includes(o.id)).map((o) => ({ outlet_id: o.id, role }));
    const callbacks = {
      onSuccess: () => (toast.success("Pengguna disimpan"), onDone()),
      onError: (err: Error) => toast.error(err instanceof ApiError ? (ERRORS[err.code] ?? err.message) : "Gagal menyimpan"),
    };
    if (user) {
      update.mutate({ id: user.id, body: { name: name.trim(), is_active: isActive, outlets: assignments } }, callbacks);
    } else {
      const login = needsLogin ? { email: email.trim(), password } : { email: null, password: null };
      create.mutate({ name: name.trim(), ...login, pin: pin || null, outlets: assignments }, callbacks);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <FormField id="user-name" label="Nama">
        <Input id="user-name" value={name} onChange={(e) => setName(e.target.value)} />
      </FormField>
      <FormField id="user-role" label="Peran">
        <select id="user-role" className={selectClass} value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </FormField>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Outlet</legend>
        {outlets.data?.map((o) => (
          <label key={o.id} className="flex items-center gap-2 text-sm">
            <Checkbox aria-label={o.name} checked={outletIds.includes(o.id)} onCheckedChange={(on) => setOutletIds((ids) => (on ? [...ids, o.id] : ids.filter((i) => i !== o.id)))} />
            {o.name}
          </label>
        ))}
      </fieldset>
      {needsLogin && (
        <div className="grid grid-cols-2 gap-3">
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
            placeholder={role === "cashier" ? "4–6 angka" : "Opsional, untuk login di kasir"}
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
      <Button type="submit" className="w-full" disabled={!canSave || pending}>
        Simpan
      </Button>
    </form>
  );
}
