import { AuditList } from "./AuditList";

export function AuditScreen() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Audit Log</h1>
        <p className="text-sm text-muted-foreground">Semua aksi operator di konsol, terbaru di atas.</p>
      </div>
      <AuditList />
    </div>
  );
}
