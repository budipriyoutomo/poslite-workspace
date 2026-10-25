// Public API of the auth feature.
export { activateDevice, exitDemo, loginManager, startDemo } from "./application/activate-device";
export { useSession } from "./application/session-store";
export { useDeviceState } from "./application/use-device-state";
export { useIdleLock } from "./application/use-idle-lock";
export { useSessionHydrated } from "./application/use-session-hydrated";
export { type SessionUser, verifyPin } from "./application/verify-pin";
export { ActivationScreen } from "./components/ActivationScreen";
export { DemoBanner } from "./components/DemoBanner";
export { LockScreen } from "./components/LockScreen";
export { copy as authCopy } from "./copy";
