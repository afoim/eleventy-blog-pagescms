/**
 * 从 posts/*.md 中提取 frontmatter，生成 posts.json
 * 供 svaf-next 获取文章列表
 */
const { readdirSync, readFileSync, writeFileSync, mkdirSync } = require("fs");
const { join } = require("path");
const { marked } = require("marked");

const POSTS_DIR = join(__dirname, "posts");
const OUTPUT = join(__dirname, "posts.json");
var FEED_OUTPUT = join(__dirname, "rss.xml");
var SELF_URL = "https://2x.nz/rss.xml";

const SITE_URL = "https://raw-posts.2x.nz/";
const SITE_TITLE = "博客 | 二叉树树";
const SITE_DESC = "《二叉树树》是一个专注于IT/互联网技术分享与实践的个人技术博客，在这里你可以找到众多前沿技术的分享与实践经验。";
const AUTHOR_NAME = "二叉树树";
const AUTHOR_EMAIL = "acofork@qq.com";

/** Convert a relative URL to absolute using SITE_URL */
function absUrl(url) {
  if (!url) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  var base = SITE_URL.replace(/\/$/, "");
  var path = url.startsWith("/") ? url : "/" + url;
  return base + path;
}

// --- Configure marked to use absUrl for images and links ---
var renderer = new marked.Renderer();
renderer.image = function (tok) {
  var href = tok.href ? absUrl(tok.href) : "";
  var alt = tok.text || "";
  return '<img src="' + href + '" alt="' + alt.replace(/"/g, "&quot;") + '" />';
};
renderer.link = function (tok) {
  var href = tok.href ? absUrl(tok.href) : "";
  return '<a href="' + href + '">' + tok.text + "</a>";
};
marked.setOptions({ renderer: renderer, breaks: false, gfm: true });

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
const rawPosts = [];

for (const file of readdirSync(POSTS_DIR)) {
  if (!file.endsWith(".md") && !file.endsWith(".markdown")) continue;

  const raw = readFileSync(join(POSTS_DIR, file), "utf-8");
  const slug = file.replace(/\.(md|markdown)$/, "");

  // Parse frontmatter
  const match = raw.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) {
    console.warn("⚠️  " + file + ": no frontmatter found");
    continue;
  }

  const fm = parseFrontmatter(match[1]);
  const body = raw.slice(match[0].length);

  rawPosts.push({ slug, body });

  if (!fm.title) {
    console.warn("⚠️  " + file + ": no title");
    continue;
  }

  posts.push({
    slug,
    title: fm.title,
    description: fm.description || "",
    published: fm.date || "",
    image: fm.coverImage ? absUrl(fm.coverImage) : null,
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
console.log("Generated posts.json with " + posts.length + " posts");

// ---- Rewrite Markdown: convert relative paths to absolute ----
var POSTS_OUT = join(__dirname, "dist", "posts");

// Ensure dist/ and dist/posts/ exist
mkdirSync(join(__dirname, "dist"), { recursive: true });
mkdirSync(POSTS_OUT, { recursive: true });

/** Rewrite relative URL references in Markdown body to absolute */
function rewriteMarkdownPaths(mdBody) {
  mdBody = mdBody.replace(/\/img\//g, SITE_URL.replace(/\/$/, "") + "/img/");
  mdBody = mdBody.replace(/(?<!!)\[([^\]]+)\]\((\/[^)]+)\)/g, function (_, text, url) {
    if (url.indexOf(SITE_URL.replace(/\/$/, "")) >= 0) return _;
    return "[" + text + "](" + absUrl(url) + ")";
  });
  return mdBody;
}

// Write rewritten .md files to dist/posts/ so the frontend gets absolute URLs
for (var fi = 0; fi < rawPosts.length; fi++) {
  var origSlug = rawPosts[fi].slug;
  var origFile = origSlug + ".md";
  var src = readFileSync(join(POSTS_DIR, origFile), "utf-8");
  var rewritten = rewriteMarkdownPaths(src);
  writeFileSync(join(POSTS_OUT, origFile), rewritten, "utf-8");
}
console.log("Rewrote " + rawPosts.length + " Markdown files to dist/posts/ with absolute URLs");

// ---- RSS 2.0 Feed ----
function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toRfc822Date(dateStr) {
  if (!dateStr) return new Date().toUTCString();
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? new Date().toUTCString() : d.toUTCString();
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

/** Build an RSS 2.0 feed from the visible (non-draft, non-hidden) posts */
function generateRssFeed(allPosts, allRawPosts) {
  var RSS_URL = "https://2x.nz/";
  var visible = allPosts.filter(function (p) { return !p.draft && !p.hide; });
  var lastBuildDate =
    visible.length > 0 ? toRfc822Date(visible[0].published) : new Date().toUTCString();

  // Build a map of slug to raw Markdown body for quick lookup
  var bodyMap = {};
  for (var i = 0; i < allRawPosts.length; i++) {
    bodyMap[allRawPosts[i].slug] = allRawPosts[i].body;
  }

  var lines = [];
  lines.push('<?xml version="1.0" encoding="utf-8"?>');
  lines.push('<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">');
  lines.push("  <channel>");
  lines.push("    <title>" + escapeXml(SITE_TITLE) + "</title>");
  lines.push("    <link>" + escapeXml(RSS_URL) + "</link>");
  lines.push("    <description>" + escapeXml(SITE_DESC) + "</description>");
  lines.push("    <language>zh-CN</language>");
  lines.push("    <lastBuildDate>" + lastBuildDate + "</lastBuildDate>");
  lines.push("    <generator>generate-posts.js (Eleventy CMS)</generator>");
  lines.push('    <atom:link href="' + escapeXml(SELF_URL) + '" rel="self" type="application/rss+xml"/>');
  lines.push("    <managingEditor>" + escapeXml(AUTHOR_EMAIL) + " (" + escapeXml(AUTHOR_NAME) + ")</managingEditor>");
  lines.push("    <webMaster>" + escapeXml(AUTHOR_EMAIL) + " (" + escapeXml(AUTHOR_NAME) + ")</webMaster>");

  for (var j = 0; j < visible.length; j++) {
    var post = visible[j];
    var postUrl = RSS_URL + "posts/" + post.slug + "/";

    // Convert Markdown body to HTML using marked
    var rawBody = bodyMap[post.slug] || "";
    var contentHtml = marked.parse(rawBody);

    // Full HTML with cover image at top if available
    var fullContent = "";
    if (post.image) {
      fullContent += '<p><img src="' + absUrl(post.image) + '" alt="' + escapeXml(post.title) + '" /></p>';
    }
    if (post.description) {
      fullContent += "<p>" + escapeXml(post.description) + "</p>";
    }
    fullContent += contentHtml;

    lines.push("    <item>");
    lines.push("      <title>" + escapeXml(post.title) + "</title>");
    lines.push("      <link>" + escapeXml(postUrl) + "</link>");
    lines.push('      <guid isPermaLink="true">' + escapeXml(postUrl) + "</guid>");
    lines.push("      <pubDate>" + toRfc822Date(post.published) + "</pubDate>");

    if (post.description) {
      lines.push("      <description>" + escapeXml(post.description) + "</description>");
    }

    // Full article content (CDATA-wrapped for HTML)
    lines.push("      <content:encoded><![CDATA[" + fullContent + "]]></content:encoded>");

    // Cover image as media:content (for follow.io and other readers)
    if (post.image) {
      var ext = (post.image.toLowerCase().match(/\.\w+$/) || [""])[0];
      var mime = MIME_MAP[ext] || "image/jpeg";
      lines.push('      <media:content url="' + absUrl(post.image) + '" type="' + mime + '" medium="image" />');
      lines.push('      <media:thumbnail url="' + absUrl(post.image) + '" />');
    }

    // Categories / tags
    if (Array.isArray(post.tags)) {
      for (var k = 0; k < post.tags.length; k++) {
        lines.push("      <category>" + escapeXml(post.tags[k]) + "</category>");
      }
    }
    if (post.category) {
      lines.push("      <category>" + escapeXml(post.category) + "</category>");
    }

    lines.push("    </item>");
  }

  lines.push("  </channel>");
  lines.push("</rss>");
  return lines.join("\n") + "\n";
}

writeFileSync(FEED_OUTPUT, generateRssFeed(posts, rawPosts), "utf-8");
console.log("Generated rss.xml with " + posts.filter(function (p) { return !p.draft && !p.hide; }).length + " entries (RSS 2.0)");

// Write into dist/ so deploy.yml only needs to copy img/ and _headers
writeFileSync(join(__dirname, "dist", "posts.json"), JSON.stringify(posts, null, 2), "utf-8");
writeFileSync(join(__dirname, "dist", "rss.xml"), readFileSync(FEED_OUTPUT, "utf-8"), "utf-8");
console.log("Copied posts.json and rss.xml into dist/");
