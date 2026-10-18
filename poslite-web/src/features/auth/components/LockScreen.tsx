"use client";

import { ShoppingCart } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import type { UserRow } from "@/shared/db";

import { useSession } from "../application/session-store";
import { useBrandIdentity } from "../application/use-brand-identity";
import { useDeviceState } from "../application/use-device-state";
import { useLockScreenUsers } from "../application/use-lock-screen-users";
import { verifyPin } from "../application/verify-pin";
import { copy } from "../copy";
import { CashierLogin } from "./CashierLogin";

export function LockScreen() {
  const router = useRouter();
  const login = useSession((s) => s.login);
  const lockScreen = useLockScreenUsers();
  const device = useDeviceState();
  const brand = useBrandIdentity();
  useEffect(() => {
    if (device === null) router.replace("/activate");
  }, [device, router]);

  const onLogin = async (user: UserRow, pin: string) => {
    login(await verifyPin({ userId: user.id, pin }));
    router.replace("/sell");
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-slate-800 via-slate-700 to-slate-900 p-4">
      {/* A phone on its side: brand on the left, PIN pad on the right, so nothing scrolls. */}
      <div className="w-full max-w-sm short:flex short:max-w-3xl short:items-center short:gap-10">
        {lockScreen && (
          <CashierLogin
            users={lockScreen.users}
            lastUserId={lockScreen.lastUserId}
            onLogin={onLogin}
            header={
              <>
                <div className="relative mx-auto mb-4 flex size-16 items-center justify-center overflow-hidden rounded-2xl bg-emerald-500 shadow-lg">
                  {brand?.logoUrl ? <Image src={brand.logoUrl} alt={`Logo ${brand.name}`} fill unoptimized sizes="64px" className="bg-white object-contain" /> : <ShoppingCart className="size-8 text-white" />}
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-white">{brand?.name ?? copy.title}</h1>
              </>
            }
          >
            {device?.mode === "demo" && <p className="mt-5 text-center text-xs text-slate-500">{copy.demoHint}</p>}
          </CashierLogin>
        )}
      </div>
    </main>
  );
}
