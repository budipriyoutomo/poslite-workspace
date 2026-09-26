"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

import { errorMessage, useLogin } from "../application/use-auth";
import { copy } from "../copy";
import { AuthCard, Field } from "./AuthCard";

export function LoginScreen() {
  const router = useRouter();
  const login = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate({ email, password }, { onSuccess: () => router.replace("/") });
  };

  return (
    <AuthCard title={copy.loginTitle} hint={copy.loginHint}>
      <form onSubmit={submit} className="space-y-4">
        <Field id="email" label={copy.email}>
          <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field id="password" label={copy.password}>
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {login.isError && (
          <p role="alert" className="text-sm text-red-600">
            {errorMessage(login.error)}
          </p>
        )}
        <Button type="submit" className="h-11 w-full" disabled={login.isPending}>
          {copy.signIn}
        </Button>
      </form>
      <p className="text-center text-sm">
        <Link href="/signup" className="text-emerald-700 hover:underline">
          {copy.toSignup}
        </Link>
      </p>
    </AuthCard>
  );
}
