import {MarkdownPostProcessorContext} from "obsidian";
import TagCloudPlugin from "./main";
import WordCloud from "wordcloud";

export class LinkCloud {
	plugin: TagCloudPlugin;

	constructor(plugin: TagCloudPlugin) {
		this.plugin = plugin;
	}

	private buildMap(record: Record<string, Record<string, number>>) {
		const map = new Map<string, number>();
		for (const cachedElement of Object.values(record)) {
			for(const linked of Object.keys(cachedElement)) {
				if (map.has(linked)) {
					map.set(linked, map.get(linked) + 1);
				} else {
					map.set(linked, 1);
				}
			}
		}
		return map;
	}

	public processor = async(source: string, el: HTMLElement, _: MarkdownPostProcessorContext) : Promise<void> => {
		el.createEl('p').setText("generating link cloud");
		const options = this.plugin.parseCodeblockOptions(source);

		if (options === undefined) {
			el.createEl('p', {cls: "cloud-error"}).setText("An error has occurred while reading the options, please check the console");
			return;
		}

		let links = new Map<string, number>();
		if(options.type === "resolved") {
			links = this.buildMap(this.plugin.app.metadataCache.resolvedLinks);
		}
		if(options.type === "unresolved") {
			links = this.buildMap(this.plugin.app.metadataCache.unresolvedLinks);
		}
		if(options.type === "both") {
			links = new Map([...this.buildMap(this.plugin.app.metadataCache.resolvedLinks), ...this.buildMap(this.plugin.app.metadataCache.unresolvedLinks)]);
		}

		const finalMap = new Map<string, number>();
		for (const link of links.keys()) {
			const value = links.get(link);
			if(value >= options.minCount) {
				const file = this.plugin.app.vault.getAbstractFileByPath(link);
				if(file) {
					finalMap.set(file.name.replace(/\.md$/, ''), value);
				}else {
					finalMap.set(link, value);
				}
			}
		}
		el.empty();

		if(finalMap.size === 0) {
			el.createEl('p', {cls: "cloud-error"}).setText("No entries to generate cloud from");
			return;
		}

		const canvas = el.createEl('canvas', {attr: {id: "tagcloud"}});
		canvas.width = options.width;
		canvas.height = options.height;

		//@ts-ignore
		const searchPlugin = this.plugin.app.internalPlugins.getPluginById("global-search");
		const search = searchPlugin && searchPlugin.instance;

		WordCloud(canvas, {
			list: Array.from(finalMap.entries()),
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
				search.openGlobalSearch("file:" + item[0]);
			},
		});
	}
}
