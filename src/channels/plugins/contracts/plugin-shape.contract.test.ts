import { beforeAll, describe, expect, it } from "vitest";
import { listBundledPackageChannelMetadata } from "../../../plugins/bundled-package-channel-metadata.js";
import {
  getBundledChannelPluginAsync,
  listBundledChannelPluginIds,
} from "./test-helpers/bundled-channel-plugin-loader.js";

const bundledChannelPluginIds = listBundledChannelPluginIds();
const packageMetadataById = new Map(
  listBundledPackageChannelMetadata().map((channel) => [channel.id, channel]),
);
describe("bundled channel plugin shape coherence", () => {
  const plugins = new Map<string, Awaited<ReturnType<typeof getBundledChannelPluginAsync>>>();

  beforeAll(async () => {
    for (const id of bundledChannelPluginIds) {
      plugins.set(id, await getBundledChannelPluginAsync(id));
    }
  });

  describe.each(bundledChannelPluginIds)("%s", (id) => {
    it("keeps runtime and lazy setup metadata on the same channel-owned contract", () => {
      const plugin = plugins.get(id);
      const packageSetup = packageMetadataById.get(id)?.setup;
      if (!plugin?.setup && !plugin?.setupContract && !packageSetup) {
        return;
      }
      expect(plugin?.setupContract, `${id} must expose setupContract`).toBeDefined();
      expect(
        plugin?.setup,
        `${id} must not duplicate the released legacy setup adapter`,
      ).toBeUndefined();
      expect(packageSetup, `${id} must expose package setup metadata`).toBeDefined();
      expect(plugin?.setupContract?.metadata).toEqual(packageSetup);
    });
  });
});
