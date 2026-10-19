// Provider contract tests cover shared provider plugin behavior across bundled providers.
import { describeProviderContracts } from "../../plugin-sdk/test-helpers/provider-contract.js";
import { describeWebSearchProviderContracts } from "../../plugin-sdk/test-helpers/web-search-provider-contract.js";

for (const providerId of ["anthropic", "google", "openai", "openrouter"] as const) {
  describeProviderContracts(providerId);
}

for (const providerId of [
  "brave",
  "duckduckgo",
  "exa",
  "firecrawl",
  "google",
  "parallel",
  "perplexity",
  "tavily",
] as const) {
  describeWebSearchProviderContracts(providerId);
}
