/**
 * 从 posts/*.md 中提取 frontmatter，生成 posts.json
 * 供 svaf-next 获取文章列表
 */
const { readdirSync, readFileSync, writeFileSync } = require("fs");
const { join } = require("path");

const POSTS_DIR = join(__dirname, "posts");
const OUTPUT = join(__dirname, "posts.json");
const FEED_OUTPUT = join(__dirname, "rss.xml");

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

/**
 * A minimal Markdown to HTML converter for the article body.
 * Handles the patterns used in this project's posts:
 *   - Headings (# ## ###)
 *   - Bold (**text**), Italic (*text*)
 *   - Inline code (`code`)
 *   - Code blocks (```...```)
 *   - Images (![alt](url))
 *   - Links ([text](url))
 *   - Unordered lists (- item)
 *   - Blockquotes (> text)
 *   - Horizontal rules (---)
 *   - Paragraphs (double-newline separated)
 */
function mdToHtml(md) {
  var html = md;

  // Escape raw HTML tags that are not already escaped
  html = html.replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Horizontal rules
  html = html.replace(/^---$/gm, "<hr />");

  // Code blocks (```lang ... ```) must come before inline code
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function (_, lang, code) {
    var langAttr = lang ? ' class="language-' + escapeXml(lang) + '"' : "";
    return "<pre><code" + langAttr + ">" + code.trim() + "</code></pre>";
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Links [text](url) must come before images
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (_, text, url) {
    return '<a href="' + absUrl(url) + '">' + text + "</a>";
  });

  // Images ![alt](url)
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, function (_, alt, url) {
    return '<img src="' + absUrl(url) + '" alt="' + alt + '" />';
  });

  // Bold and italic
  html = html.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  // Blockquotes
  html = html.replace(/^&gt;\s*(.*)$/gm, "<blockquote>$1</blockquote>");

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");

  // Headings
  html = html.replace(/^###### (.+)$/gm, "<h6>$1</h6>");
  html = html.replace(/^##### (.+)$/gm, "<h5>$1</h5>");
  html = html.replace(/^#### (.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Wrap consecutive <li> in <ul>
  html = html.replace(/((?:<li>.*?<\/li>\n?)+)/g, "<ul>$1</ul>");

  // Wrap consecutive <blockquote> in a container
  html = html.replace(/((?:<blockquote>.*?<\/blockquote>\n?)+)/g, function (match) {
    return match.replace(/<\/blockquote>\n?<blockquote>/g, "\n");
  });

  // Paragraphs: wrap remaining text blocks not already in block-level tags
  var blockTags = /^<\/?(?:h[1-6]|ul|ol|li|blockquote|pre|hr|p|div|table)/i;
  var paragraphs = html.split("\n\n").filter(Boolean);
  html = paragraphs
    .map(function (p) {
      var trimmed = p.trim();
      if (!trimmed) return "";
      if (blockTags.test(trimmed)) return trimmed;
      return "<p>" + trimmed + "</p>";
    })
    .join("\n");

  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, "");

  return html;
}

/** Build an RSS 2.0 feed from the visible (non-draft, non-hidden) posts */
function generateRssFeed(allPosts, allRawPosts) {
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
  lines.push("    <link>" + escapeXml(SITE_URL) + "</link>");
  lines.push("    <description>" + escapeXml(SITE_DESC) + "</description>");
  lines.push("    <language>zh-CN</language>");
  lines.push("    <lastBuildDate>" + lastBuildDate + "</lastBuildDate>");
  lines.push("    <generator>generate-posts.js (Eleventy CMS)</generator>");
  lines.push('    <atom:link href="' + escapeXml(SITE_URL) + 'rss.xml" rel="self" type="application/rss+xml"/>');
  lines.push("    <managingEditor>" + escapeXml(AUTHOR_EMAIL) + " (" + escapeXml(AUTHOR_NAME) + ")</managingEditor>");
  lines.push("    <webMaster>" + escapeXml(AUTHOR_EMAIL) + " (" + escapeXml(AUTHOR_NAME) + ")</webMaster>");

  for (var j = 0; j < visible.length; j++) {
    var post = visible[j];
    var postUrl = SITE_URL + "posts/" + post.slug + "/";

    // Build article HTML from Markdown body
    var rawBody = bodyMap[post.slug] || "";
    var contentHtml = mdToHtml(rawBody);

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
