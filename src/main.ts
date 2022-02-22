import {Notice, parseYaml, Plugin} from 'obsidian';
import WordCloud from "wordcloud";
import {DEFAULT_SETTINGS, TagCloudPluginSettings, TagCloudPluginSettingsTab} from "./settings";
import {LoggerManager} from "typescript-logger";
import {TagCloud} from "./tagcloud";
import {Wordcloud} from "./wordcloud";
import {LinkCloud} from "./linkcloud";
import {convertToMap, getWords, mergeMaps, removeStopwords, stopwords} from "./functions";
import stopword from "stopword";

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
	shrinkToFit: boolean,
	maxDepth: number,
}

type MergeTask = {
	map1: Record<string, number>,
	map2: Record<string, number>
}

export default class TagCloudPlugin extends Plugin {
	settings: TagCloudPluginSettings;

	//caches for word frequency
	fileContentsWithStopwords: Record<string, number> = {};
	fileContentsWithoutStopwords: Record<string, number> = {};

	//guard against running the word frequency calculation simultaneously
	calculatingWordDistribution = false;
	quit = false;

	parseCodeblockOptions(source: string): CodeblockOptions | undefined {
		const yaml = source ? parseYaml(source) : {};

		let max_width = 0;

		document.querySelectorAll('.markdown-preview-view.is-readable-line-width .markdown-preview-sizer, .cm-content').forEach(el => {
			if(el.clientWidth !== 0) {
				max_width = el.clientWidth;
			}
		});


		let width = yaml.width ? yaml.width : max_width;
		//fallback if this somehow is empty
		if (width <= 0) {
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
			type: yaml.type ? yaml.type : 'resolved',
			shrinkToFit: yaml.shrinkToFit ? yaml.shrinkToFit : true,
			maxDepth: yaml.maxDepth ? yaml.maxDepth : 25,
		}
	}

	async calculateWordDistribution() {
		if (this.calculatingWordDistribution) return;
		this.calculatingWordDistribution = true;
		logger.debug("Calculating word distribution");
		const files = this.app.vault.getMarkdownFiles();
		logger.debug("will analyze %i files", files.length);

		//we don't care what file has changed since the last scan, since we do need to go through all files regardless to build the full cache.
		const now = Date.now();
		let cacheUpToDate = true;
		for(const file of files) {
			if(file.stat.mtime > now) {
				cacheUpToDate = false;
			}
		}

		if (this.settings.wordCache && cacheUpToDate && this.settings.wordCache.timestamp !== 0) {
			this.fileContentsWithStopwords = this.settings.wordCache.withStopwords;
			this.fileContentsWithoutStopwords = this.settings.wordCache.withoutStopwords;
			this.calculatingWordDistribution = false;
			return;
		}

		const notice = new Notice("Calculating word distribution", 100000000);
		let fileCount = 0;

		if (!this.settings.filecache) {
			this.settings.filecache = DEFAULT_SETTINGS.filecache;
		}

		for (const file of files) {
			if (this.quit) continue;
			if (file === undefined) continue;

			const fileCache = this.settings.filecache[file.path];
			if (fileCache && fileCache.timestamp >= file.stat.mtime && fileCache.timestamp !== 0) {
				this.fileContentsWithStopwords = await mergeMaps(this.fileContentsWithStopwords, fileCache.withStopwords);
				this.fileContentsWithoutStopwords = await mergeMaps(this.fileContentsWithoutStopwords, fileCache.withoutStopwords);
			} else {
				const fileContent = await this.app.vault.read(file);
				const words = await getWords(fileContent);
				const withStopwords = await convertToMap(words);
				this.fileContentsWithStopwords = await mergeMaps(this.fileContentsWithStopwords, withStopwords);

				const withoutStopwords = removeStopwords(withStopwords);
				this.fileContentsWithoutStopwords = await mergeMaps(this.fileContentsWithoutStopwords, withoutStopwords);

				this.settings.filecache[file.path] = {
					withStopwords: withStopwords,
					withoutStopwords: withoutStopwords,
					timestamp: file.stat.mtime,
				};
			}

			fileCount++;
			notice.setMessage(`Calculating word distribution (${fileCount.toLocaleString()} / ${files.length.toLocaleString()} files)`);
		}
		this.settings.wordCache = {
			withStopwords: this.fileContentsWithStopwords,
			withoutStopwords: this.fileContentsWithoutStopwords,
			timestamp: Date.now(),
		};
		await this.saveSettings();
		notice.hide();
		logger.debug("Finished calculating word distribution");
		logger.debug("analyzed %i files", fileCount);
		new Notice("Finished calculating word distribution");
		this.calculatingWordDistribution = false;
	}

	generateCloud(values: [string, number][], options: CodeblockOptions, el: HTMLElement, searchPrefix: string) {
		const filtered = values.filter(([_, value]) => {
			return value >= options.minCount;
		});
		const sorted = filtered.sort((a, b) => {
			if(a[1] < b[1]) return 1;
			if(a[1] > b[1]) return -1;
			return 0;
		});

		const tmp: [string, number][] = [];
		let last = Infinity;
		let i = options.maxDepth;
		for (let sortedElement of sorted) {
			if(i <= 0) {
				break;
			}
			if(sortedElement[1] < last) {
				last = sortedElement[1];
				i--;
			}
			tmp.push([sortedElement[0], i]);
		}

		const canvas = el.createEl('canvas', {attr: {cls: "cloud"}});
		canvas.width = options.width;
		canvas.height = options.height;

		//@ts-ignore
		const searchPlugin = this.app.internalPlugins.getPluginById("global-search");
		const search = searchPlugin && searchPlugin.instance;

		WordCloud(canvas, {
			list: tmp,
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
			//@ts-ignore
			shrinkToFit: options.shrinkToFit,
			click: item => {
				search.openGlobalSearch(searchPrefix + item[0]);
			},
		});
	}

	async onload() {
		logger.info("enabling Tag & Word cloud plugin");
		await this.loadSettings();
		this.addSettingTab(new TagCloudPluginSettingsTab(this));

		Object.entries(stopword).forEach(stopword => {
			if (stopword[0] !== "removeStopwords")
				stopwords.add(stopword[0]);
		});

		if (!WordCloud.isSupported) {
			new Notice("the Word & Tag cloud plugin is not compatible with your device");
			throw Error("the tag cloud plugin is not supported on your device");
		}

		this.app.workspace.onLayoutReady(async () => {
			setTimeout(async () => await this.calculateWordDistribution(), 5000);
		});

		this.addCommand({
			id: "recalcuate-word-distribution",
			name: "Recalculate Word Distribution",
			checkCallback: (checking: boolean) => {
				if (checking) return !this.calculatingWordDistribution;

				(async () => {
					await this.calculateWordDistribution();
					new Notice("calculated word distribution");
				})();
			},
		})

		this.registerMarkdownCodeBlockProcessor('wordcloud', new Wordcloud(this).processor);
		this.registerMarkdownCodeBlockProcessor('tagcloud', new TagCloud(this).processor);
		this.registerMarkdownCodeBlockProcessor('linkcloud', new LinkCloud(this).processor);

	}

	async mergeWorker(arg: MergeTask): Promise<Record<string, number>> {
		const result = await mergeMaps(arg.map1, arg.map2);
		return Promise.resolve(result);
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
