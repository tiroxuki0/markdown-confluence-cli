import { ConfluencePageData } from "./Puller";
export interface FileGenerationOptions {
  outputDir?: string;
  overwriteExisting?: boolean;
  createDirectories?: boolean;
  fileNameTemplate?: string;
  addFrontmatter?: boolean;
}
export interface FileGenerationResult {
  success: boolean;
  filePath?: string;
  error?: string;
  existed?: boolean;
  overwritten?: boolean;
}
export declare class MarkdownFileGenerator {
  private defaultOutputDir;
  private defaultFileNameTemplate;
  private baseUrl;
  constructor(baseUrl?: string);
  /**
   * Generate and save Markdown file from Confluence page data
   */
  generateFile(
    page: ConfluencePageData,
    markdown: string,
    options?: FileGenerationOptions,
  ): Promise<FileGenerationResult>;
  /**
   * Generate multiple files from array of pages
   */
  generateFiles(
    pages: ConfluencePageData[],
    markdownContents: string[],
    options?: FileGenerationOptions,
  ): Promise<FileGenerationResult[]>;
  /**
   * Generate safe filename from page data
   */
  private generateFileName;
  /**
   * Sanitize filename to be filesystem-safe
   */
  private sanitizeFileName;
  /**
   * Generate YAML frontmatter from page data
   */
  private generateFrontmatter;
  /**
   * Format value for YAML (handle strings with special chars)
   */
  private formatYamlValue;
  /**
   * Extract domain from ancestors or use default
   */
  private extractDomainFromAncestors;
  /**
   * Check if directory exists and is writable
   */
  checkDirectory(outputDir: string): {
    exists: boolean;
    writable: boolean;
    error?: string;
  };
  /**
   * Resolve file conflicts by generating alternative names
   */
  resolveFileConflict(filePath: string): string;
}
//# sourceMappingURL=MarkdownFileGenerator.d.ts.map
