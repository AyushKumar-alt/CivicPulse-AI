<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=6,11,20&height=220&section=header&text=Community%20Hero%20AI&fontSize=60&fontColor=fff&animation=twinkling&fontAlignY=38&desc=AI-Powered%20Civic%20Operations%20Platform&descAlignY=58&descSize=22&descColor=cce4ff" width="100%" />

<br/>

<a href="https://community-hero-ai-kappa.vercel.app/">
  <img src="https://img.shields.io/badge/🌐%20Live%20Demo-community--hero--ai-0070f3?style=for-the-badge&logoColor=white" alt="Live Demo" />
</a>
&nbsp;&nbsp;
<a href="https://drive.google.com/file/d/1_-7jrisPD6U-JF4dw-6rlBLbE_Gk1oeD/view?usp=drive_link">
  <img src="https://img.shields.io/badge/▶%20Demo%20Video-Watch%20Now-FF0000?style=for-the-badge&logo=google-drive&logoColor=white" alt="Demo Video" />
</a>
&nbsp;&nbsp;
<a href="https://drive.google.com/file/d/1eZPHg-Vx_K3ywxzl5_VEeYTqVdn2XnIv/view?usp=drive_link">
  <img src="https://img.shields.io/badge/📱%20Mobile%20Demo-Watch%20Now-34A853?style=for-the-badge&logo=google-drive&logoColor=white" alt="Mobile App Demo" />
</a>
&nbsp;&nbsp;
<a href="https://3000-cs-73db60fe-3c51-465e-bd11-dc1e25e50cb6.cs-asia-southeast1-bool.cloudshell.dev/authority">
  <img src="https://img.shields.io/badge/☁️%20Google%20Cloud-Live%20Shell-4285F4?style=for-the-badge&logo=google-cloud&logoColor=white" alt="Google Cloud" />
</a>

<br/><br/>

<img src="https://img.shields.io/badge/Next.js-16.2.9-000000?style=flat-square&logo=next.js&logoColor=white" />
<img src="https://img.shields.io/badge/Firebase-Auth%20%26%20Firestore-FFCA28?style=flat-square&logo=firebase&logoColor=black" />
<img src="https://img.shields.io/badge/Gemini-2.5%20Flash-4285F4?style=flat-square&logo=google&logoColor=white" />
<img src="https://img.shields.io/badge/Tailwind%20CSS-v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" />
<img src="https://img.shields.io/badge/Cloudinary-Image%20CDN-3448C5?style=flat-square&logo=cloudinary&logoColor=white" />
<img src="https://img.shields.io/badge/Vercel-Deployed-000000?style=flat-square&logo=vercel&logoColor=white" />
<img src="https://img.shields.io/badge/Google%20Cloud-Hosted-4285F4?style=flat-square&logo=google-cloud&logoColor=white" />

<br/><br/>

<p><em>Bridging citizens and municipal government through AI — report a civic issue, get it analyzed, assigned, repaired, verified, and governance-reviewed, all in one transparent platform.</em></p>

</div>

---

##  What is Community Hero AI?

Community Hero AI is a full-stack, AI-powered civic infrastructure management platform that transforms how citizens report local issues — potholes, water leaks, electrical failures, sanitation problems — and how municipal departments resolve them.

It replaces fragmented hotlines and unstructured social media complaints with an end-to-end intelligent workflow: from the moment a citizen photographs an issue, to the moment a Command Centre officer signs off on the completed repair — with full AI reasoning, photographic verification, and governance accountability at every step.

---

##  Features

<table>
<tr>
<td width="50%" valign="top">

###  Issue Intelligence Report (IIR)
Every submitted issue is analysed by **Google Gemini 2.5 Flash**. A single photo generates 35+ structured fields — severity, impact score, affected population, area classification, repair complexity, required equipment, safety protocols, and automatic department routing. The image is analysed exactly once; all downstream agents reason from the stored report.

</td>
<td width="50%" valign="top">

###  Instant GPS Location
Two-stage geolocation: network/WiFi fix in under 1 second, then silent GPS refinement in the background. Coordinates are reverse-geocoded to a human-readable address and zone type (Residential, Commercial, Healthcare, Industrial). Citizens get their location captured fast — no waiting.

</td>
</tr>
<tr>
<td width="50%" valign="top">

###  Department AI Workflow
Departments receive AI-generated **Action Plans** (crew, tools, safety protocols, step-by-step instructions, traffic management) and stage-by-stage **Workflow Advice** as they advance through:
`Assigned → Acknowledged → Site Inspection → In Progress → Pending Verification`

