import { ConfluenceSettings } from "../Settings";
import { SettingsLoader } from "./SettingsLoader";
export declare class ConfigFileSettingsLoader extends SettingsLoader {
  private configPath;
  constructor(configPath?: string);
  loadPartial(): Partial<ConfluenceSettings>;
}
//# sourceMappingURL=ConfigFileSettingsLoader.d.ts.map
