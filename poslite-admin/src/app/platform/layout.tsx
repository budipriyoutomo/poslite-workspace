import { API_ORIGIN } from "@/config/env";
import { PlatformConsole } from "@/features/platform";

export default function PlatformLayout({ children }: LayoutProps<"/platform">) {
  return <PlatformConsole origin={API_ORIGIN}>{children}</PlatformConsole>;
}