</td>
<td width="50%" valign="top">

###  AI Photographic Verification
When repair is complete, departments upload an after-photo. The **Verification Agent** cross-checks it against the original IIR and Action Plan, returning a confidence score (0–100%) and recommendation — **Approve / Needs Inspection / Needs Rework** — with detailed reasoning.

</td>
</tr>
<tr>
<td width="50%" valign="top">

###  Governance Review & Accountability
The Command Centre triggers **AI Governance Reviews** on any completed issue — generating quality scores, SLA compliance checks, accountability reports, and public disclosure summaries. Officers can override AI decisions with documented reasons; both the AI recommendation and override are permanently stored.

</td>
<td width="50%" valign="top">

###  Morning AI Briefing
Every morning, the Command Centre receives a **narrative AI briefing**: open critical issues, overdue repairs, department backlogs, escalation alerts — a full situational picture before the day begins.

</td>
</tr>
<tr>
<td width="50%" valign="top">

###  3-Layer Role Security
**Role selection at sign-in → Firebase custom claims validation → page-level guards.** Citizens, Department staff, and Command Centre are cryptographically separated. Cross-role access is blocked at every layer — selecting the wrong portal and entering valid credentials shows an access denial, not the wrong dashboard.

</td>
<td width="50%" valign="top">

###  Dark Mode + PWA
Full dark mode with anti-flash script, localStorage persistence, and system preference detection. Installable as a **Progressive Web App** on any Android or iOS device directly from the browser — no app store required.

</td>
</tr>
<tr>
<td width="50%" valign="top">

###  Community Confirmation & Escalation
Citizens can **confirm** each other's reports. At 3 confirmations, an issue is automatically escalated with an AI-generated **Escalation Brief** (risk summary, affected population estimate, urgency level, recommended action). Critical-severity issues escalate immediately.

</td>
<td width="50%" valign="top">

###  Community Comments
Citizens add live comments (up to 300 characters) to any issue — contributing local knowledge, updates, or follow-up context. Comment counts are tracked and displayed. All comments are permanently stored and cannot be edited or deleted after posting (audit integrity).

</td>
</tr>
</table>

---

##  User Roles & Access

| Role | Portal | Capabilities |
|------|--------|--------------|
|  **Citizen** | `/dashboard` | Report issues · Track status · Confirm reports · Add comments · View IIR |
|  **Department** | `/department` | Manage assigned issues · Generate AI plans · Advance stages · Submit verification |
|  **Command Centre** | `/authority` | Full oversight · Analytics · Governance review · Morning briefing · Delete issues |

**Department accounts:** Roads · CMWSSB (Water Supply) · Electricity · Sanitation · Traffic · Public Works

---

##  Complete Working Flow

```
CITIZEN                     DEPARTMENT                  COMMAND CENTRE
  │                              │                             │
  ├─  Take / Upload Photo      │                             │
  ├─  GPS Location (2-stage)   │                             │
  ├─  Description (optional)   │                             │
  ├─  Nearby Context           │                             │
  │                              │                             │
  ├── SUBMIT ──────────────────────────────────────────────────────────►
  │                              │                             │
  ├─   Analysis Agent → IIR (35+ fields generated)           │
  ├─   Issue auto-assigned to responsible department         │
  ├─   Escalation check (Critical severity / 3 confirms)     │
  │                              │                             │
  │                       ┌──────┴──────┐                      │
  │                       │ Receive IIR │                      │
  │                       │ + Assignment│                      │
  │                       └──────┬──────┘                      │
  │                              │                             │
  │                       ┌──────┴─────────────────┐           │
  │                       │ Generate Action Plan    │           │
  │                       │ AI: crew · tools ·      │           │
  │                       │ steps · safety ·        │           │
  │                       │ traffic · timeline      │           │
  │                       └──────┬─────────────────┘           │
  │                              │                             │
  │                       ┌──────┴─────────────────┐           │
  │                       │ Stage Advance (x4 steps)│           │
  │                       │ + AI Workflow Advice    │           │
  │                       │   at each transition    │           │
  │                       └──────┬─────────────────┘           │
  │                              │                             │
  │                       ┌──────┴─────────────────┐           │
  │                       │ Upload After-Photo      │           │
  │                       │ AI Verification Report  │           │
  │                       │ Confidence Score        │           │
  │                       │ Approve / Rework        │           │
  │                       └──────┬─────────────────┘           │
  │                              │                             │
  │                              │──── Verification ────►┌─────┴──────────┐
  │                              │                        │ Governance AI  │
  │                              │                        │ Review         │
  │                              │                        │ Accountability │
  │                              │                        │ Quality Score  │
  │                              │                        └─────┬──────────┘
  │                              │                             │
  ◄──────────────────────────────────── Status Updates ─────────┤
  Issue Resolved  / Rework Ordered                          │
```

