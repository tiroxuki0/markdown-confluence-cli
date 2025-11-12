import * as path from "path";
import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import { AlwaysADFProcessingPlugins } from "./ADFProcessingPlugins";
import {
  ADFProcessingPlugin,
  createPublisherFunctions,
  executeADFProcessingPipeline,
} from "./ADFProcessingPlugins/types";
import { adfEqual } from "./AdfEqual";
import { CurrentAttachments } from "./Attachments";
import { PageContentType } from "./ConniePageConfig";
import { SettingsLoader } from "./SettingsLoader";
import { ensureAllFilesExistInConfluence } from "./TreeConfluence";
import { createFolderStructure as createLocalAdfTree } from "./TreeLocal";
import { LoaderAdaptor, RequiredConfluenceClient } from "./adaptors";
import { isEqual } from "./isEqual";

export interface LocalAdfFileTreeNode {
  name: string;
  children: LocalAdfFileTreeNode[];
  file?: LocalAdfFile;
}

interface FilePublishResult {
  successfulUploadResult?: UploadAdfFileResult;
  node: ConfluenceNode;
  reason?: string;
}

export interface LocalAdfFile {
  folderName: string;
  absoluteFilePath: string;
  fileName: string;
  contents: JSONDocNode;
  pageTitle: string;
  frontmatter: {
    [key: string]: unknown;
  };
  tags: string[];
  pageId: string | undefined;
  dontChangeParentPageId: boolean;
  contentType: PageContentType;
  blogPostDate: string | undefined;
}

export interface ConfluenceAdfFile {
  folderName: string;
  absoluteFilePath: string;
  fileName: string;
  contents: JSONDocNode;
  pageTitle: string;
  frontmatter: {
    [key: string]: unknown;
  };
  tags: string[];
  dontChangeParentPageId: boolean;

  pageId: string;
  spaceKey: string;
  pageUrl: string;

  contentType: PageContentType;
  blogPostDate: string | undefined;
}

interface ConfluencePageExistingData {
  adfContent: JSONDocNode;
  pageTitle: string;
  ancestors: { id: string }[];
  contentType: string;
}

export interface ConfluenceNode {
  file: ConfluenceAdfFile;
  version: number;
  lastUpdatedBy: string;
  existingPageData: ConfluencePageExistingData;
  ancestors: string[];
}

export interface ConfluenceTreeNode {
  file: ConfluenceAdfFile;
  version: number;
  lastUpdatedBy: string;
  existingPageData: ConfluencePageExistingData;
  children: ConfluenceTreeNode[];
}

export interface UploadAdfFileResult {
  adfFile: ConfluenceAdfFile;
  contentResult: "same" | "updated";
  imageResult: "same" | "updated";
  labelResult: "same" | "updated";
}

export class Publisher {
  private confluenceClient: RequiredConfluenceClient;
  private adaptor: LoaderAdaptor;
  private myAccountId: string | undefined;
  private settingsLoader: SettingsLoader;
  private adfProcessingPlugins: ADFProcessingPlugin<unknown, unknown>[];

  constructor(
    adaptor: LoaderAdaptor,
    settingsLoader: SettingsLoader,
    confluenceClient: RequiredConfluenceClient,
    adfProcessingPlugins: ADFProcessingPlugin<unknown, unknown>[],
  ) {
    this.adaptor = adaptor;
    this.settingsLoader = settingsLoader;

    this.confluenceClient = confluenceClient;
    this.adfProcessingPlugins = adfProcessingPlugins.concat(
      AlwaysADFProcessingPlugins,
    );
  }

