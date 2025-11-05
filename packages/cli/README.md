# md-confluence-cli

`md-confluence-cli` is a powerful tool that allows you to publish your markdown files as Confluence pages. It is designed to work seamlessly in various environments, including NPM CLI, Docker Container, and GitHub Actions, enabling you to use your docs wherever you need them. Comprehensive documentation for the tool can be found at [https://markdown-confluence.com/](https://markdown-confluence.com/).

## Pull Commands

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