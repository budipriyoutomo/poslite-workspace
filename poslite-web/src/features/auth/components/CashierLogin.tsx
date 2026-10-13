"use client";

import { UserRound } from "lucide-react";
import { type ReactNode, useState } from "react";

import type { UserRow } from "@/shared/db";
import { AppError } from "@/shared/errors";

import { copy } from "../copy";
import { PinPad } from "./PinPad";

function errorMessage(error: unknown): string {
  if (!(error instanceof AppError)) return String(error);
  if (error.code === "PIN_LOCKED") {
    const until = new Date(String(error.details.lockedUntil)).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
    return copy.errors.PIN_LOCKED(until);
  }
  return copy.errors[error.code as "WRONG_PIN" | "UNKNOWN_USER"] ?? error.code;
}

/**
 * Pick a name, then the PIN (03-offline-sync, Offline Auth). Opens on the last cashier who logged
 * in on this device, so the usual return to the till is just the PIN; "Ganti kasir" shows everyone.
 */
export function CashierLogin({
  users,
  lastUserId,
  onLogin,
  header,
  children,
}: {
  users: UserRow[];
  lastUserId?: string;
  onLogin: (user: UserRow, pin: string) => Promise<void>;
  header?: ReactNode;
  children?: ReactNode;
}) {
  // undefined = not chosen yet → the last cashier; null = the cashier list.
  const [picked, setPicked] = useState<UserRow | null>();
  const selected = picked === undefined ? (users.find((u) => u.id === lastUserId) ?? null) : picked;
  const [error, setError] = useState<string>();
  const [isChecking, setIsChecking] = useState(false);

  const submit = async (pin: string) => {
    if (!selected) return;
    setIsChecking(true);
    setError(undefined);
    try {
      await onLogin(selected, pin);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <>
      <div className="mb-8 text-center">
        {header}
        <p className="mt-1 text-sm text-slate-400">{selected ? copy.enterPin(selected.name) : copy.pickCashier}</p>
      </div>
      <div className="rounded-2xl border border-white/20 bg-white/10 p-6 shadow-2xl backdrop-blur-md">
        {selected ? (
          <>
            <PinPad onComplete={submit} disabled={isChecking} error={isChecking ? copy.checking : error} />
            <button type="button" className="mt-5 w-full text-sm text-slate-300 hover:text-white" onClick={() => (setPicked(null), setError(undefined))}>
              {copy.back}
            </button>
          </>
        ) : (
          <ul className="grid grid-cols-2 gap-3">
            {users.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => setPicked(u)}
                  className="flex w-full flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/10 p-4 text-white hover:bg-white/20"
                >
                  <UserRound className="size-8 text-emerald-300" />
                  <span className="font-semibold">{u.name}</span>
                  <span className="text-xs text-slate-400">{copy.roles[u.role]}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {children}
      </div>
    </>
  );
}
