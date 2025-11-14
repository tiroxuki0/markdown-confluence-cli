# Repository Guidelines

## Project Structure & Module Organization
This repo is an npm-workspace monorepo; each tool lives in `packages/*` with TypeScript sources under `src`. `packages/lib` holds the Markdown↔ADF transformers shared everywhere else, `packages/cli` exposes the `md-confluence` CLI, `packages/obsidian` contains the Obsidian plugin, and the two `packages/mermaid-*` workspaces render diagrams. Shared docs and release assets live in `docs/`, `manifest.json`, and the root config files, while examples and temporary content belong in `dev-vault/`. Keep tests and fixtures co-located with the code (`__snapshots__`, `*.test.ts`) so reviewers can diff behavior alongside implementation changes.

## Build, Test, and Development Commands
- `npm run dev-obsidian`: watches the library, mermaid renderer, and Obsidian plugin simultaneously for local authoring.
- `npm run build` or `npm run build --workspace=@markdown-confluence/lib`: compiles every workspace (or a single package) via esbuild/TypeScript.
- `npm run test [--workspace=...]`: runs the Jest + ts-jest suite; snapshots update with `npm test -- -u`.
- `npm run fmt`: applies Prettier to staged TypeScript files through lint-staged; run manually before large refactors.
- `npm run sync`: builds the CLI then executes `packages/cli/dist/index.js sync` to publish Markdown to Confluence; requires valid env credentials.

## Coding Style & Naming Conventions
Use modern ESM TypeScript with 2-space indentation, semicolons, and named exports by default. Favor descriptive folder names (`ADFProcessingPlugins`, `mermaid-electron-renderer`) and keep workspace-scoped package names (e.g., `@markdown-confluence/lib`). Prettier and ESLint (`@typescript-eslint`) enforce formatting and safe APIs—avoid disabling rules unless absolutely necessary and prefer small helper functions over deeply nested logic. New files should follow the existing casing (`PascalCase` for classes, `camelCase` for functions/variables) and reside near the feature they support.

## Testing Guidelines
Author Jest specs as `*.test.ts` beside the feature under test; snapshot outputs belong in adjacent `__snapshots__` folders so reviewers see behavioral drift. When touching conversion logic, add regression fixtures that cover edge cases (tables, task lists, Mermaid diagrams). Run `npm test --workspace=<package>` before opening a PR and ensure new behavior is either covered by a focused unit test or accompanied by an updated snapshot. Keep coverage steady; delete tests only when the functionality truly disappears.

## Commit & Pull Request Guidelines
Commits follow [Conventional Commits](https://www.conventionalcommits.org/)—use `type(scope): summary`, where `scope` maps to a workspace (`lib`, `cli`, `obsidian`). Write imperative summaries (`feat(lib): add table pipe fix`). Each PR should include: a clear description, linked issue/ADR, reproduction or test plan (`npm test --workspace=obsidian-confluence`), and screenshots or GIFs for UI-facing Obsidian changes. Reference docs you touched (`docs/...`) and mention any configuration updates (`manifest.json`, secrets) so maintainers can verify them quickly.

## Security & Configuration Notes
Follow `SECURITY.md` for vulnerability disclosures and prefer scanning changes locally with `osv-scanner`. Never commit Confluence tokens or vault data; store secrets via environment variables or the `dev-vault` template. Keep dependencies patched (`npm run build` fails fast on TypeScript/ESLint issues), and flag any new permissions in Obsidian’s `manifest.json` during review.
