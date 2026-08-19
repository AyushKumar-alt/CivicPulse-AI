import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Nav */}
      <nav className="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <span className="font-semibold text-gray-900">CivicPulse AI</span>
        <div className="flex items-center gap-3">
          <Link
            href="/sign-in"
            className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            Sign In
          </Link>
          <Link
            href="/sign-in"
            className="text-sm bg-blue-600 text-white rounded-lg px-4 py-2 hover:bg-blue-700 transition-colors"
          >
            Report Issue
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-24">
        <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 text-xs font-medium px-3 py-1.5 rounded-full mb-6">
          Powered by Google Gemini + Firebase
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 max-w-2xl leading-tight">
          Report Community Issues.{" "}
          <span className="text-blue-600">Let AI Drive Resolution.</span>
        </h1>
        <p className="mt-6 text-lg text-gray-500 max-w-xl">
          Upload a photo. AI classifies, prioritizes, and assigns the issue to
          the right department — automatically, within seconds.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3">
          <Link
            href="/sign-in"
            className="bg-blue-600 text-white rounded-xl px-6 py-3 text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Report an Issue
          </Link>
          <Link
            href="/sign-in"
            className="border border-gray-200 text-gray-700 rounded-xl px-6 py-3 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            See Live Dashboard
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-gray-100 px-6 py-16">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-center text-xs font-semibold text-gray-400 uppercase tracking-widest mb-10">
            How it works
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            {[
              { step: "1", label: "Citizen uploads a photo" },
              { step: "2", label: "AI analyzes + assigns" },
              { step: "3", label: "Authority acts on AI brief" },
              { step: "4", label: "Issue tracked to resolution" },
            ].map(({ step, label }) => (
              <div key={step} className="text-center">
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 font-semibold text-sm flex items-center justify-center mx-auto mb-3">
                  {step}
                </div>
                <p className="text-sm text-gray-600">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-gray-100 bg-gray-50 px-6 py-16">
        <div className="max-w-4xl mx-auto">
          <div className="grid sm:grid-cols-2 gap-6">
            {[
              {
                title: "AI Issue Analysis",
                desc: "Instant classification, severity estimation, and priority scoring from a single photo.",
              },
              {
                title: "Auto Escalation",
                desc: "Stale high-priority issues are escalated automatically overnight with AI reasoning.",
              },
              {
                title: "Community Validation",
                desc: "Citizen confirmations boost priority score and feed into AI assessments.",
              },
              {
                title: "Authority Dashboard",
                desc: "AI-generated situational briefing and priority queue for duty officers.",
              },
            ].map(({ title, desc }) => (
              <div
                key={title}
                className="bg-white rounded-xl border border-gray-200 p-5"
              >
                <h3 className="font-semibold text-gray-900 text-sm mb-1">{title}</h3>
                <p className="text-sm text-gray-500">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-gray-100 px-6 py-16 text-center">
        <Link
          href="/sign-in"
          className="bg-blue-600 text-white rounded-xl px-8 py-3.5 text-sm font-medium hover:bg-blue-700 transition-colors inline-block"
        >
          Get Started — Report an Issue
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 px-6 py-4 text-center text-xs text-gray-400">
        CivicPulse AI · Powered by Google Gemini + Firebase
      </footer>
    </div>
  );
}
