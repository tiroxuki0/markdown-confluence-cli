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

			// Get all pages in tree first to build hierarchy info
			const allPages = await this.contentFetcher.fetchPageTree(rootPageId, options.maxDepth || 10); // Use configurable max depth with fallback

			// Build page hierarchy map for nested folder structure
			const pageHierarchy = new Map<string, { title: string; id: string }>();
			const pagesWithChildren = new Set<string>(); // Track which pages have children
			
			for (const page of allPages) {
				pageHierarchy.set(page.id, { title: page.title, id: page.id });
				// Check if this page has children by looking at ancestors of other pages
				if (page.ancestors && page.ancestors.length > 0) {
					// This page is a child, so its parent has children
					const lastAncestor = page.ancestors[page.ancestors.length - 1];
					if (lastAncestor && lastAncestor.id) {
						pagesWithChildren.add(lastAncestor.id);
					}
				}
			}

			// Pull root page with hierarchy info
			const rootPage = allPages.find(p => p.id === rootPageId);
			if (rootPage) {
				const rootMarkdown = this.convertPageToMarkdown(rootPage);
				const rootHasChildren = pagesWithChildren.has(rootPageId);
				const rootFileResult = await this.fileGenerator.generateFile(rootPage, rootMarkdown, options, pageHierarchy, rootHasChildren);
				
				if (!rootFileResult.success) {
					results.push({
						success: false,
						pageId: rootPageId,
						pageTitle: rootPage.title,
						filePath: undefined,
						error: rootFileResult.error,
					});
				} else {
					results.push({
						success: true,
						pageId: rootPageId,
						pageTitle: rootPage.title,
						filePath: rootFileResult.filePath,
						error: undefined,
					});
				}
			}

			if (!options.includeChildren) {
				return results;
			}

			// Skip root page (already processed) and pull all descendants
			for (const page of allPages) {
				if (page.id !== rootPageId) {
					const markdown = this.convertPageToMarkdown(page);
					const hasChildren = pagesWithChildren.has(page.id);
					const fileResult = await this.fileGenerator.generateFile(page, markdown, options, pageHierarchy, hasChildren);
					
					if (!fileResult.success) {
						results.push({
							success: false,
							pageId: page.id,
							pageTitle: page.title,
							filePath: undefined,
							error: fileResult.error,
						});
					} else {
						results.push({
							success: true,
							pageId: page.id,
							pageTitle: page.title,
							filePath: fileResult.filePath,
							error: undefined,
						});
					}
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
		// Don't add title here - ADF content already contains headings
		// Title is stored in frontmatter and can be used separately
		let markdown = "";

		if (page.body?.atlas_doc_format?.value) {
			try {
				const adf = JSON.parse(page.body.atlas_doc_format.value) as JSONDocNode;
				const contentMarkdown = renderADFDoc(adf);
				// Remove duplicate headings that match page title (normalized)
				markdown += this.removeDuplicateTitleHeadings(contentMarkdown, page.title);
			} catch (error) {
				markdown += "*Error converting page content*\n";
			}
		} else {
			// If no content, add title as heading
			markdown = `# ${page.title}\n\n`;
		}

		// Note: Frontmatter is added by MarkdownFileGenerator.generateFile()
		// to ensure proper formatting and include all metadata (title, confluenceUrl, etc.)
		return markdown;
	}

	/**
	 * Remove duplicate headings that match page title (case-insensitive, normalized)
	 * Also removes consecutive duplicate headings of the same level
	 */
	private removeDuplicateTitleHeadings(markdown: string, pageTitle: string): string {
		// Normalize page title for comparison (lowercase, replace underscores/spaces, remove special chars)
		const normalizeTitle = (text: string): string => {
			return text
				.toLowerCase()
				.replace(/_/g, " ") // Replace underscores with spaces
				.replace(/[^a-z0-9\s]/g, "") // Remove special chars
				.replace(/\s+/g, " ") // Normalize multiple spaces to single space
				.trim();
		};

		const normalizedPageTitle = normalizeTitle(pageTitle);
		const lines = markdown.split("\n");
		const result: string[] = [];
		let lastHeadingLevel = 0;
		let lastHeadingText = "";

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (line === undefined) {
				result.push("");
				continue;
			}
			const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

			if (headingMatch) {
				const headingLevel = headingMatch[1]?.length ?? 0;
				const headingText = headingMatch[2]?.trim() ?? "";
				const normalizedHeadingText = normalizeTitle(headingText);

				// Skip if heading matches page title (case-insensitive, normalized)
				if (normalizedHeadingText === normalizedPageTitle) {
					continue;
				}

				// Skip if it's a duplicate of the previous heading (same level and text)
				if (
					headingLevel === lastHeadingLevel &&
					normalizedHeadingText === normalizeTitle(lastHeadingText)
				) {
					continue;
				}

				lastHeadingLevel = headingLevel;
				lastHeadingText = headingText;
			}

			result.push(line);
		}

		return result.join("\n");
	}


}
