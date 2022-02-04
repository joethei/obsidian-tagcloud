import {getAllTags, MarkdownPostProcessorContext} from "obsidian";
import {getAPI} from "obsidian-dataview";
import WordCloud from "wordcloud";
import TagCloudPlugin, {logger} from "./main";

export class TagCloud {
	plugin: TagCloudPlugin;

	constructor(plugin: TagCloudPlugin) {
		this.plugin = plugin;
	}

	public processor = async(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) : Promise<void> => {
		el.createEl('p').setText("generating tag cloud");
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
				pages = dataviewAPI.pages(options.query, ctx.sourcePath);
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

		const canvas = el.createEl('canvas', {attr: {id: "tagcloud"}});
		canvas.width = options.width;
		canvas.height = options.height;

		//@ts-ignore
		const searchPlugin = this.plugin.app.internalPlugins.getPluginById("global-search");
		const search = searchPlugin && searchPlugin.instance;

		WordCloud(canvas, {
			list: filtered,
			backgroundColor: options.backgroundColor,
			color: options.color,
			shape: options.shape,
			weightFactor: options.weightFactor,
			fontFamily: options.fontFamily,
			fontWeight: options.fontWeight,
			minSize: options.minFontSize,
			minRotation: options.minRotation,
			maxRotation: options.maxRotation,
			ellipticity: options.ellipticity,
			shuffle: options.shuffle,
			rotateRatio: options.rotateRatio,
			click: item => {
				search.openGlobalSearch("tag: " + item[0]);
			},
			/*
			hover: (item, dimension, event) => {
				if(item !== undefined) {
					console.log(item[0]);
				}
			}*/
		});
	}
}
