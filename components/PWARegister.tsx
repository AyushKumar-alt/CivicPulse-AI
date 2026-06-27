"use client";

import { useEffect } from "react";

export default function PWARegister() {
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      process.env.NODE_ENV === "production"
    ) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((reg) => {
            console.log("Service worker registered successfully:", reg.scope);
          })
          .catch((err) => {
            console.error("Service worker registration failed:", err);
          });
      });
    }
  }, []);

  return null;
}
