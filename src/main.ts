import {getAllTags, Notice, parseYaml, Plugin, TFile} from 'obsidian';
import WordCloud from "wordcloud";
import stopword from "stopword";
import {DEFAULT_SETTINGS, TagCloudPluginSettings, TagCloudPluginSettingsTab} from "./settings";
import {getAPI} from "obsidian-dataview";

export interface CodeblockOptions {
	width: number,
	height: number,
	backgroundColor: string,
	color: string,
	shape: string,
	weightFactor: number,
	stopwords: boolean,
	source: 'vault' | 'file' | 'query',
	fontFamily: string,
	fontWeight: string,
	minFontSize: number,
	minRotation: number,
	maxRotation: number,
	ellipticity: number,
	shuffle: boolean,
	rotateRatio: number,
	query: string,
}


export default class TagCloudPlugin extends Plugin {
	settings: TagCloudPluginSettings;

	//cache for word frequency
	fileContentsWithStopwords: Map<string, number> = new Map<string, number>();
	fileContentsWithoutStopwords: Map<string, number> = new Map<string, number>();

	//guard against running the word frequency calculation simultaneously(computationally intensive).
	calculatingWordDistribution = false;

	//original code taken from: https://gist.github.com/chrisgrieser/ac16a80cdd9e8e0e84606cc24e35ad99
	removeMarkdown(text: string): string {
		return text
			.replace(/`\$?=[^`]+`/g, "") // inline dataview
			.replace(/^---\n.*?\n---\n/s, "") // YAML Header
			.replace(/!?\[(.+)\]\(.+\)/g, "$1") // URLs & Image Captions
			.replace(/\*|_|\[\[|\]\]|\||==|~~|---|#|> |`/g, "") // Markdown Syntax
			.replace(/<!--.*?-->/sg, "") //HTML Comments
			.replace(/%%.*?%%/sg, "")//Obsidian Comments
			.replace(/^```.*\n([\s\S]*?)```$/gm, ''); //codeblocks
	}

	parseCodeblockOptions(source: string): CodeblockOptions | undefined {
		const yaml = source ? parseYaml(source) : {};

		const previewBlock = getComputedStyle(
			document.querySelector(
				'.markdown-preview-view.is-readable-line-width .markdown-preview-sizer'
			));
		if (previewBlock === undefined) {
			console.error("Preview block is undefined");
			return undefined;
		}

		const max_width = previewBlock.getPropertyValue('width');

		//remove any units
		const width = yaml.width ? yaml.width : Number(max_width.replace(/[^\d]/g, ''));

		//@ts-ignore
		const isDarkMode = app.getTheme() === "obsidian";
		let background;
		let color: string;

		const darkEl = document.getElementsByClassName("theme-dark")[0];
		const lightEl = document.getElementsByClassName("theme-light")[0];

		if (isDarkMode) {
			const style = window.getComputedStyle(darkEl);
			background = style.getPropertyValue('--background-primary');
			color = "random-light";
		} else {
			const style = window.getComputedStyle(lightEl);
			background = style.getPropertyValue('--background-primary');
			color = "random-dark";
		}

		return {
			width: width,
			height: yaml.height ? yaml.height : width / 2,
			backgroundColor: yaml.background ? yaml.background : background,
			color: color,
			shape: yaml.shape ? yaml.shape : 'circle',
			weightFactor: yaml.weight ? yaml.weight : 2,
			stopwords: yaml.stopwords ? yaml.stopwords : true,
			source: yaml.source ? yaml.source : 'vault',
			fontFamily: yaml.fontFamily ? yaml.fontFamily : '"Trebuchet MS", "Heiti TC", "微軟正黑體", "Arial Unicode MS", "Droid Fallback Sans", sans-serif',
			fontWeight: yaml.fontWeight ? yaml.fontWeight : 'normal',
			minFontSize: yaml.minFontSize ? yaml.minFontSize : 0,
			minRotation: yaml.minRotation ? yaml.minRotation : -Math.PI / 2,
			maxRotation: yaml.maxRotation ? yaml.maxRotation : Math.PI / 2,
			ellipticity: yaml.ellipticity ? yaml.ellipticity : 0.65,
			shuffle: yaml.shuffle ? yaml.shuffle : true,
			rotateRatio: yaml.rotateRatio ? yaml.rotateRatio : 0.1,
			query: yaml.query,
		}
	}

	removeStopwords(words: string[]): string[] {
		const customStopwords = this.settings ? this.settings.stopwords.toLowerCase().split("\n") : [];
		const stopwords: string[] = [];
		Object.entries(stopword).forEach(stopword => {
			if (stopword[0] !== "removeStopwords")
				stopwords.push(...stopword[1]);
		});
		return stopword.removeStopwords(words, [...stopwords, ...customStopwords]);
	}

	getWords(text: string): string[] {
		const tmp = this.removeMarkdown(text);
		return tmp.split(/[\n\s]/g).map(word => word.toLocaleLowerCase());
	}

	async calculateWordDistribution() {
		if (this.calculatingWordDistribution) return;
		this.calculatingWordDistribution = true;
		console.log("Calculating word distribution");
		new Notice("Calculating word distribution");
		for (const file of this.app.vault.getFiles()) {
			if (file === undefined) continue;
			if (file.extension !== "md") continue;

			const fileContent = await this.app.vault.read(file);
			const words = this.getWords(fileContent);
			this.fileContentsWithStopwords = this.convertToMap(words);

			const withoutStopWords = this.removeStopwords(words);
			this.fileContentsWithoutStopwords = this.convertToMap(withoutStopWords);
		}
		console.log("Finished calculating word distribution");
		new Notice("Finished calculating word distribution");
		this.calculatingWordDistribution = false;
	}

	convertToMap(words: string[]): Map<string, number> {
		return words.reduce((acc, e) => acc.set(e, (acc.get(e) || 0) + 1), new Map());
	}

	async onload() {
		console.log("enabling Tag & Word cloud plugin");
		await this.loadSettings();
		this.addSettingTab(new TagCloudPluginSettingsTab(this));

		if (!WordCloud.isSupported) {
			new Notice("the Word & Tag cloud plugin is not compatible with your device");
			throw Error("the tag cloud plugin is not supported on your device");
		}

		this.app.workspace.onLayoutReady(async () => {
			await this.calculateWordDistribution();
		});

		this.addCommand({
			id: "recalcuate-word-distribution",
			name: "Recalculate Word Distribution",
			checkCallback: (checking: boolean) => {
				if (checking) return !this.calculatingWordDistribution;

				(async () => {
					await this.calculateWordDistribution()
				})();
			},
		})

		this.registerMarkdownCodeBlockProcessor('wordcloud', async (source, el, ctx) => {
			el.createEl('p').setText("generating tag cloud");

			const options = this.parseCodeblockOptions(source);
			if (options === undefined) {
				el.createEl('p', {cls: "cloud-error"}).setText("An error has occurred while reading the options, please check the console");
				return;
			}

			let content: Map<string, number> = new Map<string, number>();

			if (options.source === 'file') {
				const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
				if (file === undefined) return;
				if (!(file instanceof TFile)) return;

				if (options.stopwords) {
					content = this.convertToMap(this.removeStopwords(this.getWords(await this.app.vault.read(file))));
				} else {
					content = this.convertToMap(this.getWords(await this.app.vault.read(file)));
				}
			}
			if (options.source === 'vault') {
				if(this.fileContentsWithStopwords.size === 0) {
					el.createEl("p", {cls: "cloud-error"}).setText("there is no content currently, try again later");
				}
				if (options.stopwords) {
					content = this.fileContentsWithoutStopwords;
				} else {
					content = this.fileContentsWithStopwords;
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

			el.empty();

			if(this.calculatingWordDistribution) {
				el.createEl('p').setText('Word distribution is currently being calculated, reopen this note after calculation has finished');
			}

			//TODO: remove after debugging issue on user side.
			console.log(content);

			const canvas = el.createEl('canvas', {attr: {id: "wordcloud"}});
			canvas.width = options.width;
			canvas.height = options.height;

			WordCloud(canvas, {
				list: Array.from(content.entries()),
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
			});
		});

		this.registerMarkdownCodeBlockProcessor('tagcloud', async (source, el, ctx) => {
			el.createEl('p').setText("generating tag cloud");
			const options = this.parseCodeblockOptions(source);

			if (options === undefined) {
				el.createEl('p', {cls: "cloud-error"}).setText("An error has occurred while reading the options, please check the console");
				return;
			}

			const tags: string[] = [];

			if (options.source === 'file') {
				const cache = this.app.metadataCache.getCache(ctx.sourcePath);
				if(cache.tags) {
					tags.push(...cache.tags.map(tag => tag.tag));
				}
				if(cache.frontmatter && cache.frontmatter.tags) {
					tags.push(...cache.frontmatter.tags);
				}
			}
			if (options.source === 'vault') {
				//@ts-ignore
				this.app.metadataCache.getCachedFiles().forEach(filename => {
					const tmp = getAllTags(this.app.metadataCache.getCache(filename));
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
					console.error(error);
					return;
				}

				for (const page of pages) {
					tags.push(...page.file.tags);
				}

			}

			const map = tags.map(t => t.replace('#', '')).reduce((acc, e) => acc.set(e, (acc.get(e) || 0) + 1), new Map());

			//TODO: remove after debugging issue on user side.
			console.log(map);

			el.empty();

			const canvas = el.createEl('canvas', {attr: {id: "tagcloud"}});
			canvas.width = options.width;
			canvas.height = options.height;

			//@ts-ignore
			const searchPlugin = this.app.internalPlugins.getPluginById("global-search");
			const search = searchPlugin && searchPlugin.instance;

			WordCloud(canvas, {
				list: Array.from(map.entries()),
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


		});

	}

	onunload() {
		console.log("disabling Tag & Word cloud plugin");
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

}
