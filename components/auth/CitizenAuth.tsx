"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import GuestAuth from "./GuestAuth";
import PhoneAuth from "./PhoneAuth";

interface CitizenAuthProps {
  onSelectEmailAuth?: () => void;
}

export default function CitizenAuth({ onSelectEmailAuth }: CitizenAuthProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"options" | "phone">("options");

  function handleSuccess() {
    router.push("/dashboard");
  }

  return (
    <div className="w-full space-y-6">
      <div className="text-center">
        <h1 className="text-xl font-bold text-gray-900">Welcome to CivicPulse</h1>
        <p className="mt-1 text-xs text-gray-500 max-w-xs mx-auto">
          Report civic problems in your area and help your city respond faster.
        </p>
      </div>

      {activeTab === "options" ? (
        <div className="space-y-4">
          {/* Option 1: Continue as Guest */}
          <GuestAuth onSuccess={handleSuccess} />

          {/* Option 2: Continue with Mobile Number (toggles phone input form) */}
          <button
            type="button"
            onClick={() => setActiveTab("phone")}
            className="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 hover:border-gray-400 hover:bg-gray-50 text-gray-800 rounded-xl px-4 py-3.5 text-sm font-semibold shadow-sm transition-all"
          >
            <span className="text-lg shrink-0">📱</span>
            <span>Continue with Mobile Number</span>
          </button>

          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-3 text-gray-400 font-medium">
                or
              </span>
            </div>
          </div>

          {/* Option 3: Sign in with Email (calls parent toggle) */}
          {onSelectEmailAuth && (
            <button
              type="button"
              onClick={onSelectEmailAuth}
              className="w-full text-center text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline py-1.5 transition-colors"
            >
              Sign in with Email or Password →
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setActiveTab("options")}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span>Back to sign-in options</span>
          </button>

          <PhoneAuth onSuccess={handleSuccess} />
        </div>
      )}
    </div>
  );
}