  async publish(publishFilter?: string) {
    const settings = this.settingsLoader.load();

    if (!this.myAccountId) {
      const currentUser = await this.confluenceClient.users.getCurrentUser();
      this.myAccountId = currentUser.accountId;
    }

    const parentPage = await this.confluenceClient.content.getContentById({
      id: settings.confluenceParentId,
      expand: ["body.atlas_doc_format", "space"],
    });
    if (!parentPage.space) {
      throw new Error("Missing Space Key");
    }

    const spaceToPublishTo = parentPage.space;

    const allFiles = await this.adaptor.getMarkdownFilesToUpload();

    // Apply filter BEFORE building tree to avoid checking unrelated files
    let filesToProcess = allFiles;
    if (publishFilter) {
      // Handle different filter formats: absolute path, relative path, or filename
      filesToProcess = allFiles.filter((file) => {
        // Exact absolute path match
        if (file.absoluteFilePath === publishFilter) {
          return true;
        }

        // Filename match (just the basename)
        const fileBasename = path.basename(file.absoluteFilePath);
        if (fileBasename === publishFilter || fileBasename === publishFilter + '.md') {
          return true;
        }

        // Relative path match within contentRoot
        if (!path.isAbsolute(publishFilter)) {
          const resolvedFilter = path.resolve(settings.contentRoot, publishFilter);
          if (file.absoluteFilePath === resolvedFilter) {
            return true;
          }
        }

        // Check if publishFilter is a relative path from contentRoot
        const relativeToContentRoot = path.relative(settings.contentRoot, file.absoluteFilePath);
        if (relativeToContentRoot === publishFilter || relativeToContentRoot === publishFilter + '.md') {
          return true;
        }

        return false;
      });
    }

    // Build tree with filtered files, but pass all files for cross-references
    const folderTree = createLocalAdfTree(filesToProcess, settings, allFiles);
    let confluencePagesToPublish = await ensureAllFilesExistInConfluence(
      this.confluenceClient,
      this.adaptor,
      folderTree,
      spaceToPublishTo.key,
      parentPage.id,
      parentPage.id,
      settings,
    );

    // Additional filter after tree building (for exact match)
    if (publishFilter) {
      confluencePagesToPublish = confluencePagesToPublish.filter(
        (file) => file.file.absoluteFilePath === publishFilter,
      );
    }

    const adrFileTasks = confluencePagesToPublish.map((file) => {
      return this.publishFile(file);
    });

    const adrFiles = await Promise.all(adrFileTasks);
    return adrFiles;
  }

  private async publishFile(node: ConfluenceNode): Promise<FilePublishResult> {
    try {
      const successfulUploadResult = await this.updatePageContent(
        node.ancestors,
        node.version,
        node.existingPageData,
        node.file,
        node.lastUpdatedBy,
      );

      return {
        node,
        successfulUploadResult,
      };
    } catch (e: unknown) {
      if (e instanceof Error) {
        return {
          node,
          reason: e.message,
        };
      }

      return {
        node,
        reason: JSON.stringify(e), // TODO: Understand why this doesn't show error message properly
      };
    }
  }

