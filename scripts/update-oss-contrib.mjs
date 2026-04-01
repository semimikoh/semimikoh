import fs from "node:fs/promises";

const README_PATH = "README.md";

const items = [
  {
    repoLabel: "Node.js",
    repoUrl: "https://github.com/nodejs/node",
    type: "pr",
    owner: "nodejs",
    repo: "node",
    number: 60841,
    text: "Fix incorrect Base64 input handling in `Buffer.byteLength` benchmark",
  },
  {
    repoLabel: "Node.js",
    repoUrl: "https://github.com/nodejs/node",
    type: "pr",
    owner: "nodejs",
    repo: "node",
    number: 62332,
    text: "Add `partialDeepEqual` to strict mode",
  },
  {
    repoLabel: "Node.js",
    repoUrl: "https://github.com/nodejs/node",
    type: "pr",
    owner: "nodejs",
    repo: "node",
    number: 62306,
    text: "Parse `NODE_OPTIONS` when `env` option is not provided",
  },
  {
    repoLabel: "Mantine",
    repoUrl: "https://github.com/mantinedev/mantine",
    type: "pr",
    owner: "mantinedev",
    repo: "mantine",
    number: 8466,
    text: "Correct `Badge` `circle` rendering when combined with `defaultProps.radius`",
  },
  {
    repoLabel: "Slate.js",
    repoUrl: "https://github.com/ianstormtaylor/slate",
    type: "pr",
    owner: "ianstormtaylor",
    repo: "slate",
    number: 5976,
    text: "Fix regression caused by missing `slate-dom` peer dependency alignment",
  },
  {
    repoLabel: "Tiptap",
    repoUrl: "https://github.com/ueberdosis/tiptap",
    type: "pr",
    owner: "ueberdosis",
    repo: "tiptap",
    number: 7626,
    text: "Prevent cursor jump during IME composition in colored text",
  },
];

function getStatusEmoji(pr) {
  if (pr.merged_at) return "✅";
  if (pr.state === "closed") return "❌";
  return "🔄";
}

async function fetchPR(owner, repo, number, token) {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${number}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "semi-koh-readme-updater",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch PR ${owner}/${repo}#${number}: ${res.status} ${text}`);
  }

  return res.json();
}

function buildSection(grouped) {
  const lines = [];

  for (const group of grouped) {
    lines.push(`- [${group.repoLabel}](${group.repoUrl})`);

    for (const item of group.items) {
      lines.push(`  - ${item.emoji} ${item.text} [#${item.number}](${item.url})`);
    }

    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

function groupByRepo(enrichedItems) {
  const map = new Map();

  for (const item of enrichedItems) {
    const key = `${item.repoLabel}|${item.repoUrl}`;
    if (!map.has(key)) {
      map.set(key, {
        repoLabel: item.repoLabel,
        repoUrl: item.repoUrl,
        items: [],
      });
    }
    map.get(key).items.push(item);
  }

  return [...map.values()];
}

async function main() {
  const token = process.env.GH_TOKEN;
  if (!token) {
    throw new Error("GH_TOKEN is required");
  }

  const enrichedItems = [];

  for (const item of items) {
    const pr = await fetchPR(item.owner, item.repo, item.number, token);
    enrichedItems.push({
      ...item,
      emoji: getStatusEmoji(pr),
      url: pr.html_url,
    });
  }

  const grouped = groupByRepo(enrichedItems);
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
