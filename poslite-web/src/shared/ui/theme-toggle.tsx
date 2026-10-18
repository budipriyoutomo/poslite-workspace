"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { type ComponentProps, useSyncExternalStore } from "react";

import { Button } from "./button";

const noop = () => () => {};

/** Icon button flipping light ↔ dark. The icon follows the `.dark` class, so it is right before hydration. */
export function ThemeToggle(props: Omit<ComponentProps<typeof Button>, "onClick" | "children">) {
  const { resolvedTheme, setTheme } = useTheme();
  // The stored theme is only known in the browser; render the light label on the server.
  const isClient = useSyncExternalStore(noop, () => true, () => false);
  const isDark = isClient && resolvedTheme === "dark";

  return (
    <Button size="icon" variant="ghost" aria-label={isDark ? "Mode terang" : "Mode gelap"} onClick={() => setTheme(isDark ? "light" : "dark")} {...props}>
      <Sun className="hidden dark:block" />
      <Moon className="dark:hidden" />
    </Button>
  );
}
