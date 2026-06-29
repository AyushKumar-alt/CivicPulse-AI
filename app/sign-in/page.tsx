"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn, createAccount, resetPassword } from "@/lib/firebase/auth";

function EyeIcon({ open }: { open: boolean }) {
  if (open) return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  );
}

function PasswordInput({
  value,
  onChange,
  autoComplete,
  onKeyDown,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        onKeyDown={onKeyDown}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm text-black bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        placeholder={placeholder ?? "••••••••"}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
        tabIndex={-1}
      >
        <EyeIcon open={show} />
      </button>
    </div>
  );
}

export default function SignInPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError("");

    if (mode === "signup") {
      if (password.length < 6) {
        setError("Password must be at least 6 characters.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === "reset") {
        await resetPassword(email);
        setSuccess("Password reset email sent. Check your inbox.");
        setMode("signin");
        return;
      }
      if (mode === "signup") {
        await createAccount(email, password);
      } else {
        await signIn(email, password);
      }
      const authorityEmail = process.env.NEXT_PUBLIC_AUTHORITY_EMAIL ?? "";
      const commandCenterEmail = process.env.NEXT_PUBLIC_COMMANDCENTER_EMAIL ?? "";
      if (authorityEmail && email === authorityEmail) {
        router.push("/authority");
      } else if (commandCenterEmail && email === commandCenterEmail) {
        router.push("/authority");
      } else {
        router.push("/dashboard");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("email-already-in-use")) {
        setError("An account with this email already exists. Sign in instead.");
      } else if (msg.includes("invalid-email")) {
        setError("Invalid email address.");
      } else if (msg.includes("wrong-password") || msg.includes("invalid-credential")) {
        setError("Invalid email or password. Please try again.");
      } else if (msg.includes("user-not-found")) {
        setError("No account found with this email. Create one instead.");
      } else {
        setError(mode === "signup" ? "Failed to create account. Try again." : "Invalid email or password. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
            ← Community Hero AI
          </Link>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="mb-6">
            <h1 className="text-xl font-semibold text-gray-900">
              {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Reset password"}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {mode === "signin"
                ? "Sign in to report or track community issues."
                : mode === "signup"
                ? "Join as a citizen to report community issues."
                : "Enter your email and we'll send a reset link."}
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                onKeyDown={(e) => e.key === "Enter" && mode === "reset" && handleSubmit()}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-black bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="you@example.com"
              />
            </div>

            {mode !== "reset" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <PasswordInput
                  value={password}
                  onChange={setPassword}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  onKeyDown={(e) => e.key === "Enter" && mode === "signin" && handleSubmit()}
                />
              </div>
            )}

            {mode === "signup" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                <PasswordInput
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  autoComplete="new-password"
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                />
              </div>
            )}

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}

            {success && (
              <p className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg">{success}</p>
            )}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="w-full bg-blue-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading
                ? mode === "signup" ? "Creating account..." : mode === "reset" ? "Sending..." : "Signing in..."
                : mode === "signup" ? "Create Account" : mode === "reset" ? "Send Reset Email" : "Sign in"}
            </button>

            <div className="space-y-2 text-center">
              {mode === "signin" && (
                <>
                  <p className="text-sm text-gray-500">
                    Don&apos;t have an account?{" "}
                    <button
                      type="button"
                      onClick={() => { setMode("signup"); setError(""); setSuccess(""); }}
                      className="text-blue-600 hover:underline font-medium"
                    >
                      Create one
                    </button>
                  </p>
                  <p className="text-sm text-gray-500">
                    Forgot password?{" "}
                    <button
                      type="button"
                      onClick={() => { setMode("reset"); setError(""); setSuccess(""); }}
                      className="text-blue-600 hover:underline font-medium"
                    >
                      Reset it
                    </button>
                  </p>
                </>
              )}
              {(mode === "signup" || mode === "reset") && (
                <p className="text-sm text-gray-500">
                  <button
                    type="button"
                    onClick={() => { setMode("signin"); setError(""); setSuccess(""); }}
                    className="text-blue-600 hover:underline font-medium"
                  >
                    ← Back to sign in
                  </button>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
