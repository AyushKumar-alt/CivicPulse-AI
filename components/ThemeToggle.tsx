"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Read current state from the class the anti-flash script already applied
    const isDark = document.documentElement.classList.contains("dark");
    setDark(isDark);
    setMounted(true);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("theme", next ? "dark" : "light"); } catch {}
  }

  // Don't render until mounted to avoid hydration mismatch
  if (!mounted) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="fixed top-4 right-4 z-50 w-11 h-11 rounded-full shadow-lg flex items-center justify-center text-lg transition-all bg-gray-900 dark:bg-white border border-gray-700 dark:border-gray-200 hover:scale-110 active:scale-95"
      style={{ boxShadow: "0 4px 16px rgba(0,0,0,0.25)" }}
    >
      {dark ? "☀️" : "🌙"}
    </button>
  );
}
