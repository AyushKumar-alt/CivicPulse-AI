"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn, createAccount, resetPassword } from "@/lib/firebase/auth";

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
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-black bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="you@example.com"
              />
            </div>

            {mode !== "reset" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  onKeyDown={(e) => e.key === "Enter" && mode === "signin" && handleSubmit()}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-black bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="••••••••"
                />
              </div>
            )}

            {mode === "signup" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-black bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="••••••••"
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
