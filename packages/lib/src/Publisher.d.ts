import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import { ADFProcessingPlugin } from "./ADFProcessingPlugins/types";
import { PageContentType } from "./ConniePageConfig";
import { SettingsLoader } from "./SettingsLoader";
import { LoaderAdaptor, RequiredConfluenceClient } from "./adaptors";
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
  ancestors: {
    id: string;
  }[];
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
export declare class Publisher {
  private confluenceClient;
  private adaptor;
  private myAccountId;
  private settingsLoader;
  private adfProcessingPlugins;
  constructor(
    adaptor: LoaderAdaptor,
    settingsLoader: SettingsLoader,
    confluenceClient: RequiredConfluenceClient,
    adfProcessingPlugins: ADFProcessingPlugin<unknown, unknown>[],
  );
  publish(publishFilter?: string): Promise<FilePublishResult[]>;
  private publishFile;
  private updatePageContent;
}
export {};
//# sourceMappingURL=Publisher.d.ts.map
