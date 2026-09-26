"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/shared/ui/button";
import { EditDialog } from "@/shared/ui/edit-dialog";

import { useOutletChoice, useSelectedOutlet } from "../application/use-outlets";
import { DevicesPanel } from "./DevicesPanel";
import { NewOutletForm } from "./NewOutletForm";
import { OutletSettingsForm } from "./OutletSettingsForm";

/** Settings and devices of the outlet chosen in the header; new outlets become the chosen one. */
export function OutletsScreen() {
  const outlet = useSelectedOutlet();
  const choose = useOutletChoice((s) => s.choose);
  const [isAdding, setIsAdding] = useState(false);

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Outlet & Perangkat</h1>
          <p className="text-sm text-muted-foreground">Pilih outlet di bagian atas untuk melihat pengaturan dan perangkatnya.</p>
        </div>
        <Button size="sm" onClick={() => setIsAdding(true)}>
          <Plus /> Tambah outlet
        </Button>
      </div>
      {outlet && <OutletSettingsForm outletId={outlet.id} />}
      {outlet && <DevicesPanel outletId={outlet.id} />}
      <EditDialog title="Outlet baru" open={isAdding} onOpenChange={setIsAdding}>
        <NewOutletForm onCreated={(id) => (choose(id), setIsAdding(false))} />
      </EditDialog>
    </div>
  );
}
