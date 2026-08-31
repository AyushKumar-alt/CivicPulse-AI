"use client";

import { useState, useEffect, useRef } from "react";
import { initPhoneRecaptcha, sendPhoneOtp } from "@/lib/firebase/auth";
import type { ConfirmationResult, RecaptchaVerifier } from "firebase/auth";

interface PhoneAuthProps {
  onSuccess?: () => void;
  onError?: (err: string) => void;
}

export default function PhoneAuth({ onSuccess, onError }: PhoneAuthProps) {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [countryCode, setCountryCode] = useState("+91");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [cooldown, setCooldown] = useState(0);

  const confirmationResultRef = useRef<ConfirmationResult | null>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // Clean up reCAPTCHA on unmount
  useEffect(() => {
    return () => {
      if (recaptchaVerifierRef.current) {
        try {
          recaptchaVerifierRef.current.clear();
        } catch {
          // ignore cleanup errors
        }
      }
    };
  }, []);

  function formatFullPhoneNumber(): string {
    const raw = phoneNumber.trim().replace(/\D/g, "");
    const cc = countryCode.trim();
    if (raw.startsWith(cc.replace("+", ""))) {
      return `+${raw}`;
    }
    return `${cc}${raw}`;
  }

  async function handleSendOtp() {
    setErrorMsg("");
    const fullNumber = formatFullPhoneNumber();

    if (phoneNumber.trim().length < 7) {
      setErrorMsg("Please enter a valid mobile number.");
      return;
    }

    setLoading(true);
    try {
      if (!recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current = initPhoneRecaptcha("recaptcha-container");
      }

      const confirmation = await sendPhoneOtp(fullNumber, recaptchaVerifierRef.current);
      confirmationResultRef.current = confirmation;
      setStep("otp");
      setCooldown(30);
    } catch (err: unknown) {
      console.error("[PhoneAuth Send Error]", err);
      const raw = (err instanceof Error ? err.message : String(err)).toLowerCase();
      let friendly = "Failed to send OTP. Please check your mobile number and try again.";

      if (raw.includes("billing-not-enabled")) {
        friendly = "Sending real SMS requires GCP Billing. To test without billing, add your number to Firebase Console → Authentication → Sign-in method → Phone numbers for testing (e.g. +91 9931147182 with code 123456).";
      } else if (raw.includes("region enabled") || raw.includes("sms unable to be sent")) {
        friendly = "SMS region policy restriction: Please allow India (+91) in Firebase Console → Authentication → Settings → SMS region policy.";
      } else if (raw.includes("invalid-phone-number")) {
        friendly = "Invalid mobile number. Please check the number and try again.";
      } else if (raw.includes("too-many-requests")) {
        friendly = "Too many attempts. Please wait a while before requesting another OTP.";
      } else if (raw.includes("operation-not-allowed")) {
        friendly = "Phone Authentication is not enabled in Firebase Console. Please enable Phone provider.";
      } else if (raw.includes("captcha") || raw.includes("reCAPTCHA")) {
        friendly = "reCAPTCHA verification failed. Please try again.";
      } else if (raw.includes("network")) {
        friendly = "Network error. Please check your connection and try again.";
      }

      setErrorMsg(friendly);
      if (onError) onError(friendly);

      // Reset reCAPTCHA if failed
      if (recaptchaVerifierRef.current) {
        try {
          recaptchaVerifierRef.current.clear();
          recaptchaVerifierRef.current = null;
        } catch {
          // ignore
        }
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    setErrorMsg("");
    const cleanOtp = otp.trim().replace(/\D/g, "");

    if (cleanOtp.length < 6) {
      setErrorMsg("Please enter the complete 6-digit verification code.");
      return;
    }

    if (!confirmationResultRef.current) {
      setErrorMsg("Session expired. Please request a new OTP.");
      setStep("phone");
      return;
    }

    setLoading(true);
    try {
      await confirmationResultRef.current.confirm(cleanOtp);
      if (onSuccess) onSuccess();
    } catch (err: unknown) {
      console.error("[PhoneAuth Verify Error]", err);
      const raw = (err instanceof Error ? err.message : String(err)).toLowerCase();
      let friendly = "Incorrect code. Please check the OTP and try again.";

      if (raw.includes("code-expired") || raw.includes("session-expired")) {
        friendly = "OTP code has expired. Please request a new code.";
      } else if (raw.includes("invalid-verification-code")) {
        friendly = "Incorrect OTP code. Please check the 6 digits and try again.";
      }

      setErrorMsg(friendly);
      if (onError) onError(friendly);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full space-y-4">
      {/* Container for invisible Firebase reCAPTCHA */}
      <div id="recaptcha-container"></div>

      {errorMsg && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
          {errorMsg}
        </p>
      )}

      {step === "phone" ? (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Mobile Number
            </label>
            <div className="flex gap-2">
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                className="rounded-lg border border-gray-300 px-2 py-2.5 text-sm text-black bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 shrink-0"
              >
                <option value="+91">🇮🇳 +91</option>
                <option value="+1">🇺🇸 +1</option>
                <option value="+44">🇬🇧 +44</option>
                <option value="+61">🇦🇺 +61</option>
                <option value="+971">🇦🇪 +971</option>
                <option value="+65">🇸🇬 +65</option>
              </select>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="98765 43210"
                onKeyDown={(e) => e.key === "Enter" && handleSendOtp()}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-black bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleSendOtp}
            disabled={loading || !phoneNumber.trim()}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-4 py-3 text-sm font-semibold shadow-sm hover:shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>📱</span>
            <span>{loading ? "Sending OTP..." : "Continue with Mobile Number"}</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800 flex items-center justify-between">
            <span>Code sent to <strong>{formatFullPhoneNumber()}</strong></span>
            <button
              type="button"
              onClick={() => {
                setStep("phone");
                setErrorMsg("");
              }}
              className="text-blue-600 hover:underline font-medium ml-2"
            >
              Change
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Enter 6-Digit Verification Code
            </label>
            <input
              type="text"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleVerifyOtp()}
              className="w-full tracking-widest text-center text-lg font-semibold rounded-lg border border-gray-300 px-3 py-2.5 text-black bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="button"
            onClick={handleVerifyOtp}
            disabled={loading || otp.length < 6}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-4 py-3 text-sm font-semibold shadow-sm hover:shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Verifying Code..." : "Verify & Sign In"}
          </button>

          <div className="text-center pt-1">
            {cooldown > 0 ? (
              <p className="text-xs text-gray-400">
                Resend code in <span className="font-semibold text-gray-600">{cooldown}s</span>
              </p>
            ) : (
              <button
                type="button"
                onClick={handleSendOtp}
                disabled={loading}
                className="text-xs text-blue-600 hover:underline font-medium"
              >
                Didn&apos;t receive code? Resend OTP
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
