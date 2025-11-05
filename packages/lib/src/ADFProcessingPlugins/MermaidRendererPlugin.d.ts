/// <reference types="node" />
import { UploadedImageData } from "../Attachments";
import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import { ADFProcessingPlugin, PublisherFunctions } from "./types";
export declare function getMermaidFileName(
  mermaidContent: string | undefined,
): {
  uploadFilename: string;
  mermaidText: string;
};
export interface ChartData {
  name: string;
  data: string;
}
export interface MermaidRenderer {
  captureMermaidCharts(charts: ChartData[]): Promise<Map<string, Buffer>>;
}
export declare class MermaidRendererPlugin
  implements
    ADFProcessingPlugin<ChartData[], Record<string, UploadedImageData | null>>
{
  private mermaidRenderer;
  constructor(mermaidRenderer: MermaidRenderer);
  extract(adf: JSONDocNode): ChartData[];
  transform(
    mermaidNodesToUpload: ChartData[],
    supportFunctions: PublisherFunctions,
  ): Promise<Record<string, UploadedImageData | null>>;
  load(
    adf: JSONDocNode,
    imageMap: Record<string, UploadedImageData | null>,
  ): JSONDocNode;
}
//# sourceMappingURL=MermaidRendererPlugin.d.ts.map
