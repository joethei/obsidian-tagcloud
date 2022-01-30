import {
	getAllTags,
	parseYaml,
	Plugin, TFile
} from 'obsidian';
import WordCloud from "wordcloud";

export interface CodeblockOptions {
	width: number,
	height: number,
	backgroundColor: string,
	shape: string,
	weightFactor: number
}


export default class TagCloudPlugin extends Plugin {

	parseCodeblockOptions(source: string): CodeblockOptions {
		const yaml = source ? parseYaml(source) : {};


		const max_width = getComputedStyle(
			document.querySelector(
				'.markdown-preview-view.is-readable-line-width .markdown-preview-sizer'
			)
		).getPropertyValue('width');

		//remove any units
		const width = yaml.width ? yaml.width : Number(max_width.replace(/[^\d]/g, ''));

		//@ts-ignore
		const isDarkMode = app.getTheme() === "obsidian";
		let background;

		const darkEL = document.getElementsByClassName("theme-dark")[0];
		const lightEl = document.getElementsByClassName("theme-light")[0];

		if (isDarkMode) {
			background = getComputedStyle(darkEL).getPropertyValue('--background-primary');
		} else {
			background = getComputedStyle(lightEl).getPropertyValue('--background-primary');
		}

		return {
			width: width,
			height: yaml.height ? yaml.height : width / 2,
			backgroundColor: yaml.background ? yaml.background : background,
			shape: yaml.shape ? yaml.shape : 'circle',
			weightFactor: yaml.weight ? yaml.weight : 2,
		}
	}

	async onload() {
		console.log("enabling Tag cloud plugin");

		if (!WordCloud.isSupported) {
			console.log("tag cloud plugin could not be enabled, something is incompatible");
			throw Error("the tag cloud plugin is not supported on your device");
		}

		this.registerMarkdownCodeBlockProcessor('wordcloud', async (source, el, ctx) => {
			const options = this.parseCodeblockOptions(source);

			const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
			if (file === undefined) return;
			if (!(file instanceof TFile)) return;

			const words = await this.app.vault.read(file);

			const map = words.split(/[\n\s]/g).reduce((acc, e) => acc.set(e, (acc.get(e) || 0) + 1), new Map());

			const canvas = el.createEl('canvas', {attr: {id: "wordcloud"}});
			canvas.width = options.width;
			canvas.height = options.height;

			WordCloud(canvas, {
				list: Array.from(map.entries()),
				backgroundColor: options.backgroundColor,
				shape: options.shape,
				weightFactor: options.weightFactor,
			});

		});

		this.registerMarkdownCodeBlockProcessor('tagcloud', (source, el, _) => {
			const options = this.parseCodeblockOptions(source);

			const tags: string[] = [];

			//@ts-ignore
			this.app.metadataCache.getCachedFiles().forEach(filename => {
				const tmp = getAllTags(this.app.metadataCache.getCache(filename));
				if (tmp && tmp.length > 0)
					tags.push(...tmp);
			});

			const map = tags.map(t => t.substr(1)).reduce((acc, e) => acc.set(e, (acc.get(e) || 0) + 1), new Map());

			const canvas = el.createEl('canvas', {attr: {id: "tagcloud"}});
			canvas.width = options.width;
			canvas.height = options.height;


			//@ts-ignore
			const searchPlugin = this.app.internalPlugins.getPluginById("global-search");
			const search = searchPlugin && searchPlugin.instance;

			WordCloud(canvas, {
				list: Array.from(map.entries()),
				backgroundColor: options.backgroundColor,
				shape: options.shape,
				weightFactor: options.weightFactor,
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
		console.log("disabling Tag cloud plugin");
	}

}
