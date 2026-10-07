# GSEA Attendance Backend Setup (GitHub Backend)

This directory provides the backend integration to automatically sync attendance data directly into your GitHub repository (`powerforcemotiondrive-pixel/gsea-attendance`).

There are two easy ways to connect your GitHub backend:

---

## Option 1: Direct GitHub API (No server needed)

You can connect directly from the Attendance page settings modal:
1. Open the Attendance page.
2. Click the **Cloud / Settings** button in the top-right header.
3. Choose **Direct GitHub API**.
4. Enter:
   - **Repository:** `powerforcemotiondrive-pixel/gsea-attendance`
   - **Branch:** `main`
   - **File Path:** `data/attendance.json`
   - **GitHub Personal Access Token (PAT):** Generated on GitHub (Settings > Developer Settings > Personal Access Tokens) with `repo` or `contents:write` permission.
5. Click **Test & Save**. All attendance updates will automatically commit to GitHub!

---

## Option 2: Cloudflare Worker (Recommended for multi-user security)

If multiple teachers or devices use the app and you do not want to expose a GitHub token on client browsers, deploy `backend/worker.js` as a free Cloudflare Worker.

### Setup Steps:
1. Create a free account at [cloudflare.com](https://cloudflare.com) and go to **Workers & Pages**.
2. Click **Create Application** > **Create Worker**.
3. Name it e.g. `gsea-attendance-api` and paste the contents of `backend/worker.js`.
4. Go to **Settings** > **Variables and Secrets** in your Worker:
   - Add secret `GITHUB_TOKEN`: Your GitHub Personal Access Token.
   - Add variable `GITHUB_REPO`: `powerforcemotiondrive-pixel/gsea-attendance`
   - Add variable `GITHUB_BRANCH`: `main`
   - Add variable `FILE_PATH`: `data/attendance.json`
5. Click **Deploy**. Your worker URL will be:
   `https://gsea-attendance-api.<your-subdomain>.workers.dev`
6. In the Attendance page settings modal, set your **Worker API URL** to that URL.

---

## Data Schema in GitHub (`data/attendance.json`)

The backend stores attendance structured by semester and group:

```json
{
  "_lastUpdated": "2026-10-07T14:00:00.000Z",
  "sem1_aas": {
    "A": {
      "weeks": [27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41],
      "students": [
        { "id": "STD-1001", "name": "Alex Morgan" },
        { "id": "STD-1002", "name": "David Chen" }
      ],
      "attendance": {
        "STD-1001_W27": "P",
        "STD-1002_W27": "A"
      },
      "notes": {
        "STD-1002_W27": "Doctor's appointment"
      }
    },
    "B": { ... },
    "C": { ... },
    "D": { ... }
  },
  "sem1_ag": { ... },
  "sem2_aas": { ... },
  "sem2_ag": { ... },
  "sem3": { ... },
  "sem4": { ... }
}
```

