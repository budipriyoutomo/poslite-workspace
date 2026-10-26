"use client";

import { formatRupiah } from "@/shared/money";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/shared/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";

import { useShiftDetail } from "../application/use-day-closing";
import { denominationRows } from "../domain/denominations";

function Count({ shiftId }: { shiftId: string }) {
  const detail = useShiftDetail(shiftId);
  if (!detail.data) return <p className="text-sm text-muted-foreground">Memuat…</p>;
  const { denominations } = detail.data;
  if (!denominations) return <p className="text-sm text-muted-foreground">Shift ditutup tanpa hitungan per pecahan.</p>;
  return (
    <Table aria-label="Hitungan per pecahan">
      <TableHeader>
        <TableRow>
          <TableHead>Pecahan</TableHead>
          <TableHead className="text-right">Lembar</TableHead>
          <TableHead className="text-right">Jumlah</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {denominationRows(denominations).map((r) => (
          <TableRow key={r.label}>
            <TableCell>{r.label}</TableCell>
            <TableCell className="text-right tabular-nums">{r.pieces ?? "—"}</TableCell>
            <TableCell className="text-right tabular-nums">{formatRupiah(r.amount)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** What the cashier counted per denomination at a blind close (15 · UX-02), for the manager. */
export function ShiftDetailDialog({ shiftId, deviceName, cashierName }: { shiftId: string; deviceName: string; cashierName: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" aria-label={`Rincian shift ${deviceName}`}>
          Rincian
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{`Shift ${deviceName} · ${cashierName}`}</DialogTitle>
          <DialogDescription>Hitungan kas saat tutup shift, per pecahan.</DialogDescription>
        </DialogHeader>
        <Count shiftId={shiftId} />
      </DialogContent>
    </Dialog>
  );
}
