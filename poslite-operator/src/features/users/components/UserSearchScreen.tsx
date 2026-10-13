"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";

import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

import { MIN_QUERY, useUserSearch } from "../application/use-user-search";

const ROLE: Record<string, string> = { owner: "Owner", manager: "Manajer", cashier: "Kasir" };

export function UserSearchScreen() {
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [tooShort, setTooShort] = useState(false);
  const users = useUserSearch(q);

  const search = (e: FormEvent) => {
    e.preventDefault();
    const value = draft.trim();
    setTooShort(value.length < MIN_QUERY);
    if (value.length >= MIN_QUERY) setQ(value);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Cari User</h1>
        <p className="text-sm text-muted-foreground">Cari user semua tenant berdasarkan nama atau email, mis. saat ada yang menghubungi support.</p>
      </div>
      <form role="search" onSubmit={search} className="flex items-center gap-2">
        <Input type="search" aria-label="Cari user" placeholder="Nama atau email" className="w-80 bg-white" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <Button type="submit" size="sm" variant="outline" aria-label="Cari">
          <Search />
        </Button>
      </form>
      {tooShort && <p className="text-sm text-muted-foreground">Ketik minimal 2 huruf.</p>}
      {users.data && (
        <table aria-label="Hasil pencarian" className="w-full rounded-lg border bg-white text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Nama</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Peran</th>
              <th className="px-3 py-2 font-medium">Tenant</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {users.data.map((u) => (
              <tr key={u.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-medium">{u.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{u.email ?? "—"}</td>
                <td className="px-3 py-2">{u.roles.map((r) => ROLE[r] ?? r).join(", ") || "—"}</td>
                <td className="px-3 py-2">
                  <Link href={`/tenants/${u.tenant_id}`} className="text-blue-700 hover:underline">
                    {u.tenant_name}
                  </Link>{" "}
                  <span className="text-xs text-muted-foreground">{u.tenant_slug}</span>
                </td>
                <td className="px-3 py-2">{u.is_active ? <Badge>Aktif</Badge> : <Badge variant="secondary">Nonaktif</Badge>}</td>
              </tr>
            ))}
            {users.data.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                  Tidak ada user yang cocok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
      {users.data && users.data.length === 50 && <p className="text-xs text-muted-foreground">Menampilkan 50 hasil pertama; persempit pencarian.</p>}
    </div>
  );
}
