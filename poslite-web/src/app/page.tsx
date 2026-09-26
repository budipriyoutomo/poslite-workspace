"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useDeviceState, useSession, useSessionHydrated } from "@/features/auth";

export default function Home() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const isHydrated = useSessionHydrated();
  const device = useDeviceState();

  useEffect(() => {
    if (!isHydrated || device === undefined) return;
    router.replace(device === null ? "/activate" : user ? "/sell" : "/lock");
  }, [router, user, isHydrated, device]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-900">
      <h1 className="text-3xl font-semibold text-white">POSLite</h1>
    </main>
  );
}
