import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import { RequiredConfluenceClient } from "./adaptors";
import { ConfluenceSettings } from "./Settings";
import { renderADFDoc } from "./ADFToMarkdown";
import { ConfluenceContentFetcher } from "./ConfluenceContentFetcher";
import { MarkdownFileGenerator, FileGenerationOptions } from "./MarkdownFileGenerator";

export interface PullResult {
	success: boolean;
	pageId: string;
	pageTitle: string;
	filePath: string | undefined;
	error: string | undefined;
}

export interface PullOptions extends FileGenerationOptions {
	pageId?: string;
	rootPageId?: string;
	includeChildren?: boolean;
	maxDepth?: number;
}

export interface ConfluencePageData {
	id: string;
	title: string;
	space: {
		key: string;
	};
	body: {
		atlas_doc_format?: {
			value: string;
		};
	};
	version: {
		number: number;
		by: {
			accountId: string;
		};
	};
	ancestors?: Array<{
		id: string;
	}>;
	children?: {
		page?: {
			results: Array<{
				id: string;
				title: string;
			}>;
		};
	};
}

export class Puller {
	// @ts-ignore - Used indirectly through contentFetcher
	private confluenceClient: RequiredConfluenceClient;
	// @ts-ignore - Used indirectly through fileGenerator
	private settings: ConfluenceSettings;
	private contentFetcher: ConfluenceContentFetcher;
	private fileGenerator: MarkdownFileGenerator;

	constructor(
		confluenceClient: RequiredConfluenceClient,
		settings: ConfluenceSettings,
	) {
		this.confluenceClient = confluenceClient;
		this.settings = settings;
		this.contentFetcher = new ConfluenceContentFetcher(confluenceClient);
		this.fileGenerator = new MarkdownFileGenerator(settings.confluenceBaseUrl);
	}

	/**
	 * Pull a single page from Confluence
	 */
	async pullSinglePage(pageId: string, options: PullOptions = {}): Promise<PullResult> {
		try {
			const page = await this.contentFetcher.fetchPage(pageId, {
				expand: ["body.atlas_doc_format", "version", "ancestors", "space"],
			});

			const markdown = this.convertPageToMarkdown(page);

			// Generate and save file
			const fileResult = await this.fileGenerator.generateFile(page, markdown, options);

			if (!fileResult.success) {
				return {
					success: false,
					pageId,
					pageTitle: page.title,
					filePath: undefined,
					error: fileResult.error,
				};
			}

			return {
				success: true,
				pageId,
				pageTitle: page.title,
				filePath: fileResult.filePath,
				error: undefined,
			};
		} catch (error) {
			return {
				success: false,
				pageId,
				pageTitle: "",
				filePath: undefined,
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	}

	/**
	 * Pull page tree (page + all children) from Confluence
	 */
	async pullPageTree(rootPageId: string, options: PullOptions = {}): Promise<PullResult[]> {
		const results: PullResult[] = [];

		try {
			// Check if root page exists first
			const rootExists = await this.contentFetcher.pageExists(rootPageId);
			if (!rootExists) {
				results.push({
					success: false,
					pageId: rootPageId,
					pageTitle: "",
					filePath: undefined,
					error: "Root page not found or access denied",
				});
				return results;
			}

			// Pull root page first
			const rootResult = await this.pullSinglePage(rootPageId, options);
			results.push(rootResult);

			if (!rootResult.success || !options.includeChildren) {
				return results;
			}

			// Get all pages in tree using ConfluenceContentFetcher
			const allPages = await this.contentFetcher.fetchPageTree(rootPageId, options.maxDepth || 10); // Use configurable max depth with fallback

			// Skip root page (already processed) and pull all descendants
			for (const page of allPages) {
				if (page.id !== rootPageId) {
					const pageResult = await this.pullSinglePage(page.id, options);
					results.push(pageResult);
				}
			}
		} catch (error) {
			results.push({
				success: false,
				pageId: rootPageId,
				pageTitle: "",
				filePath: undefined,
				error: error instanceof Error ? error.message : "Unknown error",
			});
		}

		return results;
	}

	/**
	 * Unified pull method - pulls single page or page tree based on options
	 */
	async pull(pageId: string, options: PullOptions = {}): Promise<PullResult | PullResult[]> {
		if (options.includeChildren || options.maxDepth !== undefined) {
			return await this.pullPageTree(pageId, options);
		} else {
			return await this.pullSinglePage(pageId, options);
		}
	}

	/**
	 * Convert Confluence page to Markdown
	 */
	private convertPageToMarkdown(page: ConfluencePageData): string {
		let markdown = `# ${page.title}\n\n`;

		if (page.body?.atlas_doc_format?.value) {
			try {
				const adf = JSON.parse(page.body.atlas_doc_format.value) as JSONDocNode;
				const contentMarkdown = renderADFDoc(adf);
				markdown += contentMarkdown;
			} catch (error) {
				markdown += "*Error converting page content*\n";
			}
		}

		// Add frontmatter
		const frontmatter = {
			pageId: page.id,
			spaceKey: page.space.key,
			version: page.version.number,
			lastUpdated: page.version.by.accountId,
			pulled: true,
		};

		const frontmatterStr = Object.entries(frontmatter)
			.map(([key, value]) => `${key}: ${value}`)
			.join("\n");

		return `---\n${frontmatterStr}\n---\n\n${markdown}`;
	}


}
