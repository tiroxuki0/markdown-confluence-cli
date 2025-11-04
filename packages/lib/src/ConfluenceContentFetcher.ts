import { RequiredConfluenceClient } from "./adaptors";
import { ConfluencePageData } from "./Puller";

export interface FetchPageOptions {
	expand?: string[];
	retryAttempts?: number;
	retryDelay?: number;
}

export interface FetchChildrenOptions extends FetchPageOptions {
	limit?: number;
	start?: number;
}

export class ConfluenceContentFetcher {
	private confluenceClient: RequiredConfluenceClient;
	private defaultRetryAttempts: number = 3;
	private defaultRetryDelay: number = 1000; // 1 second

	constructor(confluenceClient: RequiredConfluenceClient) {
		this.confluenceClient = confluenceClient;
	}

	/**
	 * Fetch a single page with robust error handling
	 */
	async fetchPage(pageId: string, options: FetchPageOptions = {}): Promise<ConfluencePageData> {
		const {
			expand = ["body.atlas_doc_format", "version", "ancestors", "space"],
			retryAttempts = this.defaultRetryAttempts,
			retryDelay = this.defaultRetryDelay,
		} = options;

		let lastError: Error | null = null;

		for (let attempt = 0; attempt <= retryAttempts; attempt++) {
			try {
				const page = await this.confluenceClient.content.getContentById({
					id: pageId,
					expand: expand.join(","),
				});

				return page as ConfluencePageData;
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));

				if (attempt < retryAttempts) {
					console.warn(`Failed to fetch page ${pageId} (attempt ${attempt + 1}/${retryAttempts + 1}):`, lastError.message);
					await this.delay(retryDelay * Math.pow(2, attempt)); // Exponential backoff
				}
			}
		}

		throw new Error(`Failed to fetch page ${pageId} after ${retryAttempts + 1} attempts: ${lastError?.message}`);
	}

	/**
	 * Fetch all children of a page with pagination support
	 */
	async fetchChildren(parentId: string, options: FetchChildrenOptions = {}): Promise<ConfluencePageData[]> {
		const {
			expand = ["version", "space"],
			retryAttempts = this.defaultRetryAttempts,
			retryDelay = this.defaultRetryDelay,
		} = options;

		let lastError: Error | null = null;

		for (let attempt = 0; attempt <= retryAttempts; attempt++) {
			try {
				// Use expand method directly - more reliable than CQL
				const parentPageWithChildren = await this.fetchPage(parentId, {
					expand: ["children.page", "version", "space"],
				});

				if (!parentPageWithChildren.children?.page?.results || parentPageWithChildren.children.page.results.length === 0) {
					return [];
				}

				const childIds = parentPageWithChildren.children.page.results.map((child: any) => child.id);
				const allChildren: ConfluencePageData[] = [];
				
				// Fetch full details for each child in batches
				const batchSize = 10;
				for (let i = 0; i < childIds.length; i += batchSize) {
					const batch = childIds.slice(i, i + batchSize);
					const childPromises = batch.map((childId: string) =>
						this.fetchPage(childId, { expand: expand })
					);
					const batchResults = await Promise.all(childPromises);
					allChildren.push(...batchResults);
				}

				// Warn if there might be more children (expand method has 25 limit)
				if (childIds.length >= 25 && (parentPageWithChildren.children.page as any)._links?.next) {
					console.warn(`Page ${parentId} may have more than ${childIds.length} children. Some may be missing due to API pagination limits.`);
				}

				return allChildren;
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));

				if (attempt < retryAttempts) {
					console.warn(`Failed to fetch children for page ${parentId} (attempt ${attempt + 1}/${retryAttempts + 1}):`, lastError.message);
					await this.delay(retryDelay * Math.pow(2, attempt)); // Exponential backoff
				}
			}
		}

		throw new Error(`Failed to fetch children for page ${parentId} after ${retryAttempts + 1} attempts: ${lastError?.message}`);
	}

	/**
	 * Fetch page tree recursively (page + all descendants)
	 */
	async fetchPageTree(rootPageId: string, maxDepth: number = 10): Promise<ConfluencePageData[]> {
		const allPages: ConfluencePageData[] = [];
		const visitedPages = new Set<string>();
		const pagesToProcess: { id: string; depth: number }[] = [{ id: rootPageId, depth: 0 }];

		while (pagesToProcess.length > 0) {
			const { id: pageId, depth } = pagesToProcess.shift()!;

			if (visitedPages.has(pageId) || depth > maxDepth) {
				continue;
			}

			visitedPages.add(pageId);

			try {
				// Fetch the page itself
				const page = await this.fetchPage(pageId, {
					expand: ["body.atlas_doc_format", "version", "ancestors", "space"]
				});
				allPages.push(page);

				// If not at max depth, fetch children
				if (depth < maxDepth) {
					const children = await this.fetchChildren(pageId, {
						expand: ["version", "space"],
						limit: 50
					});

					// Add children to processing queue
					for (const child of children) {
						if (!visitedPages.has(child.id)) {
							pagesToProcess.push({ id: child.id, depth: depth + 1 });
						}
					}
				}
			} catch (error) {
				console.error(`Error fetching page ${pageId}:`, error);
				// Continue with other pages even if one fails
			}
		}

		return allPages;
	}

	/**
	 * Search for pages by title or CQL query
	 * TODO: Implement when confluence.js supports searchContent
	 */
	async searchPages(_cql: string, _options: FetchChildrenOptions = {}): Promise<ConfluencePageData[]> {
		// Placeholder - confluence.js may not have searchContent method
		console.warn("searchPages not implemented yet");
		return [];
	}

	/**
	 * Check if a page exists and get basic info
	 */
	async pageExists(pageId: string): Promise<boolean> {
		try {
			await this.fetchPage(pageId, {
				expand: ["version"],
				retryAttempts: 1
			});
			return true;
		} catch (error) {
			return false;
		}
	}

	/**
	 * Get space information
	 */
	async getSpace(spaceKey: string) {
		try {
			return await this.confluenceClient.space.getSpace({
				spaceKey,
				expand: ["description", "homepage"]
			});
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			throw new Error(`Failed to get space ${spaceKey}: ${errorMessage}`);
		}
	}

	private async delay(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}
}
