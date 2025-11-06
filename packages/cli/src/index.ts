#!/usr/bin/env node

process.setMaxListeners(Infinity);

import chalk from "chalk";
import boxen from "boxen";
import ora from "ora";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import {
  AutoSettingsLoader,
  FileSystemAdaptor,
  Publisher,
  Puller,
  MermaidRendererPlugin,
} from "md-confluence-lib";
import { PuppeteerMermaidRenderer } from "md-confluence-mermaid-puppeteer-renderer";
import { ConfluenceClient } from "confluence.js";
// @ts-ignore
import OpenAI from "openai";
import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";

// Setup common dependencies
async function setupDependencies() {
  const settingLoader = new AutoSettingsLoader();
  const settings = settingLoader.load();

  const adaptor = new FileSystemAdaptor(settings);
  const confluenceClient = new ConfluenceClient({
    host: settings.confluenceBaseUrl,
    authentication: {
      basic: {
        email: settings.atlassianUserName,
        apiToken: settings.atlassianApiToken,
      },
    },
    middlewares: {
      onError(e) {
        if ("response" in e && "data" in e.response) {
          e.message =
            typeof e.response.data === "string"
              ? e.response.data
              : JSON.stringify(e.response.data);
        }
      },
    },
  });

  const mermaidRenderer = new PuppeteerMermaidRenderer();

  return {
    settingLoader,
    settings,
    adaptor,
    confluenceClient,
    mermaidRenderer,
  };
}

// Helper function to display nested file structure for publish results
async function displayPublishStructure() {
  // Get all files that should be published to show complete structure
  const { adaptor, settingLoader } = await setupDependencies();
  const settings = settingLoader.load();
  const allFiles = await adaptor.getMarkdownFilesToUpload();
  const filesToPublish = allFiles.filter((file: any) => {
    const normalizedPath = file.absoluteFilePath.replace(/^\/+/, "");
    return (
      normalizedPath === settings.folderToPublish ||
      normalizedPath.startsWith(settings.folderToPublish + "/")
    );
  });

  if (filesToPublish.length === 0) {
    return;
  }

  // Build tree structure from all files to publish
  const tree: any = {};

  for (const file of filesToPublish) {
    const absolutePath = file.absoluteFilePath;
    // Get relative path from base directory (usually content root)
    // absoluteFilePath is already relative (starts with /docs/...), so remove leading slash
    const relativePath = absolutePath.startsWith("/")
      ? absolutePath.substring(1)
      : absolutePath;
    const parts = relativePath.split("/");
    let current: any = tree;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const isLast = i === parts.length - 1;

      if (!(part in current!)) {
        current![part] = isLast ? null : {};
      }
      current = current![part];
    }
  }

  console.log(chalk.blue("\n📁 Published file structure:"));

  // Display tree recursively
  function displayTree(node: any, prefix: string = "", isLast: boolean = true) {
    const keys = Object.keys(node);

    // Sort keys: files (null values) come before directories (object values)
    keys.sort((a, b) => {
      const aIsFile = node[a] === null;
      const bIsFile = node[b] === null;

      if (aIsFile && !bIsFile) return -1; // files first
      if (!aIsFile && bIsFile) return 1; // directories after
      return a.localeCompare(b); // alphabetical within same type
    });

    keys.forEach((key, index) => {
      const isLastItem = index === keys.length - 1;
      const connector = isLast
        ? isLastItem
          ? "└── "
          : "├── "
        : isLastItem
        ? "└── "
        : "├── ";
      const nextPrefix =
        prefix + (isLast ? "    " : isLastItem ? "    " : "│   ");

      const currentNode = node[key];
      if (currentNode === null) {
        // It's a file - all files are considered "published"
        console.log(chalk.gray(prefix + connector) + chalk.green(key));
      } else {
        // It's a directory
        console.log(chalk.gray(prefix + connector) + chalk.cyan(key + "/"));
        displayTree(currentNode, nextPrefix, isLastItem);
      }
    });
  }

  displayTree(tree);
}

// Helper function to display nested file structure
function displayNestedStructure(results: any[], outputDir: string) {
  const successResults = results.filter((r) => r.success);

  if (successResults.length === 0) {
    return;
  }

  // Build tree structure from file paths
  const tree: any = {};

  for (const result of successResults) {
    const relativePath = result.filePath.replace(outputDir + "/", "");
    const parts = relativePath.split("/");
    let current = tree;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;

      if (!current[part]) {
        current[part] = isLast ? null : {};
      }
      current = current[part];
    }
  }

  console.log(chalk.blue("\n📁 Generated file structure:"));

  // Display tree recursively
  function displayTree(node: any, prefix: string = "", isLast: boolean = true) {
    const keys = Object.keys(node);

    // Sort keys: files (null values) come before directories (object values)
    keys.sort((a, b) => {
      const aIsFile = node[a] === null;
      const bIsFile = node[b] === null;

      if (aIsFile && !bIsFile) return -1; // files first
      if (!aIsFile && bIsFile) return 1; // directories after
      return a.localeCompare(b); // alphabetical within same type
    });

    keys.forEach((key, index) => {
      const isLastItem = index === keys.length - 1;
      const connector = isLast
        ? isLastItem
          ? "└── "
          : "├── "
        : isLastItem
        ? "└── "
        : "├── ";
      const nextPrefix =
        prefix + (isLast ? "    " : isLastItem ? "    " : "│   ");

      if (node[key] === null) {
        // It's a file
        console.log(chalk.gray(prefix + connector) + chalk.green(key));
      } else {
        // It's a directory
        console.log(chalk.gray(prefix + connector) + chalk.cyan(key + "/"));
        displayTree(node[key], nextPrefix, isLastItem);
      }
    });
  }

  displayTree(tree);
}

