"use client";

import { TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";

import { getDb } from "@/shared/db";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/shared/ui/alert-dialog";

import { exitDemo } from "../application/activate-device";
import { useSession } from "../application/session-store";
import { useDeviceState } from "../application/use-device-state";
import { copy } from "../copy";

/** Striped red warning above the POS header on a demo device (15 · UX-01), with a way out. */
export function DemoBanner() {
  const device = useDeviceState();
  const lock = useSession((s) => s.lock);
  const router = useRouter();
  if (device?.mode !== "demo") return null;

  const leave = async () => {
    await exitDemo({ db: getDb() });
    lock();
    router.replace("/activate");
  };

  return (
    <div
      role="alert"
      className="flex shrink-0 items-center gap-2 bg-red-700 bg-[repeating-linear-gradient(135deg,transparent_0_12px,rgb(0_0_0/0.15)_12px_24px)] px-3 py-1.5 text-xs font-semibold text-white lg:px-4"
    >
      <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1">{copy.demoBanner}</span>
      <AlertDialog>
        <AlertDialogTrigger className="shrink-0 underline underline-offset-2 hover:no-underline">{copy.exitDemo}</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.exitDemoTitle}</AlertDialogTitle>
            <AlertDialogDescription>{copy.exitDemoHint}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{copy.stayInDemo}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void leave()}>
              {copy.exitDemoConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
