# Community Hero AI 🦸‍♂️🏙️

Community Hero AI is a next-generation, AI-driven civic operations and issue resolution platform. Built using **Next.js 16 (Turbopack)**, **Firebase**, and **Google AI Studio (Gemini 2.5 Flash)**, the platform streamlines how citizens report community infrastructure issues and how municipal departments organize, plan, resolve, and verify repairs.

By employing a **Collaborative Multi-Agent AI system**, the application automates cognitive tasks like visual classification, severity assessment, duplicate detection, action planning, operational advice, and quality verification.

---

## 🌟 Key Features & User Roles

The platform is designed around three distinct user roles, each with custom workflows:

### 1. Citizens (Report & Validate)
* **Visual Submission**: Citizens capture and upload a photo of a civic issue (e.g., pothole, water leakage, broken signal).
* **Location Capture**: The system captures precise GPS coordinates and reverse-geocodes them to a clean address.
* **Context Hints**: Citizens can supply location hints (e.g., "Near a hospital" or "Near a school") to help the AI gauge community impact.
* **Social Confirmation ("I've seen this")**: Community members confirm other active issues, bumping their priority score dynamically.
* **Discussion Forums**: Public comments and feedback threads on individual issues.

### 2. Municipal Command Center (HQ Dashboard)
* **Situational Intelligence Map**: An interactive map showing all reported issues color-coded by AI-assessed severity.
* **Morning Briefing**: An AI-generated dashboard briefing summarizing overnight developments, active bottlenecks, weather sensitivities, and queue statuses.
* **Auto-Escalation**: System automatically detects critical safety hazards, escalating them and generating a detailed **Escalation Brief**.
* **Visual Verification Inspector**: Final sign-off interface where HQ reviews repairs submitted by departments alongside AI verification recommendations.
* **Manual Override**: Ability to re-route issues between departments or change statuses.

### 3. Department Operators (Action & Resolve)
* **Custom Queues**: Dedicated dashboards for specific departments (e.g., Roads, Sanitation, Water & Sewerage, Electricity, Traffic).
* **AI Action Plans**: For every assigned issue, the system generates a step-by-step resolution plan, including required skills, materials, and safety steps.
* **Workflow Advisor**: Provides live operational warnings and advice (e.g., "Avoid scheduling during peak hours 8 AM - 10 AM due to traffic" or "Rain forecast: road patch work is weather-sensitive").
* **Resolution Upload**: Field crews submit photos of the completed work along with notes, triggering the verification loop.

---

## 🤖 The Multi-Agent AI Architecture

The heart of the application is a suite of specialized AI agents built on **Gemini 2.5 Flash** that collaborate asynchronously:

```
                  ┌──────────────────────┐
                  │   Citizen Upload     │
                  └──────────┬───────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │    Analysis Agent    ├─────────┐
                  └──────────┬───────────┘         │
                             │ (Creates IIR)       │ (Checks for duplicates)
                             ▼                     ▼
                  ┌──────────────────────┐   ┌─────────────┐
                  │   Routing Agent      │   │ Duplicate   │
                  │   (Deterministic)    │   │ Detector    │
                  └──────────┬───────────┘   └─────────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │ Assigned Department  │
                  └──────┬──────────┬────┘
                         │          │
        (Generates Plan) │          │ (Operational Advice)
                         ▼          ▼
  ┌─────────────────────────┐   ┌─────────────────────────┐
  │   Action Planner Agent  │   │  Workflow Advisor Agent │
  └─────────────────────────┘   └─────────────────────────┘
                         │          │
                         ▼          ▼
                  ┌──────────────────────┐
                  │   Repair Completed   │
                  └──────────┬───────────┘
                             │ (Upload post-repair photo)
                             ▼
                  ┌──────────────────────┐
                  │  Verification Agent  │
                  └──────────┬───────────┘
                             │ (Recommends Approve/Rework)
                             ▼
                  ┌──────────────────────┐
                  │    Command Center    │
                  └──────────────────────┘
```

### 1. Analysis Agent
Runs immediately upon issue creation.
* **Visual Understanding**: Inspects the image to identify the exact issue type (e.g., "Road Cave-in", "Sewage Leak").
* **Severity & Safety Assessment**: Grades the issue (Low, Medium, High, Critical) and describes the public safety risk.
* **Area Intelligence**: Determines the *functional* category of the area (e.g., "Educational Campus", "Healthcare Zone", "IT District") based on address cues and visual evidence.
* **Civic Impact & Priority Scoring**: Calculates a dynamic priority score (0-10) using severity, area usage, and citizen confirmation count.
* **Repair Intelligence**: Sets initial expectations (estimated work hours, complexity, weather sensitivity, required safety setups, and specific verification checkpoints).

