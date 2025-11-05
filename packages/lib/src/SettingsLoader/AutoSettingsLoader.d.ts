import { ConfluenceSettings } from "../Settings";
import { SettingsLoader } from "./SettingsLoader";
export declare class AutoSettingsLoader extends SettingsLoader {
  private loaders;
  constructor(loaders?: SettingsLoader[]);
  private combineSettings;
  loadPartial(): Partial<ConfluenceSettings>;
}
//# sourceMappingURL=AutoSettingsLoader.d.ts.map
