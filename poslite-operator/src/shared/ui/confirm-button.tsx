"use client";

import type { ReactNode } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./alert-dialog";
import { Button } from "./button";

/** A small button that asks first. `label` names the trigger for screen readers ("Nonaktifkan Rina"). */
export function ConfirmButton({
  label,
  children,
  title,
  description,
  confirm,
  onConfirm,
}: {
  label: string;
  children: ReactNode;
  title: string;
  description: ReactNode;
  confirm: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" aria-label={label}>
          {children}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{confirm}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
