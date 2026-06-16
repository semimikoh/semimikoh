import fs from "node:fs/promises";

const README_PATH = "README.md";
const GITHUB_USERNAME = "semimikoh";

// Vite는 #22393(미머지) + rollup#2002 nesting 때문에 자동 검색 대신 여기서 수기 관리.
// 새 Vite PR이 머지되면 이 블록에 직접 한 줄 추가하면 됩니다.
const VITE_MANUAL = `- [Vite](https://github.com/vitejs/vite/pulls?q=author:semimikoh+is:merged)
  - feat(css): emit named exports for JS keyword class names in CSS modules [#22393](https://github.com/vitejs/vite/pull/22393)
    - feat(pluginutils): named exports for reserved-word keys + fix duplicate default export in dataToEsm [#2002](https://github.com/rollup/plugins/pull/2002)
  - fix(optimizer): pass oxc jsx options to transformSync in dependency scan [#22342](https://github.com/vitejs/vite/pull/22342)
  - fix(optimizer): allow user transform.target to override default in optimizeDeps [#22273](https://github.com/vitejs/vite/pull/22273)
  - fix: detect Deno workspace root (fix #22237) [#22238](https://github.com/vitejs/vite/pull/22238)
  - fix: skip fallback sourcemap generation for \`?raw\` imports [#22148](https://github.com/vitejs/vite/pull/22148)`;

// 여기에 레포만 등록하면 자동으로 PR을 검색합니다
const repos = [
  { label: "Node.js", owner: "nodejs", repo: "node" },
  { label: "Vite", owner: "vitejs", repo: "vite", manual: VITE_MANUAL },
  { label: "Mantine", owner: "mantinedev", repo: "mantine" },
  { label: "TanStack Query", owner: "TanStack", repo: "query" },
  { label: "Tiptap", owner: "ueberdosis", repo: "tiptap" },
  { label: "waffleBase", owner: "wafflebase", repo: "wafflebase" },
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
    if (group.manual) {
      lines.push(group.manual, "");
      continue;
    }

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

  for (const { label, owner, repo, manual } of repos) {
    // 수기 관리 그룹(Vite)은 자동 검색하지 않고 고정 블록을 순서대로 끼워 넣음
    if (manual) {
      grouped.push({ label, owner, repo, manual });
      continue;
    }

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
