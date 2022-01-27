import {App, getAllTags, MarkdownView, Modal, Notice, parseYaml, Plugin, PluginSettingTab, Setting} from 'obsidian';
import WordCloud from "wordcloud";
import cloud from "d3-cloud";

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default'
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		console.log("enabling Tag cloud plugin");
		await this.loadSettings();

		console.log(WordCloud.isSupported);
		console.log(WordCloud.miniumFontSize);

		this.registerMarkdownCodeBlockProcessor('tagcloud', (source, el, ctx) => {
			const yaml = parseYaml(source);
			const max_width = getComputedStyle(
				document.querySelector(
					'.markdown-preview-view.is-readable-line-width .markdown-preview-sizer'
				)
			).getPropertyValue('max-width');
			const width = Number(max_width.replace('px', ''));
			const canvas = el.createEl('canvas', "tagcloud");
			canvas.width = width;
			canvas.height = width / 2;

			const tags: string[] = [];

			//@ts-ignore
			this.app.metadataCache.getCachedFiles().forEach(filename => {
				const tmp = getAllTags(this.app.metadataCache.getCache(filename));
				if (tmp && tmp.length > 0)
					tags.push(...tmp);
			});

			const map = tags.reduce((acc, e) => acc.set(e, (acc.get(e) || 0) + 1), new Map());

			const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
			const background = el.style.getPropertyValue("--background-primary");

			//@ts-ignore
			const searchPlugin = this.app.internalPlugins.getPluginById("global-search");
			const search = searchPlugin && searchPlugin.instance;

			WordCloud(canvas, {
				list: Array.from(map.entries()),
				backgroundColor: background,
				shape: yaml.shape ? yaml.shape : 'circle',
				click: item => {
					search.openGlobalSearch("tag: " + item[0]);
				}
			});

		});

	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Settings for my awesome plugin.'});

		new Setting(containerEl)
			.setName('Setting #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					console.log('Secret: ' + value);
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
}
