import { ConfluenceSettings } from "../Settings";
import { SettingsLoader } from "./SettingsLoader";
export declare class CommandLineArgumentSettingsLoader extends SettingsLoader {
  getValue<T extends keyof ConfluenceSettings>(
    propertyKey: T,
    envVar: string,
  ): Partial<ConfluenceSettings>;
  loadPartial(): Partial<ConfluenceSettings>;
}
//# sourceMappingURL=CommandLineArgumentSettingsLoader.d.ts.map
