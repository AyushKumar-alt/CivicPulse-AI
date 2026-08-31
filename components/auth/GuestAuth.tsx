"use client";

import { useState } from "react";
import { signInAsGuest } from "@/lib/firebase/auth";

interface GuestAuthProps {
  onSuccess?: () => void;
  onError?: (err: string) => void;
}

export default function GuestAuth({ onSuccess, onError }: GuestAuthProps) {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleGuestSignIn() {
    setErrorMsg("");
    setLoading(true);
    try {
      await signInAsGuest();
      if (onSuccess) onSuccess();
    } catch (err: unknown) {
      console.error("[GuestAuth Error]", err);
      const raw = (err instanceof Error ? err.message : String(err)).toLowerCase();
      let friendly = "Unable to sign in as guest right now. Please check your internet connection.";
      if (raw.includes("admin-restricted-operation") || raw.includes("operation-not-allowed")) {
        friendly = "Guest sign-in is not enabled in Firebase Console. Please enable Anonymous Auth.";
      } else if (raw.includes("network")) {
        friendly = "Network error. Please check your connection and try again.";
      }
      setErrorMsg(friendly);
      if (onError) onError(friendly);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full space-y-2">
      {errorMsg && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
          {errorMsg}
        </p>
      )}

      <button
        type="button"
        onClick={handleGuestSignIn}
        disabled={loading}
        className="w-full flex items-center justify-center gap-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-4 py-3.5 text-sm font-semibold shadow-sm hover:shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className="text-lg shrink-0">👤</span>
        <span>{loading ? "Signing in as Guest..." : "Continue as Guest"}</span>
      </button>
    </div>
  );
}
