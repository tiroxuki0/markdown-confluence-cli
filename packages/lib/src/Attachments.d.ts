/// <reference types="node" />
import { RequiredConfluenceClient, LoaderAdaptor } from "./adaptors";
export type ConfluenceImageStatus = "existing" | "uploaded";
export interface UploadedImageData {
  filename: string;
  id: string;
  collection: string;
  width: number;
  height: number;
  status: ConfluenceImageStatus;
}
export type CurrentAttachments = Record<
  string,
  {
    filehash: string;
    attachmentId: string;
    collectionName: string;
  }
>;
export declare function uploadBuffer(
  confluenceClient: RequiredConfluenceClient,
  pageId: string,
  uploadFilename: string,
  fileBuffer: Buffer,
  currentAttachments: Record<
    string,
    {
      filehash: string;
      attachmentId: string;
      collectionName: string;
    }
  >,
): Promise<UploadedImageData | null>;
export declare function uploadFile(
  confluenceClient: RequiredConfluenceClient,
  adaptor: LoaderAdaptor,
  pageId: string,
  pageFilePath: string,
  fileNameToUpload: string,
  currentAttachments: CurrentAttachments,
): Promise<UploadedImageData | null>;
//# sourceMappingURL=Attachments.d.ts.map
