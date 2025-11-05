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
export declare class ConfluenceContentFetcher {
  private confluenceClient;
  private defaultRetryAttempts;
  private defaultRetryDelay;
  constructor(confluenceClient: RequiredConfluenceClient);
  /**
   * Fetch a single page with robust error handling
   */
  fetchPage(
    pageId: string,
    options?: FetchPageOptions,
  ): Promise<ConfluencePageData>;
  /**
   * Fetch all children of a page with pagination support
   */
  fetchChildren(
    parentId: string,
    options?: FetchChildrenOptions,
  ): Promise<ConfluencePageData[]>;
  /**
   * Fetch page tree recursively (page + all descendants)
   */
  fetchPageTree(
    rootPageId: string,
    maxDepth?: number,
  ): Promise<ConfluencePageData[]>;
  /**
   * Search for pages by title or CQL query
   * TODO: Implement when confluence.js supports searchContent
   */
  searchPages(
    _cql: string,
    _options?: FetchChildrenOptions,
  ): Promise<ConfluencePageData[]>;
  /**
   * Check if a page exists and get basic info
   */
  pageExists(pageId: string): Promise<boolean>;
  /**
   * Get space information
   */
  getSpace(
    spaceKey: string,
  ): Promise<import("confluence.js/out/api/models").Space>;
  private delay;
}
//# sourceMappingURL=ConfluenceContentFetcher.d.ts.map
