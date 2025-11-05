import { Transformer } from "@atlaskit/editor-common/types";
import MarkdownIt from "markdown-it";
import { Schema, Node as PMNode } from "prosemirror-model";
export type Markdown = string;
export declare class MarkdownTransformer implements Transformer<Markdown> {
  private markdownParser;
  constructor(schema?: Schema, tokenizer?: MarkdownIt);
  encode(_node: PMNode): Markdown;
  parse(content: Markdown): PMNode;
}
//# sourceMappingURL=index.d.ts.map
