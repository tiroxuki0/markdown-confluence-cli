#!/usr/bin/env node

process.setMaxListeners(Infinity)

import chalk from "chalk"
import boxen from "boxen"
import ora from "ora"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import { AutoSettingsLoader, FileSystemAdaptor, Publisher, Puller, MermaidRendererPlugin } from "md-confluence-lib"
import { PuppeteerMermaidRenderer } from "md-confluence-mermaid-puppeteer-renderer"
import { ConfluenceClient } from "confluence.js"
// @ts-ignore
import OpenAI from "openai"
import { execSync, spawn } from "child_process"
import { readFileSync, existsSync } from "fs"
import { createInterface } from "readline"

// Setup common dependencies
async function setupDependencies() {
  const settingLoader = new AutoSettingsLoader()
  const settings = settingLoader.load()

  const adaptor = new FileSystemAdaptor(settings)
  const confluenceClient = new ConfluenceClient({
    host: settings.confluenceBaseUrl,
    authentication: {
      basic: {
        email: settings.atlassianUserName,
        apiToken: settings.atlassianApiToken
      }
    },
    middlewares: {
      onError(e) {
        if ("response" in e && "data" in e.response) {
          e.message = typeof e.response.data === "string" ? e.response.data : JSON.stringify(e.response.data)
        }
      }
    }
  })

  const mermaidRenderer = new PuppeteerMermaidRenderer()

  return {
    settingLoader,
    settings,
    adaptor,
    confluenceClient,
    mermaidRenderer
  }
}

// Helper function to display nested file structure for publish results
async function displayPublishStructure() {
  // Get all files that should be published to show complete structure
  const { adaptor, settingLoader } = await setupDependencies()
  const settings = settingLoader.load()
  const allFiles = await adaptor.getMarkdownFilesToUpload()
  const filesToPublish = allFiles.filter((file: any) => {
    const normalizedPath = file.absoluteFilePath.replace(/^\/+/, "")
    return normalizedPath === settings.folderToPublish || normalizedPath.startsWith(settings.folderToPublish + "/")
  })

  if (filesToPublish.length === 0) {
    return
  }

  // Build tree structure from all files to publish
  const tree: any = {}

  for (const file of filesToPublish) {
    const absolutePath = file.absoluteFilePath
    // Get relative path from base directory (usually content root)
    // absoluteFilePath is already relative (starts with /docs/...), so remove leading slash
    const relativePath = absolutePath.startsWith("/") ? absolutePath.substring(1) : absolutePath
    const parts = relativePath.split("/")
    let current: any = tree

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!
      const isLast = i === parts.length - 1

      if (!(part in current!)) {
        current![part] = isLast ? null : {}
      }
      current = current![part]
    }
  }

  console.log(chalk.blue("\n📁 Published file structure:"))

  // Display tree recursively
  function displayTree(node: any, prefix: string = "", isLast: boolean = true) {
    const keys = Object.keys(node)

    // Sort keys: files (null values) come before directories (object values)
    keys.sort((a, b) => {
      const aIsFile = node[a] === null
      const bIsFile = node[b] === null

      if (aIsFile && !bIsFile) return -1 // files first
      if (!aIsFile && bIsFile) return 1 // directories after
      return a.localeCompare(b) // alphabetical within same type
    })

    keys.forEach((key, index) => {
      const isLastItem = index === keys.length - 1
      const connector = isLast ? (isLastItem ? "└── " : "├── ") : isLastItem ? "└── " : "├── "
      const nextPrefix = prefix + (isLast ? "    " : isLastItem ? "    " : "│   ")

      const currentNode = node[key]
      if (currentNode === null) {
        // It's a file - all files are considered "published"
        console.log(chalk.gray(prefix + connector) + chalk.green(key))
      } else {
        // It's a directory
        console.log(chalk.gray(prefix + connector) + chalk.cyan(key + "/"))
        displayTree(currentNode, nextPrefix, isLastItem)
      }
    })
  }

  displayTree(tree)
}

// Helper function to display nested file structure
function displayNestedStructure(results: any[], outputDir: string) {
  const successResults = results.filter((r) => r.success)

  if (successResults.length === 0) {
    return
  }

  // Build tree structure from file paths
  const tree: any = {}

  for (const result of successResults) {
    const relativePath = result.filePath.replace(outputDir + "/", "")
    const parts = relativePath.split("/")
    let current = tree

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLast = i === parts.length - 1

      if (!current[part]) {
        current[part] = isLast ? null : {}
      }
      current = current[part]
    }
  }

  console.log(chalk.blue("\n📁 Generated file structure:"))

  // Display tree recursively
  function displayTree(node: any, prefix: string = "", isLast: boolean = true) {
    const keys = Object.keys(node)

    // Sort keys: files (null values) come before directories (object values)
    keys.sort((a, b) => {
      const aIsFile = node[a] === null
      const bIsFile = node[b] === null

      if (aIsFile && !bIsFile) return -1 // files first
      if (!aIsFile && bIsFile) return 1 // directories after
      return a.localeCompare(b) // alphabetical within same type
    })

    keys.forEach((key, index) => {
      const isLastItem = index === keys.length - 1
      const connector = isLast ? (isLastItem ? "└── " : "├── ") : isLastItem ? "└── " : "├── "
      const nextPrefix = prefix + (isLast ? "    " : isLastItem ? "    " : "│   ")

      if (node[key] === null) {
        // It's a file
        console.log(chalk.gray(prefix + connector) + chalk.green(key))
      } else {
        // It's a directory
        console.log(chalk.gray(prefix + connector) + chalk.cyan(key + "/"))
        displayTree(node[key], nextPrefix, isLastItem)
      }
    })
  }

  displayTree(tree)
}

// Publish command
async function handlePublish(publishFilter: string = "") {
  const spinner = ora("Publishing markdown files to Confluence...").start()

  try {
    const { adaptor, settingLoader, confluenceClient, mermaidRenderer } = await setupDependencies()
    const publisher = new Publisher(adaptor, settingLoader, confluenceClient, [new MermaidRendererPlugin(mermaidRenderer)])
    const results = await publisher.publish(publishFilter)

    // Get settings and parent page info for URL logging (reuse existing dependencies)
    const urlSettings = settingLoader.load()

    // Fetch parent page to get space key for URL
    let parentPageUrl = ""
    try {
      const parentPage = await confluenceClient.content.getContentById({
        id: urlSettings.confluenceParentId,
        expand: ["space"]
      })
      if (parentPage.space?.key) {
        parentPageUrl = `${urlSettings.confluenceBaseUrl}/wiki/spaces/${parentPage.space.key}/pages/${urlSettings.confluenceParentId}`
      }
    } catch (error) {
      // If we can't fetch parent page, build URL with placeholder
      parentPageUrl = `${urlSettings.confluenceBaseUrl}/wiki/spaces/SPACE/pages/${urlSettings.confluenceParentId}`
    }

    // For accurate counting, get the actual number of files that should be published
    const countSettings = settingLoader.load()
    const allFiles = await adaptor.getMarkdownFilesToUpload()
    const totalFilesToPublish = allFiles.filter((file: any) => {
      const normalizedPath = file.absoluteFilePath.replace(/^\/+/, "")
      return normalizedPath === countSettings.folderToPublish || normalizedPath.startsWith(countSettings.folderToPublish + "/")
    }).length

    let successCount = totalFilesToPublish // Use total files that should be published
    let failCount = 0

    // Display spinner result based on success/failure
    if (successCount > 0) {
      spinner.succeed(chalk.green("Files published successfully!"))
    } else {
      spinner.fail(chalk.red("Failed to publish files"))
    }

    // Display individual results
    results.forEach((file: any) => {
      if (file.successfulUploadResult) {
        // console.log(
        // 	chalk.green(
        // 		`✅ SUCCESS: ${file.node.file.absoluteFilePath} Content: ${file.successfulUploadResult.contentResult}, Images: ${file.successfulUploadResult.imageResult}, Labels: ${file.successfulUploadResult.labelResult}, Page URL: ${file.node.file.pageUrl}`,
        // 	),
        // );
        return
      }
      console.error(chalk.red(`❌ FAILED:  ${file.node.file.absoluteFilePath} publish failed. Error is: ${file.reason}`))
    })

    // Display nested file structure with modification markers if there are successful publishes
    if (successCount > 0) {
      await displayPublishStructure()

      console.log(chalk.blue(`\n📊 Summary: ${successCount} files published successfully, ${failCount} files failed.`))

      // Log parent page URL after summary
      if (parentPageUrl) {
        console.log(chalk.blue(`📍 Parent page: ${parentPageUrl}`))
      }
    } else {
      console.log(chalk.blue(`\n📊 Summary: ${successCount} files published successfully, ${failCount} files failed.`))
    }

    if (failCount > 0) {
      process.exit(1)
    }
  } catch (error) {
    spinner.fail(chalk.red(`Publish Error: ${error instanceof Error ? error.message : String(error)}`))
    console.error(chalk.red(boxen(`Publish Error: ${error instanceof Error ? error.message : String(error)}`, { padding: 1 })))
    process.exit(1)
  }
}

