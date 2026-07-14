/**
 * 从 posts/*.md 中提取 frontmatter，生成 posts.json
 * 供 svaf-next 获取文章列表
 */
const { readdirSync, readFileSync, writeFileSync } = require("fs");
const { join } = require("path");

const POSTS_DIR = join(__dirname, "posts");
const OUTPUT = join(__dirname, "posts.json");

/** Parse YAML-like frontmatter into a map */
function parseFrontmatter(fm) {
  const lines = fm.split("\n");
  const result = {};
  let currentKey = null;
  let currentList = [];

  for (const line of lines) {
    // Key: value
    const kvMatch = line.match(/^(\w[\w_-]*):\s*(.*)$/);
    if (kvMatch) {
      // Flush previous list
      if (currentKey && currentList.length) {
        result[currentKey] = [...currentList];
        currentList = [];
      }
      currentKey = kvMatch[1];
      const val = kvMatch[2].trim();
      if (val === "") {
        // Could be a list starting next line
        currentList = [];
      } else if (val.startsWith("[")) {
        // Inline list: [a, b, c]
        result[currentKey] = val
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
          .filter(Boolean);
        currentKey = null;
      } else {
        result[currentKey] = val.replace(/^['"]|['"]$/g, "");
        currentKey = null;
      }
      continue;
    }
    // List item:  - value
    const liMatch = line.match(/^\s*-\s+(.*)$/);
    if (liMatch && currentKey) {
      currentList.push(liMatch[1].trim().replace(/^['"]|['"]$/g, ""));
    }
  }
  // Flush final list
  if (currentKey && currentList.length) {
    result[currentKey] = [...currentList];
  }

  return result;
}

const posts = [];

for (const file of readdirSync(POSTS_DIR)) {
  if (!file.endsWith(".md") && !file.endsWith(".markdown")) continue;

  const raw = readFileSync(join(POSTS_DIR, file), "utf-8");
  const slug = file.replace(/\.(md|markdown)$/, "");

  // Parse frontmatter
  const match = raw.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) {
    console.warn(`⚠️  ${file}: no frontmatter found`);
    continue;
  }

  const fm = parseFrontmatter(match[1]);
  const body = raw.slice(match[0].length);

  if (!fm.title) {
    console.warn(`⚠️  ${file}: no title`);
    continue;
  }

  posts.push({
    slug,
    title: fm.title,
    description: fm.description || "",
    published: fm.date || "",
    image: fm.coverImage || null,
    pinned: fm.pin === true || fm.pin === "true",
    draft: fm.draft === true || fm.draft === "true",
    hide: fm.hide === true || fm.hide === "true",
    category: fm.category || undefined,
    tags: Array.isArray(fm.tags) ? fm.tags : [],
    lang: fm.lang || undefined,
    ai_level: fm.ai_level ? Number(fm.ai_level) : undefined,
  });
}

// Sort by date desc (newest first)
posts.sort((a, b) => {
  if (a.published && b.published) return b.published.localeCompare(a.published);
  if (a.published) return -1;
  if (b.published) return 1;
  return 0;
});

writeFileSync(OUTPUT, JSON.stringify(posts, null, 2), "utf-8");
console.log(`✅  Generated posts.json with ${posts.length} posts`);

// ── Atom Feed ──────────────────────────────────────────────────────
const FEED_OUTPUT = join(__dirname, "feed.xml");
const SITE_URL = "https://feed.2x.nz/";
const SITE_TITLE = "AcoFork Feed";
const SITE_DESC = "AcoFork Feed. 一个随时都会冒出新奇想法的神奇小站";
const AUTHOR_NAME = "二叉树树";
const AUTHOR_EMAIL = "acofork@qq.com";

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toAtomDate(dateStr) {
  if (!dateStr) return new Date().toISOString();
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

const MIME_MAP = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
};

/** Build an Atom 1.0 feed from the visible (non-draft, non-hidden) posts */
function generateAtomFeed(allPosts) {
  const visible = allPosts.filter((p) => !p.draft && !p.hide);
  const updated =
    visible.length > 0 ? toAtomDate(visible[0].published) : new Date().toISOString();

  const lines = [];
  lines.push('<?xml version="1.0" encoding="utf-8"?>');
  lines.push('<feed xmlns="http://www.w3.org/2005/Atom">');
  lines.push(`  <title>${escapeXml(SITE_TITLE)}</title>`);
  lines.push(`  <subtitle>${escapeXml(SITE_DESC)}</subtitle>`);
  lines.push(`  <link href="${escapeXml(SITE_URL)}" rel="alternate"/>`);
  lines.push(`  <link href="${escapeXml(SITE_URL)}feed.xml" rel="self"/>`);
  lines.push(`  <id>${escapeXml(SITE_URL)}</id>`);
  lines.push(`  <updated>${updated}</updated>`);
  lines.push(`  <author>`);
  lines.push(`    <name>${escapeXml(AUTHOR_NAME)}</name>`);
  lines.push(`    <email>${escapeXml(AUTHOR_EMAIL)}</email>`);
  lines.push(`  </author>`);
  lines.push(`  <generator uri="https://github.com/afoim/eleventy-blog-pagescms">generate-posts.js</generator>`);

  for (const post of visible) {
    const postUrl = `${SITE_URL}posts/${post.slug}/`;
    const pubDate = toAtomDate(post.published);

    lines.push(`  <entry>`);
    lines.push(`    <title>${escapeXml(post.title)}</title>`);
    lines.push(`    <link href="${escapeXml(postUrl)}" rel="alternate"/>`);
    lines.push(`    <id>${escapeXml(postUrl)}</id>`);
    lines.push(`    <published>${pubDate}</published>`);
    lines.push(`    <updated>${pubDate}</updated>`);

    if (post.description) {
      lines.push(`    <summary>${escapeXml(post.description)}</summary>`);
    }
    if (Array.isArray(post.tags)) {
      for (const tag of post.tags) {
        lines.push(`    <category term="${escapeXml(tag)}"/>`);
      }
    }
    if (post.image) {
      const ext = post.image.toLowerCase().match(/\.\w+$/)?.[0] || "";
      const mime = MIME_MAP[ext] || "image/jpeg";
      const absUrl = post.image.startsWith("http") ? post.image : `${SITE_URL.replace(/\/$/, "")}${post.image}`;
      lines.push(`    <link rel="enclosure" href="${escapeXml(absUrl)}" type="${mime}"/>`);
    }
    if (post.lang) {
      lines.push(`    <content type="text" xml:lang="${escapeXml(post.lang)}"/>`);
    }

    lines.push(`  </entry>`);
  }

  lines.push("</feed>");
  return lines.join("\n") + "\n";
}

writeFileSync(FEED_OUTPUT, generateAtomFeed(posts), "utf-8");
console.log(`✅  Generated feed.xml with ${posts.filter((p) => !p.draft && !p.hide).length} entries`);
