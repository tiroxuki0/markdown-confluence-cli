/// <reference types="node" />
import { CurrentAttachments, UploadedImageData } from "../Attachments";
import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import { LoaderAdaptor, RequiredConfluenceClient } from "../adaptors";
export interface PublisherFunctions {
  uploadBuffer(
    uploadFilename: string,
    fileBuffer: Buffer,
  ): Promise<UploadedImageData | null>;
  uploadFile(fileNameToUpload: string): Promise<UploadedImageData | null>;
}
export interface ADFProcessingPlugin<E, T> {
  extract(adf: JSONDocNode, supportFunctions: PublisherFunctions): E;
  transform(items: E, supportFunctions: PublisherFunctions): Promise<T>;
  load(
    adf: JSONDocNode,
    transformedItems: T,
    supportFunctions: PublisherFunctions,
  ): JSONDocNode;
}
export declare function createPublisherFunctions(
  confluenceClient: RequiredConfluenceClient,
  adaptor: LoaderAdaptor,
  pageId: string,
  pageFilePath: string,
  currentAttachments: CurrentAttachments,
): PublisherFunctions;
export declare function executeADFProcessingPipeline(
  plugins: ADFProcessingPlugin<unknown, unknown>[],
  adf: JSONDocNode,
  supportFunctions: PublisherFunctions,
): Promise<JSONDocNode>;
//# sourceMappingURL=types.d.ts.map
