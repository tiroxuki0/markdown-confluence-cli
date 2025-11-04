import { ConfluenceSettings } from "../Settings";
import { BinaryFile, FilesToUpload, LoaderAdaptor, MarkdownFile } from ".";
import { ConfluencePerPageAllValues } from "../ConniePageConfig";
export declare class FileSystemAdaptor implements LoaderAdaptor {
    settings: ConfluenceSettings;
    constructor(settings: ConfluenceSettings);
    getFileContent(absoluteFilePath: string): Promise<{
        data: {
            [key: string]: any;
        };
        content: string;
    }>;
    updateMarkdownValues(absoluteFilePath: string, values: Partial<ConfluencePerPageAllValues>): Promise<void>;
    loadMarkdownFile(absoluteFilePath: string): Promise<MarkdownFile>;
    loadMarkdownFiles(folderPath: string): Promise<MarkdownFile[]>;
    getMarkdownFilesToUpload(): Promise<FilesToUpload>;
    readBinary(searchPath: string, referencedFromFilePath: string): Promise<BinaryFile | false>;
    private findClosestFile;
}
//# sourceMappingURL=filesystem.d.ts.map