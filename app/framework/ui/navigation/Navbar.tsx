"use client";

import { useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useApp } from "@/framework/ui/context/AppContext";
import ProductsMegaMenu from "@/framework/ui/navigation/helper/megamenus/ProductsMegaMenu";
import AboutMegaMenu from "@/framework/ui/navigation/helper/megamenus/AboutMegaMenu";
import NavSearch from "@/framework/ui/navigation/helper/NavSearch";
import HamburgerButton from "@/framework/ui/navigation/helper/HamburgerButton";
import RightSidebar from "@/framework/ui/navigation/helper/RightSidebar";
import UserMenu from "@/framework/ui/navigation/helper/UserMenu";
import UserSidebar from "@/framework/ui/navigation/helper/UserSidebar";
import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { useTheme } from "next-themes";
import { useAbsoluteModal } from "@/framework/ui/context/AppContext";

type NavLink = {
  href: string;
  label: string;
  megaMenu?: ReactNode;
};

const THEMES = [
  { value: "system", label: "System", color: "#888888" },
  { value: "light", label: "Light", color: "#ffffff" },
  { value: "dark", label: "Dark", color: "#0a0a0a" },
  { value: "ocean", label: "Ocean", color: "#0a1628" },
  { value: "forest", label: "Forest", color: "#0a1a0a" },
  { value: "sunset", label: "Sunset", color: "#1a0a00" },
];

const navLinks: NavLink[] = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About", megaMenu: <AboutMegaMenu /> },
  { href: "/products", label: "Products", megaMenu: <ProductsMegaMenu /> },
  { href: "/pricing", label: "Pricing" },
  { href: "/blog", label: "Blog" },
];

