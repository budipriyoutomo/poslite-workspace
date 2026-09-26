"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

import { errorMessage, useSignup } from "../application/use-auth";
import { copy } from "../copy";
import { slugify } from "../domain/slug";
import { AuthCard, Field } from "./AuthCard";

const FIELDS = [
  { id: "business", label: copy.businessName, type: "text" },
  { id: "owner", label: copy.ownerName, type: "text" },
  { id: "email", label: copy.email, type: "email" },
  { id: "password", label: copy.password, type: "password", minLength: 8 },
  { id: "outletCode", label: copy.outletCode, type: "text", hint: copy.outletCodeHint },
  { id: "outletName", label: copy.outletName, type: "text" },
] as const;

type Values = Record<(typeof FIELDS)[number]["id"], string>;

export function SignupScreen() {
  const router = useRouter();
  const signup = useSignup();
  const [values, setValues] = useState<Values>({ business: "", owner: "", email: "", password: "", outletCode: "", outletName: "" });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    signup.mutate(
      {
        business_name: values.business.trim(),
        slug: slugify(values.business),
        owner_name: values.owner.trim(),
        email: values.email.trim(),
        password: values.password,
        outlet: { code: values.outletCode.trim().toUpperCase(), name: values.outletName.trim(), timezone: "Asia/Jakarta" },
      },
      { onSuccess: () => router.replace("/") },
    );
  };

  return (
    <AuthCard title={copy.signupTitle} hint={copy.signupHint}>
      <form onSubmit={submit} className="space-y-4">
        {FIELDS.map((f) => (
          <Field key={f.id} id={f.id} label={f.label} hint={"hint" in f ? f.hint : undefined}>
            <Input
              id={f.id}
              type={f.type}
              required
              minLength={"minLength" in f ? f.minLength : undefined}
              value={values[f.id]}
              onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
            />
          </Field>
        ))}
        {signup.isError && (
          <p role="alert" className="text-sm text-red-600">
            {errorMessage(signup.error)}
          </p>
        )}
        <Button type="submit" className="h-11 w-full" disabled={signup.isPending}>
          {copy.signUp}
        </Button>
      </form>
      <p className="text-center text-sm">
        <Link href="/login" className="text-emerald-700 hover:underline">
          {copy.toLogin}
        </Link>
      </p>
    </AuthCard>
  );
}
