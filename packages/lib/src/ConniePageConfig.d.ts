import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import { ConfluenceSettings } from "./Settings";
import { MarkdownFile } from "./adaptors";
export type PageContentType = "page" | "blogpost";
export type ConfluencePerPageConfig = {
  publish: FrontmatterConfig<boolean, "boolean">;
  pageTitle: FrontmatterConfig<string, "text">;
  frontmatterToPublish: FrontmatterConfig<string[], "array-text">;
  tags: FrontmatterConfig<string[], "array-text">;
  pageId: FrontmatterConfig<string | undefined, "text">;
  dontChangeParentPageId: FrontmatterConfig<boolean, "boolean">;
  blogPostDate: FrontmatterConfig<string | undefined, "text">;
  contentType: FrontmatterConfig<PageContentType, "options">;
};
export type InputType = "text" | "array-text" | "boolean" | "options";
export type InputValidator<IN> = (value: IN) => {
  valid: boolean;
  errors: Error[];
};
interface FrontmatterConfigBase<OUT> {
  key: string;
  default: OUT;
  alwaysProcess?: boolean;
  process: ProcessFunction<unknown, OUT>;
  inputType: InputType;
  inputValidator: InputValidator<unknown>;
}
type FrontmatterConfigOptions<OUT, T extends InputType> = T extends "options"
  ? {
      selectOptions: OUT[];
    }
  : unknown;
export type FrontmatterConfig<
  OUT,
  T extends InputType,
> = FrontmatterConfigBase<OUT> & FrontmatterConfigOptions<OUT, T>;
type ProcessFunction<IN, OUT> = (
  value: IN,
  markdownFile: MarkdownFile,
  alreadyParsed: Partial<ConfluencePerPageValues>,
  settings: ConfluenceSettings,
  adfContent: JSONDocNode,
) => OUT | Error;
export type ConfluencePerPageAllValues = {
  [K in keyof ConfluencePerPageConfig]: ConfluencePerPageConfig[K]["default"];
};
type excludedProperties = "frontmatterToPublish";
export type ConfluencePerPageValues = Omit<
  {
    [K in keyof ConfluencePerPageConfig]: ConfluencePerPageConfig[K]["default"];
  },
  excludedProperties
>;
export declare const conniePerPageConfig: ConfluencePerPageConfig;
export declare function processConniePerPageConfig(
  markdownFile: MarkdownFile,
  settings: ConfluenceSettings,
  adfContent: JSONDocNode,
): ConfluencePerPageValues;
export {};
//# sourceMappingURL=ConniePageConfig.d.ts.map
