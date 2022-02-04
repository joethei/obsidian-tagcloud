import {Notice, parseYaml, Plugin} from 'obsidian';
import WordCloud from "wordcloud";
import stopword from "stopword";
import {DEFAULT_SETTINGS, TagCloudPluginSettings, TagCloudPluginSettingsTab} from "./settings";
import {LoggerManager} from "typescript-logger";
import {TagCloud} from "./tagcloud";
import {Wordcloud} from "./wordcloud";
import {LinkCloud} from "./linkcloud";

export const logger = LoggerManager.create("Tag & Word Cloud");

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
	minCount: number,
	type: 'unresolved' | 'resolved' | 'both';
}

export default class TagCloudPlugin extends Plugin {
	settings: TagCloudPluginSettings;

	//caches for word frequency
	fileContentsWithStopwords: Map<string, number> = new Map<string, number>();
	fileContentsWithoutStopwords: Map<string, number> = new Map<string, number>();

	//guard against running the word frequency calculation simultaneously
	calculatingWordDistribution = false;
	quit = false;

	parseCodeblockOptions(source: string): CodeblockOptions | undefined {
		const yaml = source ? parseYaml(source) : {};

		const previewBlock = getComputedStyle(
			document.querySelector(
				'.markdown-preview-view.is-readable-line-width .markdown-preview-sizer'
			));
		if (previewBlock === undefined) {
			logger.error("Preview block is undefined");
			return undefined;
		}

		const max_width = document.querySelectorAll(
			'.markdown-preview-view.is-readable-line-width .markdown-preview-sizer, .cm-content'
		)[0].clientWidth;


		let width = yaml.width ? yaml.width : max_width;
		//fallback if this somehow is empty
		if(width <= 0) {
			logger.warn("width is not defined, using fallback value");
			width = 500;
		}

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
			minCount: yaml.minCount ? yaml.minCount : 0,
			type: yaml.type ? yaml.type : 'resolved'
		}
	}

	//original code taken from: https://gist.github.com/chrisgrieser/ac16a80cdd9e8e0e84606cc24e35ad99
	removeMarkdown(text: string): string {
		return text
			.replace(/^---\n.*?\n---\n/s, '') // YAML Frontmatter
			.replace(/!?\[(.+)\]\(.+\)/g, '$1') // URLs & Images, we do want to keep the contents of the alias
			.replace(/__(.*?)__/gm, '$1') //bold
			.replace(/_(.*?)_/gm, '$1') //italic
			.replace(/==(.*?)==/gm, '$1') //highlights
			.replace(/\*\*(.*?)\*\*/gm, '$1') //bold
			.replace(/\*(.*?)\*/gm, '$1') //italic
			.replace(/#/g, '') //headers
			.replace(/-/g, '') //lists
			.replace(/>/g, '') //	quotes
			.replace(/\[\[(.*(?=\|))(.*)\]\]/g, '$2') //wikilinks with alias
			.replace(/\[\[([\s\S]*?)\]\]/gm, '$1') //wikilinks
			.replace(/- ?\[.{1}?\]/gm,'') //tasks
			.replace(/%%.*?%%/gm, '')//Obsidian Comments
			.replace(/`([\s\S]*?)`/gm, '') //codeblocks, inline & normal
			.replace(/\[\^[[\s\S]]*\]/g, '') //footnotes
			.replace(/\^\[([\s\S]*?)\]/g, '$1') //inline footnotes
			.replace(/\$\$([\s\S]*?)\$\$/gm, '') //LaTeX
			.replace(/\$([\s\S]*?)\$/gm, '') //LaTeX inline
			.replace(/<("[^"]*"|'[^']*'|[^'">])*>/gm, ''); //html (regex from: https://www.data2type.de/xml-xslt-xslfo/regulaere-ausdruecke/regex-methoden-aus-der-praxis/beispiele-zu-html/html-tags-erkennen)
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
		logger.debug("Calculating word distribution");
		const files = this.app.vault.getMarkdownFiles();
		logger.debug("will analyze %i files", files.length);
		const notice = new Notice("Calculating word distribution", 100000000);

		let fileCount = 0;
		for (const file of files) {
			if(this.quit) continue;
			if (file === undefined) continue;

			const fileContent = await this.app.vault.read(file);
			const words = this.getWords(fileContent);
			this.fileContentsWithStopwords = new Map([...this.fileContentsWithStopwords, ...this.convertToMap(words)]);

			const withoutStopWords = this.removeStopwords(words);
			this.fileContentsWithoutStopwords = new Map([...this.fileContentsWithoutStopwords, ...this.convertToMap(withoutStopWords)]);

			fileCount++;
			notice.setMessage(`Calculating word distribution (${fileCount.toLocaleString()} / ${files.length.toLocaleString()} files)`);
		}
		notice.hide();
		logger.debug("Finished calculating word distribution");
		logger.debug("analyzed %i files", fileCount);
		new Notice("Finished calculating word distribution");
		this.calculatingWordDistribution = false;
	}

	convertToMap(words: string[]): Map<string, number> {
		return words.reduce((acc, e) => acc.set(e, (acc.get(e) || 0) + 1), new Map());
	}

	async onload() {
		logger.info("enabling Tag & Word cloud plugin");
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

		this.registerMarkdownCodeBlockProcessor('wordcloud', new Wordcloud(this).processor);
		this.registerMarkdownCodeBlockProcessor('tagcloud', new TagCloud(this).processor);
		this.registerMarkdownCodeBlockProcessor('linkcloud', new LinkCloud(this).processor);

	}

	onunload() {
		this.quit = true;
		logger.info("disabling Tag & Word cloud plugin");
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

}
