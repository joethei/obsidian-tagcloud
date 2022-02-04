import TagCloudPlugin from "./main";
import {MarkdownPostProcessorContext, TFile} from "obsidian";
import WordCloud from "wordcloud";

export class Wordcloud {
	plugin: TagCloudPlugin;

	constructor(plugin: TagCloudPlugin) {
		this.plugin = plugin;
	}

	public processor = async(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) : Promise<void> => {
		el.createEl('p').setText("generating word cloud");

		const options = this.plugin.parseCodeblockOptions(source);

		if (options === undefined) {
			el.createEl('p', {cls: "cloud-error"}).setText("An error has occurred while reading the options, please check the console");
			return;
		}

		let content: Map<string, number> = new Map<string, number>();

		if (options.source === 'file') {
			const file = this.plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
			if (file === undefined) return;
			if (!(file instanceof TFile)) return;

			if (options.stopwords) {
				content = this.plugin.convertToMap(this.plugin.removeStopwords(this.plugin.getWords(await this.plugin.app.vault.read(file))));
			} else {
				content = this.plugin.convertToMap(this.plugin.getWords(await this.plugin.app.vault.read(file)));
			}
		}
		if (options.source === 'vault') {
			if (this.plugin.fileContentsWithStopwords.size === 0) {
				el.createEl("p", {cls: "cloud-error"}).setText("there is no content currently, try again later");
			}
			if (options.stopwords) {
				content = this.plugin.fileContentsWithoutStopwords;
			} else {
				content = this.plugin.fileContentsWithStopwords;
			}
		}
		if (options.source === 'query') {
			el.createEl("p", {cls: "cloud-error"}).setText("Queries are not supported in a wordcloud");
			return;
		}
		/*this part is really not performant, need to find a better solution.
		if(options.source === 'query') {
			const dataviewAPI = getAPI();
			if(dataviewAPI === undefined) {
				el.createEl("p").setText("Dataview is not installed, but is required to use queries");
				return;
			}

			const pages = dataviewAPI.pages(options.query, ctx.sourcePath);
			const words : string[] = [];
			for (let page of pages) {
				const file = this.app.vault.getAbstractFileByPath(page.file.path);
				if (file === undefined) return;
				if (!(file instanceof TFile)) return;
				const fileContent = await this.app.vault.read(file);
				words.push(...this.getWords(fileContent));
			}
			if(options.stopwords) {
				content = this.convertToMap(this.removeStopwords(words));
			}else {
				content = this.convertToMap(words);
			}
		}*/

		const filtered = Array.from(content.entries()).filter(([_, v]) => v >= options.minCount);

		el.empty();

		if (this.plugin.calculatingWordDistribution) {
			el.createEl('p').setText('Word distribution is currently being calculated, reopen this note after calculation has finished');
		}

		const canvas = el.createEl('canvas', {attr: {id: "wordcloud"}});
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
				search.openGlobalSearch(item[0]);
			},
		});
	}
}
