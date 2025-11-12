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

const frontmatterRegex = /^\s*?---\n([\s\S]*?)\n---\s*/g;

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

  // Handle simple page names (no slashes, no protocol)
  // Convert to a basic confluence page URL pattern
  if (!href.includes('/') && !href.includes('\\') && !href.includes(':')) {
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

export function parseMarkdownToADF(
  markdown: string,
  confluenceBaseUrl: string,
) {
  const prosenodes = transformer.parse(markdown);
  const adfNodes = serializer.encode(prosenodes);
  const nodes = processADF(adfNodes, confluenceBaseUrl);
  return nodes;
}

function processADF(adf: JSONDocNode, confluenceBaseUrl: string): JSONDocNode {
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
        // Try to convert relative URLs to full URLs
        const fullUrl = convertRelativeUrlToFull(href, confluenceBaseUrl);
        if (fullUrl && fullUrl !== href) {
          href = fullUrl;
          node.marks[0].attrs["href"] = href;
        } else {
          node.marks[0].attrs["href"] = "#";
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
): LocalAdfFile {
  file.contents = file.contents.replace(frontmatterRegex, "");

  const adfContent = parseMarkdownToADF(
    file.contents,
    settings.confluenceBaseUrl,
  );

  const results = processConniePerPageConfig(file, settings, adfContent);

  return {
    ...file,
    ...results,
    contents: adfContent,
  };
}
