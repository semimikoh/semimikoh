import fs from "node:fs/promises";

const README_PATH = "README.md";
const GITHUB_USERNAME = "semimikoh";

// 여기에 레포만 등록하면 자동으로 PR을 검색합니다
const repos = [
  { label: "Node.js", owner: "nodejs", repo: "node" },
  { label: "Mantine", owner: "mantinedev", repo: "mantine" },
  { label: "Slate.js", owner: "ianstormtaylor", repo: "slate" },
  { label: "Tiptap", owner: "ueberdosis", repo: "tiptap" },
];

const headers = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "User-Agent": "semi-koh-readme-updater",
});

function getStatusEmoji(pr) {
  if (pr.pull_request?.merged_at ?? pr.merged_at) return "✅";
  if (pr.state === "closed") return "❌";
  return "🔄";
}

async function fetchPRsForRepo(owner, repo, token) {
  const prs = [];
  let page = 1;

  while (true) {
    const q = encodeURIComponent(`repo:${owner}/${repo} author:${GITHUB_USERNAME} type:pr`);
    const url = `https://api.github.com/search/issues?q=${q}&per_page=100&page=${page}`;
    const res = await fetch(url, { headers: headers(token) });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to search PRs for ${owner}/${repo}: ${res.status} ${text}`);
    }

    const data = await res.json();
    prs.push(...data.items);

    if (prs.length >= data.total_count) break;
    page++;
  }

  return prs;
}

function buildSection(grouped) {
  const lines = [];

  for (const group of grouped) {
    lines.push(`- [${group.label}](https://github.com/${group.owner}/${group.repo})`);

    for (const pr of group.prs) {
      lines.push(`  - ${getStatusEmoji(pr)} ${pr.title} [#${pr.number}](${pr.html_url})`);
    }

    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

async function main() {
  const token = process.env.GH_TOKEN;
  if (!token) {
    throw new Error("GH_TOKEN is required");
  }

  const grouped = [];

  for (const { label, owner, repo } of repos) {
    const prs = await fetchPRsForRepo(owner, repo, token);
    if (prs.length === 0) continue;

    // 오래된 PR이 먼저 오도록 정렬
    prs.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    grouped.push({ label, owner, repo, prs });
  }

  const newSection = buildSection(grouped);

  const readme = await fs.readFile(README_PATH, "utf8");

  const updated = readme.replace(
    /<!-- OSS_CONTRIB_START -->([\s\S]*?)<!-- OSS_CONTRIB_END -->/,
    `<!-- OSS_CONTRIB_START -->\n${newSection}\n<!-- OSS_CONTRIB_END -->`
  );

  if (readme === updated) {
    console.log("No changes");
    return;
  }

  await fs.writeFile(README_PATH, updated, "utf8");
  console.log("README updated");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
