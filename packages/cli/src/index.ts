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

    // Gather comprehensive project context
    const projectContext = await gatherProjectContext()

    // Generate documentation
    const generateSpinner = ora("Generating documentation...").start()

    const promptFeatureName = options.feature || "Feature Name"

    const prompt = `# QA-Focused Documentation Generation from Code Changes

You are a **Senior Technical Documentation Engineer** specializing in automated documentation generation from code changes. You excel at creating **dual-audience documentation** that serves both developers and QA testers simultaneously.

## Expertise & Role

You are an expert in:
- **Automated documentation generation** from code changes
- **Dual-audience writing** (technical + non-technical)
- **Code change analysis** and feature mapping
- **QA-focused documentation** with actionable testing scenarios
- **Technical specification** writing with plain language explanations

## Context & Resources

You have access to:
- **Code Changes**: Recent git diff (${diffTruncated ? `truncated from ${originalDiffLength.toLocaleString()} to 2M characters` : `full ${diff.length.toLocaleString()} characters`})
- **Project Context**: AGENT.md standards and README.md overview
- **Codebase**: Full project structure and implementation details
- **Analysis Tools**: Code search and pattern recognition capabilities

${projectContext ? `## Project Context\n\n${projectContext}\n` : ""}

## Primary Task

**Generate comprehensive QA-focused documentation for code changes implementing: "${promptFeatureName}"**

**Success Criteria:**
- Clear feature understanding from code changes
- Dual-audience accessibility (technical + non-technical)
- Actionable QA testing scenarios
- Technical implementation accuracy
- Professional documentation following AGENT.md standards

## Critical Framework: Dual Audience Balance

**MANDATORY:** Your documentation must serve **TWO audiences simultaneously** without compromise:

### Audience 1: Non-Technical Readers (QA Testers, Product Managers, Stakeholders)
**Needs:**
- Plain language explanations of what changed
- Step-by-step user flows and behaviors
- Clear testing instructions (no technical knowledge required)
- Business impact and user experience changes
- Expected outcomes in user-visible terms

### Audience 2: Technical Readers (Developers, Technical QA, Architects)
**Needs:**
- Technical implementation details and architecture changes
- Code structure modifications and new components
- API changes and interface updates
- Performance implications and technical constraints
- Implementation references and code locations

### Writing Strategy (MANDATORY)
- **Every Technical Concept**: Plain language explanation FIRST, then technical details
- **Structure Pattern**: "What it does" (user view) → "How it works" (technical view)
- **Balance Principle**: Technical depth without sacrificing accessibility
- **Terminology Rule**: Never use technical terms without plain language explanation
- **Format Standard**: Simple explanation → Technical implementation

## Analysis Framework (CRITICAL FIRST PHASE)

**IMPORTANT:** Spend significant time on analysis before documentation generation.

### Phase 1: Feature Context Analysis
1. **Feature Name Deconstruction**
   - Break down "${promptFeatureName}": What functionality does this represent?
   - Identify core concepts, user benefits, and business value
   - Consider user perspective: What problem does this solve?
   - Map feature name to expected user outcomes

2. **Code Changes Overview**
   - **Diff Analysis**: Scan entire diff for patterns and changes
   - **Change Categories**: Identify new features, modifications, bug fixes, refactoring
   - **Scope Assessment**: Determine breadth and depth of changes
   - **Impact Evaluation**: Assess potential user and system impact

### Phase 2: Code-to-Feature Mapping
1. **Direct Mapping**
   - Find explicit references to "${promptFeatureName}" in code
   - Identify files, functions, classes named after feature concepts
   - Locate comments, commit messages, documentation strings
   - Map UI changes to user-facing functionality

2. **Indirect Mapping**
   - Identify supporting code that enables the feature
   - Find configuration changes and environment updates
   - Locate test additions and validation logic
   - Discover integration points and API modifications

3. **Architecture Impact**
   - Understand how changes fit into overall system design
   - Identify new dependencies and external integrations
   - Assess performance implications and scalability changes
   - Evaluate security and compliance impacts

### Phase 3: Validation & Gap Analysis
- **Completeness Check**: Does code fully implement "${promptFeatureName}"?
- **Gap Identification**: What's missing between feature requirements and implementation?
- **Assumption Documentation**: Note any unclear or assumed functionality
- **Risk Assessment**: Identify potential issues or edge cases

**Quality Gate:** Do not proceed until you have clear feature-to-code mapping.

## Documentation Structure & Requirements

### 1. Overview Section (MANDATORY)
**Dual Perspective Approach:**
- **User Impact**: What changes for users? What new capabilities? (Plain language)
- **Technical Changes**: What code was modified/added? (Technical details)
- **Business Value**: Why were these changes made? What problems solved?
- **Scope & Impact**: What's included? What's the expected user/system impact?

### 2. Feature Implementation & User Journey
**Structure each user flow as:**
- **User Experience**: Step-by-step user interactions (plain language)
- **System Behavior**: How system responds (user-visible outcomes)
- **Technical Flow**: Code execution path and processing (technical details)
- **Pre/Post Conditions**: Requirements and expected states
- **Validation Points**: What QA should verify at each step

