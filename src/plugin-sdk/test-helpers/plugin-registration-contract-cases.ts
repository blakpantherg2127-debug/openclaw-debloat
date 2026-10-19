/**
 * Installs bundled plugin registration contract cases used across provider tests.
 */
import type { PluginRegistrationContractParams } from "./plugin-registration-contract.js";

export const pluginRegistrationContractCases = {
  anthropic: {
    pluginId: "anthropic",
    providerIds: ["anthropic"],
    mediaUnderstandingProviderIds: ["anthropic"],
    cliBackendIds: ["claude-cli"],
  },
  brave: {
    pluginId: "brave",
    webSearchProviderIds: ["brave"],
  },
  duckduckgo: {
    pluginId: "duckduckgo",
    webSearchProviderIds: ["duckduckgo"],
  },
  exa: {
    pluginId: "exa",
    webSearchProviderIds: ["exa"],
  },
  firecrawl: {
    pluginId: "firecrawl",
    webFetchProviderIds: ["firecrawl"],
    webSearchProviderIds: ["firecrawl", "firecrawl-free"],
    toolNames: ["firecrawl_search", "firecrawl_scrape"],
  },
  google: {
    pluginId: "google",
    providerIds: ["google", "google-gemini-cli", "google-vertex"],
    webSearchProviderIds: ["gemini"],
    realtimeVoiceProviderIds: ["google"],
    speechProviderIds: ["google"],
    mediaUnderstandingProviderIds: ["google"],
    imageGenerationProviderIds: ["google"],
    videoGenerationProviderIds: ["google"],
  },
  openai: {
    pluginId: "openai",
    providerIds: ["openai"],
    speechProviderIds: ["openai"],
    realtimeTranscriptionProviderIds: ["openai"],
    realtimeVoiceProviderIds: ["openai"],
    mediaUnderstandingProviderIds: ["openai"],
    imageGenerationProviderIds: ["openai"],
  },
  openrouter: {
    pluginId: "openrouter",
    providerIds: ["openrouter"],
    mediaUnderstandingProviderIds: ["openrouter"],
    imageGenerationProviderIds: ["openrouter"],
    musicGenerationProviderIds: ["openrouter"],
    videoGenerationProviderIds: ["openrouter"],
  },
  parallel: {
    pluginId: "parallel",
    webSearchProviderIds: ["parallel", "parallel-free"],
  },
  perplexity: {
    pluginId: "perplexity",
    webSearchProviderIds: ["perplexity"],
  },
  tavily: {
    pluginId: "tavily",
    webSearchProviderIds: ["tavily"],
    toolNames: ["tavily_search", "tavily_extract"],
  },
} satisfies Record<string, PluginRegistrationContractParams>;
