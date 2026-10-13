"use client";

import { ConfirmButton } from "@/shared/ui/confirm-button";

export function SuspendButton({ name, onConfirm }: { name: string; onConfirm: () => void }) {
  return (
    <ConfirmButton
      label={`Tangguhkan ${name}`}
      title={`Tangguhkan ${name}?`}
      description="Pemilik tidak bisa mengubah data di back-office. Kasir tetap bisa berjualan dan transaksi tetap tersinkron, jadi tidak ada data yang hilang."
      confirm="Tangguhkan"
      onConfirm={onConfirm}
    >
      Tangguhkan
    </ConfirmButton>
  );
}
