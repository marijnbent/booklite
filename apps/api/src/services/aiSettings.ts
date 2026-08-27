import { config } from "../config";
import { getSetting } from "../db/client";
import { DEFAULT_OPENROUTER_MODEL } from "./aiConstants";

export { DEFAULT_OPENROUTER_MODEL } from "./aiConstants";

export interface OpenRouterSettings {
  openrouterEnabled: boolean;
  openrouterApiKey: string;
  openrouterModel: string;
}

export const resolveOpenRouterSettings = async (): Promise<OpenRouterSettings> => ({
  openrouterEnabled: await getSetting<boolean>("metadata_openrouter_enabled", false),
  openrouterApiKey: (config.openrouterApiKey ?? "").trim(),
  openrouterModel: (
    await getSetting<string>(
      "metadata_openrouter_model",
      DEFAULT_OPENROUTER_MODEL
    )
  ).trim()
});
