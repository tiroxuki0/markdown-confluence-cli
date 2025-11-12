import {
  JSONDocNode,
  JSONTransformer,
} from "@atlaskit/editor-json-transformer";
import { MarkdownTransformer } from "./MarkdownTransformer";
import { traverse } from "@atlaskit/adf-utils/traverse";
import { MarkdownFile } from "./adaptors";
import { LocalAdfFile } from "./Publisher";
import { processConniePerPageConfig } from "./ConniePageConfig";
import { p } from "@atlaskit/adf-utils/builders";
import { MarkdownToConfluenceCodeBlockLanguageMap } from "./CodeBlockLanguageMap";
import { isSafeUrl } from "@atlaskit/adf-schema";
import { ConfluenceSettings } from "./Settings";
import { cleanUpUrlIfConfluence } from "./ConfluenceUrlParser";

export const frontmatterRegex = /^\s*?---\n([\s\S]*?)\n---\s*/g;

const transformer = new MarkdownTransformer();
const serializer = new JSONTransformer();

/**
 * Converts relative URLs to full URLs based on confluence base URL
 * Handles common relative URL patterns like ./path, ../path, or page-name
 */
function convertRelativeUrlToFull(href: string, confluenceBaseUrl: string): string | null {
  if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
    return null;
  }

  // Skip if it's already a full URL
  try {
    new URL(href);
    return null; // Already a full URL, let existing logic handle it
  } catch {
    // Not a full URL, continue with conversion
  }

  // Skip .md files as they should be handled by filename resolution
  if (href.endsWith('.md')) {
    return null;
  }

  // Handle relative URLs starting with ./ or ../
  if (href.startsWith('./') || href.startsWith('../')) {
    try {
      // For relative paths, we assume they should be relative to the confluence base
      // This is a simple approach - in practice, you might want to use the file's directory
      const baseUrl = new URL(confluenceBaseUrl);
      // Remove trailing slash if present
      const basePath = baseUrl.pathname.replace(/\/$/, '');
      // Construct the full path - this is a basic implementation
      const fullPath = href.startsWith('./')
        ? `${basePath}/${href.substring(2)}`
        : `${basePath}/${href}`; // For ../ paths, we'll keep them as-is for now

      return `${baseUrl.origin}${fullPath}`;
    } catch {
      return null;
    }
  }

  // Handle simple page names (no slashes, no protocol, no file extensions)
  // Convert to a basic confluence page URL pattern
  if (!href.includes('/') && !href.includes('\\') && !href.includes(':') && !href.includes('.')) {
    try {
      const baseUrl = new URL(confluenceBaseUrl);
      // Create a basic confluence page URL
      // This assumes the page name can be used to construct a valid confluence URL
      return `${baseUrl.origin}/wiki/spaces/${href.replace(/\s+/g, '_')}`;
    } catch {
      return null;
    }
  }

  return null; // Not a relative URL we can handle
}

/**
 * Resolves a filename reference to a full Confluence page URL using page ID mapping
 */
function resolveFilenameToPageUrl(
  href: string,
  confluenceBaseUrl: string,
  filenameToPageIdMap?: Map<string, string>,
  filenameToSpaceKeyMap?: Map<string, string>,
): string | null {
  if (!href || !filenameToPageIdMap) {
    return null;
  }

  // Remove .md extension if present and strip relative path prefixes
  let filename = href.replace(/\.md$/, '');

  // Handle relative path prefixes like ./ or ../
  if (filename.startsWith('./')) {
    filename = filename.substring(2);
  } else if (filename.startsWith('../')) {
    // For ../, we still try to resolve as a filename, but it might not work
    // depending on the context. For now, just strip the prefix.
    filename = filename.substring(3);
  }
  // Look up page ID for this filename
  const pageId = filenameToPageIdMap.get(filename);
  console.log('filename',filename)
  console.log('pageId',pageId)
  if (pageId) {
    try {
      const baseUrl = new URL(confluenceBaseUrl);
      // Use dynamic space key, fallback to S5 if not found
      const spaceKey = filenameToSpaceKeyMap?.get(filename) || 'S5';
      return `${baseUrl.origin}/wiki/spaces/${spaceKey}/pages/${pageId}/${filename.replace(/_/g, '+')}`;
    } catch {
      return null;
    }
  }

  return null;
}

export function parseMarkdownToADF(
  markdown: string,
  confluenceBaseUrl: string,
  filenameToPageIdMap?: Map<string, string>,
  filenameToSpaceKeyMap?: Map<string, string>,
) {
  const prosenodes = transformer.parse(markdown);
  const adfNodes = serializer.encode(prosenodes);
  const nodes = processADF(adfNodes, confluenceBaseUrl, filenameToPageIdMap, filenameToSpaceKeyMap);
  return nodes;
}