**Include:**
- New user workflows enabled by changes
- Modified existing workflows
- Edge cases and error scenarios
- Performance expectations and user experience impact

### 3. Technical Implementation Details
**Balance accessibility with technical accuracy:**

**Architecture Changes:**
- **High-Level Design**: System changes overview (simple) → Detailed architecture (technical)
- **Component Changes**: New/modified modules (purpose first) → Implementation details (technical)
- **Integration Points**: External systems involved (business impact) → Technical interfaces (specifications)

**Code Changes Breakdown:**
- **File-by-File Analysis**: Key changes and their purposes
- **Function/API Changes**: New/modified interfaces with usage examples
- **Data Structure Changes**: Schema modifications and data flow impacts
- **Configuration Updates**: Environment and setting changes

**Performance & Scalability:**
- **User Experience**: How performance changes affect users (plain)
- **Technical Metrics**: Performance implications and benchmarks (technical)
- **Optimization Changes**: Performance improvements and their business impact

### 4. QA & Testing Strategy (CRITICAL FOR QA AUDIENCE)
**Make testing instructions actionable for non-technical QA:**

**Test Scenario Structure:**
- **Scenario Name**: Clear description of what to test (plain language)
- **Prerequisites**: Setup required (step-by-step, no technical knowledge)
- **Test Steps**: Numbered actions (user-facing instructions)
- **Expected Results**: What should happen (user-visible outcomes)
- **Technical Validation**: Additional checks (for technical QA)
- **Edge Cases**: Boundary conditions and unusual scenarios

**Required Test Categories:**
- **Happy Path Testing**: Normal usage scenarios (primary user flows)
- **Negative Testing**: Error conditions and failure modes
- **Edge Case Testing**: Boundary conditions and unusual inputs
- **Integration Testing**: How feature works with other system parts
- **Regression Testing**: Impact on existing functionality
- **Performance Testing**: User experience under different conditions

**Error Scenario Documentation:**
- **Error Conditions**: When/why errors occur (plain explanations)
- **User Experience**: What users see when errors happen
- **Reproduction Steps**: How to trigger errors (step-by-step)
- **Technical Details**: Error codes, stack traces, debugging info (technical)

### 5. Implementation Examples & Usage
**User Examples:**
- Real-world scenarios showing new functionality
- Before/after comparisons (what changed for users)
- Common use cases and user workflows

**Technical Examples:**
- Code snippets with detailed explanatory comments
- API usage examples with request/response samples
- Configuration examples and setup instructions

## Quality Standards & Validation

### Content Quality Requirements
- **Accessibility**: Non-technical reader can understand changes and testing
- **Technical Accuracy**: Developer can understand implementation changes
- **Completeness**: All significant changes documented
- **Balance**: Technical details explained accessibly
- **Actionability**: QA can execute tests without technical knowledge

### Format & Structure Requirements
- **Markdown**: Clean, structured formatting with headers and lists
- **Confluence Frontmatter**: Publishing metadata included
- **Code References**: Link to specific files, functions, commits
- **Visual Elements**: Diagrams for complex flows and architectures
- **Tables**: Structured comparison of changes and test scenarios

## Output Specifications

**Format:** Professional markdown documentation
**Length Limit:** < 2000 lines (prioritize essential information)
**Style Guide:** Follow AGENT.md standards and project conventions

