import { RequiredConfluenceClient } from "./adaptors";
import { ConfluenceSettings } from "./Settings";
import { FileGenerationOptions } from "./MarkdownFileGenerator";
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
export declare class Puller {
    private confluenceClient;
    private settings;
    private contentFetcher;
    private fileGenerator;
    constructor(confluenceClient: RequiredConfluenceClient, settings: ConfluenceSettings);
    /**
     * Pull a single page from Confluence
     */
    pullSinglePage(pageId: string, options?: PullOptions): Promise<PullResult>;
    /**
     * Pull page tree (page + all children) from Confluence
     */
    pullPageTree(rootPageId: string, options?: PullOptions): Promise<PullResult[]>;
    /**
     * Unified pull method - pulls single page or page tree based on options
     */
    pull(pageId: string, options?: PullOptions): Promise<PullResult | PullResult[]>;
    /**
     * Convert Confluence page to Markdown
     */
    private convertPageToMarkdown;
}
//# sourceMappingURL=Puller.d.ts.map