function processADF(adf: JSONDocNode, confluenceBaseUrl: string, filenameToPageIdMap?: Map<string, string>, filenameToSpaceKeyMap?: Map<string, string>): JSONDocNode {
  const olivia = traverse(adf, {
    text: (node, _parent) => {
      if (_parent.parent?.node?.type == "listItem" && node.text) {
        node.text = node.text
          .replaceAll(/^\[[xX]\]/g, "✅")
          .replaceAll(/^\[[ ]\]/g, "🔲")
          .replaceAll(/^\[[*]\]/g, "⭐️");
      }

      if (
        !(
          node.marks &&
          node.marks[0] &&
          node.marks[0].type === "link" &&
          node.marks[0].attrs &&
          "href" in node.marks[0].attrs
        )
      ) {
        return node;
      }

      let href = node.marks[0].attrs["href"] as string;

      // Handle empty or unsafe URLs (but allow wikilinks and mentions)
      if (
        href === "" ||
        (!isSafeUrl(href) &&
          !href.startsWith("wikilinks:") &&
          !href.startsWith("mention:"))
      ) {
        // Try to resolve filename to page ID URL first
        const resolvedUrl = resolveFilenameToPageUrl(href, confluenceBaseUrl, filenameToPageIdMap, filenameToSpaceKeyMap);
        console.log('resolvedUrl',resolvedUrl)
        if (resolvedUrl) {
          href = resolvedUrl;
          node.marks[0].attrs["href"] = href;
        } else {
          // Try to convert relative URLs to full URLs
          const fullUrl = convertRelativeUrlToFull(href, confluenceBaseUrl);
          if (fullUrl && fullUrl !== href) {
            href = fullUrl;
            node.marks[0].attrs["href"] = href;
          } else {
            node.marks[0].attrs["href"] = "#";
          }
        }
      }

      // Convert bare URLs to inline cards
      if (href === node.text && href !== "#") {
        const cleanedUrl = cleanUpUrlIfConfluence(href, confluenceBaseUrl);
        if (cleanedUrl !== "#") {
          node.type = "inlineCard";
          node.attrs = { url: cleanedUrl };
          delete node.marks;
          delete node.text;
        }
      }

      return node;
    },
    table: (node, _parent) => {
      if (
        node.attrs &&
        "isNumberColumnEnabled" in node.attrs &&
        node.attrs["isNumberColumnEnabled"] === false
      ) {
        delete node.attrs["isNumberColumnEnabled"];
      }
      return node;
    },
    tableRow: (node, _parent) => {
      return node;
    },
    tableHeader: (node, _parent) => {
      node.attrs = { colspan: 1, rowspan: 1, colwidth: [340] };
      return node;
    },
    tableCell: (node, _parent) => {
      node.attrs = { colspan: 1, rowspan: 1, colwidth: [340] };
      return node;
    },
    orderedList: (node, _parent) => {
      node.attrs = { order: 1 };
      return node;
    },
    codeBlock: (node, _parent) => {
      if (!node || !node.attrs) {
        return;
      }

      if (Object.keys(node.attrs).length === 0) {
        delete node.attrs;
        return node;
      }

      const codeBlockLanguage = (node.attrs || {})?.["language"];

      if (codeBlockLanguage in MarkdownToConfluenceCodeBlockLanguageMap) {
        node.attrs["language"] =
          MarkdownToConfluenceCodeBlockLanguageMap[codeBlockLanguage];
      }

      if (codeBlockLanguage === "adf") {
        if (!node?.content?.at(0)?.text) {
          return node;
        }
        try {
          const parsedAdf = JSON.parse(
            node?.content?.at(0)?.text ??
              JSON.stringify(p("ADF missing from ADF Code Block.")),
          );
          node = parsedAdf;
          return node;
        } catch (e) {
          return node;
        }
      }

      return node;
    },
  });

  if (!olivia) {
    throw new Error("Failed to traverse");
  }

  return olivia as JSONDocNode;
}

export function convertMDtoADF(
  file: MarkdownFile,
  settings: ConfluenceSettings,
  filenameToPageIdMap?: Map<string, string>,
  filenameToSpaceKeyMap?: Map<string, string>,
): LocalAdfFile {
  file.contents = file.contents.replace(frontmatterRegex, "");

  const adfContent = parseMarkdownToADF(
    file.contents,
    settings.confluenceBaseUrl,
    filenameToPageIdMap,
    filenameToSpaceKeyMap,
  );

  const results = processConniePerPageConfig(file, settings, adfContent);

  return {
    ...file,
    ...results,
    contents: adfContent,
  };
}
