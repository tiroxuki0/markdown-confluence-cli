import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import { MarkdownFile } from "./adaptors";
import { LocalAdfFile } from "./Publisher";
import { ConfluenceSettings } from "./Settings";
export declare function parseMarkdownToADF(
  markdown: string,
  confluenceBaseUrl: string,
): JSONDocNode;
export declare function convertMDtoADF(
  file: MarkdownFile,
  settings: ConfluenceSettings,
): LocalAdfFile;
//# sourceMappingURL=MdToADF.d.ts.map
