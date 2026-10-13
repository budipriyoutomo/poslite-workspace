"use client";

import { Button } from "./button";

/** "21–40 dari 42" with previous/next; `page` is zero-based. */
export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  const first = total === 0 ? 0 : page * pageSize + 1;
  const last = Math.min(total, (page + 1) * pageSize);
  return (
    <div className="flex items-center justify-end gap-3 text-sm">
      <span className="text-muted-foreground">
        {first}–{last} dari {total}
      </span>
      <Button size="sm" variant="outline" disabled={page === 0} onClick={() => onPage(page - 1)}>
        Sebelumnya
      </Button>
      <Button size="sm" variant="outline" disabled={last >= total} onClick={() => onPage(page + 1)}>
        Berikutnya
      </Button>
    </div>
  );
}
