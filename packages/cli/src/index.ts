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
      pushSpinner.warn(chalk.yellow("No files to publish"));
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

// Main CLI setup
yargs(hideBin(process.argv))
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
  .demandCommand(1, "You need at least one command before moving on")
  .help()
  .parse();
