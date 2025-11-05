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

// Sync command (pull + push)
async function handleSync(options: any) {
  console.log(chalk.blue("🔄 Starting sync process (pull + push)..."));

  try {
    // Step 1: Check git status
    const statusSpinner = ora("Checking git status...").start();
    const { execSync } = await import('child_process');

    try {
      // Check if we're in a git repository
      execSync('git rev-parse --git-dir', { stdio: 'ignore' });
    } catch (error) {
      statusSpinner.fail(chalk.red("Not a git repository"));
      console.log(chalk.yellow("💡 Tip: Initialize git repository with 'git init'"));
      process.exit(1);
    }

    // Get current branch
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    statusSpinner.succeed(chalk.green(`On branch: ${currentBranch}`));

    // Step 2: Fetch latest changes
    const fetchSpinner = ora("Fetching latest changes from remote...").start();
    try {
      execSync('git fetch --all', { stdio: 'pipe' });
      fetchSpinner.succeed(chalk.green("Fetched latest changes"));
    } catch (error) {
      fetchSpinner.warn(chalk.yellow("Could not fetch (no remote configured?)"));
    }

    // Step 3: Check for remote changes
    const pullSpinner = ora("Checking for remote changes to pull...").start();
    let hasRemoteChanges = false;
    let canFastForward = false;

    try {
      // Check if we can fast-forward
      execSync('git merge-base --is-ancestor HEAD @{upstream}', { stdio: 'ignore' });
      canFastForward = false; // We're already up to date
    } catch (error) {
      // We have changes to pull
      try {
        execSync('git diff --quiet HEAD @{upstream}', { stdio: 'ignore' });
        canFastForward = false; // No changes
      } catch (error) {
        hasRemoteChanges = true;
        canFastForward = true;
      }
    }

    if (hasRemoteChanges && canFastForward) {
      // Safe to pull
      execSync('git pull --ff-only', { stdio: 'pipe' });
      pullSpinner.succeed(chalk.green("Pulled remote changes"));
    } else if (hasRemoteChanges) {
      // Need to merge
      try {
        execSync('git pull', { stdio: 'pipe' });
        pullSpinner.succeed(chalk.green("Merged remote changes"));
      } catch (mergeError) {
        pullSpinner.fail(chalk.red("Merge conflict detected"));
        console.log(chalk.yellow("⚠️  Please resolve merge conflicts and run 'git add .' then 'git commit'"));
        console.log(chalk.blue("💡 After resolving conflicts, run sync again to push"));
        process.exit(1);
      }
    } else {
      pullSpinner.succeed(chalk.green("Already up to date"));
    }

    // Step 4: Check for local changes to push
    const pushSpinner = ora("Checking for local changes to push...").start();

    // Check if there are any staged or unstaged changes
    let hasChanges = false;
    try {
      execSync('git diff --quiet', { stdio: 'ignore' });
    } catch (error) {
      hasChanges = true;
    }

    let hasStagedChanges = false;
    try {
      execSync('git diff --cached --quiet', { stdio: 'ignore' });
    } catch (error) {
      hasStagedChanges = true;
    }

    if (!hasChanges && !hasStagedChanges) {
      pushSpinner.succeed(chalk.green("No local changes to push"));
      console.log(chalk.blue("\n✅ Sync complete: Repository is up to date"));
      return;
    }

    // Stage all changes if requested
    if (options.addAll && hasChanges) {
      execSync('git add .');
      console.log(chalk.blue("📝 Staged all changes"));
    }

    // Check if we need to commit
    let needsCommit = false;
    try {
      execSync('git diff --cached --quiet', { stdio: 'ignore' });
    } catch (error) {
      needsCommit = true;
    }

    if (needsCommit) {
      if (options.commitMessage) {
        execSync(`git commit -m "${options.commitMessage}"`);
        pushSpinner.succeed(chalk.green(`Committed changes: ${options.commitMessage}`));
      } else {
        pushSpinner.fail(chalk.yellow("Changes staged but no commit message provided"));
        console.log(chalk.blue("💡 Use --commit-message to auto-commit, or commit manually"));
        console.log(chalk.blue("💡 Then run sync again to push"));
        process.exit(0);
      }
    } else {
      pushSpinner.succeed(chalk.green("All changes committed"));
    }

    // Step 5: Push changes
    const finalPushSpinner = ora("Pushing changes to remote...").start();
    try {
      execSync('git push', { stdio: 'pipe' });
      finalPushSpinner.succeed(chalk.green("Successfully pushed changes"));
    } catch (pushError: any) {
      if (pushError.message.includes('non-fast-forward')) {
        finalPushSpinner.fail(chalk.red("Push failed: Remote has changes not in local"));
        console.log(chalk.yellow("⚠️  Run 'git pull' first to merge remote changes"));
      } else {
        finalPushSpinner.fail(chalk.red(`Push failed: ${pushError.message}`));
      }
      process.exit(1);
    }

    console.log(chalk.blue("\n✅ Sync complete: Successfully pulled and pushed all changes"));

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
    console.log(chalk.yellow("   • Resolve merge conflicts: 'git add .' then 'git commit'"));
    console.log(chalk.yellow("   • Set upstream: 'git push -u origin <branch>'"));
    console.log(chalk.yellow("   • Check remote: 'git remote -v'"));
    process.exit(1);
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
    "Sync git repository: pull remote changes + push local updates",
    (yargs) => {
      yargs
        .option("add-all", {
          alias: "a",
          type: "boolean",
          default: false,
          describe: "Automatically stage all changes",
        })
        .option("commit-message", {
          alias: "m",
          type: "string",
          describe: "Commit message for auto-commit (requires --add-all)",
        });
    },
    async (argv: any) => {
      await handleSync(argv);
    },
  )
  .demandCommand(1, "You need at least one command before moving on")
  .help()
  .parse();
