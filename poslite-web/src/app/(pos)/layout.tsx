import { PosShell } from "./pos-shell";

export default function PosLayout({ children }: LayoutProps<"/">) {
  return <PosShell>{children}</PosShell>;
}
