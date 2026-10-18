import { formatRupiah } from "@/shared/money";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { cn } from "@/shared/ui/utils";

import { useShifts } from "../application/use-day-closing";
import { dateTime } from "../domain/dates";

const time = (iso: string, timeZone: string) => dateTime(iso, timeZone).split(", ").at(-1);

/** Every shift of the day, so a cash variance can be traced to a device and cashier. */
export function ShiftTable({ outletId, businessDate, timezone }: { outletId: string; businessDate: string; timezone: string }) {
  const shifts = useShifts(outletId, businessDate);
  const rows = shifts.data ?? [];
  return (
    <Card className="gap-2 shadow-xs">
      <CardHeader>
        <CardTitle className="text-base">Shift</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{shifts.isLoading ? "Memuat…" : "Belum ada shift."}</p>
        ) : (
          <Table aria-label="Shift">
            <TableHeader>
              <TableRow>
                <TableHead>Perangkat</TableHead>
                <TableHead>Kasir</TableHead>
                <TableHead>Jam</TableHead>
                <TableHead className="text-right">Modal</TableHead>
                <TableHead className="text-right">Seharusnya</TableHead>
                <TableHead className="text-right">Terhitung</TableHead>
                <TableHead className="text-right">Selisih</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.device_name}</TableCell>
                  <TableCell>{s.closed_by_name && s.closed_by_name !== s.opened_by_name ? `${s.opened_by_name} → ${s.closed_by_name}` : s.opened_by_name}</TableCell>
                  <TableCell className="tabular-nums">
                    {time(s.opened_at, timezone)}–{s.closed_at ? time(s.closed_at, timezone) : <Badge variant="outline">terbuka</Badge>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatRupiah(s.opening_cash)}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.expected_cash === null ? "—" : formatRupiah(s.expected_cash)}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.counted_cash === null ? "—" : formatRupiah(s.counted_cash)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", (s.variance ?? 0) < 0 && "text-destructive")}>{s.variance === null ? "—" : formatRupiah(s.variance)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
