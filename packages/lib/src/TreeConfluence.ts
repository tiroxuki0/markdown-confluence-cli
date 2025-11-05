import {
  ConfluenceAdfFile,
  ConfluenceNode,
  ConfluenceTreeNode,
  LocalAdfFile,
  LocalAdfFileTreeNode,
} from "./Publisher";
import { doc, p } from "@atlaskit/adf-utils/builders";
import { RequiredConfluenceClient, LoaderAdaptor } from "./adaptors";
import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import { prepareAdfToUpload } from "./AdfProcessing";
import { ConfluenceSettings } from "./Settings";

const blankPageAdf: string = JSON.stringify(doc(p("Page not published yet")));

function flattenTree(
  node: ConfluenceTreeNode,
  ancestors: string[] = [],
): ConfluenceNode[] {
  const nodes: ConfluenceNode[] = [];
  const { file, version, lastUpdatedBy, existingPageData, children } = node;

  // Always include the node, regardless of ancestors (for counting purposes)
  nodes.push({
    file,
    version,
    lastUpdatedBy,
    existingPageData,
    ancestors,
  });

  if (children) {
    children.forEach((child) => {
      nodes.push(...flattenTree(child, [...ancestors, file.pageId]));
    });
  }

  return nodes;
}

export async function ensureAllFilesExistInConfluence(
  confluenceClient: RequiredConfluenceClient,
  adaptor: LoaderAdaptor,
  node: LocalAdfFileTreeNode,
  spaceKey: string,
  parentPageId: string,
  topPageId: string,
  settings: ConfluenceSettings,
): Promise<ConfluenceNode[]> {
  // For root node, always create page (force publish all files including root)
  const shouldCreateRootPage = !!node.file;
  const confluenceNode = await createFileStructureInConfluence(
    settings,
    confluenceClient,
    adaptor,
    node,
    spaceKey,
    parentPageId,
    topPageId,
    shouldCreateRootPage,
  );

  const pages = flattenTree(confluenceNode);

  prepareAdfToUpload(pages, settings);

  return pages;
}

async function createFileStructureInConfluence(
  settings: ConfluenceSettings,
  confluenceClient: RequiredConfluenceClient,
  adaptor: LoaderAdaptor,
  node: LocalAdfFileTreeNode,
  spaceKey: string,
  parentPageId: string,
  topPageId: string,
  createPage: boolean,
): Promise<ConfluenceTreeNode> {
  if (!node.file) {
    throw new Error("Missing file on node");
  }

  let version: number;
  let adfContent: JSONDocNode | undefined;
  let pageTitle = "";
  let contentType = "page";
  let ancestors: { id: string }[] = [];
  let lastUpdatedBy: string | undefined;
  const file: ConfluenceAdfFile = {
    ...node.file,
    pageId: node.file.pageId || "", // Keep undefined as empty string - ensurePageExists will handle creating new page
    spaceKey,
    pageUrl: "",
  };

  if (createPage) {
    // Use file with pageId from the original file (not fallback to parent)
    const fileToCheck: LocalAdfFile = {
      ...node.file,
      pageId: file.pageId, // Use pageId from the constructed file
    };
    const pageDetails = await ensurePageExists(
      confluenceClient,
      adaptor,
      fileToCheck,
      spaceKey,
      parentPageId,
      topPageId,
    );
    file.pageId = pageDetails.id;
    file.spaceKey = pageDetails.spaceKey;
    version = pageDetails.version;
    adfContent = JSON.parse(pageDetails.existingAdf ?? "{}") as JSONDocNode;
    pageTitle = pageDetails.pageTitle;
    ancestors = pageDetails.ancestors;
    lastUpdatedBy = pageDetails.lastUpdatedBy;
    contentType = pageDetails.contentType;
  } else {
    version = 0;
    adfContent = doc(p());
    pageTitle = "";
    ancestors = [];
    contentType = "page";
  }

  const childDetailsTasks = node.children.map((childNode) => {
    // Force create all child pages too
    return createFileStructureInConfluence(
      settings,
      confluenceClient,
      adaptor,
      childNode,
      spaceKey,
      file.pageId,
      topPageId,
      true, // Always create child pages
    );
  });

  const childDetails = await Promise.all(childDetailsTasks);

  const pageUrl = `${settings.confluenceBaseUrl}/wiki/spaces/${spaceKey}/pages/${file.pageId}/`;
  return {
    file: { ...file, pageUrl },
    version,
    lastUpdatedBy: lastUpdatedBy ?? "",
    children: childDetails,
    existingPageData: {
      adfContent,
      pageTitle,
      ancestors,
      contentType,
    },
  };
}