// Publish command
async function handlePublish(publishFilter: string = "") {
  const spinner = ora("Publishing markdown files to Confluence...").start();

  try {
    const { adaptor, settingLoader, confluenceClient, mermaidRenderer } =
      await setupDependencies();

    const publisher = new Publisher(adaptor, settingLoader, confluenceClient, [
      new MermaidRendererPlugin(mermaidRenderer),
    ]);

    const results = await publisher.publish(publishFilter);

    // Get settings and parent page info for URL logging (reuse existing dependencies)
    const urlSettings = settingLoader.load();

    // Fetch parent page to get space key for URL
    let parentPageUrl = "";
    try {
      const parentPage = await confluenceClient.content.getContentById({
        id: urlSettings.confluenceParentId,
        expand: ["space"],
      });
      if (parentPage.space?.key) {
        parentPageUrl = `${urlSettings.confluenceBaseUrl}/wiki/spaces/${parentPage.space.key}/pages/${urlSettings.confluenceParentId}`;
      }
    } catch (error) {
      // If we can't fetch parent page, build URL with placeholder
      parentPageUrl = `${urlSettings.confluenceBaseUrl}/wiki/spaces/SPACE/pages/${urlSettings.confluenceParentId}`;
    }

    // For accurate counting, get the actual number of files that should be published
    const countSettings = settingLoader.load();
    const allFiles = await adaptor.getMarkdownFilesToUpload();
    const totalFilesToPublish = allFiles.filter((file: any) => {
      const normalizedPath = file.absoluteFilePath.replace(/^\/+/, "");
      return (
        normalizedPath === countSettings.folderToPublish ||
        normalizedPath.startsWith(countSettings.folderToPublish + "/")
      );
    }).length;

    let successCount = totalFilesToPublish; // Use total files that should be published
    let failCount = 0;

    // Display spinner result based on success/failure
    if (successCount > 0) {
      spinner.succeed(chalk.green("Files published successfully!"));
    } else {
      spinner.fail(chalk.red("Failed to publish files"));
    }

    // Display individual results
    results.forEach((file: any) => {
      if (file.successfulUploadResult) {
        // console.log(
        // 	chalk.green(
        // 		`✅ SUCCESS: ${file.node.file.absoluteFilePath} Content: ${file.successfulUploadResult.contentResult}, Images: ${file.successfulUploadResult.imageResult}, Labels: ${file.successfulUploadResult.labelResult}, Page URL: ${file.node.file.pageUrl}`,
        // 	),
        // );
        return;
      }
      console.error(
        chalk.red(
          `❌ FAILED:  ${file.node.file.absoluteFilePath} publish failed. Error is: ${file.reason}`,
        ),
      );
    });

    // Display nested file structure with modification markers if there are successful publishes
    if (successCount > 0) {
      await displayPublishStructure();

      console.log(
        chalk.blue(
          `\n📊 Summary: ${successCount} files published successfully, ${failCount} files failed.`,
        ),
      );

      // Log parent page URL after summary
      if (parentPageUrl) {
        console.log(chalk.blue(`📍 Parent page: ${parentPageUrl}`));
      }
    } else {
      console.log(
        chalk.blue(
          `\n📊 Summary: ${successCount} files published successfully, ${failCount} files failed.`,
        ),
      );
    }

    if (failCount > 0) {
      process.exit(1);
    }
  } catch (error) {
    spinner.fail(
      chalk.red(
        `Publish Error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ),
    );
    console.error(
      chalk.red(
        boxen(
          `Publish Error: ${
            error instanceof Error ? error.message : String(error)
          }`,
          { padding: 1 },
        ),
      ),
    );
    process.exit(1);
  }
}

// Pull single page command
async function handlePullPage(pageId: string, options: any) {
  const spinner = ora("🔄 Pulling page from Confluence...").start();

  try {
    const { settings, confluenceClient } = await setupDependencies();

    const puller = new Puller(confluenceClient, settings);
    const result = await puller.pullSinglePage(pageId, {
      outputDir: options.output || options.outputDir, // Support both --output and --output-dir
      overwriteExisting: options.overwrite,
      fileNameTemplate: options.fileNameTemplate,
    });

    if (result.success) {
      spinner.succeed(
        chalk.green(`Pulled page "${result.pageTitle}" (${result.pageId})`),
      );

      // Display file structure for single page
      if (result.filePath) {
        console.log(chalk.blue("\n📁 Generated file:"));
        const outputDir = options.output || options.outputDir || "./docs";
        console.log(chalk.gray(outputDir + "/"));
        const relativePath = result.filePath.replace(outputDir + "/", "");
        console.log(chalk.gray("└── ") + chalk.green(relativePath));
      }
    } else {
      spinner.fail(
        chalk.red(`Could not pull page ${pageId}. Error: ${result.error}`),
      );
      process.exit(1);
    }
  } catch (error) {
    spinner.fail(
      chalk.red(
        `Pull Page Error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ),
    );
    console.error(
      chalk.red(
        boxen(
          `Pull Page Error: ${
            error instanceof Error ? error.message : String(error)
          }`,
          { padding: 1 },
        ),
      ),
    );
    process.exit(1);
  }
}

