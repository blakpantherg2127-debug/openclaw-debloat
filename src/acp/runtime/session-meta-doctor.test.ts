import fs from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
import { updateSessionEntry } from "../../config/sessions/session-accessor.js";
import { createPluginDoctorStateMigrationContext } from "../../infra/state-migrations.plugin-doctor-context.js";
import { sessionChanges } from "../../sessions/session-row-changes.js";
import { runOpenClawStateWriteTransaction } from "../../state/openclaw-state-db.js";
import { withOpenClawTestState } from "../../test-utils/openclaw-test-state.js";
import { buildAcpDatabaseSessionKey } from "./session-meta-keys.js";
import { readAcpSessionEntry, upsertAcpSessionMeta } from "./session-meta.js";

it("inspects without creating state and conditionally updates only the proven current owner", async () => {
  await withOpenClawTestState({ label: "acp-doctor-owner" }, async ({ env, stateDir }) => {
    const cfg = {
      agents: { ownership: "explicit" as const, entries: { main: {}, work: {} } },
      session: { scope: "global" as const },
    };
    const scope = { pluginId: "acpx", config: cfg, env };
    const readOnly = createPluginDoctorStateMigrationContext(scope);
    expect(readOnly.updateAcpSessionIdentity).toBeUndefined();
    expect(await readOnly.inspectAcpSessionClaims!()).toEqual({ claims: [], incomplete: [] });
    await expect(fs.access(path.join(stateDir, "state", "openclaw.sqlite"))).rejects.toThrow();
    for (const agentId of ["main", "work", "free-harness"]) {
      await upsertAcpSessionMeta({
        cfg,
        env,
        agentId,
        sessionKey: agentId === "free-harness" ? "agent:free-harness:acp:unrelated" : "global",
        mutate: () => ({
          backend: "acpx",
          agent: "fixture",
          mode: "persistent",
          runtimeSessionName: `old-${agentId}`,
          state: "idle",
          lastActivityAt: 10,
          identity: {
            state: "resolved",
            source: "ensure",
            lastUpdatedAt: 10,
            acpxRecordId: `record-${agentId}`,
            acpxSessionId: `upstream-${agentId}`,
          },
        }),
      });
    }
    // Legacy JSON retains the first duplicate in its promoted column until rewritten.
    runOpenClawStateWriteTransaction(
      ({ db }) => {
        db.prepare("UPDATE acp_sessions SET identity_json = ? WHERE session_key = ?").run(
          '{"state":"resolved","source":"ensure","lastUpdatedAt":10,"acpxRecordId":"record-work","acpxSessionId":"upstream-work","acpxSessionId":"normalized-work"}',
          buildAcpDatabaseSessionKey("global", "work"),
        );
      },
      { env },
    );
    const evidence = await readOnly.inspectAcpSessionClaims!();
    expect(evidence.incomplete).toEqual([]);
    expect(evidence.claims.map((claim) => claim.agentId).toSorted()).toEqual([
      "free-harness",
      "main",
      "work",
    ]);
    const claim = evidence.claims.find((item) => item.agentId === "work")!;
    let current = true;
    const assertCurrent = () => {
      if (!current) {
        throw new Error("maintenance owner expired");
      }
    };
    const repair = createPluginDoctorStateMigrationContext({
      ...scope,
      repairAuthority: { assertCurrent, assertOwnedInTransaction: assertCurrent },
    });
    const update = { claim, runtimeSessionName: "owned-work", acpxRecordId: "owned-record-work" };
    const changes: unknown[] = [];
    const unsubscribe = sessionChanges.subscribe((change) => changes.push(change));
    try {
      repair.updateAcpSessionIdentity!(update);
    } finally {
      unsubscribe();
    }
    expect(changes).toEqual([{ agentId: "work", sessionKey: "global" }]);
    expect(readAcpSessionEntry({ cfg, env, agentId: "work", sessionKey: "global" })?.acp).toEqual({
      ...claim.meta,
      runtimeSessionName: "owned-work",
      identity: { ...claim.meta.identity, acpxRecordId: "owned-record-work" },
    });
    expect(
      runOpenClawStateWriteTransaction(
        ({ db }) =>
          db
            .prepare("SELECT resume_acpx_session_id FROM acp_sessions WHERE session_key = ?")
            .get(buildAcpDatabaseSessionKey("global", "work")),
        { env },
      ),
    ).toEqual({
      resume_acpx_session_id: "normalized-work",
    });
    expect(
      readAcpSessionEntry({ cfg, env, agentId: "main", sessionKey: "global" })?.acp
        ?.runtimeSessionName,
    ).toBe("old-main");
    expect(() => repair.updateAcpSessionIdentity!(update)).toThrow("metadata changed");
    const latest = (await repair.inspectAcpSessionClaims!()).claims.find(
      (item) => item.agentId === "work",
    )!;
    await updateSessionEntry({ agentId: "work", sessionKey: "global", env }, () => ({
      sessionId: "replacement-session",
      lifecycleRevision: "replacement",
    }));
    expect((await repair.inspectAcpSessionClaims!()).incomplete).toEqual([
      expect.stringContaining("binding is absent or stale"),
    ]);
    expect(() => repair.updateAcpSessionIdentity!({ ...update, claim: latest })).toThrow(
      "metadata changed",
    );
    current = false;
    expect(() => repair.updateAcpSessionIdentity!({ ...update, claim: latest })).toThrow(
      "maintenance owner expired",
    );
  });
});

it.each(["agent:retired:main", "agent:retired:acp:binding:configured", "global", "acp:bare"])(
  "rejects a retired configured or fixed-store claim %s",
  async (sessionKey) => {
    await withOpenClawTestState({ label: "acp-doctor-retired" }, async ({ env, stateDir }) => {
      const cfg = {
        agents: {
          ownership: "explicit" as const,
          entries: { main: {}, retired: {} },
          defaults: { sessionStore: { agentId: "retired" } },
        },
        session: { store: path.join(stateDir, "sessions.json") },
      };
      await upsertAcpSessionMeta({
        cfg,
        env,
        agentId: "retired",
        sessionKey,
        mutate: () => ({
          backend: "acpx",
          agent: "fixture",
          runtimeSessionName: "old",
          mode: "persistent",
          state: "idle",
          lastActivityAt: 1,
        }),
      });
      const retired = { ...cfg, agents: { ...cfg.agents, entries: { main: {} } } };
      const evidence = await createPluginDoctorStateMigrationContext({
        pluginId: "acpx",
        config: retired,
        env,
      }).inspectAcpSessionClaims!();
      expect(evidence.claims).toEqual([]);
      expect(evidence.incomplete).toEqual([expect.stringContaining("retired")]);
    });
  },
);
