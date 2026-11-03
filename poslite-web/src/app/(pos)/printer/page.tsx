"use client";

import { useSession } from "@/features/auth";
import { retryStation } from "@/features/bills";
import { PrinterSettings } from "@/features/printing";

export default function PrinterPage() {
  const user = useSession((s) => s.user);
  return <PrinterSettings onRetry={(role) => role !== "receipt" && void retryStation(role, user?.name ?? "")} />;
}