### 2. Action Planner Agent
Consumes the **Issue Intelligence Report (IIR)** created by the Analysis Agent to output:
* Required crew size, skills, and expected duration.
* Sequence of repair steps tailored to local conditions.
* Traffic management guidelines and safety protocols.

### 3. Workflow Advisor Agent
Examines the IIR and active project state to output contextual advice:
* Identifies operational bottlenecks.
* Flags constraints (e.g., peak-hour traffic restrictions, permits required).
* Predicts expected delays and proposes mitigation strategies.

### 4. Verification Agent
Triggers when a department submits a completed repair with a "before" and "after" photo.
* **Visual Audit**: Performs a direct visual comparison of the original issue photo against the post-repair photo.
* **Checkpoint Evaluation**: Tests if each of the verification checkpoints generated during analysis has been addressed.
* **Closure Recommendation**: Outputs a confidence percentage and a recommendation (`approve` | `needs_inspection` | `needs_rework`) with detailed reasoning and concerns.
* **Fallback**: Uses a deterministic keyword-matching fallback if Gemini API limits are reached.

### 5. Morning Briefing Agent
Aggregates active issues across all department queues to draft a high-level situational overview for Command Center dashboard operators every day.

### 6. Community Agent (Summarizer)
Analyzes discussion logs and comments on issues, evaluating public sentiment, identifying recurring problems, and flagging issues that require escalation.

---

## 🛠️ Technology Stack

* **Frontend**: Next.js 16 (App Router, Turbopack, React 19)
* **Styling**: Tailwind CSS
* **Database & Auth**: Firebase Firestore & Firebase Authentication
* **Serverless Backend**: Firebase Cloud Functions (v2) & Next.js Server Actions / API Routes
* **AI Model**: Gemini 2.5 Flash via Google AI Studio (`@google/genai` and `@google/generative-ai`)
* **File Uploads**: Cloudinary API (direct signed uploads)
* **Mapping**: React-Leaflet & OpenStreetMap API
* **Data Visualization**: Recharts

---

## 🚀 Local Development Setup

### 1. Clone the repository
Ensure you have Node.js 18+ and npm installed.

### 2. Configure Firebase Project
1. Create a project in the [Firebase Console](https://console.firebase.google.com/).
2. Enable **Authentication** (Email/Password provider).
3. Create a **Firestore Database** in your preferred region. Use the default database ID `(default)`.
4. Create a Service Account for local development:
   * Go to Project Settings -> Service Accounts.
   * Click **Generate New Private Key** and save it in the root of this project as `service-account.json`. *(This file is ignored by Git)*

### 3. Configure Cloudinary
1. Register a free account at [Cloudinary](https://cloudinary.com).
2. Go to Settings -> Upload.
3. Add an **Upload Preset**:
   * Name it `community_hero` (or update your env file).
   * Mode: **Unsigned** (allows direct uploads from the client).
   * Folder: `community-hero-issues` (optional).

### 4. Setup Environment Variables
Create a `.env.local` file in the root directory:

```env
# Client-side Firebase configs (found in Firebase console -> App settings)
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# Cloudinary configs
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=community_hero

# Gemini API Key (obtained from https://aistudio.google.com)
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash

# Authority & CommandCenter settings (emails that gain HQ dashboard access)
NEXT_PUBLIC_AUTHORITY_EMAIL=authority@demo.com
AUTHORITY_EMAIL=authority@demo.com
NEXT_PUBLIC_COMMANDCENTER_EMAIL=commandcenter@demo.com

# Department logins (pipe-separated list mapping email to department key)
# Keys: roads | electricity | cmwssb | sanitation | traffic | publicworks
NEXT_PUBLIC_DEPARTMENT_EMAILS=roads@demo.com:roads|electricity@demo.com:electricity|cmwssb@demo.com:cmwssb|sanitation@demo.com:sanitation|traffic@demo.com:traffic|publicworks@demo.com:publicworks
```

### 5. Install Dependencies and Run
```bash
# Install dependencies
npm install

# Run dev server
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## ☁️ Deployment on GCP

The app is production-ready for Google Cloud Platform (GCP).

### Option A: Firebase App Hosting (Recommended)
Firebase App Hosting automatically deploys Next.js apps to Cloud Run.

1. Install the Firebase CLI: `npm install -g firebase-tools`
2. Run `firebase login` and authorize.
3. In the project root, run:
   ```bash
   firebase apphosting:discover
   ```
4. Set your production environment variables (e.g. `GEMINI_API_KEY`, Cloudinary keys) in the Firebase App Hosting console.

### Option B: Direct Cloud Run (Docker)
1. Add `output: 'standalone'` in your `next.config.ts`.
2. Build your docker container using a standard standalone node Dockerfile.
3. Deploy to Cloud Run:
   ```bash
   gcloud run deploy community-hero-ai --source . --region us-central1 --allow-unauthenticated
   ```
