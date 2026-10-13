import { ConsoleGate, ConsoleShell } from "@/features/auth";

export default function ConsoleLayout({ children }: LayoutProps<"/">) {
  return (
    <ConsoleGate>
      <ConsoleShell>{children}</ConsoleShell>
    </ConsoleGate>
  );
}
