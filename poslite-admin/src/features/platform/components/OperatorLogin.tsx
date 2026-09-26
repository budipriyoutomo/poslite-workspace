"use client";

import { ShieldCheck } from "lucide-react";
import { type FormEvent, useState } from "react";

import { ApiError } from "@/shared/api";
import { Button } from "@/shared/ui/button";
import { FormField } from "@/shared/ui/form-field";
import { Input } from "@/shared/ui/input";

import { useOperatorLogin } from "../application/use-platform";

const message = (error: unknown) =>
  error instanceof ApiError ? (error.code === "INVALID_CREDENTIALS" ? "Email atau password salah" : error.message) : "Tidak dapat terhubung ke server";

export function OperatorLogin() {
  const login = useOperatorLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate({ email, password });
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-900 p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-8 shadow">
        <div className="space-y-2 text-center">
          <ShieldCheck className="mx-auto size-10 text-slate-700" />
          <h1 className="text-xl font-bold">Konsol Platform</h1>
          <p className="text-sm text-muted-foreground">Khusus operator POSLite.</p>
        </div>
        <FormField id="op-email" label="Email">
          <Input id="op-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </FormField>
        <FormField id="op-password" label="Password">
          <Input id="op-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </FormField>
        {login.isError && (
          <p role="alert" className="text-sm text-red-600">
            {message(login.error)}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={login.isPending}>
          Masuk
        </Button>
      </form>
    </main>
  );
}
