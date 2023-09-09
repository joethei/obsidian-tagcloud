import TagCloudPlugin, {logger} from "./main";
import {MarkdownPostProcessorContext, TFile} from "obsidian";
import {getAPI} from "obsidian-dataview";
import {convertToMap, getWords, recordToArray, removeStopwords} from "./functions";
import WordCloud from "wordcloud";

export class Wordcloud {
	plugin: TagCloudPlugin;

	constructor(plugin: TagCloudPlugin) {
		this.plugin = plugin;
	}

	public processor = async(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) : Promise<void> => {
		el.createEl('p').setText("generating word cloud");

		if(!WordCloud.isSupported) {
			el.createEl("p", {cls: "cloud-error", text: "Your device is not supported"});
		}

		const options = this.plugin.parseCodeblockOptions(source);

		if (options === undefined) {
			el.createEl('p', {cls: "cloud-error"}).setText("An error has occurred while reading the options, please check the console");
			return;
		}

		let content: Record<string, number> = {};

		if (options.source === 'file') {
			const file = this.plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
			if (file === undefined) return;
			if (!(file instanceof TFile)) return;

			if (options.stopwords) {
				const tmp = this.plugin.settings.stopwords.split("\n");
				const customStopwords = new Set<string>(tmp);
				content = removeStopwords(await convertToMap(await getWords(await this.plugin.app.vault.read(file))), customStopwords);
			} else {
				content = await convertToMap(await getWords(await this.plugin.app.vault.read(file)));
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
			const dataviewAPI = getAPI();
			if (dataviewAPI === undefined) {
				el.createEl("p", {cls: "cloud-error"}).setText("Dataview is not installed, but is required to use queries");
				return;
			}

			try {
				const query = options.query;
				if(!query) {
					el.createEl('p', {cls: "cloud-error"}).setText("query option is required");
					return;
				}

				const page = dataviewAPI.page(query);

				if(!page) {
					el.createEl('p', {cls: "cloud-error"}).setText("Page not found");
					return;
				}

				const rawContent = await dataviewAPI.io.load(page.file.path)
				const parsedWords = await getWords(rawContent)
				content = await convertToMap(parsedWords);

				if(options.stopwords) {
					const tmp = this.plugin.settings.stopwords.split("\n");
					const customStopwords = new Set<string>(tmp);
					content = removeStopwords(content, customStopwords)
				}
			} catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
				el.createEl('p', {cls: "cloud-error"}).setText(error.toString());
				logger.error(error);
				return;
			}
		}

		el.empty();

		if (this.plugin.calculatingWordDistribution) {
			el.createEl('p').setText('Word distribution is currently being calculated, reopen this note after calculation has finished');
		}
		const data = await recordToArray(content);
		this.plugin.generateCloud(data, options, el, "");
	}
}
