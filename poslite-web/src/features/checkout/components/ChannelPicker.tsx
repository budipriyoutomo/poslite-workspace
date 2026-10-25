"use client";

import { Button } from "@/shared/ui/button";

import { copy } from "../copy";

interface Channel {
  id: string;
  name: string;
  kind: "dine_in" | "take_away" | "delivery";
}

/** Take-away and delivery channels of the brand (ADR-029); dine-in comes with a table's bill. */
export function ChannelPicker<C extends Channel>({ channels, activeId, onChoose }: { channels: C[]; activeId: string | null; onChoose: (channel: C) => void }) {
  const counter = channels.filter((c) => c.kind !== "dine_in");
  if (counter.length < 2) return null;
  return (
    <div role="group" aria-label={copy.channel} className="mb-2 flex flex-wrap gap-1.5">
      {counter.map((c) => (
        <Button key={c.id} size="sm" variant={c.id === activeId ? "default" : "outline"} aria-pressed={c.id === activeId} onClick={() => onChoose(c)}>
          {c.name}
        </Button>
      ))}
    </div>
  );
}