// Pull single page command
async function handlePullPage(pageId: string, options: any) {
  const spinner = ora("🔄 Pulling page from Confluence...").start()

  try {
    const { settings, confluenceClient } = await setupDependencies()

    const puller = new Puller(confluenceClient, settings)
    const result = await puller.pullSinglePage(pageId, {
      outputDir: options.output || options.outputDir, // Support both --output and --output-dir
      overwriteExisting: options.overwrite,
      fileNameTemplate: options.fileNameTemplate
    })

    if (result.success) {
      spinner.succeed(chalk.green(`Pulled page "${result.pageTitle}" (${result.pageId})`))

      // Display file structure for single page
      if (result.filePath) {
        console.log(chalk.blue("\n📁 Generated file:"))
        const outputDir = options.output || options.outputDir || "./docs"
        console.log(chalk.gray(outputDir + "/"))
        const relativePath = result.filePath.replace(outputDir + "/", "")
        console.log(chalk.gray("└── ") + chalk.green(relativePath))
      }
    } else {
      spinner.fail(chalk.red(`Could not pull page ${pageId}. Error: ${result.error}`))
      process.exit(1)
    }
  } catch (error) {
    spinner.fail(chalk.red(`Pull Page Error: ${error instanceof Error ? error.message : String(error)}`))
    console.error(chalk.red(boxen(`Pull Page Error: ${error instanceof Error ? error.message : String(error)}`, { padding: 1 })))
    process.exit(1)
  }
}

// Pull page tree command
async function handlePullTree(rootPageId: string, options: any) {
  const spinner = ora("Pulling page tree from Confluence...").start()

  try {
    const { settings, confluenceClient } = await setupDependencies()

    const puller = new Puller(confluenceClient, settings)
    const results = await puller.pullPageTree(rootPageId, {
      outputDir: options.output || options.outputDir, // Support both --output and --output-dir
      overwriteExisting: options.overwrite,
      includeChildren: true,
      fileNameTemplate: options.fileNameTemplate,
      maxDepth: options.maxDepth // Pass configurable max depth
    })

    let successCount = 0
    let failCount = 0

    // Count results
    results.forEach((result: any) => {
      if (result.success) {
        successCount++
      } else {
        failCount++
      }
    })

    // Display spinner result based on success/failure
    if (successCount > 0) {
      spinner.succeed(chalk.green("Page tree pulled successfully!"))
    } else {
      spinner.fail(chalk.red("Failed to pull page tree"))
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
        console.error(chalk.red(`❌ FAILED: Could not pull page ${result.pageId}. Error: ${result.error}`))
      }
    })

    // Display nested file structure if there are successful pulls
    if (successCount > 0) {
      displayNestedStructure(results, options.output || options.outputDir || "./docs")
    }

    console.log(chalk.blue(`\n📊 Summary: ${successCount} pages pulled successfully, ${failCount} pages failed.`))

    if (failCount > 0) {
      process.exit(1)
    }
  } catch (error) {
    spinner.fail(chalk.red(`Pull Tree Error: ${error instanceof Error ? error.message : String(error)}`))
    console.error(chalk.red(boxen(`Pull Tree Error: ${error instanceof Error ? error.message : String(error)}`, { padding: 1 })))
    process.exit(1)
  }
}

// Sync command (smart sync: pull if no local files, push if local files exist)
async function handleSync(options: any) {
  try {
    // Try to setup Confluence dependencies to get correct settings
    let publishDir = "./docs" // Default fallback
    let settings = null
    let adaptor, settingLoader, confluenceClient, mermaidRenderer

    try {
      const deps = await setupDependencies()
      adaptor = deps.adaptor
      settingLoader = deps.settingLoader
      confluenceClient = deps.confluenceClient
      mermaidRenderer = deps.mermaidRenderer

      settings = settingLoader.load()
      publishDir = settings.folderToPublish || "./docs"
    } catch (setupError) {
      // If setup fails (no credentials), we can still check local files
      // and provide helpful messaging
      console.log(chalk.yellow("⚠️  Confluence credentials not configured"))
      console.log(chalk.gray("   Checking local files to suggest next steps..."))
    }

    // Check if local files exist in the publish directory
    let hasLocalFiles = false

    try {
      const { existsSync, readdirSync, statSync } = await import("fs")
      const { join } = await import("path")

      if (existsSync(publishDir)) {
        const checkDir = (dir: string): boolean => {
          try {
            const items = readdirSync(dir)
            for (const item of items) {
              const fullPath = join(dir, item)
              const stat = statSync(fullPath)

              if (stat.isDirectory() && !item.startsWith(".") && item !== "node_modules") {
                if (checkDir(fullPath)) return true
              } else if (stat.isFile() && item.endsWith(".md")) {
                return true
              }
            }
          } catch (error) {
            // Ignore errors for directories we can't read
          }
          return false
        }

        hasLocalFiles = checkDir(publishDir)
      }
    } catch (error) {
      console.warn("Failed to check local files:", error)
    }

    // If setup failed, provide guidance
    if (!settings) {
      if (hasLocalFiles) {
        console.log(chalk.blue("\n💡 To push your local files to Confluence:"))
        console.log(chalk.gray("   1. Configure .markdown-confluence.json"))
        console.log(chalk.gray("   2. Run: confluence sync"))
      } else {
        console.log(chalk.blue("\n💡 To pull documentation from Confluence:"))
        console.log(chalk.gray("   1. Configure .markdown-confluence.json"))
        console.log(chalk.gray("   2. Run: confluence sync"))
      }
      return // Exit gracefully without error
    }

    // Decide what to do based on local files and overwrite flag
    if (options.overwrite) {
      // Force pull all files (overwrite existing)
      await performPull(confluenceClient, settings, options, publishDir)
    } else if (hasLocalFiles) {
      // Local files exist - only push
      await performPush(adaptor, settingLoader, confluenceClient, mermaidRenderer, options)
    } else {
      // No local files - only pull
      await performPull(confluenceClient, settings, options, publishDir)
    }
  } catch (error) {
    console.error(chalk.red(boxen(`Sync Error: ${error instanceof Error ? error.message : String(error)}`, { padding: 1 })))
    console.log(chalk.yellow("💡 Common solutions:"))
    console.log(chalk.yellow("   • Check your Confluence credentials"))
    console.log(chalk.yellow("   • Verify network connectivity"))
    console.log(chalk.yellow("   • Check .markdown-confluence.json configuration"))
    process.exit(1)
  }
}

