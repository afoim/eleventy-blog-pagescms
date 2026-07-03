/**
 * 从 svaf 项目迁移文章到本博客
 * node scripts/migrate-from-svaf.js
 */
const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");

const SRC = "C:/Users/acofo/Documents/GitHub/svaf/src/content/posts";
const DST_POSTS = "content/blog";
const DST_IMG = "public/img";

function slugify(name) {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9一-龥]+/g, "-")
		.replace(/^-|-$/g, "");
}

function ensureDir(dir) {
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyImages(srcImgDir, slug) {
	const imgDir = path.join(srcImgDir, "img");
	if (!fs.existsSync(imgDir)) return [];

	const files = fs.readdirSync(imgDir).filter((f) =>
		/\.(png|jpe?g|gif|svg|webp|bmp|ico|mp4|webm)$/i.test(f)
	);

	const renamed = {};
	for (const file of files) {
		const newName = `${slug}-${file}`;
		const srcFile = path.join(imgDir, file);
		const dstFile = path.join(DST_IMG, newName);

		if (!fs.existsSync(dstFile)) {
			fs.copyFileSync(srcFile, dstFile);
			console.log(`  📦 图片: ${slug}/${file} → public/img/${newName}`);
		} else {
			console.log(`  ⏭ 图片已存在: public/img/${newName}`);
		}
		renamed[file] = newName;
	}
	return renamed;
}

function transformImageRefs(body, renamed) {
	let result = body;
	// ![](img/xxx) or ![alt](img/xxx)
	result = result.replace(
		/!\[([^\]]*)\]\(img\/([^)]+)\)/g,
		(match, alt, file) => {
			const newName = renamed[file];
			if (newName) {
				return `![${alt}](/public/img/${newName})`;
			}
			console.warn(`  ⚠️ 图片引用未找到文件: img/${file}`);
			return match;
		}
	);
	// <img src="img/xxx">
	result = result.replace(
		/(<img[^>]+src\s*=\s*["'])img\/([^"']+)(["'][^>]*>)/gi,
		(match, prefix, file, suffix) => {
			const newName = renamed[file];
			if (newName) {
				return `${prefix}/public/img/${newName}${suffix}`;
			}
			console.warn(`  ⚠️ 图片引用未找到文件: img/${file}`);
			return match;
		}
	);
	return result;
}

function convertDate(dateVal) {
	if (!dateVal) return new Date().toISOString().split("T")[0];
	if (dateVal === "{{ .Date }}") {
		console.warn("  ⚠️ 日期为 Hugo 占位符 {{ .Date }}，设为今天");
		return new Date().toISOString().split("T")[0];
	}
	// 如果是 Date 对象，转为 ISO 字符串
	if (dateVal instanceof Date) {
		return dateVal.toISOString().split("T")[0];
	}
	return String(dateVal);
}

function cleanTags(tags) {
	if (!tags) return [];
	if (Array.isArray(tags)) return tags.filter(Boolean);
	// 如果 tags 是字符串，按逗号分割
	if (typeof tags === "string")
		return tags.split(/,\s*/).filter(Boolean);
	return [];
}

function main() {
	ensureDir(DST_POSTS);
	ensureDir(DST_IMG);

	const entries = fs
		.readdirSync(SRC, { withFileTypes: true })
		.filter(
			(entry) =>
				entry.isDirectory() &&
				fs.existsSync(path.join(SRC, entry.name, "index.md"))
		)
		.map((entry) => entry.name)
		.sort();

	console.log(`\n📖 找到 ${entries.length} 篇文章\n`);

	let success = 0;
	let skipped = 0;
	let errors = [];

	for (const slug of entries) {
		try {
			const srcFile = path.join(SRC, slug, "index.md");
			const raw = fs.readFileSync(srcFile, "utf-8");

			// 解析 frontmatter
			const parsed = matter(raw);
			const data = parsed.data;
			const body = parsed.content;

			// --- 转换 frontmatter ---
			const newData = {
				title: data.title || slug,
				date: convertDate(data.published),
				description: data.description || "",
				draft: data.draft === true || data.draft === "true",
				tags: cleanTags(data.tags),
			};

			// --- 迁移图片 ---
			const srcPostDir = path.join(SRC, slug);
			const renamed = copyImages(srcPostDir, slug);

			// --- 替换内容中的图片引用 ---
			const newBody = transformImageRefs(body, renamed);

			// --- 写新文件 ---
			const output = matter.stringify(newBody, newData, {
				lineWidth: -1, // 不自动折行
				noCompatMode: true,
				quotingType: '"',
			});

			const dstFile = path.join(DST_POSTS, `${slug}.md`);
			fs.writeFileSync(dstFile, output, "utf-8");
			console.log(`  ✅ ${slug}.md`);
			success++;
		} catch (err) {
			console.error(`  ❌ ${slug}: ${err.message}`);
			errors.push({ slug, error: err.message });
		}
	}

	console.log(`\n📊 迁移完成`);
	console.log(`   成功: ${success}`);
	console.log(`   跳过: ${skipped}`);
	if (errors.length) {
		console.log(`   失败: ${errors.length}`);
		for (const e of errors) {
			console.log(`     - ${e.slug}: ${e.error}`);
		}
	}
	console.log("");
}

main();
