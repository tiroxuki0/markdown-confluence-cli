# md-confluence-cli

`md-confluence-cli` is a powerful tool that allows you to publish your markdown files as Confluence pages. It is designed to work seamlessly in various environments, including NPM CLI, Docker Container, and GitHub Actions, enabling you to use your docs wherever you need them. Comprehensive documentation for the tool can be found at [https://markdown-confluence.com/](https://markdown-confluence.com/).

## Sync Command

The `sync` command provides a convenient way to synchronize your local markdown files with Confluence by pulling the latest changes from Confluence and pushing your local updates in a single operation. This is perfect for keeping your documentation perfectly synchronized.

## Sync Features

- **Smart sync logic**: Automatically decides whether to pull or push based on local files
- **Safe by default**: Pulls new files when starting, pushes changes when working
- **Force overwrite**: Use `--overwrite` to force pull all files from Confluence
- **Detailed reporting**: Shows exactly what operation was performed
- **Error resilience**: Continues operation even if some files fail
- **Configuration aware**: Uses your existing `.markdown-confluence.json` settings

### Basic Sync

Sync your documentation with Confluence:

```bash
# Simple sync - pulls latest from Confluence and pushes local changes
npx md-confluence-cli@latest sync

# Sync with custom options
npx md-confluence-cli@latest sync --overwrite --max-depth 5
```

### Sync Command Options

| Option | Alias | Type | Default | Description |
|--------|-------|------|---------|-------------|
| `--filter` | `-f` | string | - | Filter pattern for files to publish |
| `--overwrite` | `-w` | boolean | `false` | Force update all files from Confluence (default: only pull new files) |
| `--max-depth` | - | number | `10` | Maximum recursion depth when pulling |
| `--file-name-template` | `-t` | string | `{title}.md` | Template for filename generation when pulling |

### Sync Process Flow

The sync command follows this intelligent workflow:

1. **Check local files** - Determines if you have existing documentation
2. **Smart decision**:
   - **No local files** → **Only pulls** new files from Confluence
   - **Local files exist** → **Only pushes** local changes to Confluence
   - **With `--overwrite`** → **Force pulls** all files (overwrites existing)
3. **Perform operation** - Executes the chosen sync strategy
4. **Report results** - Shows what was synchronized

## Generate Docs Command

The `generate-docs` command uses OpenAI to automatically create feature documentation from your code changes. This is perfect for maintaining up-to-date documentation as you develop.

### Generate Docs Features

- **AI-Powered Documentation**: Uses GPT-4 to analyze code changes and generate comprehensive docs
- **Project-Aware**: Automatically reads multiple project context files for accurate documentation
- **Context Sources**: AGENT.md, README.md, package.json, Confluence config, environment files
- **Pattern Recognition**: Follows your project's established conventions and architecture
- **Multiple Formats**: Supports different git diff commands for various scenarios
- **Auto-Publish**: Can automatically publish generated docs to Confluence
- **Flexible Output**: Customizable output file and AI model selection

### Generate Docs Setup

**1. Set OpenAI API Key:**
```bash
# macOS/Linux
export OPENAI_API_KEY="your-api-key-here"

# Windows
set OPENAI_API_KEY="your-api-key-here"
```

**2. Create AGENT.md (highly recommended for best results):**
```markdown
# Project Agent Rules

## Overview
Brief description of your project and its purpose.

## Architecture
Key architectural decisions and patterns used in this project.

## Development Workflow
How features are developed, tested, and documented.

## Code Style & Conventions
Naming conventions, file organization, coding standards.

## Documentation Standards
How features should be documented, what sections are required.
```

**3. Ensure project context files exist:**
- `README.md` - Project overview and setup instructions
- `package.json` - Project metadata and dependencies
- `.markdown-confluence.json` - Confluence configuration
- `.env.example` - Environment variables structure

### Generate Docs Examples

**Basic documentation generation:**
```bash
npx md-confluence-cli@latest generate-docs
# 🤖 Starting documentation generation...
# 📝 Got 15432 characters of diff
# ✅ Generated: ./FEATURE_DOC.md
```

**Generate with custom diff:**
```bash
npx md-confluence-cli@latest generate-docs --diff-command "git diff main..HEAD"
# Generate docs for all changes since main branch
```

**Generate and auto-publish:**
```bash
npx md-confluence-cli@latest generate-docs --publish
# Generate docs and automatically publish to Confluence
```

**Use different AI model:**
```bash
npx md-confluence-cli@latest generate-docs --model gpt-3.5-turbo --output ./docs/feature.md
```

### Generate Docs Command Options

| Option | Alias | Type | Default | Description |
|--------|-------|------|---------|-------------|
| `--diff-command` | - | string | `git diff HEAD~1..HEAD` | Git command to get code changes |
| `--model` | - | string | `gpt-4` | OpenAI model (gpt-4, gpt-3.5-turbo) |
| `--output` | `-o` | string | `./FEATURE_DOC.md` | Output file path |
| `--publish` | `-p` | boolean | `false` | Auto-publish to Confluence |

### Generate Docs Workflow

The generate-docs command follows this intelligent workflow:

1. **Extract Code Changes** - Run git diff to get changed code
2. **Gather Project Context** - Read multiple project files:
   - `AGENT.md` - Project rules and conventions
   - `README.md` - Project overview
   - `package.json` - Dependencies and metadata
   - `.markdown-confluence.json` - Confluence setup
   - Environment files - Configuration structure
3. **AI Analysis** - Send comprehensive context + code changes to OpenAI
4. **Contextual Generation** - AI generates docs following your project's patterns
5. **Format Output** - Generate structured Markdown documentation
6. **Save & Publish** - Save to file and optionally publish to Confluence

### Generated Documentation Format

The AI generates documentation in this standardized format:

```markdown
## Feature Name

Smart Confluence Sync

### Summary

Implemented intelligent sync logic that automatically decides whether to pull or push based on local file presence, with force override capability.

### Changed Components

- packages/cli/src/index.ts - Added handleSync function
- packages/cli/README.md - Updated documentation

### API / Behavior Changes

- New --overwrite flag for force sync
- Smart decision logic replaces sequential pull+push

### Usage Example

```bash
confluence sync --overwrite
```

### Notes for Future Maintainers

- Logic prioritizes safety: pull new files first, push existing changes
- --overwrite bypasses safety checks for complete resync
```

### Generate Docs Best Practices

- **Keep AGENT.md Updated**: Include project context for better AI understanding
- **Use Specific Diffs**: Use `--diff-command` for feature-specific documentation
- **Review Before Publishing**: Always check AI-generated docs for accuracy
- **Version Control**: Commit generated docs alongside code changes
- **Iterate**: Use multiple generations to refine documentation quality

## Sync Examples

**Example 1: First time sync (no local files)**
```bash
npx md-confluence-cli@latest sync
# No local files found - will pull from Confluence
# 📥 Pulling from Confluence...
# ✔ Pulled 5 pages from Confluence
```

**Example 2: Regular sync (with local files)**
```bash
npx md-confluence-cli@latest sync
# Found local files - will push to Confluence
# 📤 Pushing to Confluence...
# ✔ Published 3 files to Confluence
```

**Example 3: Force refresh all files**
```bash
npx md-confluence-cli@latest sync --overwrite
# Force overwrite mode - will pull all from Confluence
# 📥 Pulling from Confluence...
# ✔ Pulled 8 pages from Confluence (overwriting existing)
```

**Example 4: Push specific files only**
```bash
npx md-confluence-cli@latest sync --filter "api/**"
# Found local files - will push to Confluence
# 📤 Pushing to Confluence...
# ✔ Published 2 files to Confluence (filtered)
```

### Sync Output Examples

**First time sync:**
```
Starting smart Confluence sync...
- Checking local files...
✔ No local files found - will pull from Confluence
- Pulling from Confluence...
✔ Pulled 5 pages from Confluence

📁 Generated file structure:
docs/
├── index.md
├── api/
│   ├── index.md
│   └── endpoints.md
└── guides/
    └── getting-started.md

Smart Confluence sync complete!
```

**Regular sync:**
```
Starting smart Confluence sync...
- Checking local files...
✔ Found local files - will push to Confluence
- Pushing to Confluence...
✔ Published 2 files to Confluence

Smart Confluence sync complete!
```

### Sync Error Handling

The sync command handles common scenarios gracefully:

- **No credentials configured**: Shows helpful setup instructions instead of failing
- **Network issues**: Retries failed operations where possible
- **Permission errors**: Shows clear authentication error messages
- **Missing pages**: Continues with available pages
- **Rate limiting**: Automatically handles Confluence API limits

**Example helpful guidance:**
```
⚠️  Confluence credentials not configured
   Checking local files to suggest next steps...

💡 To push your local files to Confluence:
   1. Configure .markdown-confluence.json
   2. Run: confluence sync
✔ Found local files - will push to Confluence
```

**Example error output:**
```
⚠️  2 pages failed to pull
❌ FAILED: docs/api/deprecated.md - Permission denied
💡 Check your Confluence API token and permissions
```

### Sync Best Practices

- **First time**: Run `sync` without options to pull initial documentation
- **Regular workflow**: Use `sync` to push your local changes to Confluence
- **Force refresh**: Use `sync --overwrite` when you want to reset from Confluence
- **Selective push**: Use `sync --filter "folder/**"` to push specific sections
- **Check results**: Always verify what operation was performed
- **Backup before overwrite**: Save important local changes before `--overwrite`

# Pull Commands

The `pull` command allows you to download Confluence pages as markdown files to your local machine. This is useful for:

- **Backup documentation** from Confluence
- **Work offline** with local markdown files
- **Migrate documentation** between Confluence spaces
- **Version control** documentation changes
- **Edit and republish** pages locally

### Pull a Single Page

Pull a single Confluence page by its page ID:

```bash
# Pull a page to default directory (./docs)
npx md-confluence-cli@latest pull 123456789

# Pull to a specific directory
npx md-confluence-cli@latest pull 123456789 --output ./docs

# Pull with overwrite existing files
npx md-confluence-cli@latest pull 123456789 --output ./docs --overwrite
```

### Pull a Page Tree (Recursive)

Pull a page and all its children recursively to create a complete documentation tree:

```bash
# Pull a page and all children recursively (default max-depth: 10)
npx md-confluence-cli@latest pull 123456789 --recursive

# Pull with custom output directory
npx md-confluence-cli@latest pull 123456789 --output ./docs --recursive

# Limit recursion depth (useful for large page trees)
npx md-confluence-cli@latest pull 123456789 --recursive --max-depth 5
```

### Pull Command Options

| Option | Alias | Type | Default | Description |
|--------|-------|------|---------|-------------|
| `--output` | `-o` | string | `./docs` | Output directory for markdown files |
| `--recursive` | `-r` | boolean | `false` | Pull page and all children recursively |
| `--max-depth` | - | number | `10` | Maximum recursion depth when using `--recursive` |
| `--overwrite` | `-w` | boolean | `false` | Overwrite existing files |
| `--file-name-template` | `-t` | string | `{title}.md` | Template for filename generation |

### Pulled File Structure

When pulling pages with `--recursive`, the CLI creates a nested folder structure that mirrors the Confluence page hierarchy:

```
docs/
├── frontend/
│   ├── index.md              # Root page (has children)
│   ├── mobile_app/
│   │   ├── index.md          # Page with children
│   │   ├── app_info.md      # Page without children
│   │   └── adjust_tracking_install_and_more.md
│   ├── launch_game.md        # Page without children
│   └── fe_integration_credentials.md
```

**Structure Rules:**
- **Pages with children** → Saved as `index.md` inside a folder named after the page title
- **Pages without children** → Saved as `{title}.md` in the parent folder
- **Nested hierarchy** → Maintains the exact parent-child relationships from Confluence

### Pulled File Frontmatter

Each pulled markdown file includes comprehensive frontmatter with Confluence metadata:

```yaml
---
pageId: 123456789
title: "Page Title"
spaceKey: S5
version: 3
lastUpdated: "712020:0aa84074-41f8-442b-b137-ac2d5bd53315"
pulledAt: "2025-11-04T10:07:13.904Z"
confluenceUrl: "https://s5philippines.atlassian.net/pages/viewpage.action?pageId=123456789"
parentId: 987654321
---
```

**Frontmatter Fields:**
- `pageId` - Confluence page ID (used for republishing)
- `title` - Page title from Confluence
- `spaceKey` - Confluence space key
- `version` - Current page version number
- `lastUpdated` - Last update timestamp
- `pulledAt` - When the page was pulled locally
- `confluenceUrl` - Direct link to the Confluence page
- `parentId` - Parent page ID (for hierarchy)

### Publishing Pulled Pages

Pulled pages can be republished back to Confluence. The `pageId` in frontmatter ensures pages are updated (not duplicated):

```bash
# After pulling and editing locally
npx md-confluence-cli@latest publish "docs/frontend/index.md"
```

**Important Notes:**
- Pages with `pageId` in frontmatter will **update** existing Confluence pages
- Pages without `pageId` will **create new** pages
- The `connie-publish: true` frontmatter flag controls whether a page should be published

### Pull Examples

**Example 1: Pull entire documentation tree**
```bash
# Pull the "Frontend" documentation tree
npx md-confluence-cli@latest pull 46923777 --output ./docs --recursive
```

**Example 2: Pull single page for editing**
```bash
# Pull a specific page to edit locally
npx md-confluence-cli@latest pull 94732294 --output ./docs
```

**Example 3: Pull with custom filename**
```bash
# Use custom filename template
npx md-confluence-cli@latest pull 123 --file-name-template "{id}_{title}.md"
```

**Example 4: Pull shallow tree (only 2 levels deep)**
```bash
# Limit depth for large documentation trees
npx md-confluence-cli@latest pull 46923777 --recursive --max-depth 2 --output ./docs
```

### Pull Best Practices

- **Use `--output`** to organize pulled pages into your project structure
- **Use `--max-depth`** when pulling large page trees to avoid excessive downloads
- **Use `--overwrite`** carefully - it will replace existing local files
- **Review frontmatter** after pulling to ensure `pageId` is correct for republishing
- **Test locally** before republishing pulled pages to avoid overwriting Confluence content

## Usage Examples

### CLI

**Example setup**

`.markdown-confluence.json`:

```json
{
  "confluenceBaseUrl": "https://markdown-confluence.atlassian.net",
  "confluenceParentId": "524353",
  "atlassianUserName": "andrew.mcclenaghan@gmail.com",
  "folderToPublish": "."
}
```

**Environment Variables**

macOS / Linux:

```bash
export ATLASSIAN_API_TOKEN="YOUR API TOKEN"
```

Windows:

```bash
set ATLASSIAN_API_TOKEN="YOUR API TOKEN"
```

[Learn more about `set` command](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/set_1)

**CLI Commands**

```bash
# Publish markdown files to Confluence (default command)
npx md-confluence-cli

# Sync with Confluence (pull + push)
npx md-confluence-cli sync

# Sync with overwrite local files
npx md-confluence-cli sync --overwrite

# Sync specific files only
npx md-confluence-cli sync --filter "api/**"

# Generate docs from code changes
npx md-confluence-cli generate-docs

# Generate and auto-publish docs
npx md-confluence-cli generate-docs --publish

# Pull a single page from Confluence
npx md-confluence-cli pull <pageId>

# Pull a page tree recursively
npx md-confluence-cli pull <pageId> --recursive --output ./docs
```

### Docker Container

**Example setup**
```bash
docker run -it --rm -v "$(pwd):/content" -e ATLASSIAN_API_TOKEN ghcr.io/markdown-confluence/publish:latest
```

### GitHub Actions

**Example setup**

`.github/workflows/publish.yml`:

```yaml
name: Publish to Confluence
on: [push]
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v3
      - name: Publish Markdown to Confluence
        uses: markdown-confluence/publish@v1
        with:
          atlassianApiToken: ${{ secrets.ATLASSIAN_API_TOKEN }}
```

**Environment Variables**

Add your API token as a secret in your GitHub repository settings:

1. Go to your repository's `Settings` tab.
2. Click on `Secrets` in the left sidebar.
3. Click on `New repository secret`.
4. Name it `ATLASSIAN_API_TOKEN` and enter your API token as the value.
5. Click on `Add secret`.