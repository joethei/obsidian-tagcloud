import TagCloudPlugin from "./main";
import {PluginSettingTab, Setting, SettingGroup} from "obsidian";
import WordCloud from "wordcloud";

export interface WordsCache {
	withStopwords: Record<string, number>;
	withoutStopwords: Record<string, number>;
	timestamp: number,
}

export interface TagCloudPluginSettings {
	stopwords: string,
	filecache: Record<string, WordsCache>,
	wordCache: WordsCache,
	tags: {
		exclude: Array<string>;
	}
}

export const DEFAULT_SETTINGS: TagCloudPluginSettings = {
	stopwords : '',
	filecache: {},
	wordCache: {
		withoutStopwords: {},
		withStopwords: {},
		timestamp: 0,
	},
	tags: {
		exclude: [],
	}
}

export class TagCloudPluginSettingsTab extends PluginSettingTab{
	plugin: TagCloudPlugin;
	icon = 'cloudy';

	constructor(plugin: TagCloudPlugin) {
		super(plugin.app, plugin);
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		if(!WordCloud.isSupported) {
			containerEl.createEl("p", {cls: "cloud-error", text: "Your device is not supported"});
		}

		new SettingGroup(containerEl)
			.setHeading('Wordcloud')
			.addSetting(setting => {
				setting
					.setName('Additional stopwords')
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
			})
			.addSetting(setting => {
				setting
				.setDesc("")
						.addButton(button => {
							button
								.setButtonText("Recalculate word distribution")
								.onClick(async () => {
									await this.plugin.calculateWordDistribution(true);
								})
						});
			});

		new SettingGroup(containerEl)
			.setHeading('Tagcloud')
			.addSetting(setting => {
				setting
					.setName('Excluded tags')
					.setDesc('The following tags wil be excluded from all tag clouds (one per line, without the #)')
					.addTextArea(text => {
						//new TagsSuggest(this.app, text.inputEl);
						text.setValue(this.plugin.settings.tags.exclude.join(', '));
						text.onChange(async value => {
							this.plugin.settings.tags.exclude = value.split(', ');
							await this.plugin.saveSettings();
						});
						text.inputEl.setAttr('rows', 10);
					});
			});
	}
}
