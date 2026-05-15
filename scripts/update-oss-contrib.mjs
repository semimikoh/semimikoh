import fs from "node:fs/promises";

const README_PATH = "README.md";
const GITHUB_USERNAME = "semimikoh";

// 여기에 레포만 등록하면 자동으로 PR을 검색합니다
const repos = [
  { label: "Node.js", owner: "nodejs", repo: "node" },
  { label: "Vite", owner: "vitejs", repo: "vite" },
  { label: "Mantine", owner: "mantinedev", repo: "mantine" },
  { label: "TanStack Query", owner: "TanStack", repo: "query" },
  { label: "Tiptap", owner: "ueberdosis", repo: "tiptap" },
];

// 제외할 PR 번호 (owner/repo#number)
const excludes = new Set([
  "nodejs/node#62303",
]);

// merged_at은 없지만 체리픽 등으로 실제 반영된 PR
const backports = new Set([
  "nodejs/node#62621",
]);

const headers = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "User-Agent": "semi-koh-readme-updater",
});

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
    lines.push(`- [${group.label}](https://github.com/${group.owner}/${group.repo}/pulls?q=author:${GITHUB_USERNAME}+is:merged)`);

    for (const pr of group.prs) {
      const title = pr.title.replace(/\s+/g, " ").trim();
      const suffix = backports.has(`${group.owner}/${group.repo}#${pr.number}`) ? " (backport)" : "";
      lines.push(`  - ${title} [#${pr.number}](${pr.html_url})${suffix}`);
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
    const allPrs = await fetchPRsForRepo(owner, repo, token);
    const prs = allPrs
      .filter((pr) => !excludes.has(`${owner}/${repo}#${pr.number}`))
      .filter((pr) => (pr.pull_request?.merged_at ?? pr.merged_at) || backports.has(`${owner}/${repo}#${pr.number}`));
    if (prs.length === 0) continue;

    // 최신 PR이 먼저 오도록 정렬
    prs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

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
