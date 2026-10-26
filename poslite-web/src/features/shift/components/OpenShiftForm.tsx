"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "@/shared/ui/toast";

import { useSession } from "@/features/auth";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { MoneyKeypad } from "@/shared/ui/money-keypad";

import { openShift } from "../application/shift";
import { copy } from "../copy";
import { errorMessage } from "./error-message";

export function OpenShiftForm() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const [openingCash, setOpeningCash] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  const submit = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      await openShift({ cashierId: user.id, openingCash });
      // No toast: the Sell screen opening says it, and a toast would cover the first menu dialog (UX-07).
      router.push("/sell");
    } catch (e) {
      toast.error(errorMessage(e));
      setIsSaving(false);
    }
  };

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle>{copy.openTitle}</CardTitle>
        <CardDescription>{copy.openHint}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <MoneyKeypad label={copy.openingCash} value={openingCash} onChange={setOpeningCash} />
        <Button className="h-12 w-full text-base" disabled={isSaving} onClick={submit}>
          {copy.open}
        </Button>
      </CardContent>
    </Card>
  );
}
