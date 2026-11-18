# SocratesAI — Google Classroom Socratic LLM Add-on

> An official-spec Google Classroom Add-on providing interactive, curriculum-grounded Socratic AI tutoring for **US and Canadian High Schools** (Grades 9–12) across STEM and Humanities, powered by **Google Gemini**, **Anthropic Claude**, and **OpenAI ChatGPT**.

---

## 🌟 Key Capabilities

1. **Official Google Classroom Add-on Architecture**:
   - Embeds seamlessly into Google Classroom assignments, student viewports, and teacher grading workflows using Google's official iframe specifications and the **Classroom Add-on JavaScript SDK**.
   - Complies with Google's single-sign-on (SSO), query parameters (`courseId`, `itemId`, `addOnToken`, `login_hint`), and strict CSP iframe security standards (`frame-ancestors https://classroom.google.com`).

2. **Strict Socratic Pedagogical Guardrails**:
   - Built specifically for high school education: **never gives away the direct numerical answers** or writes final essays for students.
   - Diagnoses misconceptions, guides step-by-step through inquiry and scaffolding, and reinforces growth mindset.
   - Renders mathematical equations and chemical formulas with high fidelity using **LaTeX / KaTeX** (e.g. `$x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$` and `$2H_2 + O_2 \rightarrow 2H_2O$`).

3. **Multi-Model LLM Engine**:
   - **Google Gemini**: Gemini 2.0 Flash & Gemini 1.5 Pro (recommended for Classroom).
   - **Anthropic Claude**: Claude 3.5 Sonnet & Claude 3.5 Haiku (premier Socratic restraint).
   - **OpenAI ChatGPT**: GPT-4o & GPT-4o-mini (broad generalization & rubric generation).
   - **Built-in Curriculum Simulator**: Allows instant local testing out-of-the-box even before API keys are added.

4. **Curriculum Standards Alignment (US & Canada)**:
   - **United States**: Common Core Mathematics (Algebra 1 & 2, Geometry, AP Calculus, AP Statistics), Next Generation Science Standards (NGSS High School Biology, Chemistry, Physics), and Common Core ELA / AP History.
   - **Canada**: Ontario Secondary School Curriculum (OSS MTH1W, MPM2D, MCR3U Functions, MCV4U Calculus & Vectors, SNC2D, SCH3U/4U Chemistry, SPH3U/4U Physics, ENG4U, CHC2D) and Western Canadian Protocol (BC / Alberta).

5. **AI Grading & Grade Passback**:
   - Synthesizes student reasoning sessions into teacher reports: mastery %, Socratic independence score, achieved milestones, and flagged misconceptions.
   - Passes grades and personalized feedback directly back into the **Google Classroom Gradebook**.

6. **Interactive Google Classroom Test Simulator**:
   - Includes a standalone Classroom harness (`/simulator.html`) mimicking Google Classroom's host environment and postMessage bus for testing all 3 user journeys locally.

---

## 🏗️ The 3 Google Classroom Add-on Journeys

```
                    ┌──────────────────────────────────────────────────┐
                    │               Google Classroom                   │
                    └────────┬─────────────────┬────────────────┬──────┘
                             │                 │                │
            Teacher Creates  │  Student Works  │  Teacher Reviews
              Assignment     │   on Assignment │   & Grades Work
                             ▼                 ▼                ▼
                 ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
                 │ 1. Attachment   │ │ 2. Student Work │ │ 3. Grading &    │
                 │    Discovery    │ │    Socratic UI  │ │    Passback     │
                 │ (/attachment-   │ │ (/student-      │ │ (/teacher-      │
                 │   discovery)    │ │   work)         │ │   review)       │
                 └────────┬────────┘ └────────┬────────┘ └────────┬────────┘
                          │                   │                   │
                          └─────────────┬─────┴───────────────────┘
                                        │
                                        ▼
                        ┌───────────────────────────────┐
                        │      Express Server & API     │
                        ├───────────────────────────────┤
                        │    Multi-Model LLM Engine     │
                        │  (Gemini • Claude • ChatGPT)  │
                        ├───────────────────────────────┤
                        │    US & Canada High School    │
                        │      Curricula Standards      │
                        └───────────────────────────────┘
```

