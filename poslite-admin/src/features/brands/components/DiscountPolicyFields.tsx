"use client";

import { Checkbox } from "@/shared/ui/checkbox";
import { FormField } from "@/shared/ui/form-field";
import { Input } from "@/shared/ui/input";

export interface DiscountPolicy {
  percentages: number[];
  amounts: number[];
  allow_custom: boolean;
  cashier_max_percentage: number;
  cashier_max_amount: number;
}

export const DEFAULT_POLICY: DiscountPolicy = { percentages: [5, 10, 15, 20], amounts: [5000, 10000, 25000, 50000], allow_custom: true, cashier_max_percentage: 20, cashier_max_amount: 50000 };

/** Text kept as typed ("5, 10"); numbers are read on save. */
export interface PolicyDraft {
  percentages: string;
  amounts: string;
  allow_custom: boolean;
  cashier_max_percentage: string;
  cashier_max_amount: string;
}

export const toDraft = (p: DiscountPolicy): PolicyDraft => ({
  percentages: p.percentages.join(", "),
  amounts: p.amounts.join(", "),
  allow_custom: p.allow_custom,
  cashier_max_percentage: String(p.cashier_max_percentage),
  cashier_max_amount: String(p.cashier_max_amount),
});

const numbers = (text: string) => text.split(/[,\s]+/).map((t) => t.replace(/\D/g, "")).filter(Boolean).map(Number);

/** The draft as the API takes it, or null while a value is out of range. */
export function fromDraft(d: PolicyDraft): DiscountPolicy | null {
  const percentages = numbers(d.percentages);
  const amounts = numbers(d.amounts);
  const maxPct = Number(d.cashier_max_percentage);
  const maxAmount = Number(d.cashier_max_amount);
  const ok = percentages.every((p) => p >= 1 && p <= 100) && amounts.every((a) => a >= 1) && maxPct >= 0 && maxPct <= 100 && maxAmount >= 0 && percentages.length <= 8 && amounts.length <= 8;
  return ok ? { percentages, amounts, allow_custom: d.allow_custom, cashier_max_percentage: maxPct, cashier_max_amount: maxAmount } : null;
}

/** Manual-discount rules of a brand (06 Order rule 5): presets and the cashier limits. */
export function DiscountPolicyFields({ draft, onChange }: { draft: PolicyDraft; onChange: (draft: PolicyDraft) => void }) {
  const set = (patch: Partial<PolicyDraft>) => onChange({ ...draft, ...patch });
  return (
    <fieldset className="space-y-3 rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">Diskon manual di kasir</legend>
      <FormField id="discount-percentages" label="Pilihan diskon persen">
        <Input id="discount-percentages" placeholder="5, 10, 15, 20" value={draft.percentages} onChange={(e) => set({ percentages: e.target.value })} />
      </FormField>
      <FormField id="discount-amounts" label="Pilihan diskon Rupiah">
        <Input id="discount-amounts" placeholder="5000, 10000" value={draft.amounts} onChange={(e) => set({ amounts: e.target.value })} />
      </FormField>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox aria-label="Kasir boleh mengetik nilai sendiri" checked={draft.allow_custom} onCheckedChange={(on) => set({ allow_custom: on === true })} /> Kasir boleh mengetik nilai sendiri
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="discount-max-pct" label="Batas kasir (%)">
          <Input id="discount-max-pct" inputMode="numeric" value={draft.cashier_max_percentage} onChange={(e) => set({ cashier_max_percentage: e.target.value.replace(/\D/g, "").slice(0, 3) })} />
        </FormField>
        <FormField id="discount-max-amount" label="Batas kasir (Rp per transaksi)">
          <Input id="discount-max-amount" inputMode="numeric" value={draft.cashier_max_amount} onChange={(e) => set({ cashier_max_amount: e.target.value.replace(/\D/g, "").slice(0, 12) })} />
        </FormField>
      </div>
      <p className="text-xs text-muted-foreground">Di atas batas ini kasir butuh PIN manajer. Promo tidak dihitung.</p>
    </fieldset>
  );
}
