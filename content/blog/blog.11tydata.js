module.exports = {
	tags: [
		"posts"
	],
	"layout": "layouts/post.njk",
	eleventyComputed: {
		permalink: data => {
			if (data.slug) {
				const slug = data.slug.replace(/^\/+|\/+$/g, '');
				return `/blog/${slug}/`;
			}
			// 默认使用文件路径作为 URL
			return data.page.filePathStem.replace(/^\/content/, '') + '/';
		}
	}
};
