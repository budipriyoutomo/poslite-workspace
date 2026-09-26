"use client";

import { ShoppingCart } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { ApiError, NetworkError } from "@/shared/api";
import { getDb } from "@/shared/db";
import { useOnlineStatus } from "@/shared/hooks";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { cn } from "@/shared/ui/utils";

import { activateDevice, DEFAULT_API as API, loginManager, startDemo } from "../application/activate-device";

const ERRORS: Record<string, string> = {
  INVALID_CREDENTIALS: "Email atau password salah",
  ROLE_NOT_ALLOWED: "Hanya pemilik atau manajer outlet yang bisa mengaktifkan perangkat",
  OUTLET_NOT_FOUND: "Outlet tidak ditemukan",
};

function message(e: unknown): string {
  if (e instanceof NetworkError) return "Tidak bisa terhubung ke server. Periksa koneksi internet.";
  if (e instanceof ApiError) return ERRORS[e.code] ?? e.message;
  return String(e);
}

/** One-time device activation by a manager (online), or the offline demo. */
export function ActivationScreen() {
  const router = useRouter();
  const isOnline = useOnlineStatus();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [outlets, setOutlets] = useState<{ id: string; code: string; name: string }[] | null>(null);
  const [outletId, setOutletId] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState("Kasir 1");
  const [error, setError] = useState<string>();
  const [isBusy, setIsBusy] = useState(false);

  const run = async (work: () => Promise<void>) => {
    setIsBusy(true);
    setError(undefined);
    try {
      await work();
    } catch (e) {
      setError(message(e));
    } finally {
      setIsBusy(false);
    }
  };

  const login = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const result = await loginManager({ email, password }, { api: API });
      setOutlets(result.outlets);
      setOutletId(result.outlets[0]?.id ?? null);
    });
  };
  const activate = () =>
    run(async () => {
      if (!outletId) return;
      await activateDevice({ email, password, outletId, deviceName }, { db: getDb(), api: API });
      router.replace("/lock");
    });
  const demo = () =>
    run(async () => {
      await startDemo({ db: getDb() });
      router.replace("/lock");
    });

  return (
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-slate-800 via-slate-700 to-slate-900 p-4">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-white/20 bg-white/10 p-6 text-white shadow-2xl backdrop-blur-md">
        <div className="text-center">
          <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-emerald-500">
            <ShoppingCart className="size-7" />
          </div>
          <h1 className="text-2xl font-bold">Aktivasi Perangkat</h1>
          <p className="text-sm text-slate-300">Masuk sebagai pemilik atau manajer outlet</p>
        </div>
        {!outlets ? (
          <form onSubmit={login} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required className="bg-white text-slate-900" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className="bg-white text-slate-900" />
            </div>
            <Button type="submit" className="h-11 w-full bg-emerald-600 hover:bg-emerald-700" disabled={isBusy || !isOnline}>
              Masuk
            </Button>
          </form>
        ) : (
          <div className="space-y-3">
            <p className="text-sm">Pilih outlet</p>
            <ul className="space-y-2">
              {outlets.map((o) => (
                <li key={o.id}>
                  <button type="button" onClick={() => setOutletId(o.id)} className={cn("w-full rounded-lg border px-3 py-2 text-left", o.id === outletId ? "border-emerald-400 bg-emerald-500/20" : "border-white/20")}>
                    <span className="font-semibold">{o.code}</span> · {o.name}
                  </button>
                </li>
              ))}
            </ul>
            <div className="space-y-1">
              <Label htmlFor="device-name">Nama perangkat</Label>
              <Input id="device-name" value={deviceName} maxLength={100} onChange={(e) => setDeviceName(e.target.value)} className="bg-white text-slate-900" />
            </div>
            <Button className="h-11 w-full bg-emerald-600 hover:bg-emerald-700" disabled={isBusy || !outletId || !deviceName.trim()} onClick={activate}>
              {isBusy ? "Mengaktifkan…" : "Aktifkan"}
            </Button>
          </div>
        )}
        {!isOnline && <p className="text-center text-sm text-amber-300">Aktivasi butuh koneksi internet.</p>}
        {error && (
          <p role="alert" className="text-center text-sm text-red-300">
            {error}
          </p>
        )}
        <button type="button" onClick={demo} disabled={isBusy} className="w-full text-center text-sm text-slate-300 underline-offset-4 hover:text-white hover:underline">
          Coba mode demo (tanpa server)
        </button>
      </div>
    </main>
  );
}