1. **Teacher Discovery Flow (`/attachment-discovery.html`)**:
   - Triggered when teacher clicks "Add-on" inside Google Classroom coursework editor.
   - Teacher selects the curriculum, grade level, subject, and pre-built activity template.
   - Teacher customizes Socratic style, chooses the LLM engine, and adds the activity to the assignment.

2. **Student Learning Flow (`/student-work.html`)**:
   - Loaded in an iframe when a student opens the assignment in Classroom.
   - Socratic AI tutor initiates inquiry based on the assignment prompt.
   - Student interacts, uses hint lifelines, writes in their scratchpad, and tracks mastery milestones.
   - Student clicks "Turn In / Submit" to submit their session for review.

3. **Teacher Grading & Review Flow (`/teacher-review.html`)**:
   - Opened in Google Classroom's grading drawer when evaluating a student submission.
   - Teacher inspects full student-AI transcript, AI synthesis report, independence score, and detected misconceptions.
   - One-click **Grade Passback** updates the grade in Google Classroom gradebook.

---

## 🚀 Quick Start (Local Setup)

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables (Optional for Live LLMs)
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Add your API keys:
- `GEMINI_API_KEY`: Get from [Google AI Studio](https://aistudio.google.com/)
- `ANTHROPIC_API_KEY`: Get from [Anthropic Console](https://console.anthropic.com/)
- `OPENAI_API_KEY`: Get from [OpenAI Platform](https://platform.openai.com/)

*(If no keys are provided, SocratesAI runs with full high-fidelity curriculum simulation mode!)*

### 3. Start the Server
```bash
npm run dev
```
Open your browser to:
- **Classroom Interactive Simulator**: [http://localhost:3000/simulator.html](http://localhost:3000/simulator.html)
- **Project Hub & Docs**: [http://localhost:3000/](http://localhost:3000/)
- **Teacher Discovery View**: [http://localhost:3000/attachment-discovery.html](http://localhost:3000/attachment-discovery.html)
- **Student Learning View**: [http://localhost:3000/student-work.html?attachmentId=att-demo-socratic-01](http://localhost:3000/student-work.html?attachmentId=att-demo-socratic-01)
- **Teacher Grading View**: [http://localhost:3000/teacher-review.html?submissionId=sub-alex-turner-01](http://localhost:3000/teacher-review.html?submissionId=sub-alex-turner-01)

---

## 🌐 Publishing to Google Workspace Marketplace

To deploy SocratesAI as an official Google Classroom Add-on in Google Workspace Marketplace:

### Step 1: Deploy Web Server over HTTPS
Deploy this Node.js app to Google Cloud Run, App Engine, Render, Vercel, or AWS with a valid SSL certificate (HTTPS TLS 1.2+ is mandatory for Google Classroom iframes).

### Step 2: Google Cloud Console Configuration
1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a Google Cloud Project.
3. Enable the following APIs:
   - **Google Classroom API**
   - **Google Workspace Marketplace SDK**
4. Configure OAuth Consent Screen:
   - User Type: Internal (for school domain test) or External (for public marketplace listing).
   - Scopes required:
     - `https://www.googleapis.com/auth/classroom.addons.teacher`
     - `https://www.googleapis.com/auth/classroom.addons.student`
     - `https://www.googleapis.com/auth/classroom.coursework.students`
     - `https://www.googleapis.com/auth/userinfo.email`
     - `https://www.googleapis.com/auth/userinfo.profile`

### Step 3: Google Workspace Marketplace SDK Configuration
1. In Cloud Console, go to **Google Workspace Marketplace SDK** > **App Configuration**.
2. Under **Application Integration**, check **Google Classroom add-on**.
3. Provide your production URLs configured in `google-classroom-manifest.json`:
   - **Attachment discovery URI**: `https://YOUR_DOMAIN/attachment-discovery.html`
   - **Student work URI**: `https://YOUR_DOMAIN/student-work.html`
   - **Teacher view URI**: `https://YOUR_DOMAIN/teacher-review.html`
   - **Student work review URI**: `https://YOUR_DOMAIN/teacher-review.html`

### Step 4: Installation & Testing
- In Google Classroom, open any class > **Classwork** > **Create** > **Assignment**.
- Under the **Add-ons** dropdown, select **SocratesAI**.
- The Discovery iframe will open directly inside Google Classroom!

---

## 📖 Course Materials & Grounding Sources

### Which Course Materials Are Used by Default?
SocratesAI anchors all Socratic inquiries, hints, formulas, and terminology in peer-reviewed, open-educational curriculum materials:
1. **Mathematics (Algebra I/II, Precalculus, Ontario MTH1W/MPM2D/MCR3U)**:
   - Grounded in **OpenStax Algebra & Trigonometry 2e** (Rice University, CC BY 4.0) — Chapter 2: Quadratic Equations & Completing the Square, and the **Ontario Ministry of Education Secondary Mathematics Curriculum**.
2. **Chemistry (High School Chemistry, AP Chem, Ontario SCH3U/4U)**:
   - Grounded in **OpenStax Chemistry 2e** — Chapter 4: Reaction Stoichiometry & Limiting Reactant Analysis.
3. **Biology (NGSS High School Biology, AP Biology, Ontario SNC2D/SBI4U)**:
   - Grounded in **OpenStax Biology 2e** — Chapter 8: Photosynthesis, Light-Dependent Reactions, and the Calvin-Benson Cycle.
4. **Physics & Advanced Vectors (AP Physics, Ontario MCV4U Calculus & Vectors)**:
   - Grounded in **OpenStax Calculus Volume 3** (Chapter 2: Vectors in 3D Space) and **OpenStax University Physics Volume 1** (Newtonian Mechanics).
5. **Humanities & English Language Arts (AP English, Ontario ENG4U)**:
   - Grounded in **College Board AP English Language & Composition Course and Exam Description (CED)** — Classical Rhetorical Appeals (Ethos, Pathos, Logos).

### How Teachers Load Their Own Course Materials
Teachers have complete control over the grounding sources:
- **`📁 Load My Own Materials` Button**: In the Teacher Discovery view (`/attachment-discovery.html`), click this button or drag-and-drop any syllabus, textbook PDF, markdown file (`.md`), handout (`.txt`), or lesson notes directly into the workspace.
- **`📚 Browse Curriculum Library` Button**: Provides 1-click loading from curated OpenStax and provincial curriculum standards.
- **Custom Source Citation**: Teachers can name their custom source (e.g. *"Week 4 Lecture Notes — Period 2"*), which is displayed to students inside their **"📖 Course Reading"** drawer during their Socratic dialogue.

---

## 🎮 Google Classroom Host Simulator: All 4 Tabs

The simulator (`/simulator.html`) fully emulates Google Classroom's host environment across all four navigation tabs:

| Tab | Feature | How It Works |
| :--- | :--- | :--- |
| **Stream** | Live Class Announcements & Feed | Shows class banner, room info, upcoming assignment due dates, interactive instructor announcement posting, and student discussion comments. |
| **Classwork** | Add-on Viewport & Journey Switcher | Embeds the SocratesAI Add-on iframe and allows 1-click switching between **Teacher Discovery**, **Student Work**, and **Teacher Review**. Includes real-time `postMessage` inspector. |
| **People** | Teacher & Student Cohort Roster | Displays course teachers and all 6 enrolled students with live AI session statuses (*Completed*, *In Progress*, *Not Started*) and quick-launch links. |
| **Grades** | Official Classroom Gradebook | Displays student grades, class average (91.7%), live grade passback animations when a teacher scores work, and a one-click **"📥 Export CSV / Google Sheets"** download. |

---

## 🎯 Feature Roadmap & Future Options

Here is the current architectural options roadmap:

1. **(Option 1) Interactive Math & Science Grapher / Visualizer**:
   - Embed an interactive KaTeX + Canvas graphing engine (quadratic parabolas, vertex shifts, calculus tangent lines, and physics vector diagrams) into the student workspace alongside the Socratic tutor.
2. **(Option 2) Real-Time Teacher Live Monitoring Dashboard**:
   - A live multi-student cockpit allowing teachers to see all students working simultaneously in class, real-time confusion/misconception flags, and instant teacher-intervention messaging.
3. **(Option 3) Voice Socratic Interaction & Accessibility**:
   - Web Speech API integration providing Speech-to-Text student inquiry and natural text-to-speech audio guidance for ESL/ELL students and IEP/504 accommodations.
4. **(Option 4) Google Workspace Marketplace & Production Deployment**:
   - Full OAuth2 SSO token verification, Google Cloud Run Docker packaging, and official Workspace Marketplace listing review checklist.

---

## 🖼️ Add-on Display Mode Options

Google Workspace Add-ons can render in different visual layouts inside Google Classroom.
The layout is controlled primarily by `simulator.html` (host frame) and the CSS in `public/css/classroom-frame.css`.

| # | Mode | Description | Files to Change |
| :- | :--- | :--- | :--- |
| **1** | **Right-Side Panel** | A slim sidebar that slides in from the right edge of Classroom, keeping the Classwork view visible. Non-intrusive — mirrors how Gmail add-on sidepanels work. | `simulator.html` (add `.panel-host` wrapper), `classroom-frame.css` |
| **2** | **Full Iframe Page** | The add-on fills the full content area below the header tabs, replacing the Classwork view entirely while the add-on is active. **(Current default behaviour.)** | Already implemented in `simulator.html` |
| **3** | **Material Design Card** | Styled exactly like a native Google Classroom card/tile — Google's blue/white palette, `Roboto` font, card shadows — so the add-on blends in seamlessly with the native UI. | `theme.css`, `classroom-frame.css`, all HTML iframes |
| **4** | **Floating Modal / Dialog** | Opens as a centered pop-up overlay on top of Classroom (like Google Meet's *"You are presenting"* modal). Can be dismissed without navigating away. | `simulator.html` (modal overlay div), `classroom-frame.css` |
| **5** | **Split-View** | Left side shows the Classwork assignment list; right side shows the SocratesAI panel side-by-side (e.g. 55 % / 45 % split). Best for wide screens. | `simulator.html` (flex split layout), `classroom-frame.css` |

> **How to switch modes**: Tell the AI assistant which mode number you'd like (e.g. *"switch to Mode 1 — Right-Side Panel"*) and it will update `simulator.html` and the relevant CSS files for you.

---

## 📁 Repository Structure

```
classroom-socratic-addon/
├── package.json                   # Project scripts and dependencies
├── .env.example                   # Environment variable template
├── README.md                      # Comprehensive guide & roadmap
├── google-classroom-manifest.json # Workspace Marketplace Add-on Manifest
├── server/
│   ├── index.js                   # Express server, security headers & CSP
│   ├── config.js                  # Environment & key detection
│   ├── services/
│   │   ├── llmService.js          # Multi-LLM provider (Gemini, Claude, ChatGPT)
│   │   ├── promptEngine.js        # High school Socratic prompt engine & telemetry
│   │   └── classroomService.js    # Classroom API helper & grade passback
│   ├── routes/
│   │   ├── api.js                 # Chat, curricula, materials-library endpoints
│   │   └── classroom.js           # Add-on attachment & verification webhooks
│   └── data/
│       └── curricula.js           # US/Canada catalog & OpenStax material library
└── public/
    ├── css/
    │   ├── theme.css              # Modern dark/glass design system & typography
    │   ├── components.css         # Chat bubbles, hint chips, rubric cards
    │   └── classroom-frame.css    # Full Stream, Classwork, People, Grades styling
    ├── js/
    │   ├── classroom-sdk-mock.js  # Classroom Add-on SDK bridge & postMessage
    │   ├── math-renderer.js       # KaTeX / LaTeX formula renderer
    │   ├── discovery.js           # Teacher discovery & materials library loader
    │   ├── student.js             # Student Socratic chat, reading & mastery
    │   ├── review.js              # Teacher grading & passback logic
    │   └── simulator.js           # Full 4-tab simulator & Gradebook controller
    ├── attachment-discovery.html  # Teacher Discovery iframe & materials loader
    ├── student-work.html          # Student Learning iframe & reading drawer
    ├── teacher-review.html        # Teacher Grading & Review iframe
    ├── simulator.html             # Google Classroom Interactive 4-Tab Testbed
    └── index.html                 # Documentation hub & launcher
```

---

## 📜 License
MIT License. Built for educators and students.

