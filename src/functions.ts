export const stopwords = new Set<string>();

export function removeMarkdown(text: string): string {
	return text
		.replace(/^---\n.*?\n---\n/s, '') // YAML Frontmatter
		.replace(/!?\[(.+)\]\(.+\)/gm, '$1') // URLs & embeds, we do want to keep the contents of the alias
		.replace(/(https?):\/\/\S*(\s?)/gm, '') //any raw url's
		.replace(/\*\*(.*?)\*\*/gm, '$1') //bold
		.replace(/\*(.*?)\*/gm, '$1') //italic
		.replace(/\[\[(.*(?=\|))(.*)\]\]/g, '$2') //wikilinks with alias
		.replace(/\[\[([\s\S]*?)\]\]/gm, '$1') //wikilinks
		.replace(/- ?\[.?\]/gm, '') //tasks
		.replace(/%%.*?%%/gm, '')//Obsidian Comments
		.replace(/`([\s\S]*?)`/gm, '') //codeblocks, inline & normal
		.replace(/\[\^[[\s\S]]*\]/g, '') //footnotes
		.replace(/\^\[([\s\S]*?)\]/g, '$1') //inline footnotes
		.replace(/\$\$([\s\S]*?)\$\$/gm, '') //LaTeX
		.replace(/\$([\s\S]*?)\$/gm, '') //LaTeX inline
		.replace(/\[([\s\S]*?)\]/g, '$1')//normal brackets[]
		.replace(/\(([\s\S]*?)\)/g, '$1')//normal brackets()
		.replace(/^(.*?)::(.*?)$/gm, '') //dataview inline attributes
		.replace(/[,.;:|#-()=_*-^\[\]]/g, '')
		.replace(/<("[^"]*"|'[^']*'|[^'">])*>/gm, '') //html (regex from: https://www.data2type.de/xml-xslt-xslfo/regulaere-ausdruecke/regex-methoden-aus-der-praxis/beispiele-zu-html/html-tags-erkennen)
		.replace(/\s\S\s/g, ' ') //single chars;
}

export function removeStopwords(words: Record<string, number>, customStopwords: Set<string>): Record<string, number> {
	const result: Record<string, number> = {};
	for (const word of Object.keys(words)) {
		const word_lc = word.toLowerCase();
		if(!stopwords.has(word_lc) && !customStopwords.has(word_lc)) {
			result[word] = words[word];
		}
	}
	return result;
}

export async function getWords(text: string): Promise<string[]> {
	const words = text.split(/[\n\s]/g);
	const output: string[] = [];
	for (let word of words) {
		const result = removeMarkdown(word).toLocaleLowerCase();
		if(result.length > 0) {
			output.push(result);
		}
	}
	return output;
}

export async function convertToMap(words: string[]): Promise<Record<string, number>> {
	const record: Record<string, number> = {};
	for (let word of words) {
		const element = record[word];
		if(element) {
			record[word] = element + 1;
		}else {
			record[word] = 1;
		}

	}
	return record;
}

export async function recordToArray(record: Record<string, number>) : Promise<[string, number][]> {
	const result: [string, number][] = [];
	for(const key of Object.keys(record)) {
		result.push([key, record[key]]);
	}

	return result;
}

export async function mergeMaps(map1: Record<string, number>, map2: Record<string, number>) : Promise<Record<string, number>> {
	if(map1 === undefined) return map2;
	if(map2 === undefined) return map1;

	const result: Record<string, number> = {};
	for(const key of Object.keys(map1)) {
		if(map2[key]) {
			result[key] = map1[key] + map2[key];
		}else {
			result[key] = map1[key];
		}
	}
	for(const key of Object.keys(map2)) {
		if(!result[key]) {
			result[key] = map2[key];
		}
	}

	return result;
}
