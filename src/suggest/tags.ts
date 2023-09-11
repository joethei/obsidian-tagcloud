import { TextInputSuggest } from "./suggest";

export class TagsSuggest extends TextInputSuggest<string> {

	getSuggestions(inputStr: string): string[] {
		const lowerCaseInputStr = inputStr.toLowerCase();
		//@ts-ignore
		const tags = Object.keys(this.app.metadataCache.getTags()).map(t => t.replace('#', ''));
		return tags.filter(tag => tag.includes(lowerCaseInputStr));

	}

	renderSuggestion(tag: string, el: HTMLElement): void {
		el.setText(tag);
	}

	selectSuggestion(tag: string): void {
		this.inputEl.value = tag;
		this.inputEl.trigger("input");
		this.close();
	}
}
