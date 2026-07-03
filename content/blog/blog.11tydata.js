module.exports = {
	tags: [
		"posts"
	],
	"layout": "layouts/post.njk",
	eleventyComputed: {
		permalink: data => {
			// 用文件名作为 URL slug
			return `/posts/${data.page.fileSlug}/`;
		}
	}
};