async function ensurePageExists(
  confluenceClient: RequiredConfluenceClient,
  adaptor: LoaderAdaptor,
  file: LocalAdfFile,
  spaceKey: string,
  parentPageId: string,
  topPageId: string,
) {
  if (file.pageId) {
    // Try to fetch by ID first
    try {
      const contentById = await confluenceClient.content.getContentById({
        id: file.pageId,
        expand: ["version", "body.atlas_doc_format", "ancestors", "space"],
      });

      if (!contentById.space?.key) {
        throw new Error("Missing Space Key");
      }

      // If pageId matches topPageId, it's the root page - skip ancestor check
      // Otherwise, verify the page is in the correct tree
      // Convert to string for comparison to handle number/string mismatches
      const filePageIdStr = String(file.pageId);
      const topPageIdStr = String(topPageId);

      if (filePageIdStr !== topPageIdStr && file.contentType === "page") {
        const isInTree =
          String(contentById.id) === topPageIdStr ||
          contentById.ancestors?.some(
            (ancestor) => String(ancestor.id) === topPageIdStr,
          );
        if (!isInTree) {
          throw new Error(
            `${file.pageTitle} (pageId: ${file.pageId}) is outside the page tree from the selected top page (${topPageId})`,
          );
        }
      }

      await adaptor.updateMarkdownValues(file.absoluteFilePath, {
        publish: true,
        pageId: contentById.id,
      });

      return {
        id: contentById.id,
        title: file.pageTitle,
        version: contentById?.version?.number ?? 1,
        lastUpdatedBy: contentById?.version?.by?.accountId ?? "NO ACCOUNT ID",
        existingAdf: contentById?.body?.atlas_doc_format?.value,
        spaceKey: contentById.space.key,
        pageTitle: contentById.title,
        ancestors:
          contentById.ancestors?.map((ancestor) => ({
            id: ancestor.id,
          })) ?? [],
        contentType: contentById.type,
      } as const;
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        "response" in error &&
        typeof error.response === "object" &&
        error.response &&
        "status" in error.response &&
        typeof error.response.status === "number" &&
        error.response.status === 404
      ) {
        // Page not found by ID - clear pageId and fall through to search by title
        await adaptor.updateMarkdownValues(file.absoluteFilePath, {
          publish: false,
          pageId: undefined,
        });
        // Continue to search by title instead of throwing
      } else {
        // For other errors, rethrow
        throw error;
      }
    }
  }

  const searchParams = {
    type: file.contentType,
    spaceKey,
    title: file.pageTitle,
    expand: ["version", "body.atlas_doc_format", "ancestors"],
  };
  const contentByTitle = await confluenceClient.content.getContent(
    searchParams,
  );

  const currentPage = contentByTitle.results[0];

  if (currentPage) {
    // If file has pageId from frontmatter, verify it matches the found page
    if (file.pageId && String(currentPage.id) !== String(file.pageId)) {
      // Page found by title doesn't match pageId from frontmatter - this could cause conflicts
      // Try to find the correct page by ID first
      throw new Error(
        `Page "${file.pageTitle}" found by title (ID: ${currentPage.id}) doesn't match pageId from frontmatter (${file.pageId}). There may be multiple pages with the same title.`,
      );
    }

    // Check if this is the root page or if it's in the tree
    const topPageIdStr = String(topPageId);
    const isRootPage = String(currentPage.id) === topPageIdStr;
    const isInTree =
      isRootPage ||
      currentPage.ancestors?.some(
        (ancestor) => String(ancestor.id) === topPageIdStr,
      );

    if (file.contentType === "page" && !isInTree) {
      throw new Error(
        `${file.pageTitle} is trying to overwrite a page outside the page tree from the selected top page`,
      );
    }

    await adaptor.updateMarkdownValues(file.absoluteFilePath, {
      publish: true,
      pageId: currentPage.id,
    });
    return {
      id: currentPage.id,
      title: file.pageTitle,
      version: currentPage.version?.number ?? 1,
      lastUpdatedBy: currentPage.version?.by?.accountId ?? "NO ACCOUNT ID",
      existingAdf: currentPage.body?.atlas_doc_format?.value,
      pageTitle: currentPage.title,
      spaceKey,
      ancestors:
        currentPage.ancestors?.map((ancestor) => ({
          id: ancestor.id,
        })) ?? [],
      contentType: currentPage.type,
    } as const;
  } else {
    // No page found by ID or title - create new page
    const creatingBlankPageRequest = {
      space: { key: spaceKey },
      ...(file.contentType === "page"
        ? { ancestors: [{ id: parentPageId }] }
        : {}),
      title: file.pageTitle,
      type: file.contentType,
      body: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        atlas_doc_format: {
          value: blankPageAdf,
          representation: "atlas_doc_format",
        },
      },
      expand: ["version", "body.atlas_doc_format", "ancestors"],
    };
    const pageDetails = await confluenceClient.content.createContent(
      creatingBlankPageRequest,
    );

    await adaptor.updateMarkdownValues(file.absoluteFilePath, {
      publish: true,
      pageId: pageDetails.id,
    });
    return {
      id: pageDetails.id,
      title: file.pageTitle,
      version: pageDetails.version?.number ?? 1,
      lastUpdatedBy: pageDetails.version?.by?.accountId ?? "NO ACCOUNT ID",
      existingAdf: pageDetails.body?.atlas_doc_format?.value,
      pageTitle: pageDetails.title,
      ancestors:
        pageDetails.ancestors?.map((ancestor) => ({
          id: ancestor.id,
        })) ?? [],
      spaceKey,
      contentType: pageDetails.type,
    } as const;
  }
}