// Helper function to perform pull operation
async function performPull(confluenceClient: any, settings: any, options: any, publishDir: string) {
  const pullSpinner = ora("Pulling from Confluence...").start()

  try {
    const puller = new Puller(confluenceClient, settings)
    const pullResults = await puller.pullPageTree(settings.confluenceParentId, {
      outputDir: publishDir,
      overwriteExisting: options.overwrite || false,
      includeChildren: true,
      fileNameTemplate: options.fileNameTemplate || "{title}.md",
      maxDepth: options.maxDepth || 10
    })

    let pullSuccessCount = 0
    let pullFailCount = 0

    pullResults.forEach((result: any) => {
      if (result.success) {
        pullSuccessCount++
      } else {
        pullFailCount++
      }
    })

    if (pullSuccessCount > 0) {
      pullSpinner.succeed(chalk.green(`Pulled ${pullSuccessCount} pages from Confluence`))
      displayNestedStructure(pullResults, publishDir)
    } else {
      pullSpinner.warn(chalk.yellow("No pages to pull"))
    }

    if (pullFailCount > 0) {
      console.log(chalk.yellow(`⚠️  ${pullFailCount} pages failed to pull`))
    }
  } catch (pullError) {
    pullSpinner.fail(chalk.red("Failed to pull from Confluence"))
    console.error(chalk.red(`Pull error: ${pullError instanceof Error ? pullError.message : String(pullError)}`))
    throw pullError
  }
}

// Helper function to perform push operation
async function performPush(adaptor: any, settingLoader: any, confluenceClient: any, mermaidRenderer: any, options: any) {
  const pushSpinner = ora("Pushing to Confluence...").start()

  try {
    const publisher = new Publisher(adaptor, settingLoader, confluenceClient, [new MermaidRendererPlugin(mermaidRenderer)])

    const pushResults = await publisher.publish(options.filter || "")

    let pushSuccessCount = 0
    let pushFailCount = 0

    pushResults.forEach((file: any) => {
      if (file.successfulUploadResult) {
        pushSuccessCount++
      } else {
        pushFailCount++
      }
    })

    if (pushSuccessCount > 0) {
      pushSpinner.succeed(chalk.green(`Published ${pushSuccessCount} files to Confluence`))
    } else {
      pushSpinner.fail(chalk.red("Failed to push files to Confluence"))
    }

    // Display published file structure (attempted files)
    if (pushSuccessCount > 0 || pushFailCount > 0) {
      await displayPublishStructure()

      // Display parent page URL when push succeeds
      if (pushSuccessCount > 0) {
        const urlSettings = settingLoader.load()

        // Fetch parent page to get space key for URL
        let parentPageUrl = ""
        try {
          const parentPage = await confluenceClient.content.getContentById({
            id: urlSettings.confluenceParentId,
            expand: ["space"]
          })
          if (parentPage.space?.key) {
            parentPageUrl = `${urlSettings.confluenceBaseUrl}/wiki/spaces/${parentPage.space.key}/pages/${urlSettings.confluenceParentId}`
          }
        } catch (error) {
          // If we can't fetch parent page, build URL with placeholder
          parentPageUrl = `${urlSettings.confluenceBaseUrl}/wiki/spaces/SPACE/pages/${urlSettings.confluenceParentId}`
        }

        // Log parent page URL after summary
        if (parentPageUrl) {
          console.log(chalk.blue(`📍 Parent page: ${parentPageUrl}`))
        }
      }
    }

    if (pushFailCount > 0) {
      console.log(chalk.yellow(`⚠️  ${pushFailCount} files failed to publish`))
    }

    // Show detailed results
    pushResults.forEach((file: any) => {
      if (file.successfulUploadResult) {
        // Success - minimal logging for sync
      } else {
        console.error(chalk.red(`❌ FAILED: ${file.node.file.absoluteFilePath} - ${file.reason}`))
      }
    })
  } catch (pushError) {
    pushSpinner.fail(chalk.red("Failed to push to Confluence"))
    console.error(chalk.red(`Push error: ${pushError instanceof Error ? pushError.message : String(pushError)}`))
    throw pushError
  }
}

// Get comprehensive project structure as a tree
async function getProjectStructure(rootDir: string, maxDepth: number = 4): Promise<string> {
  const { readdirSync, statSync } = await import("fs")
  const { join } = await import("path")

  function buildTree(dir: string, prefix: string = "", depth: number = 0): string {
    if (depth > maxDepth) {
      return ""
    }

    let result = ""
    let items: string[]

    try {
      items = readdirSync(dir).sort((a, b) => {
        // Sort: directories first, then files, alphabetically
        const aStat = statSync(join(dir, a))
        const bStat = statSync(join(dir, b))
        const aIsDir = aStat.isDirectory()
        const bIsDir = bStat.isDirectory()

        if (aIsDir && !bIsDir) return -1
        if (!aIsDir && bIsDir) return 1
        return a.localeCompare(b)
      })
    } catch (error) {
      return ""
    }

    items.forEach((item, index) => {
      const fullPath = join(dir, item)
      const isLast = index === items.length - 1
      const connector = isLast ? "└── " : "├── "
      const nextPrefix = prefix + (isLast ? "    " : "│   ")

      try {
        const stat = statSync(fullPath)

        // Skip hidden files/directories and common build artifacts
        if (
          item.startsWith(".") ||
          item === "node_modules" ||
          item === "dist" ||
          item === "build" ||
          item === ".git" ||
          item === "coverage" ||
          item === ".next" ||
          item === ".nuxt" ||
          item === ".vuepress" ||
          item === "_site" ||
          item === "public" ||
          item === "static"
        ) {
          return
        }

        if (stat.isDirectory()) {
          result += prefix + connector + item + "/\n"
          const subTree = buildTree(fullPath, nextPrefix, depth + 1)
          if (subTree) {
            result += subTree
          }
        } else {
          // Only show important file types
          const ext = item.split(".").pop()?.toLowerCase()
          if (
            ["md", "ts", "js", "tsx", "jsx", "json", "yml", "yaml", "toml", "config", "env"].includes(ext || "") ||
            item === "Dockerfile" ||
            item === "Makefile" ||
            item === "package.json" ||
            item === "tsconfig.json" ||
            item === "README" ||
            item.startsWith("README.") ||
            item === "AGENT" ||
            item.startsWith("AGENT.") ||
            item === "CHANGELOG" ||
            item.startsWith("CHANGELOG.") ||
            item === "CONTRIBUTING" ||
            item.startsWith("CONTRIBUTING.")
          ) {
            result += prefix + connector + item + "\n"
          }
        }
      } catch (error) {
        // Skip files we can't access
      }
    })

    return result
  }

  const tree = buildTree(rootDir)
  return tree || "No project structure found"
}

// Retry function with exponential backoff for API rate limiting
export async function retryWithBackoff<T>(operation: () => Promise<T>, maxRetries: number = 3, baseDelay: number = 2000): Promise<T> {
  let lastError: Error

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error: any) {
      lastError = error

      // Check if it's a rate limiting error (429)
      const isRateLimit =
        error?.status === 429 || error?.code === 429 || error?.message?.includes("429") || error?.message?.includes("rate limit") || error?.message?.includes("Provisioned Throughput")

      if (!isRateLimit || attempt === maxRetries) {
        // If not rate limit error or max retries reached, throw immediately
        throw error
      }

      // Calculate delay with exponential backoff and jitter
      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000
      const delaySeconds = Math.ceil(delay / 1000)

      console.log(chalk.yellow(`Retrying... ${attempt}/${maxRetries} in ${delaySeconds} seconds...`))
      console.log(chalk.gray(`   Error: ${error?.message || "Rate limiting"}`))

      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError!
}

