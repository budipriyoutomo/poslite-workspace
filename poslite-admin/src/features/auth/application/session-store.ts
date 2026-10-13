import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { components } from "@/shared/api";

export type AuthResult = components["schemas"]["AuthResult"];

export interface Session {
  token: string;
  expiresAt: string;
  user: AuthResult["user"];
  tenant: AuthResult["tenant"];
  /** Active brand (ADR-022); null until the access tree is loaded after sign-in. */
  brandId: string | null;
}

interface SessionState {
  session: Session | null;
  signIn: (result: AuthResult) => void;
  selectBrand: (brandId: string) => void;
  signOut: () => void;
}

/** Back-office session (opaque 12 h token) in localStorage — see AGENTS.md for the trade-off. */
export function createSessionStore() {
  return create<SessionState>()(
    persist(
      (set) => ({
        session: null,
        signIn: (r) => set({ session: { token: r.token, expiresAt: r.expires_at, user: r.user, tenant: r.tenant, brandId: null } }),
        selectBrand: (brandId) => set((s) => (s.session ? { session: { ...s.session, brandId } } : s)),
        signOut: () => set({ session: null }),
      }),
      { name: "poslite-admin-session", storage: createJSONStorage(() => localStorage), partialize: (s) => ({ session: s.session }) },
    ),
  );
}

export function isSignedIn(session: Session | null, now: Date): session is Session {
  return session !== null && new Date(session.expiresAt).getTime() > now.getTime();
}

export const useSessionStore = createSessionStore();
