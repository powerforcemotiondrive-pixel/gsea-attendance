/**
 * Cloudflare Worker Backend for GSEA Attendance System
 * Syncs attendance data with GitHub Repository: powerforcemotiondrive-pixel/gsea-attendance
 *
 * Environment Secrets required in Cloudflare Worker:
 * - GITHUB_TOKEN: A GitHub Personal Access Token (classic with 'repo' scope or fine-grained with 'contents:write')
 * - GITHUB_REPO: "powerforcemotiondrive-pixel/gsea-attendance" (default fallback provided)
 * - GITHUB_BRANCH: "main" (default)
 * - FILE_PATH: "data/attendance.json" (or "attendance.json")
 */

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Cache-Control, Pragma, X-Requested-With, *",
      "Access-Control-Max-Age": "86400",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Sanitize and normalize environment variables
    let repo = (env.GITHUB_REPO || "powerforcemotiondrive-pixel/gsea-attendance").trim();
    repo = repo.replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "").replace(/^\/+|\/+$/g, "");

    let branch = (env.GITHUB_BRANCH || "main").trim();
    if (!branch) branch = "main";

    let filePath = (env.FILE_PATH || "data/attendance.json").trim();
    filePath = filePath.replace(/^\/+/, "");

    const token = (env.GITHUB_TOKEN || "").trim();

    if (!token) {
      return new Response(
        JSON.stringify({
          status: "error",
          message: "GITHUB_TOKEN secret is not configured in worker environment."
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const githubApiUrl = `https://api.github.com/repos/${repo}/contents/${filePath}?ref=${branch}&_t=${Date.now()}`;

    // 1. GET Request: Fetch latest attendance.json from GitHub
    if (request.method === "GET") {
      try {
        const ghRes = await fetch(githubApiUrl, {
          cf: { cacheTtl: 0, cacheEverything: false },
          headers: {
            "User-Agent": "GSEA-Attendance-Worker",
            "Authorization": `Bearer ${token}`,
            "Accept": "application/vnd.github.v3+json"
          }
        });

        if (ghRes.status === 404) {
          // File does not exist yet
          return new Response(
            JSON.stringify({ status: "not_found", message: "File does not exist yet", data: null }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (!ghRes.ok) {
          const errText = await ghRes.text();
          return new Response(
            JSON.stringify({ status: "error", message: `GitHub API error: ${ghRes.status}`, details: errText }),
            { status: ghRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const ghData = await ghRes.json();
        // Decode base64 UTF-8 content
        const rawContent = decodeURIComponent(escape(atob(ghData.content.replace(/\s/g, ''))));
        const parsedJson = JSON.parse(rawContent);

        return new Response(
          JSON.stringify({
            status: "success",
            sha: ghData.sha,
            data: parsedJson
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ status: "error", message: err.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // 2. POST Request: Commit updated attendance data to GitHub with concurrency retry
    if (request.method === "POST") {
      try {
        const payload = await request.json();
        const maxRetries = 4;
        let lastErrorText = "";

        for (let attempt = 0; attempt < maxRetries; attempt++) {
          // Step 1: Fetch latest file state & SHA from GitHub
          let currentSha = null;
          let existingData = {};

          const checkRes = await fetch(githubApiUrl, {
            cf: { cacheTtl: 0, cacheEverything: false },
            headers: {
              "User-Agent": "GSEA-Attendance-Worker",
              "Authorization": `Bearer ${token}`,
              "Accept": "application/vnd.github.v3+json"
            }
          });

          if (checkRes.ok) {
            const checkJson = await checkRes.json();
            currentSha = checkJson.sha;
            try {
              const rawContent = decodeURIComponent(escape(atob(checkJson.content.replace(/\s/g, ''))));
              existingData = JSON.parse(rawContent);
            } catch (e) {
              existingData = {};
            }
          }

          // Step 2: Merge incoming changes safely (protect other groups/teachers from overwrite)
          let mergedData;
          let commitMessage = payload.description || "Update attendance";

          if (payload.action === "FULL_SNAPSHOT" && payload.fullState) {
            // Deep merge to ensure concurrent edits to other semesters/groups are not wiped
            mergedData = deepMergeAttendance(existingData, payload.fullState);
          } else if (payload.semester && payload.group) {
            mergedData = existingData || {};
            if (!mergedData[payload.semester]) mergedData[payload.semester] = {};
            if (!mergedData[payload.semester][payload.group]) {
              mergedData[payload.semester][payload.group] = { weeks: [], students: [], attendance: {}, notes: {} };
            }

            if (payload.action === "UPDATE_MARK") {
              if (!mergedData[payload.semester][payload.group].attendance) {
                mergedData[payload.semester][payload.group].attendance = {};
              }
              if (payload.status) {
                mergedData[payload.semester][payload.group].attendance[`${payload.studentId}_${payload.week}`] = payload.status;
              } else {
                delete mergedData[payload.semester][payload.group].attendance[`${payload.studentId}_${payload.week}`];
              }
            } else if (payload.action === "UPDATE_NOTE") {
              if (!mergedData[payload.semester][payload.group].notes) {
                mergedData[payload.semester][payload.group].notes = {};
              }
              if (payload.noteText) {
                mergedData[payload.semester][payload.group].notes[payload.noteKey] = payload.noteText;
              } else {
                delete mergedData[payload.semester][payload.group].notes[payload.noteKey];
              }
            } else if (payload.registerData) {
              mergedData[payload.semester][payload.group] = payload.registerData;
            } else {
              mergedData = deepMergeAttendance(existingData, payload.fullState || payload);
            }
          } else {
            mergedData = deepMergeAttendance(existingData, payload.fullState || payload);
          }

          mergedData._lastUpdated = new Date().toISOString();

          // Step 3: Commit file to GitHub Contents API
          const newContentJson = JSON.stringify(mergedData, null, 2);
          const encodedContent = btoa(unescape(encodeURIComponent(newContentJson)));

          const commitBody = {
            message: commitMessage,
            content: encodedContent,
            branch: branch,
          };
          if (currentSha) {
            commitBody.sha = currentSha;
          }

          const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, {
            method: "PUT",
            headers: {
              "User-Agent": "GSEA-Attendance-Worker",
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json",
              "Accept": "application/vnd.github.v3+json"
            },
            body: JSON.stringify(commitBody)
          });

          // Handle multi-user concurrent commit (409 Conflict): another teacher committed at the same second
          if (putRes.status === 409) {
            lastErrorText = "GitHub 409 Conflict";
            // Wait briefly with exponential jitter and retry with fresh SHA
            await new Promise(r => setTimeout(r, 120 * Math.pow(2, attempt) + Math.random() * 50));
            continue;
          }

          if (!putRes.ok) {
            const errDetail = await putRes.text();

            // Intelligent diagnosis for HTTP 404
            if (putRes.status === 404) {
              try {
                const repoProbe = await fetch(`https://api.github.com/repos/${repo}`, {
                  headers: {
                    "User-Agent": "GSEA-Attendance-Worker",
                    "Authorization": `Bearer ${token}`,
                    "Accept": "application/vnd.github.v3+json"
                  }
                });

                if (repoProbe.status === 404) {
                  return new Response(
                    JSON.stringify({
                      status: "error",
                      message: `GitHub 404: Cannot access repository '${repo}'. Verify repository name in Cloudflare Worker settings, and ensure GITHUB_TOKEN has access to this repo (repo scope for classic tokens).`,
                      details: errDetail
                    }),
                    { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                  );
                }

                if (repoProbe.ok) {
                  const repoInfo = await repoProbe.json();
                  const defaultBranch = repoInfo.default_branch || "main";

                  // Auto-recovery: if user set branch to master instead of main, retry with default_branch
                  if (branch !== defaultBranch) {
                    commitBody.branch = defaultBranch;
                    const retryRes = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, {
                      method: "PUT",
                      headers: {
                        "User-Agent": "GSEA-Attendance-Worker",
                        "Authorization": `Bearer ${token}`,
                        "Content-Type": "application/json",
                        "Accept": "application/vnd.github.v3+json"
                      },
                      body: JSON.stringify(commitBody)
                    });

                    if (retryRes.ok) {
                      const retryJson = await retryRes.json();
                      return new Response(
                        JSON.stringify({
                          status: "success",
                          commitSha: retryJson.commit?.sha,
                          newFileSha: retryJson.content?.sha,
                          message: commitMessage
                        }),
                        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                      );
                    }
                  }

                  // Repo exists, branch is correct, but commit returned 404 -> Token lacks write permission!
                  return new Response(
                    JSON.stringify({
                      status: "error",
                      message: `GitHub 404: GITHUB_TOKEN has read access to '${repo}', but lacks WRITE permissions. For Fine-Grained Tokens: set 'Repository permissions > Contents' to 'Read and write'. For Classic Tokens: ensure 'repo' scope is selected.`,
                      details: errDetail
                    }),
                    { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                  );
                }
              } catch (probeErr) {
                console.warn("Probe error:", probeErr);
              }
            }

            return new Response(
              JSON.stringify({ status: "error", message: `GitHub commit error: ${putRes.status}`, details: errDetail }),
              { status: putRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          const commitResult = await putRes.json();
          return new Response(
            JSON.stringify({
              status: "success",
              commitSha: commitResult.commit?.sha,
              newFileSha: commitResult.content?.sha,
              message: commitMessage
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ status: "error", message: `Concurrent write collision: ${lastErrorText}. Please retry.` }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ status: "error", message: err.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }
};

/**
 * Deep merge helper to prevent concurrent teachers from overwriting each others registers
 */
function deepMergeAttendance(base, incoming) {
  if (!base || typeof base !== "object" || Object.keys(base).length === 0) return incoming || {};
  if (!incoming || typeof incoming !== "object") return base;

  const result = { ...base };
  for (const semKey of Object.keys(incoming)) {
    if (semKey.startsWith("_")) continue;
    if (!result[semKey]) {
      result[semKey] = incoming[semKey];
    } else {
      result[semKey] = { ...result[semKey] };
      for (const grpKey of Object.keys(incoming[semKey])) {
        if (!result[semKey][grpKey]) {
          result[semKey][grpKey] = incoming[semKey][grpKey];
        } else {
          const baseGrp = result[semKey][grpKey];
          const incGrp = incoming[semKey][grpKey];
          result[semKey][grpKey] = {
            weeks: Array.isArray(incGrp.weeks) && incGrp.weeks.length > 0 ? incGrp.weeks : (baseGrp.weeks || []),
            students: Array.isArray(incGrp.students) && incGrp.students.length > 0 ? incGrp.students : (baseGrp.students || []),
            attendance: { ...(baseGrp.attendance || {}), ...(incGrp.attendance || {}) },
            notes: { ...(baseGrp.notes || {}), ...(incGrp.notes || {}) }
          };
        }
      }
    }
  }
  result._lastUpdated = new Date().toISOString();
  return result;
}