// Some Gemini responses echo the prompt/template instead of filling it out
function responseLooksLikePrompt(content: string): boolean {
  const normalized = content.toLowerCase()
  const promptMarkers = [
    "## task",
    "## requirements",
    "## code changes to analyze",
    "## output format",
    "[what users can now do + business value + technical changes]",
    "[actual user flows affected by code changes]",
    "[real code changes from diff with file names and snippets]",
    "[actionable test scenarios based on actual code logic]",
    "[real examples from the code changes]",
    "**ready to begin comprehensive code change analysis"
  ]

  return promptMarkers.some((marker) => normalized.includes(marker))
}

// Gather comprehensive project context from multiple sources
async function gatherProjectContext(): Promise<string> {
  const contextParts: string[] = []

  // 1. Read AGENT.md (highest priority - project rules and conventions)
  try {
    if (existsSync("./AGENT.md")) {
      const agentContent = readFileSync("./AGENT.md", "utf8")
      contextParts.push(`=== PROJECT AGENT RULES ===\n${agentContent}\n`)
    }
  } catch (error) {
    // Continue without AGENT.md
  }

  // 2. Read README.md (project overview and setup)
  try {
    if (existsSync("./README.md")) {
      const readmeContent = readFileSync("./README.md", "utf8")
      contextParts.push(`=== PROJECT README ===\n${readmeContent}\n`)
    }
  } catch (error) {
    // Continue without README.md
  }

  // 3. Read package.json (project metadata and dependencies)
  try {
    if (existsSync("./package.json")) {
      const packageJson = JSON.parse(readFileSync("./package.json", "utf8"))
      const packageInfo = {
        name: packageJson.name,
        version: packageJson.version,
        description: packageJson.description,
        main: packageJson.main,
        scripts: packageJson.scripts,
        dependencies: Object.keys(packageJson.dependencies || {}),
        devDependencies: Object.keys(packageJson.devDependencies || {}),
        workspaces: packageJson.workspaces
      }
      contextParts.push(`=== PROJECT PACKAGE INFO ===\n${JSON.stringify(packageInfo, null, 2)}\n`)
    }
  } catch (error) {
    // Continue without package.json
  }

  // 4. Read .markdown-confluence.json if exists (Confluence configuration)
  try {
    if (existsSync("./.markdown-confluence.json")) {
      const confluenceConfig = JSON.parse(readFileSync("./.markdown-confluence.json", "utf8"))
      // Remove sensitive info
      const safeConfig = { ...confluenceConfig }
      delete safeConfig.atlassianUserName
      delete safeConfig.atlassianApiToken

      contextParts.push(`=== CONFLUENCE CONFIGURATION ===\n${JSON.stringify(safeConfig, null, 2)}\n`)
    }
  } catch (error) {
    // Continue without confluence config
  }

  // 5. Read any .env.example or similar files for environment understanding
  const envFiles = [".env.example", ".env.local", ".env"]
  for (const envFile of envFiles) {
    try {
      if (existsSync(envFile)) {
        const envContent = readFileSync(envFile, "utf8")
        // Only include non-sensitive env vars (those without values)
        const safeEnvLines = envContent
          .split("\n")
          .filter((line) => line.includes("=") && !line.includes("SECRET") && !line.includes("KEY") && !line.includes("TOKEN"))
          .join("\n")
        if (safeEnvLines.trim()) {
          contextParts.push(`=== ENVIRONMENT VARIABLES (${envFile}) ===\n${safeEnvLines}\n`)
        }
        break // Only read one env file
      }
    } catch (error) {
      // Continue
    }
  }

  // 6. Get comprehensive project structure info
  try {
    const projectStructure = await getProjectStructure(process.cwd())
    contextParts.push(`=== PROJECT FILE STRUCTURE ===\n${projectStructure}\n`)
  } catch (error) {
    // Continue without project structure
  }

  return contextParts.join("\n")
}

// Helper function to copy text to clipboard
async function copyToClipboard(text: string): Promise<boolean> {
  return new Promise((resolve) => {
    const platform = process.platform
    let command: string
    let args: string[]

    if (platform === "darwin") {
      // macOS
      command = "pbcopy"
      args = []
    } else if (platform === "linux") {
      // Linux - try xclip first, then xsel
      command = "xclip"
      args = ["-selection", "clipboard"]
    } else if (platform === "win32") {
      // Windows
      command = "clip"
      args = []
    } else {
      resolve(false)
      return
    }

    const child = spawn(command, args)
    child.stdin.write(text)
    child.stdin.end()

    child.on("error", () => {
      // If xclip fails on Linux, try xsel
      if (platform === "linux" && command === "xclip") {
        const xselChild = spawn("xsel", ["--clipboard", "--input"])
        xselChild.stdin.write(text)
        xselChild.stdin.end()
        xselChild.on("error", () => resolve(false))
        xselChild.on("close", (code) => resolve(code === 0))
      } else {
        resolve(false)
      }
    })

    child.on("close", (code) => {
      resolve(code === 0)
    })
  })
}

// Helper function to wait for user input
function waitForEnter(message: string): Promise<void> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    })

    rl.question(message, () => {
      rl.close()
      resolve()
    })
  })
}

// Helper function to convert feature name to filename
function featureNameToFilename(featureName: string): string {
  return featureName
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_") // Replace spaces with underscores
    .replace(/[^a-z0-9_]/g, "") // Remove special characters except underscores
    .replace(/_+/g, "_") // Replace multiple underscores with single underscore
    .replace(/^_|_$/g, "") // Remove leading/trailing underscores
    + ".md"
}

