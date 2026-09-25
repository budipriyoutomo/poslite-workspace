"use client";

import { useOpenShift } from "../application/use-open-shift";
import { OpenShiftForm } from "./OpenShiftForm";
import { ShiftOverview } from "./ShiftOverview";

export function ShiftScreen() {
  const shift = useOpenShift();
  if (shift === undefined) return null;
  return <div className="p-4 sm:p-6">{shift ? <ShiftOverview shift={shift} /> : <OpenShiftForm />}</div>;
}
