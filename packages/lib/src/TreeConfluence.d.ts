import { ConfluenceNode, LocalAdfFileTreeNode } from "./Publisher";
import { RequiredConfluenceClient, LoaderAdaptor } from "./adaptors";
import { ConfluenceSettings } from "./Settings";
export declare function ensureAllFilesExistInConfluence(
  confluenceClient: RequiredConfluenceClient,
  adaptor: LoaderAdaptor,
  node: LocalAdfFileTreeNode,
  spaceKey: string,
  parentPageId: string,
  topPageId: string,
  settings: ConfluenceSettings,
): Promise<ConfluenceNode[]>;
//# sourceMappingURL=TreeConfluence.d.ts.map
