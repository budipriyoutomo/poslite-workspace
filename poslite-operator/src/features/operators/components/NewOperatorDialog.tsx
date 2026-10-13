"use client";

import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { ApiError } from "@/shared/api";
import { Button } from "@/shared/ui/button";
import { EditDialog } from "@/shared/ui/edit-dialog";
import { FormField } from "@/shared/ui/form-field";
import { Input } from "@/shared/ui/input";

import { MIN_PASSWORD, useCreateOperator } from "../application/use-operators";

const message = (error: unknown) =>
  error instanceof ApiError ? (error.code === "OPERATOR_EMAIL_TAKEN" ? "Email sudah dipakai operator lain" : error.message) : "Tidak dapat terhubung ke server";

export function NewOperatorDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const create = useCreateOperator();
  const valid = name.trim() !== "" && email.includes("@") && password.length >= MIN_PASSWORD;

  const close = (next: boolean) => {
    setOpen(next);
    if (next) return;
    setName("");
    setEmail("");
    setPassword("");
    create.reset();
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate({ name: name.trim(), email: email.trim(), password }, { onSuccess: (o) => (toast.success(`${o.name} bisa login sekarang`), close(false)) });
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>Tambah operator</Button>
      <EditDialog title="Tambah operator" open={open} onOpenChange={close}>
        <form onSubmit={submit} className="space-y-4">
          <FormField id="op-name" label="Nama">
            <Input id="op-name" value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField id="op-new-email" label="Email">
            <Input id="op-new-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </FormField>
          <FormField id="op-new-password" label="Password">
            <Input id="op-new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </FormField>
          <p className="text-sm text-muted-foreground">Minimal {MIN_PASSWORD} karakter. Sampaikan ke operator baru lewat kanal yang aman.</p>
          {create.isError && (
            <p role="alert" className="text-sm text-red-600">
              {message(create.error)}
            </p>
          )}
          <Button type="submit" disabled={!valid || create.isPending}>
            Simpan
          </Button>
        </form>
      </EditDialog>
    </>
  );
}
