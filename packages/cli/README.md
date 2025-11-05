# md-confluence-cli

`md-confluence-cli` is a powerful tool that allows you to publish your markdown files as Confluence pages. It is designed to work seamlessly in various environments, including NPM CLI, Docker Container, and GitHub Actions, enabling you to use your docs wherever you need them. Comprehensive documentation for the tool can be found at [https://markdown-confluence.com/](https://markdown-confluence.com/).

## Sync Command

The `sync` command provides a convenient way to synchronize your local markdown files with Confluence by pulling the latest changes from Confluence and pushing your local updates in a single operation. This is perfect for keeping your documentation perfectly synchronized.

## Sync Features

- **Bi-directional sync**: Pulls latest from Confluence + pushes local changes
- **Smart processing**: Only processes files that need updating
- **Detailed reporting**: Shows exactly what was pulled and pushed
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

1. **Pull from Confluence** - Downloads latest page tree from your configured parent page
   - **Only pulls new files** by default (files that don't exist locally)
   - Use `--overwrite` to force update all existing files
2. **Update local files** - Creates new markdown files in your publish folder
3. **Push to Confluence** - Publishes any local changes back to Confluence
4. **Report results** - Shows summary of what was synchronized

### Sync Examples

**Example 1: Basic sync**
```bash
npx md-confluence-cli@latest sync
# 📥 Step 1: Pulling latest changes from Confluence...
# 📤 Step 2: Pushing local changes to Confluence...
# ✅ Confluence sync complete!
```

**Example 2: Force sync all files**
```bash
npx md-confluence-cli@latest sync --overwrite
# Forces update of all files from Confluence (overwrites existing)
```

**Example 3: Sync specific files only**
```bash
npx md-confluence-cli@latest sync --filter "api/**"
# Only pushes files in the api/ directory
```

**Example 4: Limited depth sync**
```bash
npx md-confluence-cli@latest sync --max-depth 3
# Only pulls pages up to 3 levels deep
```

### Sync Output Example

```
🔄 Starting Confluence sync (pull + push)...

📥 Step 1: Pulling latest changes from Confluence...
✔ Pulled 5 pages from Confluence

📁 Generated file structure:
docs/
├── index.md
├── api/
│   ├── index.md
│   └── endpoints.md
└── guides/
    └── getting-started.md

📤 Step 2: Pushing local changes to Confluence...
✔ Published 2 files to Confluence

✅ Confluence sync complete!
🔄 Local files are now synchronized with Confluence
```

### Sync Error Handling

The sync command handles common Confluence scenarios:

- **Network issues**: Retries failed operations where possible
- **Permission errors**: Shows clear authentication error messages
- **Missing pages**: Continues with available pages
- **Rate limiting**: Automatically handles Confluence API limits

**Example error output:**
```
⚠️  2 pages failed to pull
❌ FAILED: docs/api/deprecated.md - Permission denied
💡 Check your Confluence API token and permissions
```

### Sync Best Practices

- **Run regularly** to keep documentation synchronized
- **Default behavior** only pulls new files (safe for existing local work)
- **Use `--overwrite`** when you want to force update all files from Confluence
- **Use `--filter`** to sync specific sections of your documentation
- **Check results** to ensure all important files were synchronized
- **Backup important local changes** before running sync with `--overwrite`

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