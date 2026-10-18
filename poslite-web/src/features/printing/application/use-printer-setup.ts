"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";

import { getDb, type PrinterDevice } from "@/shared/db";
import { newId } from "@/shared/id";

import { copy, printerErrorMessage } from "../copy";
import { browserPrinterDrivers } from "../infrastructure/browser-drivers";
import type { PrinterRole } from "./configured-printer";
import { choicesFor, getPrinter, isAddressDriver, pairPrinter, type PrinterChoice, printTestPage, type PrinterSetupDeps, removePrinter, savePrinter, savePrinterAddress } from "./printer-setup";

export const defaultPrinterSetupDeps = (): PrinterSetupDeps => ({ db: getDb(), printers: browserPrinterDrivers(), newId, now: () => new Date() });

/** The cashier closed the browser's device picker: not an error worth showing. */
const isPickerCancelled = (e: unknown) => e instanceof DOMException && e.name === "NotFoundError";

export function usePrinterSetup(deps: PrinterSetupDeps, role: PrinterRole) {
  // null while loading; undefined = nothing saved for this role
  const config = useLiveQuery(() => getPrinter(deps.db, role), [deps.db, role], null);
  const choices = useMemo(() => choicesFor(role, deps.printers), [role, deps.printers]);
  const [message, setMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const choice: PrinterChoice = config?.driver ?? (role === "receipt" ? "system" : "none");
  const paperWidth = config?.paperWidth ?? 58;

  const run = async (action: () => Promise<void>, success: string | null) => {
    setIsBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage(success);
    } catch (e) {
      if (!isPickerCancelled(e)) setMessage(printerErrorMessage(e));
    } finally {
      setIsBusy(false);
    }
  };

  return {
    isLoading: config === null,
    choice,
    paperWidth,
    /** A printer of its own (not "none", not the receipt printer's) — has a paper width. */
    hasOwnPrinter: choice !== "none" && choice !== "same-as-receipt",
    needsPairing: choice !== "none" && choice !== "same-as-receipt" && choice !== "system" && !isAddressDriver(choice),
    addressDriver: isAddressDriver(choice) ? choice : null,
    device: config?.device,
    isPaired: Boolean(config?.device),
    choices,
    message,
    isBusy,
    choose: (next: PrinterChoice) => run(() => (next === "none" ? removePrinter(role, deps) : savePrinter({ role, driver: next, paperWidth }, deps)), null),
    choosePaperWidth: (next: 58 | 80) => run(() => (choice === "none" ? Promise.resolve() : savePrinter({ role, driver: choice, paperWidth: next }, deps)), null),
    pair: () => run(() => pairPrinter(deps, role), null),
    saveAddress: (device: PrinterDevice) => run(() => savePrinterAddress({ role, device }, deps), copy.addressSaved),
    testPrint: () => run(() => printTestPage(deps, role), copy.testPrintSent),
  };
}
