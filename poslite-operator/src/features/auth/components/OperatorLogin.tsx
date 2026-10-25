"use client";

import { ShieldCheck } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";

import { ApiError } from "@/shared/api";
import { Button } from "@/shared/ui/button";
import { FormField } from "@/shared/ui/form-field";
import { Input } from "@/shared/ui/input";

import { useOperatorLogin, useSecondFactor } from "../application/use-operator-login";
import { useOperatorStore } from "../application/session-store";

const ERRORS: Record<string, string> = {
  INVALID_CREDENTIALS: "Email atau password salah",
  INVALID_2FA_CODE: "Kode salah atau kedaluwarsa. Masuk lagi bila sudah lebih dari 5 menit.",
  RATE_LIMITED: "Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.",
};

const message = (error: unknown) => (error instanceof ApiError ? (ERRORS[error.code] ?? error.message) : "Tidak dapat terhubung ke server");

type Challenge = { challenge_token: string; step: "setup" | "verify"; totp_secret?: string | null; otpauth_uri?: string | null };
type Session = { token: string; expires_at: string; recovery_codes?: string[] };

function Card({ onSubmit, children }: { onSubmit?: (e: FormEvent) => void; children: ReactNode }) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-slate-950 p-4">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(50rem_28rem_at_15%_-10%,rgb(99_102_241/0.35),transparent),radial-gradient(40rem_24rem_at_110%_110%,rgb(139_92_246/0.25),transparent)]" />
      <form onSubmit={onSubmit} className="relative w-full max-w-sm space-y-4 rounded-2xl bg-card p-8 shadow-2xl shadow-black/40">
        <div className="space-y-2 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/30">
            <ShieldCheck className="size-6" />
          </span>
          <h1 className="text-xl font-bold">Konsol Operator</h1>
          <p className="text-sm text-muted-foreground">Khusus operator POSLite.</p>
        </div>
        {children}
      </form>
    </main>
  );
}

/** Operator sign-in (P1-8): password, then an authenticator code; set up at the first sign-in. */
export function OperatorLogin() {
  const login = useOperatorLogin();
  const second = useSecondFactor();
  const signIn = useOperatorStore((s) => s.signIn);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [isRecovery, setIsRecovery] = useState(false);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [fresh, setFresh] = useState<Session | null>(null);

  const open = (s: Session) => signIn({ token: s.token, expiresAt: s.expires_at });

  if (fresh) {
    return (
      <Card>
        <p className="text-sm font-medium">Simpan 10 kode pemulihan ini. Masing-masing hanya bisa dipakai sekali bila ponsel hilang.</p>
        <ul className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-3 font-mono text-sm">
          {fresh.recovery_codes!.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <Button type="button" className="w-full" onClick={() => open(fresh)}>
          Sudah saya simpan, buka konsol
        </Button>
      </Card>
    );
  }

  if (challenge) {
    const verify = (e: FormEvent) => {
      e.preventDefault();
      const body = { challenge_token: challenge.challenge_token, ...(isRecovery ? { recovery_code: code.trim() } : { code: code.trim() }) };
      second.mutate(body, { onSuccess: (s) => ((s.recovery_codes?.length ?? 0) > 0 ? setFresh(s) : open(s)) });
    };
    return (
      <Card onSubmit={verify}>
        {challenge.step === "setup" && (
          <div className="space-y-1 text-sm">
            <p>Aktifkan verifikasi dua langkah: tambahkan akun ini di aplikasi autentikator (Google Authenticator, Authy) dengan kunci berikut.</p>
            <p className="rounded-lg bg-muted p-2 text-center font-mono font-semibold break-all">{challenge.totp_secret}</p>
            {challenge.otpauth_uri && (
              <a className="text-xs text-primary underline" href={challenge.otpauth_uri}>
                Buka di aplikasi autentikator
              </a>
            )}
          </div>
        )}
        {isRecovery ? (
          <FormField id="op-recovery" label="Kode pemulihan">
            <Input id="op-recovery" autoComplete="off" required value={code} onChange={(e) => setCode(e.target.value)} />
          </FormField>
        ) : (
          <FormField id="op-code" label="Kode autentikator">
            <Input id="op-code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value)} />
          </FormField>
        )}
        {second.isError && (
          <p role="alert" className="text-sm text-destructive">
            {message(second.error)}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={second.isPending}>
          Verifikasi
        </Button>
        {challenge.step === "verify" && !isRecovery && (
          <Button type="button" variant="ghost" className="w-full" onClick={() => (setIsRecovery(true), setCode(""))}>
            Pakai kode pemulihan
          </Button>
        )}
      </Card>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate({ email, password }, { onSuccess: setChallenge });
  };
  return (
    <Card onSubmit={submit}>
      <FormField id="op-email" label="Email">
        <Input id="op-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </FormField>
      <FormField id="op-password" label="Password">
        <Input id="op-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </FormField>
      {login.isError && (
        <p role="alert" className="text-sm text-destructive">
          {message(login.error)}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={login.isPending}>
        Masuk
      </Button>
    </Card>
  );
}
