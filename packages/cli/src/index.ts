#!/usr/bin/env node

process.setMaxListeners(Infinity);

import chalk from "chalk";
import boxen from "boxen";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import {
	AutoSettingsLoader,
	FileSystemAdaptor,
	Publisher,
	Puller,
	MermaidRendererPlugin,
} from "@markdown-confluence/lib";
import { PuppeteerMermaidRenderer } from "@markdown-confluence/mermaid-puppeteer-renderer";
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

// Publish command
async function handlePublish(publishFilter: string = "") {
	try {
		const { adaptor, settingLoader, confluenceClient, mermaidRenderer } = await setupDependencies();

		const publisher = new Publisher(adaptor, settingLoader, confluenceClient, [
			new MermaidRendererPlugin(mermaidRenderer),
		]);

		const results = await publisher.publish(publishFilter);
		results.forEach((file) => {
			if (file.successfulUploadResult) {
				console.log(
					chalk.green(
						`SUCCESS: ${file.node.file.absoluteFilePath} Content: ${file.successfulUploadResult.contentResult}, Images: ${file.successfulUploadResult.imageResult}, Labels: ${file.successfulUploadResult.labelResult}, Page URL: ${file.node.file.pageUrl}`,
					),
				);
				return;
			}
			console.error(
				chalk.red(
					`FAILED:  ${file.node.file.absoluteFilePath} publish failed. Error is: ${file.reason}`,
				),
			);
		});
	} catch (error) {
		console.error(chalk.red(boxen(`Publish Error: ${error instanceof Error ? error.message : String(error)}`, { padding: 1 })));
		process.exit(1);
	}
}

// Pull single page command
async function handlePullPage(pageId: string, options: any) {
	try {
		const { settings, confluenceClient } = await setupDependencies();

		const puller = new Puller(confluenceClient, settings);
		const result = await puller.pullSinglePage(pageId, {
			outputDir: options.outputDir,
			overwriteExisting: options.overwrite,
			fileNameTemplate: options.fileNameTemplate,
		});

		if (result.success) {
			console.log(
				chalk.green(
					`SUCCESS: Pulled page "${result.pageTitle}" (${result.pageId}) to ${result.filePath}`,
				),
			);
		} else {
			console.error(
				chalk.red(
					`FAILED: Could not pull page ${pageId}. Error: ${result.error}`,
				),
			);
			process.exit(1);
		}
	} catch (error) {
		console.error(chalk.red(boxen(`Pull Page Error: ${error instanceof Error ? error.message : String(error)}`, { padding: 1 })));
		process.exit(1);
	}
}

// Pull page tree command
async function handlePullTree(rootPageId: string, options: any) {
	try {
		const { settings, confluenceClient } = await setupDependencies();

		const puller = new Puller(confluenceClient, settings);
		const results = await puller.pullPageTree(rootPageId, {
			outputDir: options.outputDir,
			overwriteExisting: options.overwrite,
			includeChildren: true,
			fileNameTemplate: options.fileNameTemplate,
		});

		let successCount = 0;
		let failCount = 0;

		results.forEach((result) => {
			if (result.success) {
				console.log(
					chalk.green(
						`SUCCESS: Pulled page "${result.pageTitle}" (${result.pageId}) to ${result.filePath}`,
					),
				);
				successCount++;
			} else {
				console.error(
					chalk.red(
						`FAILED: Could not pull page ${result.pageId}. Error: ${result.error}`,
					),
				);
				failCount++;
			}
		});

		console.log(
			chalk.blue(
				`\nSummary: ${successCount} pages pulled successfully, ${failCount} pages failed.`,
			),
		);

		if (failCount > 0) {
			process.exit(1);
		}
	} catch (error) {
		console.error(chalk.red(boxen(`Pull Tree Error: ${error instanceof Error ? error.message : String(error)}`, { padding: 1 })));
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
		"pull-page <pageId>",
		"Pull a single page from Confluence to markdown",
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
					default: "./pulled-pages",
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
			await handlePullPage(argv.pageId, argv);
		},
	)
	.command(
		"pull-tree <rootPageId>",
		"Pull a page tree (page + all children) from Confluence to markdown",
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
					default: "./pulled-pages",
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
			await handlePullTree(argv.rootPageId, argv);
		},
	)
	.demandCommand(1, "You need at least one command before moving on")
	.help()
	.parse();
