"use client";

import { useLiveQuery } from "dexie-react-hooks";

import { getDb, isManager } from "@/shared/db";
import { ApprovalField } from "@/shared/ui/approval-field";

import { checkManagerPin } from "../application/manager-pin";

/** Managers and owners who can approve on this device (master data, offline). */
export function useManagers() {
  return useLiveQuery(async () => (await getDb().users.toArray()).filter((u) => isManager(u.role)).map((u) => ({ id: u.id, name: u.name })), []);
}

/**
 * The one manager-approval block (15 · UX-05): a manager picks their name and enters their PIN on this
 * device, offline. Wrong PINs count toward the device lockout, which it reports like the lock screen.
 */
export function ManagerApproval({ approvedBy, onApproved }: { approvedBy: string | null; onApproved: (userId: string) => void }) {
  const managers = useManagers();
  // Wait for the list: the field picks its first manager when it mounts.
  if (!managers) return null;
  return <ApprovalField approvers={managers} verifyApprover={checkManagerPin} approvedBy={approvedBy} onApproved={onApproved} />;
}