export default function Navbar() {
  const { user } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userSidebarOpen, setUserSidebarOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);
  const themeButtonRef = useRef<HTMLDivElement>(null);
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

  const hoverModal = useAbsoluteModal();
  return (
    <>
      <nav
        className="bg-white border-b border-gray-200 sticky top-0 z-40"
        onMouseLeave={() => setActiveMenu(null)}
      >
        <div className="px-6">
          <div className="flex items-center justify-between h-16">

            <div className="flex items-center gap-2">
              <HamburgerButton open={sidebarOpen} onClick={() => setSidebarOpen((v) => !v)} className="hidden md:flex" />
              <Link href="/" className="font-bold text-gray-900 tracking-tight">
                <Text value="MyApp" size="medium" />
              </Link>
            </div>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-6 h-full">
              {navLinks.map((link) => (
                <Button
                  {...hoverModal.triggerProps}
                  key={link.href}
                  styleType="nav"
                  href={link.href}
                  className="flex items-center gap-1 h-full"
                  onHover={() => hoverModal.open({
                    side: "bottom",
                    align: "center",
                    offset: 0,
                    closeOnLeave: true,
                    component: link.megaMenu,
                  })}
                >
                  {/*
                    Keyed because Button forwards these on as `props.children`
                    into <Link>; once children travel through a prop React
                    validates them as a dynamic list and wants keys.
                  */}
                  <Text key="label" value={link.label} size="small" />
                  {link.megaMenu && (
                    <Text
                      key="chevron"
                      icon="chevron-down"
                      size="very small"
                      className={`text-gray-400 transition-transform ${activeMenu === link.label ? "rotate-180" : ""}`}
                    />
                  )}
                </Button>
              ))}
            </div>

            {/* Desktop user + sidebar trigger */}
            <div
              className="hidden md:flex items-center gap-2"
              onMouseEnter={() => setActiveMenu(null)}
            >
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
              <NavSearch iconMode />
              <UserMenu user={user} />
            </div>

            {/* Mobile right side */}
            <div className="flex items-center md:hidden">
              <button
                type="button"
                onClick={() => setUserSidebarOpen((v) => !v)}
                aria-label="Open user menu"
                className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-gray-100 transition-colors"
              >
                {user?.image ? (
                  <img src={user.image} alt={user.name ?? "User"} className="w-7 h-7 rounded-full object-cover" />
                ) : (
                  <Text icon="user" size="medium" className="text-gray-600" />
                )}
              </button>
              <HamburgerButton open={menuOpen} onClick={() => setMenuOpen((v) => !v)} />
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden border-t border-gray-100 bg-white px-4 py-4 flex flex-col gap-1">
            <div className="mb-2">
              <NavSearch placeholder="Search..." className="w-full" />
            </div>
            {navLinks.map((link) => (
              <Button
                key={link.href}
                styleType="nav"
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="w-full justify-start"
              >
                <Text value={link.label} size="small" />
              </Button>
            ))}
            {mounted && (
              <div className="pt-3 mt-2 border-t border-gray-100">
                <Text value="Theme" size="very small" className="text-gray-400 px-3 mb-2" />
                <div className="flex gap-2 px-3">
                  {THEMES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      title={t.label}
                      onClick={() => setTheme(t.value)}
                      className={`w-6 h-6 rounded-full border-2 transition-all ${theme === t.value ? "border-gray-500 scale-110" : "border-gray-200"}`}
                      style={{ backgroundColor: t.color }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div className="pt-3 mt-2 border-t border-gray-100">
              {user ? (
                <Text value={user.name ?? user.email} size="small" className="font-medium text-gray-700 px-3" />
              ) : (
                <Link
                  href="/login"
                  onClick={() => setMenuOpen(false)}
                  className="block text-center bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
                >
                  <Text value="Sign in" size="small" />
                </Link>
              )}
            </div>
          </div>
        )}
      </nav>

      <RightSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} title="Sidebar" side="left">
        <nav className="flex flex-col gap-1">
          <Link href="/" onClick={() => setSidebarOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">
            <Text icon="dashboard" size="small" className="text-gray-400" />
            <Text value="Dashboard" size="small" />
          </Link>
          <Link href="/projects" onClick={() => setSidebarOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">
            <Text icon="folder" size="small" className="text-gray-400" />
            <Text value="Projects" size="small" />
          </Link>
          <Link href="/tasks" onClick={() => setSidebarOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">
            <Text icon="tasks" size="small" className="text-gray-400" />
            <Text value="Tasks" size="small" />
          </Link>
          <Link href="/messages" onClick={() => setSidebarOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">
            <Text icon="messages" size="small" className="text-gray-400" />
            <Text value="Messages" size="small" />
          </Link>
          <Link href="/analytics" onClick={() => setSidebarOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">
            <Text icon="analytics" size="small" className="text-gray-400" />
            <Text value="Analytics" size="small" />
          </Link>

          <div className="mt-3 pt-3 border-t border-gray-100">
            <Text value="Account" size="very small" className="text-gray-400 px-3 mb-1" />
            <Link href="/settings" onClick={() => setSidebarOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">
              <Text icon="settings" size="small" className="text-gray-400" />
              <Text value="Settings" size="small" />
            </Link>
            <Link href="/help" onClick={() => setSidebarOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">
              <Text icon="help" size="small" className="text-gray-400" />
              <Text value="Help & Support" size="small" />
            </Link>
          </div>
        </nav>
      </RightSidebar>

      <UserSidebar open={userSidebarOpen} onClose={() => setUserSidebarOpen(false)} content={
        user ? (
          <div className="flex flex-col gap-1">
            <div className="mb-4 pb-4 border-b border-gray-100">
              <p className="text-sm font-medium text-gray-800 truncate">{user.name ?? "User"}</p>
              <p className="text-xs text-gray-500 truncate">{user.email}</p>
            </div>
            <Link href="/profile" onClick={() => setUserSidebarOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">
              <Text icon="user" size="small" className="text-gray-400" />
              <Text value="Profile" size="small" />
            </Link>
            <Link href="/settings" onClick={() => setUserSidebarOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">
              <Text icon="settings" size="small" className="text-gray-400" />
              <Text value="Settings" size="small" />
            </Link>
            <div className="mt-3 pt-3 border-t border-gray-100">
              <Link href="/api/auth/signout" onClick={() => setUserSidebarOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-red-600 hover:bg-red-50 transition-colors">
                <Text icon="logout" size="small" />
                <Text value="Sign out" size="small" />
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Link href="/login" onClick={() => setUserSidebarOpen(false)} className="block text-center bg-gray-900 text-white px-4 py-2.5 rounded-lg hover:bg-gray-700 transition-colors">
              <Text value="Sign in" size="small" />
            </Link>
            <Link href="/register" onClick={() => setUserSidebarOpen(false)} className="block text-center border border-gray-200 text-gray-700 px-4 py-2.5 rounded-lg hover:bg-gray-50 transition-colors">
              <Text value="Register" size="small" />
            </Link>
          </div>
        )
      } />
    </>
  );
}