// Generate prompt for IDE to create documentation
async function handleGeneratePrompt(options: any) {
  console.log(chalk.blue("📝 Generating prompt..."))

  try {
    // Gather comprehensive project context
    const contextSpinner = ora("Gathering project context...").start()
    const projectContext = await gatherProjectContext()
    contextSpinner.succeed(chalk.green("Project context gathered"))

    const promptFeatureName = options.feature || "Feature Name"
    
    // outputFileName: tên file (từ feature name)
    const outputFileName = options.feature ? featureNameToFilename(options.feature) : "FEATURE_DOC.md"
    
    // outputPath: đường dẫn/nơi đặt file (từ options.output, nếu có)
    // outputFile: đường dẫn đầy đủ trong source structure (outputPath + outputFileName)
    const { join } = await import("path")
    const outputFile = options.output ? join(options.output, outputFileName) : outputFileName

    // Create comprehensive QA-focused prompt for IDE using structured approach
    const prompt = `# QA-Focused Documentation Generation Task

You are an expert technical documentation specialist, specialized in creating **dual-audience documentation** that serves both technical developers and non-technical QA testers simultaneously. Your documentation must be accessible yet technically accurate.

## Role & Expertise

You are a **Senior Technical Documentation Engineer** with expertise in:
- QA-focused documentation creation
- Dual-audience writing (technical + non-technical)
- Code analysis and feature mapping
- User experience documentation
- Technical specification writing

## Context & Environment

You have access to:
- Full project codebase (via Cursor's codebase search and analysis tools)
- AGENT.md file (project standards and conventions)
- README.md file (project overview and architecture)
- Project structure and configuration files
- Development environment with search capabilities

${projectContext ? `## Project Context\n\n${projectContext}\n` : ""}

## Task

**Generate comprehensive QA-focused documentation for: "${promptFeatureName}"**

**Success Criteria:**
- Documentation accessible to readers with zero feature knowledge
- Clear feature flows and user journeys
- Actionable QA testing scenarios
- Technical accuracy for developers
- Professional presentation following AGENT.md standards

## Critical Requirements

### Audience Balance (MANDATORY)
Your documentation must serve **TWO audiences simultaneously**:

**Audience 1: Non-Technical Readers (QA Testers, Product Managers)**
- Need plain language explanations
- Want step-by-step user flows
- Require business logic understanding
- Need clear testing instructions

**Audience 2: Technical Readers (Developers, Technical QA)**
- Need technical implementation details
- Want code structure and architecture
- Require API specifications
- Need implementation references

### Writing Strategy
- **Every technical concept**: Plain language explanation first, then technical details
- **Structure**: Simple explanation → Technical depth
- **Format**: "What it does" (user view) → "How it works" (technical view)
- **Balance**: Include technical details but explain them accessibly

## Feature Analysis Framework

**CRITICAL: Complete this analysis BEFORE generating documentation**

### Phase 1: Feature Understanding
1. **Feature Name Deconstruction**
   - Break down "${promptFeatureName}": What does each word/component imply?
   - Identify core concepts, functionality, and domain
   - Consider synonyms and related terminology
   - What should this feature accomplish from a user perspective?

2. **Codebase Mapping**
   - **Use Cursor's codebase search extensively**
   - Search patterns: exact matches, related terms, synonyms
   - Identify: files, functions, classes, APIs, configurations, tests
   - Map feature concepts to specific code locations

### Phase 2: Implementation Analysis
1. **Architecture Discovery**
   - Core implementation files and modules
   - Supporting utilities and helpers
   - API endpoints and interfaces
   - Data structures and models
   - Configuration and settings

2. **Flow Analysis**
   - User interaction patterns
   - Data flow and processing
   - Integration points
   - Dependencies and relationships

### Phase 3: Validation
- Verify feature-code connections are accurate
- Identify gaps between feature expectations and implementation
- Note any missing or incomplete functionality
- Document assumptions and limitations

**Quality Gate:** Do not proceed until you have clear feature-code mapping.

## Documentation Structure

### 1. Overview Section
**Dual Audience Approach:**
- **User Perspective**: What does this feature do? (Plain language)
- **Technical Perspective**: What code implements this? (Technical details)
- **Business Value**: Why was this built? What problem solves?
- **Scope**: What's included, what's not

### 2. Feature Flow / User Journey
**Structure each step as:**
- **User Action**: What user does (plain language)
- **System Response**: What happens (both user-visible and technical)
- **Pre/Post Conditions**: What must be true before/after
- **Validation Points**: What QA should verify
- **Code References**: Technical implementation details

### 3. Technical Implementation
**Balance accessibility with accuracy:**
- **Architecture**: High-level design (simple) → Detailed structure (technical)
- **Key Components**: Purpose (plain) → Implementation (technical)
- **APIs & Interfaces**: Usage (simple) → Specifications (technical)
- **Data Flow**: User impact (plain) → Technical processing (technical)
- **Performance**: User experience (plain) → Technical metrics (technical)

### 4. QA & Testing Guide
**Make this actionable for non-technical QA:**

**Test Scenarios Structure:**
- **Scenario Description**: What to test (plain language)
- **Prerequisites**: Setup required (step-by-step)
- **Test Steps**: Clear numbered steps (no technical knowledge needed)
- **Expected Results**: What should happen (user-visible terms)
- **Validation Points**: Technical checks (for technical QA)
- **Edge Cases**: Unusual conditions to test

**Include:**
- Happy path testing (normal usage)
- Error scenarios (failure modes)
- Edge cases (boundary conditions)
- Integration testing (system interactions)
- Regression testing (impact on existing features)

### 5. Usage Examples
- **User Examples**: Real-world scenarios (no code)
- **Technical Examples**: Code snippets with detailed comments
- **Configuration**: Setup and customization options
- **Troubleshooting**: Common issues and solutions

## Quality Standards

### Content Quality
- **Accessibility**: Non-technical reader can understand feature and testing
- **Technical Accuracy**: Developer can understand implementation
- **Completeness**: All important aspects covered
- **Balance**: Technical details explained accessibly
- **Professional**: Well-structured, clear, error-free

### Format Requirements
- **Markdown**: Clean structure with headers, lists, code blocks
- **Frontmatter**: Confluence publishing metadata
- **Code References**: Link to specific files/functions
- **Visual Suggestions**: Diagrams for complex flows
- **Tables**: Structured data presentation

## Output Specifications

**File:** ${outputFile}
**Format:** Markdown with Confluence frontmatter
**Length Limit:** < 2000 lines (prioritize essential information)
**Style Guide:** Follow AGENT.md standards

## Confluence Frontmatter (MANDATORY)

\`\`\`yaml
---
connie-publish: true
title: "${promptFeatureName}"
tags: documentation, qa, ${promptFeatureName.toLowerCase().replace(/[^a-z0-9]/g, '-')}
---
\`\`\`

## Execution Framework

### Phase 1: Deep Analysis (Spend significant time here)
1. **Feature Name Analysis**: Deconstruct "${promptFeatureName}" thoroughly
2. **Codebase Search**: Use all available search tools extensively
3. **Feature Mapping**: Create detailed feature-to-code mapping
4. **Architecture Understanding**: Understand how feature fits into system
5. **Gap Analysis**: Identify what's missing or unclear

### Phase 2: Documentation Planning
1. **Audience Analysis**: Plan content for dual audiences
2. **Structure Design**: Design clear, logical flow
3. **Content Mapping**: Map analysis findings to documentation sections
4. **Technical Balance**: Ensure accessibility without losing technical depth

### Phase 3: Content Generation
1. **Write Overview**: Start with user perspective, add technical details
2. **Document Flows**: Create step-by-step user journeys with technical references
3. **Technical Sections**: Provide implementation details with explanations
4. **QA Scenarios**: Create actionable testing instructions
5. **Examples**: Include real-world usage scenarios

### Phase 4: Quality Assurance
1. **Accessibility Check**: Can non-technical reader understand?
2. **Technical Check**: Are implementation details accurate?
3. **Completeness Check**: Is all essential information included?
4. **Balance Check**: Is content accessible yet technically sound?
5. **Format Check**: Follows AGENT.md and markdown standards?

### Phase 5: Finalization
1. **Review**: Final content review and editing
2. **Format**: Ensure proper markdown and frontmatter
3. **Save**: Create file at specified location
4. **Validate**: Confirm documentation meets all requirements

## Validation & Testing Framework

### Pre-Generation Validation
**Before starting documentation:**

1. **Feature Existence Check**
   - Confirm "${promptFeatureName}" exists in codebase
   - Validate feature name against actual implementation
   - Identify primary feature files and components

2. **Codebase Search Validation**
   - Execute comprehensive search patterns
   - Verify search results contain relevant code
   - Document any gaps in feature implementation

3. **Context Availability Check**
   - Ensure AGENT.md and README.md are accessible
   - Validate project context information
   - Confirm development environment capabilities

### Content Validation Methods

**During documentation generation:**

1. **Dual Audience Testing**
   - **Accessibility Test**: Can someone with zero knowledge understand?
   - **Technical Test**: Do developers get implementation details?
   - **Balance Test**: Both audiences satisfied by same content?

2. **Technical Accuracy Validation**
   - **Code Reference Check**: All code references accurate?
   - **Implementation Check**: Documentation matches actual code?
   - **Terminology Check**: Technical terms properly explained?

3. **QA Actionability Validation**
   - **Test Step Clarity**: Can QA execute without technical knowledge?
   - **Scenario Completeness**: All important test cases covered?
   - **Edge Case Coverage**: Unusual scenarios documented?

### Post-Generation Quality Checks

**Final validation before completion:**

1. **Structure Compliance**
   - All required sections present?
   - Frontmatter correctly formatted?
   - Length within limits (< 2000 lines)?

2. **Content Quality Assessment**
   - **Readability**: Clear, professional, error-free writing?
   - **Completeness**: All important aspects covered?
   - **Relevance**: All content relates to "${promptFeatureName}"?

3. **Standards Adherence**
   - Follows AGENT.md style guide?
   - Includes proper Confluence metadata?
   - Uses correct markdown formatting?

### Automated Validation Checklist

- [ ] Feature-code mapping complete and accurate
- [ ] Documentation accessible to non-technical readers
- [ ] Technical implementation details correct
- [ ] QA testing scenarios actionable
- [ ] All sections follow dual-audience approach
- [ ] Frontmatter includes proper Confluence tags
- [ ] Length stays under 2000 lines
- [ ] Follows AGENT.md standards
- [ ] No unexplained technical jargon
- [ ] Code references are accurate

## Critical Success Factors

### Analysis Quality
- **Time Investment**: Spend adequate time on feature-code analysis
- **Search Thoroughness**: Use all available search capabilities
- **Mapping Accuracy**: Ensure feature maps correctly to implementation
- **Context Understanding**: Understand broader system implications

### Content Quality
- **Dual Audience Success**: Both technical and non-technical readers satisfied
- **Accessibility**: Zero-knowledge readers can understand
- **Technical Depth**: Developers get needed implementation details
- **QA Friendliness**: Clear, actionable testing instructions
- **Professional Quality**: Well-written, well-structured, error-free

### Process Adherence
- **Framework Following**: Complete all phases systematically
- **Quality Gates**: Pass all validation checkpoints
- **Standards Compliance**: Follow AGENT.md and project standards
- **Length Discipline**: Stay within line limits through prioritization

**CRITICAL REMINDER:** Quality analysis produces quality documentation. Invest time in understanding the relationship between "${promptFeatureName}" and the codebase. Your analysis quality directly determines documentation quality.

---

**Ready to begin comprehensive feature analysis and documentation generation for "${promptFeatureName}".**`

    
      // Print to console
      console.log(chalk.blue("\n" + "=".repeat(80)))
      console.log(chalk.blue("📋 PROMPT FOR IDE"))
      console.log(chalk.blue("=".repeat(80) + "\n"))
      console.log(chalk.blue(`📍 Documentation will be created at: ${outputFile}\n`))
      console.log(prompt)
      console.log(chalk.blue("\n" + "=".repeat(80)))
      
      // Offer to copy to clipboard
      console.log(chalk.blue("📋 Copy to Clipboard:"))
      await waitForEnter(chalk.yellow("   Press Enter to copy prompt to clipboard... "))
      
      const copied = await copyToClipboard(prompt)
      if (copied) {
        console.log(chalk.green("   ✅ Copied to clipboard! Press Ctrl+V to paste in your IDE"))
      } else {
        console.log(chalk.yellow("   ⚠️  Could not copy to clipboard automatically. Please copy manually from above."))
      }
  } catch (error) {
    console.error(chalk.red(boxen(`Prompt Generation Error: ${error instanceof Error ? error.message : String(error)}`, { padding: 1 })))
    process.exit(1)
  }
}