// Pull page tree command
async function handlePullTree(rootPageId: string, options: any) {
  const spinner = ora("Pulling page tree from Confluence...").start();

  try {
    const { settings, confluenceClient } = await setupDependencies();

    const puller = new Puller(confluenceClient, settings);
    const results = await puller.pullPageTree(rootPageId, {
      outputDir: options.output || options.outputDir, // Support both --output and --output-dir
      overwriteExisting: options.overwrite,
      includeChildren: true,
      fileNameTemplate: options.fileNameTemplate,
      maxDepth: options.maxDepth, // Pass configurable max depth
    });

    let successCount = 0;
    let failCount = 0;

    // Count results
    results.forEach((result: any) => {
      if (result.success) {
        successCount++;
      } else {
        failCount++;
      }
    });

    // Display spinner result based on success/failure
    if (successCount > 0) {
      spinner.succeed(chalk.green("Page tree pulled successfully!"));
    } else {
      spinner.fail(chalk.red("Failed to pull page tree"));
    }

    // Display individual results
    results.forEach((result: any) => {
      if (result.success) {
        // console.log(
        // 	chalk.green(
        // 		`✅ SUCCESS: Pulled page "${result.pageTitle}" (${result.pageId})`,
        // 	),
        // );
      } else {
        console.error(
          chalk.red(
            `❌ FAILED: Could not pull page ${result.pageId}. Error: ${result.error}`,
          ),
        );
      }
    });

    // Display nested file structure if there are successful pulls
    if (successCount > 0) {
      displayNestedStructure(
        results,
        options.output || options.outputDir || "./docs",
      );
    }

    console.log(
      chalk.blue(
        `\n📊 Summary: ${successCount} pages pulled successfully, ${failCount} pages failed.`,
      ),
    );

    if (failCount > 0) {
      process.exit(1);
    }
  } catch (error) {
    spinner.fail(
      chalk.red(
        `Pull Tree Error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ),
    );
    console.error(
      chalk.red(
        boxen(
          `Pull Tree Error: ${
            error instanceof Error ? error.message : String(error)
          }`,
          { padding: 1 },
        ),
      ),
    );
    process.exit(1);
  }
}

// Sync command (smart sync: pull if no local files, push if local files exist)
async function handleSync(options: any) {
  try {
    // Try to setup Confluence dependencies to get correct settings
    let publishDir = "./docs"; // Default fallback
    let settings = null;
    let adaptor, settingLoader, confluenceClient, mermaidRenderer;

    try {
      const deps = await setupDependencies();
      adaptor = deps.adaptor;
      settingLoader = deps.settingLoader;
      confluenceClient = deps.confluenceClient;
      mermaidRenderer = deps.mermaidRenderer;

      settings = settingLoader.load();
      publishDir = settings.folderToPublish || "./docs";
    } catch (setupError) {
      // If setup fails (no credentials), we can still check local files
      // and provide helpful messaging
      console.log(chalk.yellow("⚠️  Confluence credentials not configured"));
      console.log(chalk.gray("   Checking local files to suggest next steps..."));
    }

    // Check if local files exist in the publish directory
    let hasLocalFiles = false;

    try {
      const { existsSync, readdirSync, statSync } = await import('fs');
      const { join } = await import('path');

      if (existsSync(publishDir)) {
        const checkDir = (dir: string): boolean => {
          try {
            const items = readdirSync(dir);
            for (const item of items) {
              const fullPath = join(dir, item);
              const stat = statSync(fullPath);

              if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
                if (checkDir(fullPath)) return true;
              } else if (stat.isFile() && item.endsWith('.md')) {
                return true;
              }
            }
          } catch (error) {
            // Ignore errors for directories we can't read
          }
          return false;
        };

        hasLocalFiles = checkDir(publishDir);
      }
    } catch (error) {
      console.warn('Failed to check local files:', error);
    }

    // If setup failed, provide guidance
    if (!settings) {
      if (hasLocalFiles) {
        console.log(chalk.blue("\n💡 To push your local files to Confluence:"));
        console.log(chalk.gray("   1. Configure .markdown-confluence.json"));
        console.log(chalk.gray("   2. Run: confluence sync"));
      } else {
        console.log(chalk.blue("\n💡 To pull documentation from Confluence:"));
        console.log(chalk.gray("   1. Configure .markdown-confluence.json"));
        console.log(chalk.gray("   2. Run: confluence sync"));
      }
      return; // Exit gracefully without error
    }

    // Decide what to do based on local files and overwrite flag
    if (options.overwrite) {
      // Force pull all files (overwrite existing)
      await performPull(confluenceClient, settings, options, publishDir);
    } else if (hasLocalFiles) {
      // Local files exist - only push
      await performPush(adaptor, settingLoader, confluenceClient, mermaidRenderer, options);
    } else {
      // No local files - only pull
      await performPull(confluenceClient, settings, options, publishDir);
    }

  } catch (error) {
    console.error(
      chalk.red(
        boxen(
          `Sync Error: ${
            error instanceof Error ? error.message : String(error)
          }`,
          { padding: 1 },
        ),
      ),
    );
    console.log(chalk.yellow("💡 Common solutions:"));
    console.log(chalk.yellow("   • Check your Confluence credentials"));
    console.log(chalk.yellow("   • Verify network connectivity"));
    console.log(chalk.yellow("   • Check .markdown-confluence.json configuration"));
    process.exit(1);
  }
}

// Helper function to perform pull operation
async function performPull(confluenceClient: any, settings: any, options: any, publishDir: string) {
  const pullSpinner = ora("Pulling from Confluence...").start();

  try {
    const puller = new Puller(confluenceClient, settings);
    const pullResults = await puller.pullPageTree(settings.confluenceParentId, {
      outputDir: publishDir,
      overwriteExisting: options.overwrite || false,
      includeChildren: true,
      fileNameTemplate: options.fileNameTemplate || "{title}.md",
      maxDepth: options.maxDepth || 10,
    });

    let pullSuccessCount = 0;
    let pullFailCount = 0;

    pullResults.forEach((result: any) => {
      if (result.success) {
        pullSuccessCount++;
      } else {
        pullFailCount++;
      }
    });

    if (pullSuccessCount > 0) {
      pullSpinner.succeed(chalk.green(`Pulled ${pullSuccessCount} pages from Confluence`));
      displayNestedStructure(pullResults, publishDir);
    } else {
      pullSpinner.warn(chalk.yellow("No pages to pull"));
    }

    if (pullFailCount > 0) {
      console.log(chalk.yellow(`⚠️  ${pullFailCount} pages failed to pull`));
    }

  } catch (pullError) {
    pullSpinner.fail(chalk.red("Failed to pull from Confluence"));
    console.error(chalk.red(`Pull error: ${pullError instanceof Error ? pullError.message : String(pullError)}`));
    throw pullError;
  }
}

// Helper function to perform push operation
async function performPush(adaptor: any, settingLoader: any, confluenceClient: any, mermaidRenderer: any, options: any) {
  const pushSpinner = ora("Pushing to Confluence...").start();

  try {
    const publisher = new Publisher(adaptor, settingLoader, confluenceClient, [
      new MermaidRendererPlugin(mermaidRenderer),
    ]);

    const pushResults = await publisher.publish(options.filter || "");

    let pushSuccessCount = 0;
    let pushFailCount = 0;

    pushResults.forEach((file: any) => {
      if (file.successfulUploadResult) {
        pushSuccessCount++;
      } else {
        pushFailCount++;
      }
    });

    if (pushSuccessCount > 0) {
      pushSpinner.succeed(chalk.green(`Published ${pushSuccessCount} files to Confluence`));
    } else {
      pushSpinner.fail(chalk.red("Failed to push files to Confluence"));
    }

    // Display published file structure (attempted files)
    if (pushSuccessCount > 0 || pushFailCount > 0) {
      await displayPublishStructure();

      // Display parent page URL when push succeeds
      if (pushSuccessCount > 0) {
        const urlSettings = settingLoader.load();

        // Fetch parent page to get space key for URL
        let parentPageUrl = "";
        try {
          const parentPage = await confluenceClient.content.getContentById({
            id: urlSettings.confluenceParentId,
            expand: ["space"],
          });
          if (parentPage.space?.key) {
            parentPageUrl = `${urlSettings.confluenceBaseUrl}/wiki/spaces/${parentPage.space.key}/pages/${urlSettings.confluenceParentId}`;
          }
        } catch (error) {
          // If we can't fetch parent page, build URL with placeholder
          parentPageUrl = `${urlSettings.confluenceBaseUrl}/wiki/spaces/SPACE/pages/${urlSettings.confluenceParentId}`;
        }

        // Log parent page URL after summary
        if (parentPageUrl) {
          console.log(chalk.blue(`📍 Parent page: ${parentPageUrl}`));
        }
      }
    }

    if (pushFailCount > 0) {
      console.log(chalk.yellow(`⚠️  ${pushFailCount} files failed to publish`));
    }

    // Show detailed results
    pushResults.forEach((file: any) => {
      if (file.successfulUploadResult) {
        // Success - minimal logging for sync
      } else {
        console.error(
          chalk.red(
            `❌ FAILED: ${file.node.file.absoluteFilePath} - ${file.reason}`,
          ),
        );
      }
    });

  } catch (pushError) {
    pushSpinner.fail(chalk.red("Failed to push to Confluence"));
    console.error(chalk.red(`Push error: ${pushError instanceof Error ? pushError.message : String(pushError)}`));
    throw pushError;
  }
}

// Get comprehensive project structure as a tree
async function getProjectStructure(rootDir: string, maxDepth: number = 4): Promise<string> {
  const { readdirSync, statSync } = await import('fs');
  const { join } = await import('path');

  function buildTree(dir: string, prefix: string = "", depth: number = 0): string {
    if (depth > maxDepth) {
      return "";
    }

    let result = "";
    let items: string[];

    try {
      items = readdirSync(dir).sort((a, b) => {
        // Sort: directories first, then files, alphabetically
        const aStat = statSync(join(dir, a));
        const bStat = statSync(join(dir, b));
        const aIsDir = aStat.isDirectory();
        const bIsDir = bStat.isDirectory();

        if (aIsDir && !bIsDir) return -1;
        if (!aIsDir && bIsDir) return 1;
        return a.localeCompare(b);
      });
    } catch (error) {
      return "";
    }

    items.forEach((item, index) => {
      const fullPath = join(dir, item);
      const isLast = index === items.length - 1;
      const connector = isLast ? "└── " : "├── ";
      const nextPrefix = prefix + (isLast ? "    " : "│   ");

      try {
        const stat = statSync(fullPath);

        // Skip hidden files/directories and common build artifacts
        if (item.startsWith('.') ||
            item === 'node_modules' ||
            item === 'dist' ||
            item === 'build' ||
            item === '.git' ||
            item === 'coverage' ||
            item === '.next' ||
            item === '.nuxt' ||
            item === '.vuepress' ||
            item === '_site' ||
            item === 'public' ||
            item === 'static') {
          return;
        }

        if (stat.isDirectory()) {
          result += prefix + connector + item + "/\n";
          const subTree = buildTree(fullPath, nextPrefix, depth + 1);
          if (subTree) {
            result += subTree;
          }
        } else {
          // Only show important file types
          const ext = item.split('.').pop()?.toLowerCase();
          if (['md', 'ts', 'js', 'tsx', 'jsx', 'json', 'yml', 'yaml', 'toml', 'config', 'env'].includes(ext || '') ||
              item === 'Dockerfile' ||
              item === 'Makefile' ||
              item === 'package.json' ||
              item === 'tsconfig.json' ||
              item === 'README' ||
              item.startsWith('README.') ||
              item === 'AGENT' ||
              item.startsWith('AGENT.') ||
              item === 'CHANGELOG' ||
              item.startsWith('CHANGELOG.') ||
              item === 'CONTRIBUTING' ||
              item.startsWith('CONTRIBUTING.')) {
            result += prefix + connector + item + "\n";
          }
        }
      } catch (error) {
        // Skip files we can't access
      }
    });

    return result;
  }

  const tree = buildTree(rootDir);
  return tree || "No project structure found";
}

// Retry function with exponential backoff for API rate limiting
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 2000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;

      // Check if it's a rate limiting error (429)
      const isRateLimit = error?.status === 429 ||
                         error?.code === 429 ||
                         error?.message?.includes('429') ||
                         error?.message?.includes('rate limit') ||
                         error?.message?.includes('Provisioned Throughput');

      if (!isRateLimit || attempt === maxRetries) {
        // If not rate limit error or max retries reached, throw immediately
        throw error;
      }

      // Calculate delay with exponential backoff and jitter
      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
      const delaySeconds = Math.ceil(delay / 1000);

      console.log(chalk.yellow(`🤖 AI đang mệt... thử lại lần ${attempt}/${maxRetries} sau ${delaySeconds} giây...`));
      console.log(chalk.gray(`   Lỗi: ${error?.message || 'Rate limiting'}`));

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

// Gather comprehensive project context from multiple sources
async function gatherProjectContext(): Promise<string> {
  const contextParts: string[] = [];

  // 1. Read AGENT.md (highest priority - project rules and conventions)
  try {
    if (existsSync("./AGENT.md")) {
      const agentContent = readFileSync("./AGENT.md", "utf8");
      contextParts.push(`=== PROJECT AGENT RULES ===\n${agentContent}\n`);
    }
  } catch (error) {
    // Continue without AGENT.md
  }

  // 2. Read README.md (project overview and setup)
  try {
    if (existsSync("./README.md")) {
      const readmeContent = readFileSync("./README.md", "utf8");
      contextParts.push(`=== PROJECT README ===\n${readmeContent}\n`);
    }
  } catch (error) {
    // Continue without README.md
  }

  // 3. Read package.json (project metadata and dependencies)
  try {
    if (existsSync("./package.json")) {
      const packageJson = JSON.parse(readFileSync("./package.json", "utf8"));
      const packageInfo = {
        name: packageJson.name,
        version: packageJson.version,
        description: packageJson.description,
        main: packageJson.main,
        scripts: packageJson.scripts,
        dependencies: Object.keys(packageJson.dependencies || {}),
        devDependencies: Object.keys(packageJson.devDependencies || {}),
        workspaces: packageJson.workspaces
      };
      contextParts.push(`=== PROJECT PACKAGE INFO ===\n${JSON.stringify(packageInfo, null, 2)}\n`);
    }
  } catch (error) {
    // Continue without package.json
  }

  // 4. Read .markdown-confluence.json if exists (Confluence configuration)
  try {
    if (existsSync("./.markdown-confluence.json")) {
      const confluenceConfig = JSON.parse(readFileSync("./.markdown-confluence.json", "utf8"));
      // Remove sensitive info
      const safeConfig = { ...confluenceConfig };
      delete safeConfig.atlassianUserName;
      delete safeConfig.atlassianApiToken;

      contextParts.push(`=== CONFLUENCE CONFIGURATION ===\n${JSON.stringify(safeConfig, null, 2)}\n`);
    }
  } catch (error) {
    // Continue without confluence config
  }

  // 5. Read any .env.example or similar files for environment understanding
  const envFiles = [".env.example", ".env.local", ".env"];
  for (const envFile of envFiles) {
    try {
      if (existsSync(envFile)) {
        const envContent = readFileSync(envFile, "utf8");
        // Only include non-sensitive env vars (those without values)
        const safeEnvLines = envContent
          .split("\n")
          .filter(line => line.includes("=") && !line.includes("SECRET") && !line.includes("KEY") && !line.includes("TOKEN"))
          .join("\n");
        if (safeEnvLines.trim()) {
          contextParts.push(`=== ENVIRONMENT VARIABLES (${envFile}) ===\n${safeEnvLines}\n`);
        }
        break; // Only read one env file
      }
    } catch (error) {
      // Continue
    }
  }

  // 6. Get comprehensive project structure info
  try {
    const projectStructure = await getProjectStructure(process.cwd());
    contextParts.push(`=== PROJECT FILE STRUCTURE ===\n${projectStructure}\n`);
  } catch (error) {
    // Continue without project structure
  }

  return contextParts.join("\n");
}

// Generate documentation from code changes using OpenAI
async function handleGenerateDocs(options: any) {
  console.log(chalk.blue("🤖 Starting documentation generation..."));

  try {
    // Check OpenAI API key
    const openaiApiKey = process.env['OPENAI_API_KEY'];
    if (!openaiApiKey) {
      console.error(
        chalk.red(
          boxen(
            "OpenAI API key is required. Set OPENAI_API_KEY environment variable.",
            { padding: 1 },
          ),
        ),
      );
      process.exit(1);
    }

    const openai = new OpenAI({
      baseURL: process.env['OPENAI_BASE_URL'] || 'https://generativelanguage.googleapis.com/v1beta/openai/',
      apiKey: openaiApiKey,
    });

    // Get git diff
    const diffSpinner = ora("Getting code changes...").start();
    let diff = "";
    try {
      diff = execSync(options.diffCommand || "git diff HEAD~1..HEAD", {
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
      });
    } catch (error) {
      diffSpinner.warn(chalk.yellow("Could not get git diff, using empty diff"));
    }

    if (!diff.trim()) {
      diffSpinner.warn(chalk.yellow("No code changes found"));
      // Still proceed with empty diff
    } else {
      diffSpinner.succeed(chalk.green(`Got ${diff.length} characters of diff`));
    }

    // Gather comprehensive project context
    const projectContext = await gatherProjectContext();

    // Generate documentation
    const generateSpinner = ora("Generating documentation...").start();

    const promptFeatureName = options.feature || "Feature Name";

    const prompt = `You are a senior software engineer working on this specific project. ${projectContext ? `Here is comprehensive information about the project you are working on:\n\n${projectContext}` : 'No project context provided.'}

Based on the code changes below, create a **simple, flat feature documentation** entry. AVOID nested structures and complex hierarchies.

Format output strictly in **Markdown**:

## ${promptFeatureName}

<short descriptive name following project naming conventions>

### Summary

<what changed and why, explaining the business/technical rationale>

### Changes Made

- <list specific components or modules changed, following project structure>
- <any new APIs, changed behaviors, or breaking changes>

### Usage Example

\`\`\`js
<example code showing how to use this feature, following project patterns>
\`\`\`

### Notes

<important implications, edge cases, or maintenance considerations>

--- CODE CHANGES ---

${diff}

IMPORTANT: Keep documentation FLAT and SIMPLE. Do NOT create nested sections, sub-headings beyond H3, or complex hierarchies. Focus on clarity over complexity.`;

    // Use retry logic for API calls to handle rate limiting
    const maxRetries = options.maxRetries || 3;
    const retryDelay = options.retryDelay || 3000;

    const response = await retryWithBackoff(
      () => openai.chat.completions.create({
        model: options.model || "gemini-2.0-flash",
        messages: [
          {
            role: "system",
            content: "You produce concise, accurate developer documentation. Focus on what changed and why."
          },
          { role: "user", content: prompt }
        ],
      }),
      maxRetries,
      retryDelay
    );

    let markdown = response.choices[0]?.message?.content;
    if (!markdown) {
      throw new Error("No response from OpenAI API");
    }

    // Clean markdown code block wrapper if AI added it
    if (markdown.startsWith('```markdown') && markdown.endsWith('```')) {
      markdown = markdown.slice(11, -3).trim(); // Remove ```markdown\n and \n```
    } else if (markdown.startsWith('```') && markdown.endsWith('```')) {
      markdown = markdown.slice(4, -3).trim(); // Remove ```\n and \n```
    }

    generateSpinner.succeed(chalk.green("Documentation generated successfully"));

    // Save to file
    const { writeFileSync, statSync } = await import("fs");
    const { join } = await import("path");

    // Create default filename from feature name
    const featureFilename = options.feature
      ? options.feature.toLowerCase().replace(/[^a-z0-9]/g, '_') + '.md'
      : 'new_feature.md';

    let outputPath = options.output || `./${featureFilename}`;

    try {
      // Check if output path is a directory
      const stats = statSync(outputPath);
      if (stats.isDirectory()) {
        // If it's a directory, create filename inside it
        outputPath = join(outputPath, featureFilename);
      }
      // If it's a file path or doesn't exist, use as-is
    } catch (error) {
      // Path doesn't exist, treat as file path
    }

    const formattedTitle = options.feature
      ? options.feature : 'New Feature'

    const finalMarkdown = `---\nconnie-publish: true\nconnie-title: "${formattedTitle}"\n---\n${markdown}`;

    writeFileSync(outputPath, finalMarkdown);

    console.log(chalk.green(`✅ Generated: ${outputPath}`));
    console.log(chalk.gray("📄 Preview:"));
    console.log(chalk.gray("─".repeat(50)));
    console.log(markdown.split("\n").slice(0, 10).join("\n"));
    console.log(chalk.gray("─".repeat(50)));
    console.log(chalk.gray("(See full documentation in the file)"));

    // Optionally publish to Confluence
    if (options.publish) {
      console.log(chalk.blue("\n📤 Publishing to Confluence..."));

      // Create a temporary markdown file for publishing
      const tempFile = `./temp_feature_doc_${Date.now()}.md`;
      writeFileSync(tempFile, markdown);

      try {
        const { adaptor, settingLoader, confluenceClient, mermaidRenderer } =
          await setupDependencies();

        const publisher = new Publisher(adaptor, settingLoader, confluenceClient, [
          new MermaidRendererPlugin(mermaidRenderer),
        ]);

        const publishResults = await publisher.publish(tempFile);

        let publishSuccessCount = 0;

        publishResults.forEach((file: any) => {
          if (file.successfulUploadResult) {
            publishSuccessCount++;
          }
        });

        if (publishSuccessCount > 0) {
          console.log(chalk.green(`✅ Published feature documentation to Confluence`));
        } else {
          console.log(chalk.red(`❌ Failed to publish feature documentation`));
        }

      } catch (publishError) {
        console.log(chalk.yellow(`⚠️ Could not publish to Confluence: ${publishError instanceof Error ? publishError.message : String(publishError)}`));
      } finally {
        // Clean up temp file
        try {
          const { unlinkSync } = await import("fs");
          unlinkSync(tempFile);
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    }

  } catch (error: any) {
    const isRateLimit = error?.status === 429 ||
                       error?.code === 429 ||
                       error?.message?.includes('429') ||
                       error?.message?.includes('rate limit') ||
                       error?.message?.includes('Provisioned Throughput');

    if (isRateLimit) {
      console.error(
        chalk.red(
          boxen(
            `🤖 AI is tired!\n\n` +
            `Lỗi: ${error?.message || 'Rate limiting exceeded'}\n\n` +
            `💡 Please try again later or:\n` +
            `   • Switch to a different model`,
            { padding: 1 },
          ),
        ),
      );
    } else {
      console.error(
        chalk.red(
          boxen(
            `Documentation Generation Error: ${
              error instanceof Error ? error.message : String(error)
            }`,
            { padding: 1 },
          ),
        ),
      );
      console.log(chalk.yellow("💡 Make sure OPENAI_API_KEY is set and you have internet connection"));
    }
    process.exit(1);
  }
}

// Custom argument preprocessor for feature names with spaces
export function preprocessFeatureArgs(args: string[]): string[] {
  const processedArgs: string[] = [];
  let i = 0;

  while (i < args.length) {
    const arg = args[i];

    if (!arg) {
      i++;
      continue;
    }

    // Handle --feature or -f flag
    if (arg === '--feature' || arg === '-f') {
      processedArgs.push(arg);
      i++; // Move to next argument

      // Collect all following arguments until we hit another flag
      let featureName = '';
      while (i < args.length && args[i] && !args[i]!.startsWith('-')) {
        // Remove surrounding quotes if present
        const currentArg = args[i]!;
        const cleanArg = currentArg.replace(/^["']|["']$/g, '');
        featureName += (featureName ? ' ' : '') + cleanArg;
        i++;
      }

      if (featureName) {
        processedArgs.push(featureName);
      } else {
        // No feature name provided, yargs will handle the error
        i--; // Back up so yargs sees the missing value
      }
    } else {
      processedArgs.push(arg);
      i++;
    }
  }

  return processedArgs;
}

// Main CLI setup
const processedArgs = preprocessFeatureArgs(hideBin(process.argv));

yargs(processedArgs)
  .scriptName("confluence")
  .usage("$0 <cmd> [args]")
  .command(
    "publish [filter]",
    "Publish markdown files to Confluence (default command)",
    (yargs) => {
      yargs.positional("filter", {
        type: "string",
        default: "",
        describe: "Filter pattern for files to publish",
      });
    },
    async (argv: any) => {
      await handlePublish(argv.filter || "");
    },
  )
  .command(
    "pull <pageId>",
    "Pull pages from Confluence to markdown",
    (yargs) => {
      yargs
        .positional("pageId", {
          type: "string",
          demandOption: true,
          describe: "Confluence page ID to pull",
        })
        .option("output", {
          alias: "o",
          type: "string",
          default: "./docs",
          describe: "Output directory for markdown files",
        })
        .option("recursive", {
          alias: "r",
          type: "boolean",
          default: false,
          describe: "Pull page and all children recursively",
        })
        .option("max-depth", {
          type: "number",
          default: 10,
          describe: "Maximum recursion depth (default: 10)",
        })
        .option("overwrite", {
          alias: "w",
          type: "boolean",
          default: false,
          describe: "Overwrite existing files",
        })
        .option("file-name-template", {
          alias: "t",
          type: "string",
          default: "{title}.md",
          describe: "Template for filename generation",
        });
    },
    async (argv: any) => {
      if (argv.recursive) {
        await handlePullTree(argv.pageId, argv);
      } else {
        await handlePullPage(argv.pageId, argv);
      }
    },
  )
  .command(
    "pull-page <pageId>",
    false, // Hide from help text
    (yargs) => {
      yargs
        .positional("pageId", {
          type: "string",
          demandOption: true,
          describe: "Confluence page ID to pull",
        })
        .option("output-dir", {
          alias: "o",
          type: "string",
          default: "./docs",
          describe: "Output directory for markdown files",
        })
        .option("overwrite", {
          alias: "w",
          type: "boolean",
          default: false,
          describe: "Overwrite existing files",
        })
        .option("file-name-template", {
          alias: "t",
          type: "string",
          default: "{title}.md",
          describe: "Template for filename generation",
        });
    },
    async (argv: any) => {
      console.warn(
        chalk.yellow(
          "⚠️  WARNING: 'pull-page' command is deprecated. Use 'pull <pageId>' instead.",
        ),
      );
      await handlePullPage(argv.pageId, argv);
    },
  )
  .command(
    "pull-tree <rootPageId>",
    false, // Hide from help text
    (yargs) => {
      yargs
        .positional("rootPageId", {
          type: "string",
          demandOption: true,
          describe: "Root Confluence page ID to pull tree from",
        })
        .option("output-dir", {
          alias: "o",
          type: "string",
          default: "./docs",
          describe: "Output directory for markdown files",
        })
        .option("overwrite", {
          alias: "w",
          type: "boolean",
          default: false,
          describe: "Overwrite existing files",
        })
        .option("file-name-template", {
          alias: "t",
          type: "string",
          default: "{title}.md",
          describe: "Template for filename generation",
        });
    },
    async (argv: any) => {
      console.warn(
        chalk.yellow(
          "⚠️  WARNING: 'pull-tree' command is deprecated. Use 'pull <pageId> --recursive' instead.",
        ),
      );
      await handlePullTree(argv.rootPageId, argv);
    },
  )
  .command(
    "sync",
    "Sync with Confluence: pull latest changes + push local updates",
    (yargs) => {
      yargs
        .option("filter", {
          alias: "f",
          type: "string",
          describe: "Filter pattern for files to publish",
        })
        .option("overwrite", {
          alias: "w",
          type: "boolean",
          default: false,
          describe: "Force update all files from Confluence (default: only pull new files)",
        })
        .option("max-depth", {
          type: "number",
          default: 10,
          describe: "Maximum recursion depth when pulling (default: 10)",
        })
        .option("file-name-template", {
          alias: "t",
          type: "string",
          default: "{title}.md",
          describe: "Template for filename generation when pulling",
        });
    },
    async (argv: any) => {
      await handleSync(argv);
    },
  )
  .command(
    "generate-docs",
    "Generate documentation from code changes using OpenAI",
    (yargs) => {
      yargs
        .option("diff-command", {
          type: "string",
          default: "git diff HEAD~1..HEAD",
          describe: "Git command to get code changes",
        })
        .option("model", {
          type: "string",
          default: "gpt-4",
          describe: "OpenAI model to use (gpt-4, gpt-3.5-turbo, etc.)",
        })
        .option("output", {
          alias: "o",
          type: "string",
          default: "./FEATURE_DOC.md",
          describe: "Output file path for generated documentation",
        })
        .option("publish", {
          alias: "p",
          type: "boolean",
          default: false,
          describe: "Automatically publish generated docs to Confluence",
        })
        .option("feature", {
          alias: "f",
          type: "string",
          describe: "Feature name to use in filename and title",
        })
        .option("max-retries", {
          type: "number",
          default: 3,
          describe: "Maximum number of retries for rate limiting (default: 3)",
        })
        .option("retry-delay", {
          type: "number",
          default: 3000,
          describe: "Base delay between retries in milliseconds (default: 3000)",
        });
    },
    async (argv: any) => {
      await handleGenerateDocs(argv);
    },
  )
  .demandCommand(1, "You need at least one command before moving on")
  .help()
  .parse();
