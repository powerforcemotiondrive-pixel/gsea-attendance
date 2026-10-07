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
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const repo = env.GITHUB_REPO || "powerforcemotiondrive-pixel/gsea-attendance";
    const branch = env.GITHUB_BRANCH || "main";
    const filePath = env.FILE_PATH || "data/attendance.json";
    const token = env.GITHUB_TOKEN;

    if (!token) {
      return new Response(
        JSON.stringify({
          status: "error",
          message: "GITHUB_TOKEN secret is not configured in worker environment."
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const githubApiUrl = `https://api.github.com/repos/${repo}/contents/${filePath}?ref=${branch}`;

    // 1. GET Request: Fetch latest attendance.json from GitHub
    if (request.method === "GET") {
      try {
        const ghRes = await fetch(githubApiUrl, {
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

    // 2. POST Request: Commit updated attendance data to GitHub
    if (request.method === "POST") {
      try {
        const payload = await request.json();

        // Step 1: Get existing file SHA if it exists
        let currentSha = null;
        let existingData = {};

        const checkRes = await fetch(githubApiUrl, {
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

        // Merge or replace data
        let mergedData;
        let commitMessage = "Update attendance register";

        if (payload.action === "FULL_SNAPSHOT" && payload.fullState) {
          mergedData = payload.fullState;
          commitMessage = `Sync attendance register: ${payload.description || 'Full snapshot'}`;
        } else if (payload.semester && payload.group) {
          mergedData = existingData || {};
          if (!mergedData[payload.semester]) mergedData[payload.semester] = {};
          if (!mergedData[payload.semester][payload.group]) mergedData[payload.semester][payload.group] = {};

          if (payload.action === "UPDATE_MARK") {
            if (!mergedData[payload.semester][payload.group].attendance) {
              mergedData[payload.semester][payload.group].attendance = {};
            }
            mergedData[payload.semester][payload.group].attendance[`${payload.studentId}_${payload.week}`] = payload.status;
            commitMessage = `Attendance [${payload.semester} ${payload.group}]: ${payload.studentName || payload.studentId} ${payload.week} -> ${payload.status || 'Cleared'}`;
          } else if (payload.action === "UPDATE_REGISTER" && payload.registerData) {
            mergedData[payload.semester][payload.group] = payload.registerData;
            commitMessage = `Update register [${payload.semester} ${payload.group}]: ${payload.description || 'Register updated'}`;
          } else {
            // Generic merge
            mergedData = payload.fullState || payload;
            commitMessage = payload.description || "Update attendance";
          }
        } else {
          mergedData = payload.fullState || payload;
          commitMessage = payload.description || "Update attendance";
        }

        mergedData._lastUpdated = new Date().toISOString();

        // Step 2: Commit file to GitHub Contents API
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

        if (!putRes.ok) {
          const errDetail = await putRes.text();
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

