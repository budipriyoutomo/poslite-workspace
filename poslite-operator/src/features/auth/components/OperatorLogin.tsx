"use client";

import { ShieldCheck } from "lucide-react";
import { type FormEvent, useState } from "react";

import { ApiError } from "@/shared/api";
import { Button } from "@/shared/ui/button";
import { FormField } from "@/shared/ui/form-field";
import { Input } from "@/shared/ui/input";

import { useOperatorLogin } from "../application/use-operator-login";

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
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-slate-950 p-4">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(50rem_28rem_at_15%_-10%,rgb(99_102_241/0.35),transparent),radial-gradient(40rem_24rem_at_110%_110%,rgb(139_92_246/0.25),transparent)]" />
      <form onSubmit={submit} className="relative w-full max-w-sm space-y-4 rounded-2xl bg-white p-8 shadow-2xl shadow-black/40">
        <div className="space-y-2 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/30">
            <ShieldCheck className="size-6" />
          </span>
          <h1 className="text-xl font-bold">Konsol Operator</h1>
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
