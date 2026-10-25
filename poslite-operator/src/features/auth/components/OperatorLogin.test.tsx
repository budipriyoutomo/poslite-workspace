import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { envelope, renderWithApi } from "../../../../tests/support/render";
import { useOperatorStore } from "../application/session-store";
import { OperatorLogin } from "./OperatorLogin";

beforeEach(() => useOperatorStore.getState().signOut());

const CODES = Array.from({ length: 10 }, (_, i) => `code${i}abcd`);

// P1-8: the password opens only the second step; a TOTP code (or a recovery code) opens the console.
function server(step: "setup" | "verify") {
  return renderWithApi(<OperatorLogin />, ({ path, body }) => {
    if (path === "/api/v1/platform/auth/login") {
      const { password } = body as { password: string };
      if (password === "lagi-lagi") return { status: 429, body: { message: "Too many attempts", code: "RATE_LIMITED" } };
      if (password !== "benar-sekali") return { status: 401, body: { message: "Email or password is wrong", code: "INVALID_CREDENTIALS" } };
      return envelope({ challenge_token: "ch", expires_at: "2099-01-01T00:00:00Z", step, ...(step === "setup" && { totp_secret: "JBSWY3DPEHPK3PXP", otpauth_uri: "otpauth://totp/POSLite%20Operator:ops%40poslite.id?secret=JBSWY3DPEHPK3PXP" }) });
    }
    const { code, recovery_code } = body as { code?: string; recovery_code?: string };
    if (code === "123456" || recovery_code === "code0abcd") return envelope({ token: "op-token", expires_at: "2099-01-01T00:00:00Z", recovery_codes: step === "setup" ? CODES : [] });
    return { status: 401, body: { message: "The code is wrong or expired", code: "INVALID_2FA_CODE" } };
  });
}

async function password(value: string) {
  await userEvent.type(screen.getByLabelText("Email"), "ops@poslite.id");
  await userEvent.type(screen.getByLabelText("Password"), value);
  await userEvent.click(screen.getByRole("button", { name: "Masuk" }));
}

describe("OperatorLogin", () => {
  it("asks for the authenticator code after the password, then signs in", async () => {
    const { calls } = server("verify");
    await password("benar-sekali");
    expect(useOperatorStore.getState().session).toBeNull();

    await userEvent.type(await screen.findByLabelText("Kode autentikator"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Verifikasi" }));

    await waitFor(() => expect(useOperatorStore.getState().session?.token).toBe("op-token"));
    expect(calls[1]).toMatchObject({ path: "/api/v1/platform/auth/2fa", body: { challenge_token: "ch", code: "123456" } });
  });

  it("sets 2FA up at the first sign-in and shows the recovery codes once", async () => {
    server("setup");
    await password("benar-sekali");

    expect(await screen.findByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Kode autentikator"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Verifikasi" }));

    expect(await screen.findByText("code9abcd")).toBeInTheDocument();
    expect(useOperatorStore.getState().session).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Sudah saya simpan, buka konsol" }));
    expect(useOperatorStore.getState().session?.token).toBe("op-token");
  });

  it("signs in with a recovery code when the phone is lost", async () => {
    server("verify");
    await password("benar-sekali");

    await userEvent.click(await screen.findByRole("button", { name: "Pakai kode pemulihan" }));
    await userEvent.type(screen.getByLabelText("Kode pemulihan"), "code0abcd");
    await userEvent.click(screen.getByRole("button", { name: "Verifikasi" }));

    await waitFor(() => expect(useOperatorStore.getState().session?.token).toBe("op-token"));
  });

  it("refuses a wrong code", async () => {
    server("verify");
    await password("benar-sekali");

    await userEvent.type(await screen.findByLabelText("Kode autentikator"), "000000");
    await userEvent.click(screen.getByRole("button", { name: "Verifikasi" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Kode salah atau kedaluwarsa");
    expect(useOperatorStore.getState().session).toBeNull();
  });

  it("shows wrong credentials without signing in", async () => {
    server("verify");
    await password("salah");

    expect(await screen.findByRole("alert")).toHaveTextContent("Email atau password salah");
    expect(useOperatorStore.getState().session).toBeNull();
  });

  it("asks to wait after too many attempts (ADR-027)", async () => {
    server("verify");
    await password("lagi-lagi");

    expect(await screen.findByRole("alert")).toHaveTextContent("Terlalu banyak percobaan");
  });
});
