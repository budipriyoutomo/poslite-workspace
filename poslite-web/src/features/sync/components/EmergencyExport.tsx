"use client";

import { Download } from "lucide-react";
import { useState } from "react";

import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";

const selectClass = "h-10 w-full rounded-md border bg-card px-3 text-sm";

function saveFile(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: filename });
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Last resort when a device cannot sync (broken, revoked, no network for days): its unsent
 * events as a file for the back-office import (ADR-024). Needs a manager's PIN; works offline.
 */
export function EmergencyExport({
  managers,
  verify,
  build,
  download = saveFile,
}: {
  managers: { id: string; name: string }[];
  verify: (userId: string, pin: string) => Promise<boolean>;
  build: () => Promise<{ filename: string; content: string }>;
  download?: (filename: string, content: string) => void;
}) {
  const [userId, setUserId] = useState(managers[0]?.id ?? "");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setError(null);
    if (!(await verify(userId || (managers[0]?.id ?? ""), pin))) return void (setError("PIN salah"), setPin(""));
    const file = await build();
    download(file.filename, file.content);
    setPin("");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Export data darurat</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">Simpan semua transaksi yang belum terkirim ke file, lalu impor di back-office (Outlet, Meja & Perangkat). Data di tablet ini tidak dihapus.</p>
        <select aria-label="Manajer yang menyetujui" className={selectClass} value={userId} onChange={(e) => setUserId(e.target.value)}>
          {managers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <Input aria-label="PIN manajer" type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} />
        {error && <p className="text-destructive">{error}</p>}
        <Button variant="outline" disabled={pin.length < 4 || managers.length === 0} onClick={() => void run()}>
          <Download /> Export data darurat
        </Button>
      </CardContent>
    </Card>
  );
}