---

##  AI Agent Architecture

| Agent | Trigger | Input | Output |
|-------|---------|-------|--------|
| **Analysis Agent** | On submission | Photo + GPS + Description + Context | Full IIR (35+ fields) |
| **Community Summarizer** | After multiple nearby reports | Clustered issue group | Concern level + summary |
| **Escalation Briefing Agent** | 3+ confirmations or Critical severity | IIR + confirmation data | Urgency level + escalation brief |
| **Action Plan Agent** | Department request | IIR + department + address | Repair plan: crew, steps, safety, timeline |
| **Workflow Advice Agent** | Each stage transition | IIR + Plan + current stage | Stage checklist + risk warnings |
| **Verification Agent** | After-photo upload | IIR + Plan + photo + notes + checkpoints | Confidence score + Approve/Rework |
| **Governance Review Agent** | Command Centre request | IIR + Plan + Verification + Full history | Quality score + accountability report |
| **Morning Briefing Agent** | Daily on CC login | All open issues | Narrative situational summary |

> **Single Image Principle:** The photo is sent to Gemini exactly once at submission. Every downstream agent reasons from the stored IIR — not the raw image. This keeps API costs minimal and all responses fast.

---

##  Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 16.2.9 (App Router), React 19 |
| **Backend (API)** | Next.js Serverless API Routes — deployed as serverless functions on Vercel / Google Cloud Run (no traditional server; each API route spins up on demand) |
| **Backend (Auth)** | Firebase Auth + Firebase Admin SDK — handles sign-in, session tokens, and server-side custom claims (`role: authority`, `role: commandcenter`) |
| **Backend (Rules)** | Cloud Firestore Security Rules — server-enforced access control; all read/write permissions validated on Google's servers, unreachable by client-side code |
| **Styling** | Tailwind CSS v4 |
| **Database** | Cloud Firestore (real-time NoSQL, Google Cloud) |
| **Image Storage** | Cloudinary (CDN + auto-optimisation) |
| **AI / Vision** | Google Gemini 2.5 Flash (multimodal — processes photos + text) |
| **Maps** | Leaflet.js (interactive issue maps) |
| **Charts** | Recharts (analytics dashboard) |
| **Geolocation** | Browser Geolocation API (two-stage: network → GPS) |
| **PWA** | next-pwa (service worker, offline-ready, installable) |
| **Hosting** | Vercel (CI/CD from GitHub) + Google Cloud Shell / Cloud Run |

---

##  Getting Started

### Prerequisites
- Node.js 18+
- Firebase project (Firestore + Authentication enabled)
- Cloudinary account (free tier works)
- Google AI Studio API key (Gemini)

### Installation

```bash
git clone https://github.com/your-username/community-hero-ai.git
cd community-hero-ai
npm install
```

### Environment Variables

Create a `.env.local` file in the project root:

```env
# Firebase
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# Cloudinary
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your_cloud_name
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=your_upload_preset

# Google Gemini AI
NEXT_PUBLIC_GEMINI_API_KEY=your_gemini_key
GEMINI_API_KEY=your_gemini_key

# Role Access Control
NEXT_PUBLIC_COMMANDCENTER_EMAIL=commandcenter@yourdomain.com
NEXT_PUBLIC_DEPARTMENT_EMAILS=roads@d.com:roads|water@d.com:cmwssb|electricity@d.com:electricity|sanitation@d.com:sanitation|traffic@d.com:traffic|publicworks@d.com:publicworks

# Escalation threshold
ESCALATION_THRESHOLD=3
```

### Run Locally

```bash
npm run dev
# Open http://localhost:3000
```

### Set Firebase Custom Claims

After creating department and command centre accounts in Firebase Auth:

```bash
node scripts/set-dept-claims.js
```

This sets the role claims that enforce role-based access control at the token level.

---

##  Project Structure

