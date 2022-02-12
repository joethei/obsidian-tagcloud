import TagCloudPlugin from "./main";
import {PluginSettingTab, Setting} from "obsidian";

export interface WordsCache {
	withStopwords: Record<string, number>;
	withoutStopwords: Record<string, number>;
	timestamp: number,
}

export interface TagCloudPluginSettings {
	stopwords: string,
	filecache: Record<string, WordsCache>,
	wordCache: WordsCache,
}

export const DEFAULT_SETTINGS: TagCloudPluginSettings = {
	stopwords : '',
	filecache: {},
	wordCache: {
		withoutStopwords: {},
		withStopwords: {},
		timestamp: 0,
	}
}

export class TagCloudPluginSettingsTab extends PluginSettingTab{
	plugin: TagCloudPlugin;

	constructor(plugin: TagCloudPlugin) {
		super(plugin.app, plugin);
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h1', {text: 'Tag & Word Cloud Settings'});

		new Setting(containerEl)
			.setName('Additional Stopwords')
			.setDesc("Don't show any of these words in the word cloud(one per line)")
			.addTextArea(text => {
					text
						.setValue(this.plugin.settings.stopwords)
						.onChange(async (value) => {
							this.plugin.settings.stopwords = value;
							await this.plugin.saveSettings();
						})
					text.inputEl.setAttr("rows", 8);
				}
			);
	}
}
