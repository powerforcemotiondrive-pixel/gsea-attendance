# GSEA Attendance - Absence & Late Reporting System

A fast, mobile-friendly, exception-only academic attendance logger for GSEA teachers and administrators.

Instead of marking every present student across 20+ registers, teachers only log **exceptions** (**Absent** or **Late**). Every submission is automatically sent to a **Google Form** that instantly streams records into a linked **Google Sheet** with zero race conditions, merge conflicts, or file locks.

---

## 🌟 Key Features

1. **4 Fast Cohort Selectors:**
   - **Promotion:** `GSEA24B`, `GSEA25A`, `GSEA25B`, `GSEA26A`
   - **Class Type:** `AAS` (Applied Animal Sciences) or `AG` (Agriculture)
   - **Group:** `Group A`, `Group B`, `Group C`, `Group D`
   - **Incident Status:** `Absent` (Rose ✕) or `Late` (Amber ◷)

2. **Rapid 5-Second Teacher Workflow:**
   - Tap the selectors (defaults to your last selection).
   - Type the **Student Name**.
   - Hit **`Enter`** (or tap **Submit Record**).
   - The entry is logged, auto-saved locally, sent to Google Sheets via Google Forms, and the name field automatically clears and refocuses for the next student.

3. **Multi-User Safe (Powered by Google Forms → Google Sheets):**
   - Built to handle multiple teachers submitting from different smartphones or laptops at the exact same moment.
   - Google Forms safely queues all incoming responses in Google's cloud pipeline and writes each row sequentially into the linked Google Sheet with timestamps.

4. **Offline Resilience & Local Activity Feed:**
   - Works offline: all logged incidents are cached locally in the browser (`localStorage`).
   - Live activity table with search, status filtering, and individual delete controls.
   - Today's Summary stats (Total, Late, Absent, Form connection status).

5. **1-Click Backup & Export Tools:**
   - **📋 Copy for Sheets**: Copies all records as tab-separated values ready to paste (`Cmd+V` / `Ctrl+V`) directly into Google Sheets.
   - **📥 CSV Export**: Downloads a clean `.csv` file.

---

## 🚀 How to Set Up Google Forms & Google Sheets

### Step 1: Create your Google Form
1. Go to [forms.google.com](https://forms.google.com) and click **Blank form**.
2. Name the form **"GSEA Attendance"**.
3. Add these 7 questions:
   - **Promotion** (Multiple choice or Short answer: `GSEA24B`, `GSEA25A`, `GSEA25B`, `GSEA26A`)
   - **Class Type** (Multiple choice or Short answer: `AAS`, `AG`)
   - **Group** (Multiple choice or Short answer: `A`, `B`, `C`, `D`)
   - **Status** (Multiple choice or Short answer: `Absent`, `Late`)
   - **Student Name** (Short answer)
   - **Date** (Date or Short answer)
   - **Notes** (Short answer, optional)

### Step 2: Link the Form to Google Sheets
1. In your Google Form, click the **Responses** tab at the top.
2. Click the green **Link to Sheets** icon.
3. Select **Create a new spreadsheet** &rarr; click **Create**.
4. A Google Sheet will open. Every submission will automatically appear here as a new row with a timestamp!

### Step 3: Get the Pre-filled Link
1. In your Google Form, click the **⋮ (three dots)** in the top-right corner.
2. Click **Get pre-filled link**.
3. Fill in sample answers for all questions:
   - Promotion: `GSEA24B`
   - Class Type: `AAS`
   - Group: `A`
   - Status: `Absent`
   - Student Name: `Test Student`
   - Date: `2026-10-07`
   - Notes: `Test note`
4. Click **Get link** (or **Copy link**) at the bottom.

### Step 4: Connect the Attendance App
1. Open [index.html](index.html) in your browser.
2. Click the **Google Form & Sheets** button in the top header.
3. Paste the copied pre-filled link into the box.
4. Click **⚡ Auto-Connect**.
5. Click **🧪 Send Test Row to Google Sheet** to verify that your Google Sheet receives the test submission.

Done! Any teacher using this webpage can now log absences and lates simultaneously.
