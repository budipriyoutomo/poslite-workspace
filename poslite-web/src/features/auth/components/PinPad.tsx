"use client";

import { Delete } from "lucide-react";
import { useState } from "react";

import { cn } from "@/shared/ui/utils";

import { copy } from "../copy";

const PIN_LENGTH = 4;
const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

const keyClass =
  "h-14 rounded-xl border border-white/10 bg-white/10 text-xl font-semibold text-white transition-colors hover:bg-white/20 active:bg-white/30 disabled:opacity-40";

export function PinPad({ onComplete, disabled = false, error }: { onComplete: (pin: string) => void; disabled?: boolean; error?: string }) {
  const [pin, setPin] = useState("");

  const press = (digit: string) => {
    if (disabled) return;
    const next = pin + digit;
    if (next.length < PIN_LENGTH) return setPin(next);
    setPin("");
    onComplete(next);
  };

  return (
    <div className="space-y-5">
      <div role="status" aria-label={copy.pinProgress(pin.length, PIN_LENGTH)} className="flex justify-center gap-4">
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <span
            key={i}
            className={cn(
              "size-4 rounded-full border-2 transition-all",
              i < pin.length ? "scale-110 border-emerald-400 bg-emerald-400" : "border-slate-400",
            )}
          />
        ))}
      </div>
      {error && (
        <p role="alert" className="text-center text-sm text-red-400">
          {error}
        </p>
      )}
      <div className="grid grid-cols-3 gap-3">
        {DIGITS.map((d) => (
          <button key={d} type="button" className={keyClass} disabled={disabled} onClick={() => press(d)}>
            {d}
          </button>
        ))}
        <span />
        <button type="button" className={keyClass} disabled={disabled} onClick={() => press("0")}>
          0
        </button>
        <button
          type="button"
          aria-label={copy.deleteDigit}
          className={cn(keyClass, "flex items-center justify-center hover:bg-red-500/30")}
          disabled={disabled}
          onClick={() => setPin(pin.slice(0, -1))}
        >
          <Delete className="size-5" />
        </button>
      </div>
    </div>
  );
}
