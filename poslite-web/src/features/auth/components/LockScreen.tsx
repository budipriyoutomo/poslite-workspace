"use client";

import { ShoppingCart, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AppError } from "@/shared/errors";
import type { UserRow } from "@/shared/db";

import { useSession } from "../application/session-store";
import { useDeviceState } from "../application/use-device-state";
import { useDeviceUsers } from "../application/use-device-users";
import { verifyPin } from "../application/verify-pin";
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

export function LockScreen() {
  const router = useRouter();
  const login = useSession((s) => s.login);
  const users = useDeviceUsers();
  const device = useDeviceState();
  useEffect(() => {
    if (device === null) router.replace("/activate");
  }, [device, router]);
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [error, setError] = useState<string>();
  const [isChecking, setIsChecking] = useState(false);

  const submit = async (pin: string) => {
    if (!selected) return;
    setIsChecking(true);
    setError(undefined);
    try {
      login(await verifyPin({ userId: selected.id, pin }));
      router.replace("/sell");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-slate-800 via-slate-700 to-slate-900 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-emerald-500 shadow-lg">
            <ShoppingCart className="size-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">{copy.title}</h1>
          <p className="mt-1 text-sm text-slate-400">{selected ? copy.enterPin(selected.name) : copy.pickCashier}</p>
        </div>
        <div className="rounded-2xl border border-white/20 bg-white/10 p-6 shadow-2xl backdrop-blur-md">
          {selected ? (
            <>
              <PinPad onComplete={submit} disabled={isChecking} error={isChecking ? copy.checking : error} />
              <button type="button" className="mt-5 w-full text-sm text-slate-300 hover:text-white" onClick={() => (setSelected(null), setError(undefined))}>
                {copy.back}
              </button>
            </>
          ) : (
            <ul className="grid grid-cols-2 gap-3">
              {users?.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(u)}
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
          {device?.mode === "demo" && <p className="mt-5 text-center text-xs text-slate-500">{copy.demoHint}</p>}
        </div>
      </div>
    </main>
  );
}
