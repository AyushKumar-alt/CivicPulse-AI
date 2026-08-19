"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn, createAccount, resetPassword, logout } from "@/lib/firebase/auth";

type RoleType = "citizen" | "command" | "department";
type FormMode = "signin" | "signup" | "reset";

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

const ROLES: { id: RoleType; icon: string; label: string; description: string; color: string }[] = [
  {
    id: "citizen",
    icon: "🏘️",
    label: "Citizen",
    description: "Report and track community issues",
    color: "border-blue-200 hover:border-blue-400 hover:bg-blue-50",
  },
  {
    id: "command",
    icon: "🏛️",
    label: "Command Centre",
    description: "Municipal operations dashboard",
    color: "border-purple-200 hover:border-purple-400 hover:bg-purple-50",
  },
  {
    id: "department",
    icon: "🏗️",
    label: "Department",
    description: "Field crew & repair management",
    color: "border-orange-200 hover:border-orange-400 hover:bg-orange-50",
  },
];

export default function SignInPage() {
  const router = useRouter();
  const [role, setRole] = useState<RoleType | null>(null);
  const [mode, setMode] = useState<FormMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  function selectRole(r: RoleType) {
    setRole(r);
    setMode("signin");
    setError("");
    setSuccess("");
  }

  function goBack() {
    if (mode !== "signin") {
      setMode("signin");
      setError("");
    } else {
      setRole(null);
      setEmail("");
      setPassword("");
      setConfirmPassword("");
      setError("");
      setSuccess("");
    }
  }

  async function handleSubmit() {
    setError("");

    if (mode === "signup") {
      if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
      if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    }

    setLoading(true);
    try {
      if (mode === "reset") {
        await resetPassword(email);
        setSuccess("Password reset email sent. Check your inbox.");
        setMode("signin");
        return;
      }
      let fbUser;
      if (mode === "signup") {
        const cred = await createAccount(email, password);
        fbUser = cred.user;
      } else {
        const cred = await signIn(email, password);
        fbUser = cred.user;
      }

      // Enforce role ↔ claim match
      const token = await fbUser.getIdTokenResult();
      const claimedRole = token.claims.role as string | undefined;

      const isOfficialAccount = claimedRole === "commandcenter" || claimedRole === "authority";

      if (role === "command" && claimedRole !== "commandcenter") {
        await logout();
        setError(
          isOfficialAccount
            ? "This account belongs to a different portal. Please go back and select the correct role."
            : "This account is not authorised for the Command Centre portal.",
        );
        return;
      }
      if (role === "department" && claimedRole !== "authority") {
        await logout();
        setError(
          isOfficialAccount
            ? "This account belongs to a different portal. Please go back and select the correct role."
            : "This account is not authorised for the Department portal.",
        );
        return;
      }
      if (role === "citizen" && isOfficialAccount) {
        await logout();
        setError(
          "This is an official account. Please go back and sign in through the Command Centre or Department portal.",
        );
        return;
      }

      if (role === "command") {
        router.push("/authority");
      } else if (role === "department") {
        router.push("/department");
      } else {
        router.push("/dashboard");
      }
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
      if (msg.includes("email-already-in-use")) {
        setError("An account with this email already exists. Sign in instead.");
      } else if (msg.includes("invalid-email")) {
        setError("Please enter a valid email address.");
      } else if (msg.includes("weak-password")) {
        setError("Password must be at least 6 characters.");
      } else if (msg.includes("user-not-found")) {
        if (isCitizen) {
          setError("No account found. Use 'Create Account' below to register first.");
        } else {
          setError("Account not found. Contact your administrator.");
        }
      } else if (
        msg.includes("wrong-password") ||
        msg.includes("invalid-credential") ||
        msg.includes("invalid-login-credentials")
      ) {
        if (mode === "signin" && isCitizen) {
          setError("Incorrect email or password. New here? Tap 'Create Account' below to register.");
        } else if (mode === "signin") {
          setError("Incorrect email or password. Contact your administrator if you forgot your credentials.");
        } else {
          setError("Incorrect password. Please try again.");
        }
      } else if (msg.includes("too-many-requests")) {
        setError("Too many failed attempts. Try again in a few minutes or reset your password.");
      } else if (msg.includes("network")) {
        setError("Network error. Check your connection and try again.");
      } else {
        setError(mode === "signup" ? "Failed to create account. Try again." : "Sign-in failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  // ── Role picker ─────────────────────────────────────────────────────────

  if (!role) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <Link href="/" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
              ← CivicPulse AI
            </Link>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
            <div className="mb-6 text-center">
              <h1 className="text-xl font-semibold text-gray-900">Welcome back</h1>
              <p className="mt-1 text-sm text-gray-500">Select your role to continue</p>
            </div>

            <div className="space-y-3">
              {ROLES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => selectRole(r.id)}
                  className={`w-full flex items-center gap-4 rounded-xl border-2 px-4 py-4 text-left transition-all duration-150 ${r.color}`}
                >
                  <span className="text-2xl shrink-0">{r.icon}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{r.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{r.description}</p>
                  </div>
                  <svg className="ml-auto shrink-0 w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Sign-in form ─────────────────────────────────────────────────────────

  const selectedRole = ROLES.find((r) => r.id === role)!;
  const isCitizen = role === "citizen";

  const title =
    mode === "signup" ? "Create citizen account"
    : mode === "reset" ? "Reset password"
    : `Sign in as ${selectedRole.label}`;

  const subtitle =
    mode === "signup" ? "Join as a citizen to report community issues."
    : mode === "reset" ? "Enter your email and we'll send a reset link."
    : role === "citizen" ? "Sign in to report or track community issues."
    : role === "command" ? "Access the municipal operations dashboard."
    : "Access your department's repair management portal.";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
            ← CivicPulse AI
          </Link>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {/* Role badge + back */}
          <div className="flex items-center gap-2 mb-5">
            <button
              type="button"
              onClick={goBack}
              className="text-gray-400 hover:text-gray-700 transition-colors"
              aria-label="Back"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-base">{selectedRole.icon}</span>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{selectedRole.label}</span>
          </div>

          <div className="mb-6">
            <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
            <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
          </div>

          {/* First-time citizen hint */}
          {isCitizen && mode === "signin" && (
            <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-start gap-2">
              <span className="text-blue-500 text-base shrink-0 mt-0.5">ℹ️</span>
              <p className="text-xs text-blue-700 leading-relaxed">
                <strong>First time here?</strong> You need to create a citizen account before signing in.
                Tap <strong>Create Account</strong> below.
              </p>
            </div>
          )}

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
                placeholder={
                  role === "command" ? "commandcentre@demo.com"
                  : role === "department" ? "dept@demo.com"
                  : "you@example.com"
                }
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

            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            {success && <p className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg">{success}</p>}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="w-full bg-blue-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading
                ? (mode === "signup" ? "Creating account..." : mode === "reset" ? "Sending..." : "Signing in...")
                : (mode === "signup" ? "Create Account" : mode === "reset" ? "Send Reset Email" : "Sign in")}
            </button>

            <div className="space-y-2 text-center">
              {mode === "signin" && (
                <>
                  {isCitizen && (
                    <button
                      type="button"
                      onClick={() => { setMode("signup"); setError(""); setSuccess(""); }}
                      className="w-full border border-blue-300 text-blue-700 rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-blue-50 transition-colors"
                    >
                      Create Account (new users)
                    </button>
                  )}
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