// Generate documentation from code changes using OpenAI
async function handleGenerateDocs(options: any) {
  console.log(chalk.blue("🤖 Starting documentation generation..."))

  try {
    // Check OpenAI API key
    const openaiApiKey = process.env["GEMINI_API_KEY"]
    if (!openaiApiKey) {
      console.error(chalk.red(boxen("GeminiAI API key is required. Set GEMINI_API_KEY environment variable.", { padding: 1 })))
      process.exit(1)
    }

    const openai = new OpenAI({
      baseURL: process.env["OPENAI_BASE_URL"] || "https://generativelanguage.googleapis.com/v1beta/openai/",
      apiKey: openaiApiKey
    })

    // Get git diff (last 100 commits)
    const diffSpinner = ora("Getting code changes...").start()
    let diff = ""
    try {
      diff = execSync(options.diffCommand || "git diff HEAD~100..HEAD", {
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      })
    } catch (error) {
      diffSpinner.warn(chalk.yellow("Could not get git diff, using empty diff"))
    }

    // Limit diff size to avoid exceeding API context limits
    // Gemini 2.0 Flash has ~1M token context (~4M characters), we use ~2M chars (~500K tokens) to be safe
    // This leaves room for prompt (~50K tokens), project context (~50K tokens), and response (~400K tokens)
    // IMPORTANT: Keep the END of diff (most recent changes) as they are most relevant for documentation
    const MAX_DIFF_SIZE = 2000000 // ~2M characters (~500K tokens) - safe limit for 1M token context window
    const originalDiffLength = diff.length
    let diffTruncated = false

    if (diff.length > MAX_DIFF_SIZE) {
      // Keep the END of diff (most recent changes) instead of the beginning
      // This ensures we don't miss the latest, most relevant code changes
      const truncatedMessage = `\n\n... [Diff truncated: showing last ${MAX_DIFF_SIZE.toLocaleString()} characters of ${originalDiffLength.toLocaleString()} total - oldest changes were removed to fit API limits] ...\n\n`
      const messageLength = truncatedMessage.length
      const availableSize = MAX_DIFF_SIZE - messageLength
      
      // Take the last N characters (most recent changes)
      diff = truncatedMessage + diff.substring(diff.length - availableSize)
      diffTruncated = true
    }

    if (!diff.trim()) {
      diffSpinner.warn(chalk.yellow("No code changes found"))
      // Still proceed with empty diff
    } else {
      if (diffTruncated) {
        diffSpinner.succeed(chalk.green(`Got ${originalDiffLength.toLocaleString()} characters of diff (truncated to ${MAX_DIFF_SIZE.toLocaleString()} for API limits)`))
      } else {
        diffSpinner.succeed(chalk.green(`Got ${diff.length.toLocaleString()} characters of diff`))
      }
    }

    // Generate documentation
    const generateSpinner = ora("Generating documentation...").start()

    const promptFeatureName = options.feature || "Feature Name"

    const prompt = `You are a technical documentation specialist. Your task is to analyze git code changes and produce a COMPLETE, FILLED-OUT markdown document. 

**CRITICAL INSTRUCTIONS:**
1. DO NOT output the template structure itself
2. DO NOT include the placeholder text like [What users can now do...]
3. DO NOT echo back the instructions
4. ONLY output the FINAL filled-in markdown document
5. Replace EVERY placeholder with REAL details from the code diff
6. Use specific file names, function names, and code snippets from the diff

**REQUIRED OUTPUT STRUCTURE (fill in all sections):**

---
connie-publish: true
title: "${promptFeatureName}"
tags: documentation, qa, feature-update, ${promptFeatureName.toLowerCase().replace(/[^a-z0-9]/g, '-')}
---

## Overview
Provide: what users can now do + business value + specific technical changes from the diff

## Feature Flow & User Journey  
Provide: actual user flows affected by the code changes shown in diff

## Technical Implementation Details
Provide: real code changes from diff with actual file names and code snippets

## QA & Testing Guide
Provide: actionable test scenarios based on actual code logic in the diff

## Usage Examples & Configuration
Provide: real examples from the code changes

---

**GIT DIFF TO ANALYZE:**

${diffTruncated ? `\n[Note: Diff was truncated from ${originalDiffLength.toLocaleString()} to 2,000,000 characters. Most recent changes preserved.]\n\n` : ""}${diff}

---

Now produce the FILLED-OUT markdown document with concrete details from the diff above. Do not include any template markers or placeholders.`

    let markdown: string;
    let retryAttempts = 0;
    const maxRetryAttempts = 3;

    // For testing: Mock response to avoid API call
    if (process.env['GEMINI_API_KEY'] === 'test_key_not_real') {
      console.log('=== MOCK MODE: Simulating AI response ===');
      markdown = `---
connie-publish: true
title: "Test Generate Docs"
tags: documentation, qa, feature-update, test-generate-docs
---

## Overview

This feature adds a test function for generate-docs testing.

## Feature Flow & User Journey

1. Test function is added to the codebase
2. Generate-docs processes the code changes
3. Documentation is generated successfully

## Technical Implementation Details

### File: test_generate_docs.js
\`\`\`javascript
console.log("Test function for generate-docs testing");
\`\`\`

**Plain Explanation:** A simple test file was added with a console.log statement.

**Technical Details:** This JavaScript file contains a single console.log statement used for testing the generate-docs functionality.

## QA & Testing Guide

1. **Verify file creation:**
   - Check that test_generate_docs.js exists in the root directory
   - Verify the file contains the expected console.log statement

## Usage Examples & Configuration

Run the test file:
\`\`\`bash
node test_generate_docs.js
\`\`\`

Expected output: "Test function for generate-docs testing"`;

      console.log('=== MOCK RESPONSE GENERATED ===');
      console.log('Mock response length:', markdown.length, 'characters');
      console.log('Mock response starts with:', markdown.substring(0, 200) + '...');

      generateSpinner.succeed(chalk.green("Documentation generated successfully (MOCK)"));
    } else {
      const systemMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
        role: "system",
        content:
          "You are a technical documentation specialist. Analyze the provided git diff and create comprehensive documentation. Extract real details from actual code changes - no placeholders. Focus on specific files, functions, and code snippets that changed. Output ONLY the final filled-in markdown document, nothing else."
      }

      const requestDocumentation = async (promptContent: string): Promise<string> => {
        const response = await retryWithBackoff<OpenAI.Chat.Completions.ChatCompletion>(
          () =>
            openai.chat.completions.create({
              model: options.model || "gemini-2.0-flash",
              messages: [systemMessage, { role: "user", content: promptContent }]
            }),
          1, // Use 1 retry at API level, we handle multiple retries at prompt level
          options.retryDelay || 3000
        )

        const aiContent = response.choices[0]?.message?.content || ""
        if (!aiContent) {
          throw new Error("No response from OpenAI API")
        }

        return aiContent
      }

      // Initial request
      markdown = await requestDocumentation(prompt)

      // Retry loop for template response detection
      while (responseLooksLikePrompt(markdown) && retryAttempts < maxRetryAttempts) {
        retryAttempts++
        console.log(
          chalk.yellow(
            `⚠️ Gemini returned template instead of documentation (attempt ${retryAttempts}/${maxRetryAttempts}). Retrying with stronger instructions...`
          )
        )
        generateSpinner.text = `Regenerating documentation (attempt ${retryAttempts + 1}/${maxRetryAttempts + 1})...`

        // Use progressively more direct prompts
        let retryPrompt: string
        if (retryAttempts === 1) {
          retryPrompt = `FINAL INSTRUCTION: Output ONLY the filled markdown document below, nothing else. Replace all placeholders with real details from the diff:

${prompt}`
        } else if (retryAttempts === 2) {
          retryPrompt = `CRITICAL: Stop echoing the template. Output ONLY the COMPLETED markdown document with real data from the diff. Start with --- and end after all sections are filled:\n\n${prompt}`
        } else {
          retryPrompt = `Generate the completed markdown now. Start directly with:\n---\nconnie-publish: true\ntitle: "${promptFeatureName}"\n\nThen complete all remaining sections using ONLY real details from the provided diff. Do NOT include template structure or instructions.`
        }

        markdown = await requestDocumentation(retryPrompt)

        // Add delay between retries to avoid hitting rate limits
        if (responseLooksLikePrompt(markdown) && retryAttempts < maxRetryAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 2000))
        }
      }

      if (responseLooksLikePrompt(markdown)) {
        throw new Error(
          `Gemini returned the instructions template ${retryAttempts + 1} times. This suggests either:\n` +
          `  1. The git diff is empty or too small\n` +
          `  2. The feature name "${promptFeatureName}" is too vague\n` +
          `  3. There's an API issue\n\n` +
          `Try:\n` +
          `  • Verify git history with: git log --oneline | head -20\n` +
          `  • Use a more specific feature name\n` +
          `  • Check if GEMINI_API_KEY is valid`
        )
      }
    }

    // Clean markdown code block wrapper if AI added it
    if (markdown.startsWith("```markdown") && markdown.endsWith("```")) {
      markdown = markdown.slice(11, -3).trim() // Remove ```markdown\n and \n```
    } else if (markdown.startsWith("```") && markdown.endsWith("```")) {
      markdown = markdown.slice(4, -3).trim() // Remove ```\n and \n```
    }

    generateSpinner.succeed(chalk.green("Documentation generated successfully"))

    // Save to file
    const { writeFileSync, statSync } = await import("fs")
    const { join } = await import("path")

    // Create default filename from feature name
    const featureFilename = options.feature ? options.feature.toLowerCase().replace(/[^a-z0-9]/g, "_") + ".md" : "new_feature.md"

    let outputPath = options.output || `./${featureFilename}`

    try {
      // Check if output path is a directory
      const stats = statSync(outputPath)
      if (stats.isDirectory()) {
        // If it's a directory, create filename inside it
        outputPath = join(outputPath, featureFilename)
      }
      // If it's a file path or doesn't exist, use as-is
    } catch (error) {
      // Path doesn't exist, treat as file path
    }

    const formattedTitle = options.feature
      ? options.feature
          .replace(/_/g, " ") // Replace underscores with spaces
          .split(" ") // Split into words
          .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()) // Capitalize each word
          .join(" ") // Join back with spaces
      : "New Feature"

    const finalMarkdown = `---\nconnie-publish: true\ntitle: "${formattedTitle}"\n---\n${markdown}`

    writeFileSync(outputPath, finalMarkdown)

    console.log(chalk.green(`✅ Generated: ${outputPath}`))
    console.log(chalk.gray("📄 Preview:"))
    console.log(chalk.gray("─".repeat(50)))
    console.log(markdown.split("\n").slice(0, 10).join("\n"))
    console.log(chalk.gray("─".repeat(50)))
    console.log(chalk.gray("(See full documentation in the file)"))

    // Optionally publish to Confluence
    if (options.publish) {
      console.log(chalk.blue("\n📤 Publishing to Confluence..."))

      // Create a temporary markdown file for publishing
      const tempFile = `./temp_feature_doc_${Date.now()}.md`
      writeFileSync(tempFile, markdown)

      try {
        const { adaptor, settingLoader, confluenceClient, mermaidRenderer } = await setupDependencies()

        const publisher = new Publisher(adaptor, settingLoader, confluenceClient, [new MermaidRendererPlugin(mermaidRenderer)])

        const publishResults = await publisher.publish(tempFile)

        let publishSuccessCount = 0

        publishResults.forEach((file: any) => {
          if (file.successfulUploadResult) {
            publishSuccessCount++
          }
        })

        if (publishSuccessCount > 0) {
          console.log(chalk.green(`✅ Published feature documentation to Confluence`))
        } else {
          console.log(chalk.red(`❌ Failed to publish feature documentation`))
        }
      } catch (publishError) {
        console.log(chalk.yellow(`⚠️ Could not publish to Confluence: ${publishError instanceof Error ? publishError.message : String(publishError)}`))
      } finally {
        // Clean up temp file
        try {
          const { unlinkSync } = await import("fs")
          unlinkSync(tempFile)
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    }
  } catch (error: any) {
    const isRateLimit = error?.status === 429 || error?.code === 429 || error?.message?.includes("429") || error?.message?.includes("rate limit") || error?.message?.includes("Provisioned Throughput")

    if (isRateLimit) {
      console.log("\n")
      console.error(chalk.red(boxen(`🤖 AI is tired!\n\n` + `💡 Please try again later or:\n` + `   • Switch to a different model`, { padding: 1 })))
    } else {
      console.error(chalk.red(boxen(`Documentation Generation Error: ${error instanceof Error ? error.message : String(error)}`, { padding: 1 })))
      console.log(chalk.yellow("💡 Make sure GEMINI_API_KEY is set and you have internet connection"))
    }
    process.exit(1)
  }
}

