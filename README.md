# GSEA Academic Attendance Register & Live Progression System

A web-based multi-semester, multi-group academic attendance register and progression tracker designed for GSEA, integrated with a GitHub cloud backend (`powerforcemotiondrive-pixel/gsea-attendance`).

---

## 🌟 Key Features

1. **6 Dedicated Semester Registers:**
   - **Semester 1 AAS**
   - **Semester 1 AG**
   - **Semester 2 AAS**
   - **Semester 2 AG**
   - **Semester 3**
   - **Semester 4**
   - Switching semesters instantly switches to that semester's register.

2. **Independent Group Pages per Semester:**
   - **Group A**, **Group B**, **Group C**, and **Group D**.
   - Each group appears on its own dedicated page with isolated rosters, attendance records, and cohort progression metrics.
   - URL Hash Routing (`#sem=sem1_aas&group=A`, `#sem=sem1_aas&group=B`, etc.) for direct bookmarking and browser history navigation (back/forward).

3. **Real-Time GitHub Backend Synchronization:**
   - **Direct GitHub REST API**: Direct commits to `powerforcemotiondrive-pixel/gsea-attendance` (`data/attendance.json`) via GitHub Personal Access Token.
   - **Cloudflare Worker Proxy**: Production-ready serverless proxy (`backend/worker.js`) to commit securely without exposing tokens on client browsers.
   - **Offline Resilience**: Instant local storage (`localStorage`) fallback if offline or backend is unconfigured.

4. **Attendance Tracking & Actions:**
   - **Quick-Cycle Status**: Unmarked (`-`) &rarr; Present (`✓` Green) &rarr; Late (`◷` Amber) &rarr; Absent (`✕` Red) &rarr; Excused (`≡` Sky Blue) &rarr; Unmarked.
   - **Attendance Notes**: Right-click on any cell to add/edit reasons or remarks (with indicator dot).
   - **Live Progression Metrics**: Group attendance rate %, total present, late count, absences, and enrolled students.
   - **Student Search**: Real-time filtering by name or student ID (press `Esc` to clear).
   - **Bulk Actions**: Mark all students present for any selected week.
   - **Dynamic Weeks**: Add new week columns on the fly.
   - **Student Enrollment & Archiving**: Enroll new students or archive existing ones per group.
   - **CSV Export**: RFC-4180 compliant CSV export for the active group register.
   - **Print Optimization**: Clean print layout formatted for physical records or PDF export.
   - **All Registers Overview**: Modal summarizing rates across all 24 registers with 1-click jump.

---

## 🚀 Getting Started

Simply open `index.html` in your web browser:
```bash
open index.html
```

Or deploy to **GitHub Pages** (automatically served from `index.html`).

---

## ☁️ GitHub Backend Setup

Click the **Cloud Backend** button in the top-right header to configure your backend:

- **Option A (Direct GitHub API):** Enter your GitHub Personal Access Token (`repo` scope), repo (`powerforcemotiondrive-pixel/gsea-attendance`), branch (`main`), and file path (`data/attendance.json`).
- **Option B (Cloudflare Worker):** Deploy `backend/worker.js` to Cloudflare Workers and enter the worker URL. See [`backend/README.md`](backend/README.md) for step-by-step setup.
