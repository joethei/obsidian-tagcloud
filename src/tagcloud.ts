import {getAllTags, MarkdownPostProcessorContext} from "obsidian";
import {getAPI} from "obsidian-dataview";
import TagCloudPlugin, {logger} from "./main";
import WordCloud from "wordcloud";

export class TagCloud {
	plugin: TagCloudPlugin;

	constructor(plugin: TagCloudPlugin) {
		this.plugin = plugin;
	}

	public processor = async(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) : Promise<void> => {
		el.createEl('p').setText("generating tag cloud");

		if(!WordCloud.isSupported) {
			el.createEl("p", {cls: "cloud-error", text: "Your device is not supported"});
		}

		const options = this.plugin.parseCodeblockOptions(source);

		if (options === undefined) {
			el.createEl('p', {cls: "cloud-error"}).setText("An error has occurred while reading the options, please check the console");
			return;
		}

		const tags: string[] = [];

		if (options.source === 'file') {
			const cache = this.plugin.app.metadataCache.getCache(ctx.sourcePath);
			if (cache.tags) {
				tags.push(...cache.tags.map(tag => tag.tag));
			}
			if (cache.frontmatter && cache.frontmatter.tags) {
				tags.push(...cache.frontmatter.tags);
			}
		}
		if (options.source === 'vault') {
			//@ts-ignore
			this.plugin.app.metadataCache.getCachedFiles().forEach(filename => {
				const tmp = getAllTags(this.plugin.app.metadataCache.getCache(filename));
				if (tmp && tmp.length > 0)
					tags.push(...tmp);
			});

		}
		if (options.source === 'query') {
			const dataviewAPI = getAPI();
			if (dataviewAPI === undefined) {
				el.createEl("p", {cls: "cloud-error"}).setText("Dataview is not installed, but is required to use queries");
				return;
			}

			let pages: any; // eslint-disable-line @typescript-eslint/no-explicit-any
			try {
				let query = options.query;
				if(!query) {
					el.createEl('p', {cls: "cloud-error"}).setText("query option is required");
					return;
				}
				if(!query.match(/[[#]/)) {
					query = '"' + options.query + '"';
				}
				pages = dataviewAPI.pages(query, ctx.sourcePath);
			} catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
				el.createEl('p', {cls: "cloud-error"}).setText(error.toString());
				logger.error(error);
				return;
			}

			for (const page of pages) {
				tags.push(...page.file.tags);
			}
		}

		const map = tags.map(t => t.replace('#', '')).reduce((acc, e) => acc.set(e, (acc.get(e) || 0) + 1), new Map());
		const filtered = Array.from(map.entries()).filter(([_, v]) => v >= options.minCount);

		el.empty();

		this.plugin.generateCloud(filtered, options, el, "tag:");
	}
}