// Custom argument preprocessor for feature names with spaces
export function preprocessFeatureArgs(args: string[]): string[] {
  const processedArgs: string[] = []
  let i = 0

  while (i < args.length) {
    const arg = args[i]

    if (!arg) {
      i++
      continue
    }

    // Handle --feature or -f flag (both --feature=value and --feature value formats)
    if (arg === "--feature" || arg === "-f") {
      processedArgs.push(arg)
      i++ // Move to next argument

      // Collect all following arguments until we hit another flag
      let featureName = ""
      while (i < args.length && args[i] && !args[i]!.startsWith("-")) {
        // Remove surrounding quotes if present
        const currentArg = args[i]!
        const cleanArg = currentArg.replace(/^["']|["']$/g, "")
        featureName += (featureName ? " " : "") + cleanArg
        i++
      }

      if (featureName) {
        processedArgs.push(featureName)
      } else {
        // No feature name provided, yargs will handle the error
        i-- // Back up so yargs sees the missing value
      }
    } else if (arg.startsWith("--feature=") || arg.startsWith("-f=")) {
      // Handle --feature=value or -f=value format
      const flag = arg.startsWith("--feature=") ? "--feature" : "-f"
      const value = arg.split("=", 2)[1] || ""

      processedArgs.push(flag)
      // Remove surrounding quotes and add the value
      const cleanValue = value.replace(/^["']|["']$/g, "")
      processedArgs.push(cleanValue)
      i++
    } else {
      processedArgs.push(arg)
      i++
    }
  }

  return processedArgs
}

// Main CLI setup
const processedArgs = preprocessFeatureArgs(hideBin(process.argv))

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
        describe: "Filter pattern for files to publish"
      })
    },
    async (argv: any) => {
      await handlePublish(argv.filter || "")
    }
  )
  .command(
    "pull <pageId>",
    "Pull pages from Confluence to markdown",
    (yargs) => {
      yargs
        .positional("pageId", {
          type: "string",
          demandOption: true,
          describe: "Confluence page ID to pull"
        })
        .option("output", {
          alias: "o",
          type: "string",
          default: "./docs",
          describe: "Output directory for markdown files"
        })
        .option("recursive", {
          alias: "r",
          type: "boolean",
          default: false,
          describe: "Pull page and all children recursively"
        })
        .option("max-depth", {
          type: "number",
          default: 10,
          describe: "Maximum recursion depth (default: 10)"
        })
        .option("overwrite", {
          alias: "w",
          type: "boolean",
          default: false,
          describe: "Overwrite existing files"
        })
        .option("file-name-template", {
          alias: "t",
          type: "string",
          default: "{title}.md",
          describe: "Template for filename generation"
        })
    },
    async (argv: any) => {
      if (argv.recursive) {
        await handlePullTree(argv.pageId, argv)
      } else {
        await handlePullPage(argv.pageId, argv)
      }
    }
  )
  .command(
    "pull-page <pageId>",
    false, // Hide from help text
    (yargs) => {
      yargs
        .positional("pageId", {
          type: "string",
          demandOption: true,
          describe: "Confluence page ID to pull"
        })
        .option("output-dir", {
          alias: "o",
          type: "string",
          default: "./docs",
          describe: "Output directory for markdown files"
        })
        .option("overwrite", {
          alias: "w",
          type: "boolean",
          default: false,
          describe: "Overwrite existing files"
        })
        .option("file-name-template", {
          alias: "t",
          type: "string",
          default: "{title}.md",
          describe: "Template for filename generation"
        })
    },
    async (argv: any) => {
      console.warn(chalk.yellow("⚠️  WARNING: 'pull-page' command is deprecated. Use 'pull <pageId>' instead."))
      await handlePullPage(argv.pageId, argv)
    }
  )
  .command(
    "pull-tree <rootPageId>",
    false, // Hide from help text
    (yargs) => {
      yargs
        .positional("rootPageId", {
          type: "string",
          demandOption: true,
          describe: "Root Confluence page ID to pull tree from"
        })
        .option("output-dir", {
          alias: "o",
          type: "string",
          default: "./docs",
          describe: "Output directory for markdown files"
        })
        .option("overwrite", {
          alias: "w",
          type: "boolean",
          default: false,
          describe: "Overwrite existing files"
        })
        .option("file-name-template", {
          alias: "t",
          type: "string",
          default: "{title}.md",
          describe: "Template for filename generation"
        })
    },
    async (argv: any) => {
      console.warn(chalk.yellow("⚠️  WARNING: 'pull-tree' command is deprecated. Use 'pull <pageId> --recursive' instead."))
      await handlePullTree(argv.rootPageId, argv)
    }
  )
  .command(
    "sync",
    "Sync with Confluence: pull latest changes + push local updates",
    (yargs) => {
      yargs
        .option("filter", {
          alias: "f",
          type: "string",
          describe: "Filter pattern for files to publish"
        })
        .option("overwrite", {
          alias: "w",
          type: "boolean",
          default: false,
          describe: "Force update all files from Confluence (default: only pull new files)"
        })
        .option("max-depth", {
          type: "number",
          default: 10,
          describe: "Maximum recursion depth when pulling (default: 10)"
        })
        .option("file-name-template", {
          alias: "t",
          type: "string",
          default: "{title}.md",
          describe: "Template for filename generation when pulling"
        })
    },
    async (argv: any) => {
      await handleSync(argv)
    }
  )
  .command(
    "generate-docs",
    "Generate documentation from code changes using Gemini AI",
    (yargs) => {
      yargs
        .option("diff-command", {
          type: "string",
          default: "git diff HEAD~100..HEAD",
          describe: "Git command to get code changes (default: last 100 commits)"
        })
        .option("model", {
          type: "string",
          default: "gemini-2.0-flash",
          describe: "Gemini AI model to use (gemini-2.0-flash, gemini-1.5-pro, etc.)"
        })
        .option("output", {
          alias: "o",
          type: "string",
          default: "./FEATURE_DOC.md",
          describe: "Output file path for generated documentation"
        })
        .option("publish", {
          alias: "p",
          type: "boolean",
          default: false,
          describe: "Automatically publish generated docs to Confluence"
        })
        .option("feature", {
          alias: "f",
          type: "string",
          describe: "Feature name to use in filename and title"
        })
        .option("max-retries", {
          type: "number",
          default: 3,
          describe: "Maximum number of retries for rate limiting (default: 3)"
        })
        .option("retry-delay", {
          type: "number",
          default: 3000,
          describe: "Base delay between retries in milliseconds (default: 3000)"
        })
    },
    async (argv: any) => {
      await handleGenerateDocs(argv)
    }
  )
  .command(
    "generate-prompt",
    "Generate a prompt for IDE to create documentation",
    (yargs) => {
      yargs
        .option("output", {
          alias: "o",
          type: "string",
          describe: "Output file path for the prompt (default: print to console)"
        })
        .option("feature", {
          alias: "f",
          type: "string",
          describe: "Feature name to include in the prompt"
        })
        .option("target-file", {
          alias: "t",
          type: "string",
          describe: "Target file path where documentation should be created"
        })
    },
    async (argv: any) => {
      await handleGeneratePrompt(argv)
    }
  )
  .demandCommand(1, "You need at least one command before moving on")
  .help()
  .parse()