  private async updatePageContent(
    ancestors: string[],
    pageVersionNumber: number,
    existingPageData: ConfluencePageExistingData,
    adfFile: ConfluenceAdfFile,
    lastUpdatedBy: string,
  ): Promise<UploadAdfFileResult> {
    // Check version conflict - but allow update if page was pulled (has pageId from frontmatter)
    // In that case, we'll use the current version from Confluence instead of blocking
    if (lastUpdatedBy !== this.myAccountId) {
      // If page was pulled, fetch current version and use it instead of blocking
      if (adfFile.pageId) {
        try {
          const currentPage =
            await this.confluenceClient.content.getContentById({
              id: adfFile.pageId,
              expand: ["version"],
            });
          // Use current version from Confluence (may have been updated by another user)
          pageVersionNumber = currentPage.version?.number ?? pageVersionNumber;
          console.warn(
            `Warning: Page ${adfFile.pageTitle} was updated by another user (${lastUpdatedBy}). Using current version ${pageVersionNumber} to update.`,
          );
        } catch (error) {
          // If fetch fails, still block to prevent overwriting
          throw new Error(
            `Page last updated by another user. Won't publish over their changes. MyAccountId: ${this.myAccountId}, Last Updated By: ${lastUpdatedBy}`,
          );
        }
      } else {
        // No pageId - this is a new page or page not found, block update
        throw new Error(
          `Page last updated by another user. Won't publish over their changes. MyAccountId: ${this.myAccountId}, Last Updated By: ${lastUpdatedBy}`,
        );
      }
    }
    if (existingPageData.contentType !== adfFile.contentType) {
      throw new Error(
        `Cannot convert between content types. From ${existingPageData.contentType} to ${adfFile.contentType}`,
      );
    }

    const result: UploadAdfFileResult = {
      adfFile,
      contentResult: "same",
      imageResult: "same",
      labelResult: "same",
    };

    const currentUploadedAttachments =
      await this.confluenceClient.contentAttachments.getAttachments({
        id: adfFile.pageId,
      });

    const currentAttachments: CurrentAttachments =
      currentUploadedAttachments.results.reduce((prev, curr) => {
        return {
          ...prev,
          [`${curr.title}`]: {
            filehash: curr.metadata.comment,
            attachmentId: curr.extensions.fileId,
            collectionName: curr.extensions.collectionName,
          },
        };
      }, {});

    const supportFunctions = createPublisherFunctions(
      this.confluenceClient,
      this.adaptor,
      adfFile.pageId,
      adfFile.absoluteFilePath,
      currentAttachments,
    );
    const adfToUpload = await executeADFProcessingPipeline(
      this.adfProcessingPlugins,
      adfFile.contents,
      supportFunctions,
    );

    /*
		const imageResult = Object.keys(imageUploadResult.imageMap).reduce(
			(prev, curr) => {
				const value = imageUploadResult.imageMap[curr];
				if (!value) {
					return prev;
				}
				const status = value.status;
				return {
					...prev,
					[status]: (prev[status] ?? 0) + 1,
				};
			},
			{
				existing: 0,
				uploaded: 0,
			} as Record<string, number>
		);
		*/

    /*
		if (!adfEqual(adfFile.contents, imageUploadResult.adf)) {
			result.imageResult =
				(imageResult["uploaded"] ?? 0) > 0 ? "updated" : "same";
		}
		*/

    result.imageResult = "updated";

    const existingPageDetails = {
      title: existingPageData.pageTitle,
      type: existingPageData.contentType,
      ...(adfFile.contentType === "blogpost" || adfFile.dontChangeParentPageId
        ? {}
        : { ancestors: existingPageData.ancestors }),
    };

    // Use existing page title from Confluence to avoid "title already exists" errors
    // when updating pages that were pulled from Confluence
    const newPageDetails = {
      title: existingPageData.pageTitle,
      type: adfFile.contentType,
      ...(adfFile.contentType === "blogpost" || adfFile.dontChangeParentPageId
        ? {}
        : {
            ancestors: ancestors.map((ancestor) => ({
              id: ancestor,
            })),
          }),
    };

    if (
      !adfEqual(existingPageData.adfContent, adfToUpload) ||
      !isEqual(existingPageDetails, newPageDetails)
    ) {
      result.contentResult = "updated";

      const updateContentDetails = {
        ...newPageDetails,
        id: adfFile.pageId,
        version: { number: pageVersionNumber + 1 },
        body: {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          atlas_doc_format: {
            value: JSON.stringify(adfToUpload),
            representation: "atlas_doc_format",
          },
        },
      };
      await this.confluenceClient.content.updateContent(updateContentDetails);
    }

    const getLabelsForContent = {
      id: adfFile.pageId,
    };
    const currentLabels =
      await this.confluenceClient.contentLabels.getLabelsForContent(
        getLabelsForContent,
      );

    for (const existingLabel of currentLabels.results) {
      if (!adfFile.tags.includes(existingLabel.label)) {
        result.labelResult = "updated";
        await this.confluenceClient.contentLabels.removeLabelFromContentUsingQueryParameter(
          {
            id: adfFile.pageId,
            name: existingLabel.name,
          },
        );
      }
    }

    const labelsToAdd = [];
    for (const newLabel of adfFile.tags) {
      if (
        currentLabels.results.findIndex((item) => item.label === newLabel) ===
        -1
      ) {
        labelsToAdd.push({
          prefix: "global",
          name: newLabel,
        });
      }
    }

    if (labelsToAdd.length > 0) {
      result.labelResult = "updated";
      await this.confluenceClient.contentLabels.addLabelsToContent({
        id: adfFile.pageId,
        body: labelsToAdd,
      });
    }

    return result;
  }
}
