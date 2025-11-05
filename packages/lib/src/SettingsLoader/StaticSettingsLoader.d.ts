import { ConfluenceSettings } from "../Settings";
import { SettingsLoader } from "./SettingsLoader";
export declare class StaticSettingsLoader extends SettingsLoader {
  private settings;
  constructor(settings: Partial<ConfluenceSettings>);
  loadPartial(): Partial<ConfluenceSettings>;
}
//# sourceMappingURL=StaticSettingsLoader.d.ts.map