**Confluence Frontmatter (MANDATORY):**
\`\`\`yaml
---
connie-publish: true
title: "${promptFeatureName}"
tags: documentation, qa, feature-update, ${promptFeatureName.toLowerCase().replace(/[^a-z0-9]/g, '-')}
---
\`\`\`

## Execution Process

### Phase 1: Deep Code Analysis (Most Critical)
1. **Diff Analysis**: Thoroughly examine all code changes
2. **Feature Mapping**: Map code changes to "${promptFeatureName}" functionality
3. **Architecture Understanding**: Understand system impact and integration points
4. **Gap Analysis**: Identify what's implemented vs. what's expected

### Phase 2: Documentation Planning
1. **Audience Analysis**: Plan content structure for dual audiences
2. **Content Mapping**: Organize findings into documentation sections
3. **Technical Balance**: Ensure accessibility without losing technical depth
4. **QA Focus**: Design actionable testing scenarios

### Phase 3: Content Generation
1. **Overview Writing**: Create dual-perspective overview section
2. **Flow Documentation**: Document user journeys and technical flows
3. **Technical Details**: Provide implementation details with explanations
4. **QA Scenarios**: Create comprehensive testing instructions
5. **Examples**: Include practical usage examples

### Phase 4: Quality Validation
1. **Dual Audience Testing**:
   - Can non-technical QA understand what changed and how to test?
   - Can developers understand technical implementation changes?
2. **Technical Term Check**: Every term explained in plain language
3. **Balance Validation**: Content serves both audiences effectively
4. **Completeness Check**: All significant changes documented
5. **Length Compliance**: Stay within line limits

### Phase 5: Finalization
1. **Format Review**: Ensure proper markdown and frontmatter
2. **Content Polish**: Professional editing and clarity improvements
3. **Structure Validation**: Follow AGENT.md standards
4. **Final Quality Check**: Meets all requirements and standards

## Code Changes Reference

**Analysis Basis:** Git diff (${diffTruncated ? `truncated to 2M characters, most recent changes preserved` : `full diff`})

--- CODE CHANGES (Last 100 commits) ---

${diffTruncated ? `\n**Note:** Diff was truncated from ${originalDiffLength.toLocaleString()} to 2,000,000 characters. **Most recent changes are preserved** (oldest changes removed) to ensure latest, most relevant code is analyzed for documentation.\n\n` : ""}${diff}

---

## Validation & Quality Assurance Framework

### Pre-Analysis Validation
**Before processing code changes:**

1. **Diff Quality Assessment**
   - Verify diff contains relevant code changes
   - Check for truncated content and assess impact
   - Validate diff represents actual "${promptFeatureName}" implementation

2. **Context Readiness Check**
   - Ensure AGENT.md standards are available
   - Validate project context information
   - Confirm Gemini API access and capabilities

3. **Scope Validation**
   - Assess whether diff scope matches "${promptFeatureName}"
   - Identify if changes are feature-complete or partial
   - Document any scope limitations

### Real-time Validation Methods

**During analysis and generation:**

1. **Code Change Relevance Testing**
   - **Direct Relevance**: Does each change relate to "${promptFeatureName}"?
   - **Indirect Relevance**: Does change support or enable the feature?
   - **Noise Filtering**: Identify and exclude unrelated changes

2. **Dual Audience Content Validation**
   - **Accessibility Check**: Can non-technical readers understand changes?
   - **Technical Depth Check**: Do developers get implementation details?
   - **Balance Assessment**: Both audiences served by same content?

3. **Technical Accuracy Validation**
   - **Implementation Match**: Documentation reflects actual code changes?
   - **Architecture Alignment**: Changes understood in system context?
   - **Dependency Awareness**: Related system impacts identified?

### Post-Generation Quality Controls

**Final validation before output:**

1. **Content Completeness Audit**
   - All significant code changes documented?
   - User impact clearly explained?
   - Technical implementation details accurate?

2. **QA Testing Validation**
   - Test scenarios cover all change types?
   - Instructions actionable for non-technical QA?
   - Edge cases and error conditions documented?

3. **Format & Standards Compliance**
   - Confluence frontmatter properly formatted?
   - Markdown structure clean and consistent?
   - Length within specified limits?

### Automated Quality Checklist

**Use this checklist to validate final documentation:**

- [ ] Code changes accurately analyzed and categorized
- [ ] Feature-code mapping clear and comprehensive
- [ ] User impact explained in plain language
- [ ] Technical implementation details correct
- [ ] QA testing scenarios actionable and complete
- [ ] Error handling and edge cases documented
- [ ] Both audiences satisfied by content balance
- [ ] Confluence frontmatter includes proper metadata
- [ ] Length constraint met (< 2000 lines)
- [ ] AGENT.md style guide followed
- [ ] No unexplained technical terminology
- [ ] Code references accurate and specific

## Critical Success Factors

### Analysis Excellence
- **Thorough Code Review**: Every line of diff analyzed for relevance
- **Accurate Mapping**: Clear connection between code changes and feature
- **Context Understanding**: Changes understood in broader system context
- **Gap Recognition**: Missing functionality identified and noted

### Content Quality
- **Dual Audience Success**: Both readers get value from same document
- **Technical Accuracy**: Implementation details correct and complete
- **QA Actionability**: Testing instructions clear and executable
- **Professional Standard**: Well-written, well-structured, error-free

### Process Discipline
- **Phase Completion**: Each phase completed before moving to next
- **Quality Gates**: All validation checkpoints passed
- **Standards Adherence**: AGENT.md and project standards followed
- **Efficiency**: Comprehensive yet concise within length limits

**CRITICAL REMINDER:** Quality analysis produces quality documentation. Invest time in understanding the relationship between "${promptFeatureName}" and the code changes. Your analysis quality directly determines documentation quality.

**Ready to begin comprehensive code change analysis and documentation generation for "${promptFeatureName}".**`

    // Use retry logic for API calls to handle rate limiting
    const maxRetries = options.maxRetries || 3
    const retryDelay = options.retryDelay || 3000

    const response = await retryWithBackoff(
      () =>
        openai.chat.completions.create({
          model: options.model || "gemini-2.0-flash",
          messages: [
            {
              role: "system",
              content: "You are a technical documentation specialist. Analyze the provided git diff and create comprehensive, specific documentation. Extract real details from the code changes - no placeholders or generic templates. Focus on actual files, functions, and code snippets that changed."
            },
            { role: "user", content: prompt }
          ]
        }),
      maxRetries,
      retryDelay
    )

    let markdown = response.choices[0]?.message?.content
    if (!markdown) {
      throw new Error("No response from OpenAI API")
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
