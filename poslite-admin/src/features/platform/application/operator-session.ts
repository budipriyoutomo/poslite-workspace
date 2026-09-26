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

/**
 * SaaS operator session, kept apart from the tenant session: operator tokens only work under
 * /platform on the API, and one browser may hold both.
 */
export const useOperatorStore = create<OperatorState>()(
  persist(
    (set) => ({
      session: null,
      signIn: (session) => set({ session }),
      signOut: () => set({ session: null }),
    }),
    { name: "poslite-admin-operator", storage: createJSONStorage(() => localStorage), partialize: (s) => ({ session: s.session }) },
  ),
);

export const isOperatorSignedIn = (session: OperatorSession | null, now: Date): session is OperatorSession =>
  session !== null && new Date(session.expiresAt).getTime() > now.getTime();
