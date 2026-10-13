import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface OperatorSession {
  token: string;
  expiresAt: string;
}

interface OperatorState {
  session: OperatorSession | null;
  signIn: (session: OperatorSession) => void;
  signOut: () => void;
}

/** SaaS operator session. Operator tokens only work under /platform on the API, never as a tenant. */
export const useOperatorStore = create<OperatorState>()(
  persist(
    (set) => ({
      session: null,
      signIn: (session) => set({ session }),
      signOut: () => set({ session: null }),
    }),
    { name: "poslite-operator-session", storage: createJSONStorage(() => localStorage), partialize: (s) => ({ session: s.session }) },
  ),
);

export const isOperatorSignedIn = (session: OperatorSession | null, now: Date): session is OperatorSession =>
  session !== null && new Date(session.expiresAt).getTime() > now.getTime();
