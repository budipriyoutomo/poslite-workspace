"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import type { UserRow } from "@/shared/db";
import { PosliteLogo } from "@/shared/ui/logo";

import { useSession } from "../application/session-store";
import { useBrandIdentity } from "../application/use-brand-identity";
import { useDeviceState } from "../application/use-device-state";
import { useLockScreenUsers } from "../application/use-lock-screen-users";
import { verifyPin } from "../application/verify-pin";
import { copy } from "../copy";
import { CashierLogin } from "./CashierLogin";
import { DemoBanner } from "./DemoBanner";

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
    <div className="flex min-h-dvh flex-col bg-gradient-to-br from-slate-800 via-slate-700 to-slate-900">
    {/* The demo PINs below only make sense next to the warning that nothing reaches the server (UX-01). */}
    <DemoBanner />
    <main className="flex flex-1 items-center justify-center p-4">
      {/* A phone on its side: brand on the left, PIN pad on the right, so nothing scrolls. */}
      <div className="w-full max-w-sm short:flex short:max-w-3xl short:items-center short:gap-10">
        {lockScreen && (
          <CashierLogin
            users={lockScreen.users}
            lastUserId={lockScreen.lastUserId}
            onLogin={onLogin}
            header={
              <>
                {brand?.logoUrl ? (
                  <div className="relative mx-auto mb-4 size-16 overflow-hidden rounded-2xl bg-white shadow-lg">
                    <Image src={brand.logoUrl} alt={`Logo ${brand.name}`} fill unoptimized sizes="64px" className="object-contain" />
                  </div>
                ) : (
                  <PosliteLogo className="mx-auto mb-4 size-16 rounded-2xl shadow-lg" iconClassName="size-8" />
                )}
                <h1 className="text-3xl font-bold tracking-tight text-white">{brand?.name ?? copy.title}</h1>
                {/* Which outlet of a multi-brand group this till belongs to, before anyone logs in. */}
                {brand?.outletName && <p className="mt-1 font-medium text-slate-200">{brand.outletName}</p>}
              </>
            }
          >
            {device?.mode === "demo" && <p className="mt-5 text-center text-xs text-slate-300">{copy.demoHint}</p>}
          </CashierLogin>
        )}
      </div>
    </main>
    </div>
  );
}
