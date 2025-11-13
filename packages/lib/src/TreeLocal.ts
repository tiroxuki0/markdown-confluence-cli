import path from "path";
import { MarkdownFile } from "./adaptors";
import { convertMDtoADF } from "./MdToADF";
import { folderFile } from "./FolderFile";
import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import { LocalAdfFileTreeNode } from "./Publisher";
import { ConfluenceSettings } from "./Settings";
import { frontmatterRegex } from "./MdToADF";

/**
 * Builds a mapping from filename (without extension) to page ID from all markdown files
 */
function buildFilenameToPageIdMap(files: MarkdownFile[]): Map<string, string> {
  const mapping = new Map<string, string>();

  for (const file of files) {
    try {
      // Use the already parsed frontmatter from the file object
      const frontmatter = file.frontmatter || {};

      // Try to extract pageId or connie-page-id
      const pageId = frontmatter['pageId'] || frontmatter['connie-page-id'];
      if (pageId !== undefined && pageId !== null) {
        const pageIdStr = String(pageId).trim();
        if (pageIdStr) {
          // Extract filename without extension
          const filename = path.basename(file.fileName, '.md');
          mapping.set(filename, pageIdStr);
        }
      }
    } catch (error) {
      // Skip files with invalid frontmatter
      console.warn(`Failed to parse frontmatter for ${file.fileName}:`, error);
    }
  }

  return mapping;
}

function buildFilenameToSpaceKeyMap(files: MarkdownFile[]): Map<string, string> {
  const mapping = new Map<string, string>();

  for (const file of files) {
    try {
      // Extract frontmatter using regex
      const frontmatterMatch = file.contents.match(frontmatterRegex);
      if (frontmatterMatch && frontmatterMatch[1]) {
        const frontmatterContent = frontmatterMatch[1];

        // Try to extract spaceKey
        const spaceKeyMatch = frontmatterContent.match(/^spaceKey:\s*['"]?([^'"\n]+)['"]?$/m);
        if (spaceKeyMatch && spaceKeyMatch[1]) {
          const spaceKey = spaceKeyMatch[1].trim();
          if (spaceKey) {
            // Extract filename without extension
            const filename = path.basename(file.fileName, '.md');
            mapping.set(filename, spaceKey);
          }
        }
      }
    } catch (error) {
      // Skip files with invalid frontmatter
      console.warn(`Failed to parse spaceKey for ${file.fileName}:`, error);
    }
  }

  return mapping;
}

const findCommonPath = (paths: string[]): string => {
  const [firstPath, ...rest] = paths;
  if (!firstPath) {
    throw new Error("No Paths Provided");
  }
  const commonPathParts = firstPath.split(path.sep);

  rest.forEach((filePath) => {
    const pathParts = filePath.split(path.sep);
    for (let i = 0; i < commonPathParts.length; i++) {
      if (pathParts[i] !== commonPathParts[i]) {
        commonPathParts.splice(i);
        break;
      }
    }
  });

  return commonPathParts.join(path.sep);
};

const createTreeNode = (name: string): LocalAdfFileTreeNode => ({
  name,
  children: [],
});

const addFileToTree = (
  treeNode: LocalAdfFileTreeNode,
  file: MarkdownFile,
  relativePath: string,
  settings: ConfluenceSettings,
  filenameToPageIdMap: Map<string, string>,
  filenameToSpaceKeyMap?: Map<string, string>,
) => {
  const [folderName, ...remainingPath] = relativePath.split(path.sep);
  if (folderName === undefined) {
    throw new Error("Unable to get folder name");
  }

  if (remainingPath.length === 0) {
    const adfFile = convertMDtoADF(file, settings, filenameToPageIdMap, filenameToSpaceKeyMap);
    treeNode.children.push({
      ...createTreeNode(folderName),
      file: adfFile,
    });
  } else {
    let childNode = treeNode.children.find((node) => node.name === folderName);

    if (!childNode) {
      childNode = createTreeNode(folderName);
      treeNode.children.push(childNode);
    }

    addFileToTree(childNode, file, remainingPath.join(path.sep), settings, filenameToPageIdMap, filenameToSpaceKeyMap);
  }
};

const processNode = (commonPath: string, node: LocalAdfFileTreeNode) => {
  if (!node.file) {
    let indexFile = node.children.find(
      (child) => path.parse(child.name).name === node.name,
    );
    if (!indexFile) {
      // Support FolderFile with a file name of "index.md"
      indexFile = node.children.find((child) =>
        ["index", "README", "readme"].includes(path.parse(child.name).name),
      );
    }

    if (indexFile && indexFile.file) {
      node.file = indexFile.file;
      node.children = node.children.filter((child) => child !== indexFile);
    } else {
      node.file = {
        folderName: node.name,
        absoluteFilePath: path.join(commonPath, node.name),
        fileName: `${node.name}.md`,
        contents: folderFile as JSONDocNode,
        pageTitle: node.name,
        frontmatter: {},
        tags: [],
        pageId: undefined,
        dontChangeParentPageId: false,
        contentType: "page",
        blogPostDate: undefined,
      };
    }
  }

  const childCommonPath = path.parse(
    node?.file?.absoluteFilePath ?? commonPath,
  ).dir;

  node.children.forEach((childNode) => processNode(childCommonPath, childNode));
};

export const createFolderStructure = (
  markdownFiles: MarkdownFile[],
  settings: ConfluenceSettings,
  allFiles?: MarkdownFile[],
): LocalAdfFileTreeNode => {
  // Use allFiles for commonPath calculation if provided to ensure consistent paths
  const pathFiles = allFiles || markdownFiles;
  const commonPath = findCommonPath(
    pathFiles.map((file) => file.absoluteFilePath),
  );
  const rootNode = createTreeNode(commonPath);

  // Build filename to page ID mapping for cross-references
  // Use allFiles if provided (for cross-references when publishing filtered files)
  const mappingFiles = allFiles || markdownFiles;
  const filenameToPageIdMap = buildFilenameToPageIdMap(mappingFiles);
  const filenameToSpaceKeyMap = buildFilenameToSpaceKeyMap(mappingFiles);

  markdownFiles.forEach((file) => {
    const relativePath = path.relative(commonPath, file.absoluteFilePath);
    addFileToTree(rootNode, file, relativePath, settings, filenameToPageIdMap, filenameToSpaceKeyMap);
  });

  processNode(commonPath, rootNode);

  checkUniquePageTitle(rootNode);

  return rootNode;
};

function checkUniquePageTitle(
  rootNode: LocalAdfFileTreeNode,
  pageTitles: Set<string> = new Set<string>(),
) {
  const currentPageTitle = rootNode.file?.pageTitle ?? "";

  if (pageTitles.has(currentPageTitle)) {
    throw new Error(
      `Page title "${currentPageTitle}" is not unique across all files.`,
    );
  }
  pageTitles.add(currentPageTitle);
  rootNode.children.forEach((child) => checkUniquePageTitle(child, pageTitles));
}
