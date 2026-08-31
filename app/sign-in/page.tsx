"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn, createAccount, resetPassword, logout } from "@/lib/firebase/auth";
import { resolveUserRoleSync } from "@/lib/auth";
import CitizenAuth from "@/components/auth/CitizenAuth";

type RoleType = "citizen" | "command" | "department";
type FormMode = "signin" | "signup" | "reset";

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
        className="w-full rounded-lg border border-gray-300 px-3 py-2.5 pr-12 text-sm text-black bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        placeholder={placeholder ?? "••••••••"}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-800 p-1.5 rounded-md hover:bg-gray-100 transition-all text-xs font-semibold flex items-center justify-center"
        aria-label={show ? "Hide password" : "Show password"}
        title={show ? "Hide password" : "Show password"}
      >
        <span className="text-base leading-none">{show ? "🙈" : "👁️"}</span>
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
  const [role, setRole] = useState<RoleType | null>("citizen");
  const [showCitizenEmailForm, setShowCitizenEmailForm] = useState(false);
  const [mode, setMode] = useState<FormMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  function selectRole(r: RoleType) {
    setRole(r);
    setShowCitizenEmailForm(false);
    setMode("signin");
    setError("");
    setSuccess("");
  }

  function goBack() {
    if (showCitizenEmailForm) {
      setShowCitizenEmailForm(false);
      setMode("signin");
      setError("");
      return;
    }
    if (mode !== "signin") {
      setMode("signin");
      setError("");
    } else {
      setRole("citizen");
      setEmail("");
      setPassword("");
      setConfirmPassword("");
      setError("");
      setSuccess("");
    }
  }

  async function handleSubmit() {
    setError("");

    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }

    if (mode === "signup") {
      if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
      if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    }

    setLoading(true);
    try {
      if (mode === "reset") {
        await resetPassword(email);
        setSuccess("Password reset email sent. Check your inbox for the link.");
        setMode("signin");
        return;
      }
      let fbUser;
      if (mode === "signup") {
        const cred = await createAccount(email, password);
        fbUser = cred.user;
      } else {
        try {
          const cred = await signIn(email, password);
          fbUser = cred.user;
        } catch (signInErr: unknown) {
          const errCode = (signInErr as { code?: string })?.code || "";
          if (errCode === "auth/invalid-credential" || errCode === "auth/user-not-found" || errCode.includes("credential")) {
            try {
              // Fallback to Demo1234! default password if user exists
              const cred = await signIn(email, "Demo1234!");
              fbUser = cred.user;
            } catch {
              try {
                const cred = await createAccount(email, password);
                fbUser = cred.user;
              } catch {
                throw signInErr;
              }
            }
          } else {
            throw signInErr;
          }
        }
      }

      // Enforce strict portal access controls via RBAC engine
      const roleRes = resolveUserRoleSync(fbUser);

      if (role === "citizen" && roleRes.isOfficial) {
        await logout();
        setError("This is an official account. Please sign in through the Department or Command Centre portal.");
        return;
      }
      if (role === "department" && !roleRes.isOfficial) {
        await logout();
        setError("This account is a Citizen account. Please switch to the Citizen portal tab.");
        return;
      }
      if (role === "command" && roleRes.role !== "commandcenter") {
        await logout();
        setError("This account is not authorized for the Command Centre portal.");
        return;
      }

      // Seamless routing based on selected role
      if (role === "command") {
        router.push("/command-center");
      } else if (role === "department") {
        router.push("/department");
      } else {
        router.push("/dashboard");
      }
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
      if (msg.includes("invalid-api-key") || msg.includes("api_key_invalid") || msg.includes("api-key")) {
        setError("Firebase API Key is missing or unconfigured. Please set NEXT_PUBLIC_FIREBASE_API_KEY in .env.local.");
      } else if (msg.includes("email-already-in-use")) {
        setError("An account with this email already exists. Sign in instead.");
      } else if (msg.includes("invalid-email")) {
        setError("Please enter a valid email address.");
      } else if (msg.includes("weak-password")) {
        setError("Password must be at least 6 characters.");
      } else if (msg.includes("user-not-found")) {
        if (isCitizen) {
          setError("No account found with this email. Tap 'Create Account' below to register.");
        } else {
          setError("Official account not found. Contact your municipal administrator.");
        }
      } else if (
        msg.includes("wrong-password") ||
        msg.includes("invalid-credential") ||
        msg.includes("invalid-login-credentials")
      ) {
        if (mode === "signin" && isCitizen) {
          setError("Incorrect email or password. New user? Tap 'Create Account' below, or tap 'Reset it' if you forgot your password.");
        } else if (mode === "signin") {
          setError("Incorrect credentials. For demo official accounts use Demo1234!, or tap 'Reset it' below.");
        } else {
          setError("Incorrect password. Please try again.");
        }
      } else if (msg.includes("too-many-requests")) {
        setError("Too many failed attempts. Try again in a few minutes or reset your password below.");
      } else if (msg.includes("network")) {
        setError("Network error. Check your connection and try again.");
      } else {
        setError(mode === "signup" ? "Failed to create account. Try again." : "Sign-in failed. Please check your details.");
      }
    } finally {
      setLoading(false);
    }
  }

  const selectedRole = ROLES.find((r) => r.id === role) || ROLES[0];
  const isCitizen = role === "citizen";

  const title =
    mode === "signup" ? "Create citizen account"
    : mode === "reset" ? "Reset password"
    : `Sign in as ${selectedRole.label}`;

  const subtitle =
    mode === "signup" ? "Join as a citizen to report community issues."
    : mode === "reset" ? "Enter your email address and we'll send a password reset link."
    : role === "citizen" ? "Sign in to report or track community issues."
    : role === "command" ? "Access the municipal operations dashboard."
    : "Access your department's repair management portal.";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
            ← CivicPulse AI
          </Link>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {isCitizen && !showCitizenEmailForm ? (
            <>
              <CitizenAuth onSelectEmailAuth={() => setShowCitizenEmailForm(true)} />

              <div className="mt-8 pt-4 border-t border-gray-100 text-center">
                <p className="text-xs text-gray-400 mb-2">Municipal Staff & Operations</p>
                <div className="flex justify-center items-center gap-3">
                  <button
                    type="button"
                    onClick={() => selectRole("department")}
                    className="text-xs text-orange-600 hover:text-orange-800 font-medium hover:underline flex items-center gap-1"
                  >
                    <span>🏗️</span> Department
                  </button>
                  <span className="text-xs text-gray-300">•</span>
                  <button
                    type="button"
                    onClick={() => selectRole("command")}
                    className="text-xs text-purple-600 hover:text-purple-800 font-medium hover:underline flex items-center gap-1"
                  >
                    <span>🏛️</span> Command Centre
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
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
                    <strong>First time here?</strong> You need to create an account before signing in.
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
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-black bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder={
                      role === "command" ? "commandcentre@demo.com"
                      : role === "department" ? "dept@demo.com"
                      : "you@example.com"
                    }
                  />
                </div>

                {mode !== "reset" && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-sm font-medium text-gray-700">Password</label>
                      <button
                        type="button"
                        onClick={() => { setMode("reset"); setError(""); setSuccess(""); }}
                        className="text-xs text-blue-600 hover:underline font-medium"
                      >
                        Forgot password?
                      </button>
                    </div>
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

                {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg leading-relaxed">{error}</p>}
                {success && <p className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg leading-relaxed">{success}</p>}

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading}
                  className="w-full bg-blue-600 text-white rounded-xl px-4 py-3 text-sm font-semibold hover:bg-blue-700 shadow-sm hover:shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading
                    ? (mode === "signup" ? "Creating account..." : mode === "reset" ? "Sending..." : "Signing in...")
                    : (mode === "signup" ? "Create Account" : mode === "reset" ? "Send Reset Email" : "Sign in")}
                </button>

                <div className="space-y-2 text-center pt-1">
                  {mode === "signin" && isCitizen && (
                    <button
                      type="button"
                      onClick={() => { setMode("signup"); setError(""); setSuccess(""); }}
                      className="w-full border border-blue-300 text-blue-700 rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-blue-50 transition-colors"
                    >
                      Create Account (new users)
                    </button>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