```
community-hero-ai/
├── app/
│   ├── page.tsx                  # Landing page
│   ├── sign-in/page.tsx          # 3-role sign-in with claims validation
│   ├── dashboard/page.tsx        # Citizen dashboard
│   ├── submit/page.tsx           # Issue submission (photo + GPS + AI)
│   ├── issues/[id]/              # Issue detail + comments + confirm
│   ├── department/page.tsx       # Department portal
│   └── authority/page.tsx        # Command Centre portal
├── lib/
│   ├── ai/
│   │   ├── types.ts              # IIR type definitions (35+ fields)
│   │   ├── analyzeIssue.ts       # Analysis Agent
│   │   ├── generateActionPlan.ts # Action Plan Agent
│   │   ├── generateWorkflowAdvice.ts  # Workflow Advice Agent
│   │   ├── generateVerification.ts    # Verification Agent
│   │   ├── generateGovernanceReview.ts # Governance Agent
│   │   ├── generateMorningBriefing.ts  # Briefing Agent
│   │   └── *Client.ts            # Browser-side wrappers (NEXT_PUBLIC key)
│   ├── firebase/
│   │   ├── client.ts             # Firebase client SDK
│   │   ├── admin.ts              # Firebase Admin SDK
│   │   ├── auth.ts               # Auth helpers
│   │   └── firestore.ts          # Firestore helpers
│   └── hooks/
│       ├── useRequireAuth.ts     # Auth guard
│       └── useUserRole.ts        # Role detection
├── components/
│   ├── ThemeToggle.tsx           # Dark mode toggle
│   └── IssueMap.tsx              # Leaflet map
├── firestore.rules               # Firestore security rules
└── scripts/
    └── set-dept-claims.js        # Firebase custom claims setup
```

---

##  Security Architecture

```
LAYER 1 — SIGN-IN PAGE
└── User selects role (Citizen / Command Centre / Department)
    └── Firebase signIn() resolves → getIdTokenResult() checks custom claims
        ├── Claims mismatch → logout() immediately + error message shown
        └── Claims match → redirect to correct portal only

LAYER 2 — PAGE-LEVEL GUARDS (cannot bypass with direct URL)
├── /dashboard   → redirects commandcenter→/authority, department→/department
├── /authority   → redirects citizen→/dashboard, department→/department
└── /department  → redirects citizen→/dashboard, commandcenter→/authority

LAYER 3 — FIRESTORE SECURITY RULES (server-side, cannot be bypassed)
├── Issues       → only reporter can create, only department can update status
├── Confirmations→ only non-reporters can increment count
├── Comments     → authenticated only, no edit/delete after creation
└── Delete       → Command Centre role only
```

---

##  Live Links

| | |
|---|---|
| 🚀 **Production (Vercel)** | [community-hero-ai-kappa.vercel.app](https://community-hero-ai-kappa.vercel.app/) |
| ☁️ **Google Cloud Shell** | [Cloud Shell Instance](https://3000-cs-73db60fe-3c51-465e-bd11-dc1e25e50cb6.cs-asia-southeast1-bool.cloudshell.dev/authority) |
| 🎬 **Demo Video** | [Watch on Google Drive](https://drive.google.com/file/d/1_-7jrisPD6U-JF4dw-6rlBLbE_Gk1oeD/view?usp=drive_link) |
| 📱 **Mobile App Demo** | [Watch on Google Drive](https://drive.google.com/file/d/1eZPHg-Vx_K3ywxzl5_VEeYTqVdn2XnIv/view?usp=drive_link) |

---

##  Roadmap

- [ ] Push notifications — citizens alerted on status change, departments on new assignments
- [ ] SLA tracking — automatic escalation when department deadlines are missed
- [ ] Public ward dashboard — read-only transparency view for non-registered citizens
- [ ] Multi-city support — separate data namespaces per municipal body
- [ ] WhatsApp / SMS reporting — for non-smartphone users
- [ ] Contractor accounts — for outsourced large-scale repair projects
- [ ] Analytics export — PDF / CSV reports for municipal leadership review

---

<div align="center">

<br/>

**Built for smarter cities. Built for citizens.**

<br/>

[![Live Demo](https://img.shields.io/badge/Try%20it%20Live-%20community--hero--ai--kappa.vercel.app-0070f3?style=for-the-badge&logo=vercel&logoColor=white)](https://community-hero-ai-kappa.vercel.app/)

<br/>

<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=6,11,20&height=120&section=footer&animation=twinkling" width="100%" />

</div>
