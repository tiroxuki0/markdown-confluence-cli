import * as fs from "fs";
import * as path from "path";
import { ConfluencePageData } from "./Puller";

export interface FileGenerationOptions {
	outputDir?: string;
	overwriteExisting?: boolean;
	createDirectories?: boolean;
	fileNameTemplate?: string; // Template for filename generation
	addFrontmatter?: boolean;
}

export interface FileGenerationResult {
	success: boolean;
	filePath?: string;
	error?: string;
	existed?: boolean;
	overwritten?: boolean;
}

export class MarkdownFileGenerator {
	private defaultOutputDir: string = "./docs";
	private defaultFileNameTemplate: string = "{title}.md";
	private baseUrl: string = "https://your-domain.atlassian.net";

	constructor(baseUrl?: string) {
		if (baseUrl) {
			this.baseUrl = baseUrl;
		}
	}

	/**
	 * Generate and save Markdown file from Confluence page data
	 */
	async generateFile(
		page: ConfluencePageData,
		markdown: string,
		options: FileGenerationOptions = {},
		pageHierarchy?: Map<string, { title: string; id: string }>, // Map of pageId -> {title, id} for hierarchy
		hasChildren: boolean = false // Whether this page has children
	): Promise<FileGenerationResult> {
		try {
			const {
				outputDir = this.defaultOutputDir,
				overwriteExisting = false,
				createDirectories = true,
				fileNameTemplate = this.defaultFileNameTemplate,
				addFrontmatter = true,
			} = options;

			// Create output directory if needed
			if (createDirectories && !fs.existsSync(outputDir)) {
				fs.mkdirSync(outputDir, { recursive: true });
			}

			// Build folder path based on ancestors/hierarchy
			let folderPath = outputDir;
			if (pageHierarchy && page.ancestors && page.ancestors.length > 0) {
				// Build path from ancestors
				const ancestorFolders: string[] = [];
				for (const ancestor of page.ancestors) {
					const ancestorInfo = pageHierarchy.get(ancestor.id);
					if (ancestorInfo) {
						const folderName = this.sanitizeFileName(ancestorInfo.title);
						ancestorFolders.push(folderName);
					}
				}
				if (ancestorFolders.length > 0) {
					folderPath = path.join(outputDir, ...ancestorFolders);
					// Create nested directories
					if (createDirectories && !fs.existsSync(folderPath)) {
						fs.mkdirSync(folderPath, { recursive: true });
					}
				}
			}

			// Generate filename
			// If page has children, create index.md in its own folder
			let fileName: string;
			if (hasChildren) {
				// Create folder for this page and use index.md
				const pageFolderName = this.sanitizeFileName(page.title);
				const pageFolderPath = path.join(folderPath, pageFolderName);
				if (createDirectories && !fs.existsSync(pageFolderPath)) {
					fs.mkdirSync(pageFolderPath, { recursive: true });
				}
				folderPath = pageFolderPath;
				fileName = "index.md";
			} else {
				// Regular file in parent folder
				fileName = this.generateFileName(page, fileNameTemplate);
			}
			const filePath = path.join(folderPath, fileName);

			// Check if file exists
			const fileExists = fs.existsSync(filePath);

			if (fileExists && !overwriteExisting) {
				return {
					success: false,
					error: `File already exists: ${filePath}`,
					existed: true,
				};
			}

			// Prepare content
			let content = markdown;
			if (addFrontmatter) {
				const frontmatter = this.generateFrontmatter(page);
				content = `---\n${frontmatter}\n---\n\n${markdown}`;
			}

			// Write file
			fs.writeFileSync(filePath, content, "utf-8");

			return {
				success: true,
				filePath,
				existed: fileExists,
				overwritten: fileExists,
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	}

	/**
	 * Generate multiple files from array of pages
	 */
	async generateFiles(
		pages: ConfluencePageData[],
		markdownContents: string[],
		options: FileGenerationOptions = {}
	): Promise<FileGenerationResult[]> {
		const results: FileGenerationResult[] = [];

		for (let i = 0; i < pages.length; i++) {
			const page = pages[i];
			const content = markdownContents[i];
			if (page && content) {
				const result = await this.generateFile(page, content, options);
				results.push(result);
			}
		}

		return results;
	}

	/**
	 * Generate safe filename from page data
	 */
	private generateFileName(page: ConfluencePageData, template: string): string {
		let fileName = template;

		// Replace template variables with null checks
		fileName = fileName.replace("{title}", this.sanitizeFileName(page.title || "untitled"));
		fileName = fileName.replace("{id}", page.id || "unknown");
		fileName = fileName.replace("{spaceKey}", page.space?.key || "unknown");

		// Ensure .md extension
		if (!fileName.endsWith(".md")) {
			fileName += ".md";
		}

		return fileName;
	}

	/**
	 * Sanitize filename to be filesystem-safe
	 */
	private sanitizeFileName(name: string): string {
		if (!name || typeof name !== 'string') {
			return "untitled";
		}
		return name
			.replace(/[<>:"/\\|?*]/g, "_") // Replace invalid chars
			.replace(/\s+/g, "_") // Replace spaces with underscores
			.replace(/_+/g, "_") // Replace multiple underscores with single
			.replace(/^_+|_+$/g, "") // Remove leading/trailing underscores
			.toLowerCase();
	}

	/**
	 * Generate YAML frontmatter from page data
	 */
	private generateFrontmatter(page: ConfluencePageData): string {
		const frontmatter: Record<string, any> = {
			pageId: page.id,
			title: page.title,
			spaceKey: page.space.key,
			version: page.version.number,
			lastUpdated: page.version.by.accountId,
			pulledAt: new Date().toISOString(),
			confluenceUrl: `https://${this.extractDomainFromAncestors(page)}/pages/viewpage.action?pageId=${page.id}`,
		};

		// Add optional fields if available
		if (page.ancestors && page.ancestors.length > 0) {
			// @ts-ignore - Dynamic property access
			frontmatter.parentId = (page.ancestors[page.ancestors.length - 1] as any)?.id;
		}

		// Add connie-specific fields for publish capability
		frontmatter["connie-publish"] = true;
		frontmatter["connie-page-id"] = page.id;

		// Convert to YAML format
		return Object.entries(frontmatter)
			.map(([key, value]) => `${key}: ${this.formatYamlValue(value)}`)
			.join("\n");
	}

	/**
	 * Format value for YAML (handle strings with special chars)
	 */
	private formatYamlValue(value: any): string {
		if (typeof value === "boolean") {
			// Boolean values should be written as true/false without quotes
			return value ? "true" : "false";
		}
		if (value === null || value === undefined) {
			// Null values should be written as null or ~
			return "null";
		}
		if (typeof value === "number") {
			// Numbers should be written as-is
			return String(value);
		}
		if (typeof value === "string") {
			// Quote strings with spaces, colons, or other special chars
			if (value.includes(" ") || value.includes(":") || value.includes("'") || value.includes('"')) {
				return `"${value.replace(/"/g, '\\"')}"`;
			}
			return value;
		}
		// For other types (objects, arrays), convert to JSON string
		return JSON.stringify(value);
	}

	/**
	 * Extract domain from ancestors or use default
	 */
	private extractDomainFromAncestors(_page: ConfluencePageData): string {
		// Extract domain from baseUrl
		try {
			const url = new URL(this.baseUrl);
			return url.hostname;
		} catch {
			return "your-domain.atlassian.net";
		}
	}

	/**
	 * Check if directory exists and is writable
	 */
	checkDirectory(outputDir: string): { exists: boolean; writable: boolean; error?: string } {
		try {
			const exists = fs.existsSync(outputDir);

			if (!exists) {
				return { exists: false, writable: true };
			}

			// Check if directory is writable by trying to create a temp file
			const testFile = path.join(outputDir, ".write-test");
			try {
				fs.writeFileSync(testFile, "test", "utf-8");
				fs.unlinkSync(testFile);
				return { exists: true, writable: true };
			} catch (error) {
				return {
					exists: true,
					writable: false,
					error: "Directory exists but is not writable",
				};
			}
		} catch (error) {
			return {
				exists: false,
				writable: false,
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	}

	/**
	 * Resolve file conflicts by generating alternative names
	 */
	resolveFileConflict(filePath: string): string {
		const dir = path.dirname(filePath);
		const ext = path.extname(filePath);
		const baseName = path.basename(filePath, ext);

		let counter = 1;
		let resolvedPath = filePath;

		while (fs.existsSync(resolvedPath)) {
			resolvedPath = path.join(dir, `${baseName}_${counter}${ext}`);
			counter++;

			// Prevent infinite loop
			if (counter > 1000) {
				throw new Error(`Unable to resolve file conflict for: ${filePath}`);
			}
		}

		return resolvedPath;
	}
}
