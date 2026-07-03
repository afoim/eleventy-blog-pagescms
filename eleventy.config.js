const { DateTime } = require("luxon");
const markdownItAnchor = require("markdown-it-anchor");

const pluginRss = require("@11ty/eleventy-plugin-rss");
const pluginSyntaxHighlight = require("@11ty/eleventy-plugin-syntaxhighlight");
const pluginBundle = require("@11ty/eleventy-plugin-bundle");
const pluginNavigation = require("@11ty/eleventy-navigation");
const { EleventyHtmlBasePlugin } = require("@11ty/eleventy");

const pluginDrafts = require("./eleventy.config.drafts.js");
const pluginImages = require("./eleventy.config.images.js");

module.exports = function(eleventyConfig) {
	// Copy the contents of the public folder to the output folder
	eleventyConfig.addPassthroughCopy({
		"./public/": "/public/",
		"./node_modules/prismjs/themes/prism-okaidia.css": "/css/prism-okaidia.css"
	});

	eleventyConfig.addWatchTarget("content/**/*.{svg,webp,png,jpeg}");

	// App plugins
	eleventyConfig.addPlugin(pluginDrafts);
	eleventyConfig.addPlugin(pluginImages);

	// Official plugins
	eleventyConfig.addPlugin(pluginRss);
	eleventyConfig.addPlugin(pluginSyntaxHighlight, {
		preAttributes: { tabindex: 0 }
	});
	eleventyConfig.addPlugin(pluginNavigation);
	eleventyConfig.addPlugin(EleventyHtmlBasePlugin);
	eleventyConfig.addPlugin(pluginBundle);

	// GFM 警报块 transform：构建时将 > [!tip|info|warning|caution] 转为带样式的 HTML
	eleventyConfig.addTransform("alertBlocks", (content, outputPath) => {
		if (!outputPath || !outputPath.endsWith(".html")) return content;
		const ALERTS = { tip: ["💡", "提示"], info: ["📖", "信息"], warning: ["⚠️", "注意"], caution: ["🚨", "警告"] };
		return content.replace(/<blockquote>\s*<p>\[!(tip|info|warning|caution)\]\s*([\s\S]*?)<\/p>/gi, (match, type, rest) => {
			const a = ALERTS[type.toLowerCase()];
			if (!a) return match;
			return '<blockquote data-alert data-alert-' + type.toLowerCase() + '>\n\t\t\t<p>' + a[0] + ' ' + a[1] + ' ' + rest.trim() + '</p>';
		});
	});

	// Filters
	eleventyConfig.addFilter("readableDate", (dateObj, format, zone) => {
		return DateTime.fromJSDate(dateObj, { zone: zone || "utc" }).setLocale("zh-CN").toFormat(format || "yyyy年M月d日");
	});

	eleventyConfig.addFilter('htmlDateString', (dateObj) => {
		return DateTime.fromJSDate(dateObj, {zone: 'utc'}).toFormat('yyyy-LL-dd');
	});

	eleventyConfig.addFilter("sortByPin", (posts) => {
		return [...posts].sort((a, b) => {
			if (a.data.pin && !b.data.pin) return -1;
			if (!a.data.pin && b.data.pin) return 1;
			return b.date - a.date;
		});
	});

	eleventyConfig.addFilter("head", (array, n) => {
		if(!Array.isArray(array) || array.length === 0) return [];
		if( n < 0 ) return array.slice(n);
		return array.slice(0, n);
	});

	eleventyConfig.addFilter("min", (...numbers) => {
		return Math.min.apply(null, numbers);
	});

	eleventyConfig.addFilter("getAllTags", collection => {
		let tagSet = new Set();
		for(let item of collection) {
			(item.data.tags || []).forEach(tag => tagSet.add(tag));
		}
		return Array.from(tagSet);
	});

	eleventyConfig.addFilter("filterTagList", function filterTagList(tags) {
		return (tags || []).filter(tag => ["all", "nav", "post", "posts"].indexOf(tag) === -1);
	});

	eleventyConfig.amendLibrary("md", mdLib => {
		mdLib.use(markdownItAnchor, {
			permalink: markdownItAnchor.permalink.ariaHidden({
				placement: "after",
				class: "header-anchor",
				symbol: "#",
				ariaHidden: false,
			}),
			level: [1,2,3,4],
			slugify: eleventyConfig.getFilter("slugify")
		});
	});

	return {
		templateFormats: ["md", "njk", "html", "liquid"],
		markdownTemplateEngine: "njk",
		htmlTemplateEngine: "njk",
		dir: {
			input: "content",
			includes: "../_includes",
			data: "../_data",
			output: "_site"
		},
		pathPrefix: "/",
	};
};


