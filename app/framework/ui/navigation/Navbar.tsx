"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { useTheme } from "next-themes";

/*
 * The app's top bar: its name on the left; the theme picker, Info and History
 * on the right, at every screen size.
 *
 * The sidebars, mega menus, search and user menu the scaffold shipped with are
 * no longer loaded. Their code is kept in `helper/` (RightSidebar, UserSidebar,
 * HamburgerButton, NavSearch, UserMenu, megamenus) in case they come back.
 */

const APP_NAME = "AirSearcher";

const THEMES = [
  { value: "system", label: "System", color: "#888888" },
  { value: "light", label: "Light", color: "#ffffff" },
  { value: "dark", label: "Dark", color: "#0a0a0a" },
  { value: "ocean", label: "Ocean", color: "#0a1628" },
  { value: "forest", label: "Forest", color: "#0a1a0a" },
  { value: "sunset", label: "Sunset", color: "#1a0a00" },
];

const NAV_LINKS = [
  { href: "/info", label: "Info" },
  { href: "/#history", label: "History" },
  { href: "/saved", label: "Saved" },
];

export default function Navbar() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);
  const themeButtonRef = useRef<HTMLDivElement>(null);
  // The theme is only known in the browser; rendering the picker before that
  // would show the wrong one during hydration.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!themeDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (themeButtonRef.current && !themeButtonRef.current.contains(e.target as Node)) {
        setThemeDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [themeDropdownOpen]);

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" className="font-bold text-gray-900 tracking-tight">
          <Text value={APP_NAME} size="medium" />
        </Link>

        <div className="flex items-center gap-1 sm:gap-2">
          {mounted && (
            <div ref={themeButtonRef} className="relative">
              <button
                type="button"
                onClick={() => setThemeDropdownOpen((v) => !v)}
                className="flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
                aria-label="Change theme"
              >
                <Text icon="palette" size="small" className="text-gray-600" />
              </button>
              {themeDropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-40 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-50">
                  {THEMES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => { setTheme(t.value); setThemeDropdownOpen(false); }}
                      className={`flex items-center gap-2.5 w-full px-3 py-2 text-left hover:bg-gray-50 transition-colors ${theme === t.value ? "font-medium text-gray-900" : "text-gray-600"}`}
                    >
                      <span
                        className="w-4 h-4 rounded-full border border-gray-300 flex-shrink-0"
                        style={{ backgroundColor: t.color }}
                      />
                      <Text value={t.label} size="small" />
                      {theme === t.value && (
                        <Text icon="check" size="very small" className="ml-auto text-gray-400" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {NAV_LINKS.map((link) => (
            <Button key={link.href} styleType="nav" href={link.href}>
              <Text key="label" value={link.label} size="small" />
            </Button>
          ))}
        </div>
      </div>
    </nav>
  );
}
