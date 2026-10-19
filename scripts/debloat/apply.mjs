#!/usr/bin/env node
// Idempotent fork debloat: removes the component groups marked `apply: true` below and
// prunes every inventory that would otherwise point at them. Re-run after each upstream sync:
//   scripts/debloat/apply.sh            # apply all enabled groups, regenerate, reinstall
//   scripts/debloat/apply.sh --dry-run  # list what would be removed
//   scripts/debloat/apply.sh --only channels,providers
// Groups with `apply: false` were tried and kept; `reason` records why (see DEBLOAT_LOG.md).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Gateway send and plugin-approval suites whose synthetic channel fixture used the "slack" id
// (channels group edit, DEBLOAT_LOG.md 3.2).
const SEND_SLACK_FIXTURE_FILES = [
  "src/gateway/server-methods/send.delivery-attempt.test-support.ts",
  "src/gateway/server-methods/send.session-routing.test-support.ts",
  "src/gateway/server-methods/send.test.ts",
  "src/gateway/server-methods/send.upload-policy.test-support.ts",
  "src/infra/plugin-approval-forwarder.test.ts",
];

// Plugin ids follow the extension directory name (extensions/<id>).
export const GROUPS = [
  {
    id: "channels",
    apply: true,
    description: "every chat channel plugin except telegram",
    extensions: [
      "a2a",
      "buzz",
      "clickclack",
      "discord",
      "feishu",
      "googlechat",
      "imessage",
      "irc",
      "line",
      "matrix",
      "mattermost",
      "msteams",
      "nextcloud-talk",
      "nostr",
      "raft",
      "reef",
      "signal",
      "slack",
      "sms",
      "synology-chat",
      "tlon",
      "twitch",
      "whatsapp",
      "x",
      "zalo",
      "zalouser",
      // QA harness whose live transports import the removed channel plugins; source-only.
      "qa-lab",
    ],
    // QA Lab scenario modules; they only run inside the removed qa-lab plugin.
    paths: ["test/e2e/qa-lab"],
    // Tests that exercise the removed channels through bundled ids, generated channel metadata,
    // or source reads of their files (found by the core test set; see DEBLOAT_LOG.md 2.1).
    testFiles: [
      "src/channels/message-access/context-builder-callers.test.ts",
      "src/channels/message-access/discord-native-acp-owner.test.ts",
      "src/channels/message-access/discord-native-owner.test.ts",
      "src/channels/plugins/account-config-mutation.msteams.test.ts",
      "src/plugins/compat/registry.test.ts",
      "src/plugins/registry-runtime.twitch-ingress.test.ts",
      "src/plugins/runtime-live-state-guardrails.test.ts",
      // Full-suite run on the final branch (DEBLOAT_LOG.md 3.2).
      "src/agents/channel-tools.line.test.ts",
      "src/agents/openclaw-tools.session-context.test.ts",
      "src/agents/subagents/announce/subagent-announce-delivery.discord-thread.test.ts",
      "src/auto-reply/reply/commands-config.owner.test.ts",
      "src/auto-reply/reply/route-reply.imessage.test.ts",
      "src/channels/plugins/contracts/channel-catalog.contract.test.ts",
      "src/channels/plugins/contracts/gateway-auth-artifact.contract.test.ts",
      "src/channels/plugins/contracts/mattermost-read-authority.contract.test.ts",
      "src/channels/plugins/contracts/message-tool-artifact.contract.test.ts",
      "src/channels/plugins/contracts/session-binding.registry-backed.contract.test.ts",
      "src/channels/plugins/contracts/session-key-artifact.contract.test.ts",
      "src/channels/plugins/contracts/thread-binding-artifact.contract.test.ts",
      "src/commands/agents.identity.persistence.test.ts",
      "src/commands/doctor-command-owner-route.test.ts",
      "src/commands/doctor-config-flow.webhook-deferral.test.ts",
      "src/gateway/conversation-list.account-removal.test.ts",
      "src/gateway/server-instance-runtime.approvals.test.ts",
      "src/gateway/server-methods/send.discord-request-authority.integration.test.ts",
      "src/gateway/server-methods/send.scheduled-reads.integration.test.ts",
      "src/gateway/server.approval-forwarding.test.ts",
      "src/gateway/server.qa-lab-rpc-replay.test.ts",
      "src/gateway/session-row-projection.config-commits.test.ts",
      "src/infra/outbound/conversation-delivery.queue-admission.test.ts",
      "src/infra/outbound/message-action-threading.slack.test.ts",
      "src/gateway/update-run-notice-target.test.ts",
      "src/infra/outbound/message-action-threading.test.ts",
      "src/plugins/contracts/channel-provider-skills.contract.test.ts",
      "src/plugins/contracts/channel-reply-to-mode.contract.test.ts",
      "src/plugins/contracts/plugin-sdk-runtime-api-guardrails.test.ts",
      "src/secrets/runtime-channel-inactive-variants.test.ts",
      "src/secrets/runtime-discord-surface.test.ts",
      "src/secrets/runtime-matrix-top-level.test.ts",
      "src/secrets/runtime-nextcloud-talk-file-precedence.test.ts",
      "src/secrets/runtime-zalo-token-activity.test.ts",
      "src/secrets/unsupported-surface-policy.test.ts",
      "src/plugins/contracts/plugin-sdk-index.bundle.test.ts",
      "test/discord-live-policy.integration.test.ts",
      "test/plugins/signal-account-policy.integration.test.ts",
      "test/plugins/tool-search-plugin-catalog.integration.test.ts",
      "src/secrets/runtime-matrix-shadowing.test.ts",
      "src/secrets/runtime-nostr.test.ts",
      "test/feishu-message-read-authority.integration.test.ts",
      "test/scripts/prompt-snapshots.test.ts",
      "test/scripts/qa-flow-bundle.test.ts",
      "test/scripts/qa-report-cli.test.ts",
      "test/subagent-announce-origin.integration.test.ts",
      "test/scripts/plugin-inventory-module-refs.test.ts",
      "test/scripts/compiled-tooling.process.test.ts",
    ],
    testCases: [
      // Build-entry and update-admission fixtures that name removed channel plugins.
      ["test/scripts/bundled-plugin-build-entries.test.ts", "emits %s/%s through its owning build"],
      [
        "test/scripts/bundled-plugin-build-entries.test.ts",
        "keeps the Matrix packaged runtime shim in its package-owned build",
      ],
      [
        "test/scripts/bundled-plugin-build-entries.test.ts",
        "builds explicitly selected external plugins only for Docker",
      ],
      [
        "src/cli/update-cli/update-command-admit.test.ts",
        "$verdict plugin-owned legacy Discord DM config ($policy) without writing",
      ],
      [
        "src/cli/update-cli/update-command-admit.test.ts",
        "emits a parseable refusal when Doctor-projected database targets are incompatible",
      ],
      ["src/agents/tools/message-tool-discovery.test.ts", "scheduled account discovery"],
      [
        "src/agents/tools/message-tool.scheduled-writes.test.ts",
        "selects the scheduled %s account %s",
      ],
      [
        "src/agents/tools/message-tool.test.ts",
        "does not resolve secrets for broadcast channels that reject the explicit account",
      ],
      [
        "src/agents/tools/sessions-spawn-tool.test.ts",
        "dispatches ACP with the caller's identity, policy, resume, and completion context",
      ],
      [
        "src/channels/message-access/operator-authority.test.ts",
        "carries native Slack requester authority through preparation",
      ],
      [
        "src/channels/plugins/bundled.shape-guard.test.ts",
        "loads real bundled channel entry contracts from the source tree",
      ],
      [
        "src/channels/plugins/configured-state.test.ts",
        "resolves Discord, Slack, Telegram, and IRC env probes without full plugin loads",
      ],
      [
        "src/channels/plugins/configured-state.test.ts",
        "accepts the owner-specific $name contract",
      ],
      [
        "src/channels/plugins/persisted-auth-state.test.ts",
        "lists shipped persisted-auth metadata channels",
      ],
      ["src/channels/registry.helpers.test.ts", "keeps Feishu first in the current default order"],
      [
        "src/channels/turn/message-turn-guardrails.test.ts",
        "keeps migrated message paths off low-level reply-history helpers",
      ],
      [
        "src/channels/turn/run-channel-turn.delivery.test.ts",
        "prepares durable payloads while leaving hooks and visible delivery with the durable owner",
      ],
      [
        "src/channels/turn/run-channel-turn.delivery.test.ts",
        "preserves durable partial-send visibility without retrying via direct delivery",
      ],
      [
        "src/commands/doctor/shared/allowfrom-fallback-migration.test.ts",
        "preserves account-scoped fallback without broadening to the channel",
      ],
      [
        "src/commands/doctor/shared/legacy-config-account-promotion.test.ts",
        "preserves WhatsApp accounts and returns warning-only results",
      ],
      [
        "src/commands/doctor/shared/legacy-tools-by-sender.test.ts",
        "preserves the first effective policy for $name",
      ],
      [
        "src/commands/doctor/shared/legacy-tools-by-sender.test.ts",
        "migrates nested account policies without changing typed matching or colon IDs",
      ],
      [
        "src/config/channel-configured.test.ts",
        "detects Discord env configuration through the package metadata seam",
      ],
      [
        "src/config/channel-configured.test.ts",
        "requires both Slack identity and transport tokens through the package metadata seam",
      ],
      [
        "src/config/channel-configured.test.ts",
        "requires both IRC host and nick env vars through the package metadata seam",
      ],
      [
        "src/config/channel-configured.test.ts",
        "requires both Mattermost URL and token env vars through the package metadata seam",
      ],
      [
        "src/config/channel-configured.test.ts",
        "honors Matrix bootstrap metadata without consulting operational credential hooks",
      ],
      [
        "src/config/commands.test.ts",
        "uses only enabled package channel metadata for bundled auto defaults before runtime loads",
      ],
      [
        "src/config/config-startup-corpus.test.ts",
        "preserves ambient channel ownership when retiring Copilot discovery",
      ],
      [
        "src/config/config.plugin-validation.test.ts",
        "warns when plugins.allow contains a channel id without a plugin manifest (#76872)",
      ],
      [
        "src/config/config.plugin-validation.test.ts",
        "accepts bundled channel aliases for heartbeat targets",
      ],
      [
        "src/config/doc-baseline.integration.test.ts",
        "uses human-readable channel metadata for top-level channel sections",
      ],
      ["src/config/docs-config-examples.test.ts", "reports a retired bundled channel key"],
      [
        "src/config/plugin-auto-enable.core.test.ts",
        "auto-enables built-in channels and preserves them in restrictive plugins.allow",
      ],
      [
        "src/config/plugin-auto-enable.core.test.ts",
        "preserves an empty plugins.allow as nonrestrictive during auto-enable",
      ],
      [
        "src/config/redact-snapshot.test.ts",
        "preserves account SecretRef identity via generated channel metadata hints",
      ],
      [
        "src/config/schema.test.ts",
        "keeps core channel settings discoverable with bundled metadata",
      ],
      ["src/config/schema.test.ts", "adds heartbeat target hints with dynamic channels"],
      ["src/config/sessions.test.ts", "keeps explicit provider when provided in group key"],
      [
        "src/config/sessions/group.test.ts",
        "preserves empty opaque segments in originating group ids",
      ],
      [
        "src/config/validation.policy.test.ts",
        "filters only the policy-owned unknown key (typo=%s)",
      ],
      [
        "src/plugins/channel-plugin-ids.test.ts",
        "evaluates the trusted installed Slack owner's credential contract",
      ],
      [
        "src/plugins/commands.test.ts",
        "requires config before using read-only manifest command defaults",
      ],
      [
        "src/plugins/doctor-contract-registry.retained-config.test.ts",
        "repairs retained channel config before installation without selecting state owners",
      ],
      [
        "src/plugins/bundled-plugin-metadata.test.ts",
        "captures setup-entry metadata for bundled channel plugins",
      ],
      [
        "src/plugins/bundled-plugin-metadata.test.ts",
        "keeps bundled persisted-auth metadata on channel package manifests",
      ],
      [
        "src/plugins/bundled-plugin-metadata.test.ts",
        "loads tlon channel config metadata from the lightweight schema surface",
      ],
      [
        "src/plugins/doctor-contract-registry.selection.test.ts",
        "preserves historical webhook ownership for $name",
      ],
      [
        "src/plugins/doctor-contract-registry.webhook-pins.test.ts",
        "supplements historical facts without replacing $name",
      ],
      // Full-suite run on the final branch (DEBLOAT_LOG.md 3.2).
      [
        "extensions/policy/src/cli.test.ts",
        "checks authored routing probes without exposing route identifiers",
      ],
      [
        "src/agents/runtime-capabilities.test.ts",
        "adds thread-bound spawn capabilities when the channel account allows unified spawns",
      ],
      [
        "src/auto-reply/reply/commands-login.consent.test.ts",
        "waits for registered model-access application and reports %s",
      ],
      [
        "src/auto-reply/reply/commands-login.consent.test.ts",
        "renews a %s model-access choice without another sign-in or an unconfirmed write",
      ],
      [
        "src/auto-reply/reply/commands-login.consent.test.ts",
        "keeps model access answerable after releasing the login reservation",
      ],
      [
        "src/auto-reply/reply/commands-login.consent.test.ts",
        "finishes login before applying %s with %s policy (%s; %s)",
      ],
      [
        "src/auto-reply/reply/commands-plugins.install.test.ts",
        "installs bare bundled plugin ids from the bundled source without --force",
      ],
      [
        "src/auto-reply/reply/commands-plugins.install.test.ts",
        "installs a bundled local path without --force",
      ],
      ["src/auto-reply/reply/groups.test.ts", "keeps prompt helpers off the heavy group runtime"],
      [
        "src/auto-reply/reply/session-delivery.test.ts",
        "inter-session message does NOT overwrite established Discord lastChannel",
      ],
      [
        "src/auto-reply/reply/session-delivery.test.ts",
        "inter-session message does NOT overwrite established external lastTo",
      ],
      [
        "src/channels/plugins/contracts/plugin-shape.contract.test.ts",
        "%s applies shared sanitizer semantics to outbound text",
      ],
      [
        "src/cli/config-cli.integration.test.ts",
        "redacts SecretRef ids and plugin-only sensitive fields in JSON/text order",
      ],
      [
        "src/cli/config-cli.reference-values.integration.test.ts",
        "explains rejected settings without saving and accepts their correction",
      ],
      [
        "src/cli/config-cli.roster.integration.test.ts",
        "preserves ownership intent through $mode preview and write",
      ],
      [
        "src/cli/config-cli.secrets.integration.test.ts",
        "preserves literal exec args from the config builder through provider invocation",
      ],
      [
        "src/cli/config-cli.secrets.integration.test.ts",
        "does not execute an overwritten exec ref during an --allow-exec batch dry-run",
      ],
      [
        "src/cli/config-cli.secrets.integration.test.ts",
        "rejects impossible provider/source refs during real config $name",
      ],
      [
        "src/cli/config-cli.secrets.integration.test.ts",
        "rejects impossible provider/source refs during real config validate",
      ],
      [
        "src/cli/config-cli.secrets.integration.test.ts",
        "strictly validates an existing mismatch when $name is a no-op",
      ],
      [
        "src/cli/config-cli.secrets.integration.test.ts",
        "skips exec provider execution during dry-run by default",
      ],
      [
        "src/cli/config-cli.secrets.integration.test.ts",
        "validates only the final candidate after a leaf overwrites an exec ref",
      ],
      ["src/cli/message-secret-scope.test.ts", "prefers explicit channel/account inputs"],
      ["src/cli/message-secret-scope.test.ts", "infers channel from a prefixed target"],
      ["src/cli/message-secret-scope.test.ts", "infers a shared channel from target arrays"],
      [
        "src/cli/message-secret-scope.test.ts",
        "uses fallback channel/account when direct inputs are missing",
      ],
      [
        "src/cli/program/preaction.test.ts",
        "only allows invalid config for explicit official recovery reinstall requests",
      ],
      [
        "src/cli/update-cli/update-config-provenance.integration.test.ts",
        "preserves the historical account owner and narrower route through %s",
      ],
      [
        "src/commands/channels.logs.test.ts",
        "rejects an unknown explicit channel without widening output",
      ],
      [
        "src/commands/channels/plugin-config-persistence.test.ts",
        "saves new channel credentials as resolvable protected refs without migrating other settings",
      ],
      [
        "src/commands/daemon-install-helpers.test.ts",
        "ignores missing passEnv values while blocking populated dangerous values on %s",
      ],
      [
        "src/commands/doctor-config-flow.include-refusal.test.ts",
        "publishes Teams webhook completion after included settings (%s)",
      ],
      [
        "src/commands/doctor-config-flow.test.ts",
        "migrates legacy toolsBySender keys to typed id entries on repair",
      ],
      [
        "src/commands/doctor-config-preflight.test.ts",
        "migrates readable active config after preserving its state locators",
      ],
      [
        "src/commands/doctor-legacy-config.secret-inputs.test.ts",
        "migrates legacy secretref-env markers on SecretRef credential paths",
      ],
      [
        "src/commands/doctor-lint.test.ts",
        "runs post-plugin readiness against an isolated state snapshot",
      ],
      [
        "src/commands/doctor-security.test.ts",
        "keeps intentional $label open groupPolicy advisory in Doctor and update lint",
      ],
      [
        "src/commands/message.test.ts",
        "scopes unqualified broadcast secrets to channels accepting the explicit account",
      ],
      [
        "src/gateway/config-reload.telegram-policy.test.ts",
        "restarts Slack when plugin approvers are edited",
      ],
      [
        "src/gateway/conversation-send.test.ts",
        "reports the same unknown outcome initially and on replay when an accepted response lacks identity",
      ],
      [
        "src/gateway/message-action-turn-capability.test.ts",
        "admits channel ingress but rejects Gateway and internal run sources",
      ],
      [
        "src/gateway/server-channels.ownership.test.ts",
        "preserves legacy account owner $authored across migration and a persisted restart",
      ],
      [
        "src/gateway/server.config-record-keys.test.ts",
        "accepts exact numeric record keys in replacePaths",
      ],
      [
        "src/gateway/server.plugin-http-auth.test.ts",
        "allows unauthenticated Mattermost callbacks while protecting other channel routes",
      ],
      [
        "src/gateway/server-methods/send.test.ts",
        "keeps delivered source sends successful when transcript mirroring fails",
      ],
      [
        "src/gateway/server-methods/send.test.ts",
        "preserves authored media captions and their selected agent session",
      ],
      [
        "src/gateway/server-methods/send.test.ts",
        "preserves source transcript mirror order before message.action responses",
      ],
      [
        "src/gateway/server-methods/send.test.ts",
        "strips forged current-turn context from agent runs without an ingress capability",
      ],
      [
        "src/gateway/server-methods/send.test.ts",
        "uses the resolved runtime config when the source snapshot matches",
      ],
      [
        "src/infra/approval-gateway-resolver.test.ts",
        "derives the %s approval client label from channel metadata",
      ],
      [
        "src/infra/approval-gateway-resolver.test.ts",
        "sends channel custody to an injected canonical runtime",
      ],
      ["src/infra/exec-approval-forwarder.test.ts", "forwards to session target and resolves"],
      [
        "src/infra/exec-approval-forwarder.test.ts",
        "joins started delivery and its queued real resolution while stopping future expiry",
      ],
      ["src/infra/exec-approval-forwarder.test.ts", "keeps pending delivery ahead of %s"],
      [
        "src/infra/exec-approval-forwarder.test.ts",
        "does not arm new expiry while an admitted route lookup finishes during stop",
      ],
      [
        "src/infra/exec-approval-forwarder.test.ts",
        "forwards exec metadata and policy-aware command text for $request",
      ],
      [
        "src/infra/exec-approval-forwarder.test.ts",
        "applies forwarding configuration and session filters for %j",
      ],
      [
        "src/infra/exec-approval-forwarder.test.ts",
        "logs per-target error when expiry delivery fails without producing unhandled rejection",
      ],
      [
        "src/infra/exec-approval-forwarder.test.ts",
        "deletes pending entry before starting expiry delivery",
      ],
      [
        "src/infra/state-migrations.recoverable-legacy-state.test.ts",
        "keeps Discord cache cleanup advisory with retired state=%s",
      ],
      [
        "src/infra/state-migrations.channel-pairing.test.ts",
        "does not defer pairing requests or built-in explicit default accounts",
      ],
      [
        "src/infra/state-migrations.channel-pairing.test.ts",
        "imports a built-in explicit default account without channel config",
      ],
      [
        "src/plugins/contracts/config-footprint-guardrails.test.ts",
        "keeps bundled channel private-network config canonical in generated metadata",
      ],
      [
        "src/plugins/contracts/config-footprint-guardrails.test.ts",
        "keeps retired flat streaming aliases out of channel-owned schemas",
      ],
      [
        "src/plugins/contracts/plugin-sdk-package-contract-guardrails.test.ts",
        "keeps Matrix dependencies local to the Matrix plugin",
      ],
      [
        "src/secrets/runtime-external-channel-audit.test.ts",
        "resolves only active channel credentials (active=%s)",
      ],
      [
        "src/secrets/runtime-external-channel-audit.test.ts",
        "resolves Feishu top-level appSecret SecretRef for the implicit default account",
      ],
      [
        "src/secrets/runtime-external-channel-audit.test.ts",
        "publishes an unavailable Discord realtime provider owner as a typed redacted error",
      ],
      ["src/security/fix.test.ts", "tightens groupPolicy + filesystem perms"],
      [
        "src/security/fix.test.ts",
        "applies allowlist per-account and seeds WhatsApp groupAllowFrom from store",
      ],
      [
        "src/system-agent/config-redaction.test.ts",
        "keeps structured parent writes visible when no descendant is sensitive",
      ],
      ["src/system-agent/config-redaction.test.ts", "preserves schema-valid path %s"],
      [
        "src/system-agent/operations.test.ts",
        "redacts plugin secrets and channel callback URLs with active metadata",
      ],
      [
        "src/plugins/contracts/boundary-invariants.test.ts",
        "keeps bundled plugin typed hook registrations on an explicit allowlist",
      ],
      [
        "src/plugins/contracts/boundary-invariants.test.ts",
        "keeps bundled plugin typed hook names on an explicit allowlist",
      ],
      [
        "src/plugins/contracts/boundary-invariants.test.ts",
        "keeps live provider config surfaces on runtime config lookups",
      ],
      [
        "src/plugins/contracts/extension-runtime-dependencies.contract.test.ts",
        "lists extension dependency inputs from git without walking extension dirs",
      ],
      [
        "test/package-scripts.test.ts",
        "partitions $platform CI coverage into disjoint explicit test lists",
      ],
      ["test/plugin-npm-runtime-build.test.ts", "plans public runtime surfaces for $plugins"],
      [
        "test/plugin-npm-runtime-build.test.ts",
        "builds msteams startup runtime surfaces as CommonJS files",
      ],
      [
        "test/plugin-npm-runtime-build.test.ts",
        "keeps published %s runtime imports resolvable from the host package",
      ],
      [
        "src/plugins/contracts/plugin-sdk-subpaths.test.ts",
        "keeps channel runtime helpers on focused subpaths",
      ],
      [
        "src/plugins/contracts/session-attachments.contract.test.ts",
        "rejects unloaded bundled gateway-mode channels before attachment delivery",
      ],
      [
        "test/plugin-npm-package-manifest.test.ts",
        "keeps msteams runtime dependencies registry-installed",
      ],
      [
        "test/scripts/build-external-plugin-local-dist.test.ts",
        "selects every externalized first-party plugin behind a package exclusion",
      ],
      [
        "test/scripts/build-external-plugin-local-dist.test.ts",
        "retains released optional outputs and respects private QA and bounded selectors",
      ],
      [
        "test/scripts/build-external-plugin-local-dist.test.ts",
        "performs no writes when Docker owns the selected build",
      ],
      [
        "test/scripts/bundled-plugin-assets.test.ts",
        "discovers the Discord SDK hook for standalone asset preparation",
      ],
      [
        "src/secrets/configure-plan.test.ts",
        "builds configure candidates from supported configure targets",
      ],
      ["src/system-agent/operations-parse.test.ts", "parses config and doctor repair operations"],
      [
        "test/scripts/check-deadcode-exports.test.ts",
        "models both compiled subprocess registries as workspace-relative full-tree roots",
      ],
      [
        "test/scripts/ci-changed-node-test-plan.dependency-inputs.test.ts",
        "rejects missing or unresolved changed-path input before producing a partial plan",
      ],
      [
        "test/scripts/ci-changed-node-test-plan.policy.test.ts",
        "keeps split planner proof within native row budgets without losing cases",
      ],
      [
        "test/scripts/ci-check-plan.test.ts",
        "selects complete extension roots without narrowing full check owners (%s)",
      ],
      [
        "test/scripts/codex-app-server-fixture.test.ts",
        "%s exposes empty effective config and no managed requirements",
      ],
      [
        "test/scripts/codex-app-server-fixture.test.ts",
        "allocates distinct auth fixture threads across clients and preserves resumed identity",
      ],
      [
        "test/scripts/extension-test-plan.test.ts",
        "bounds $name files with their actual ordinary and database owners",
      ],
      [
        "test/scripts/labeler-extension-coverage.test.ts",
        "references only existing extension directories",
      ],
      [
        "test/scripts/pr-crabbox-gate-plan.test.ts",
        "uses the E2E helper's whole family, including native QA fixtures",
      ],
      [
        "test/scripts/pr-crabbox-gate-plan.test.ts",
        "routes an explicit native QA fixture to its browser owner",
      ],
      [
        "test/scripts/prepare-vitest-runtime.test.ts",
        "prepares private-QA artifacts only with verified separation: %s",
      ],
      [
        "test/scripts/release-no-push-workflow.test.ts",
        "fails a missing required local live image before any registry pull",
      ],
      [
        "test/scripts/release-plan-producer.test.ts",
        "matches the exact current npm and ClawHub publisher inventories",
      ],
      [
        "test/scripts/test-projects-build-admission.test.ts",
        "blocks %s CLI readers until successful build and preserves SIGTERM",
      ],
      [
        "test/scripts/test-projects-build-admission.test.ts",
        "prepares only selected Gateway assets: $name",
      ],
      [
        "test/scripts/test-projects-build-admission.test.ts",
        "prepares only the effective config selection: $name",
      ],
      [
        "test/scripts/test-projects-build-admission.test.ts",
        "admits preparation from native controls only: $args",
      ],
      [
        "test/scripts/test-projects-build-admission.test.ts",
        "admits readers only after successful preparation: $name",
      ],
      [
        "test/scripts/test-projects-build-admission.test.ts",
        "prepares only the selected runtime: $target ($flag)",
      ],
      [
        "test/scripts/test-projects-build-admission.test.ts",
        "coalesces mixed E2E preparation and preserves prebuilt ownership (flag=%s)",
      ],
      [
        "test/scripts/test-projects-build-admission.test.ts",
        "holds batch readers behind preparation (parallel=$parallel, outcome=$outcome)",
      ],
      [
        "test/scripts/test-projects-build-admission.test.ts",
        "prepares the actual invocation selection: $name",
      ],
      [
        "test/vitest-pr-exempt-retention.test.ts",
        "retains one canonical owner for every PR-exempt file in %s plans",
      ],
      [
        "test/vitest-ui-e2e-config.test.ts",
        "scopes setup and leases to selection $filters / $include / $available",
      ],
      [
        "test/vitest-ui-e2e-config.test.ts",
        "cleans owned resources after native $failure failure (prebuilt: $prebuilt)",
      ],
      [
        "test/vitest-ui-e2e-config.test.ts",
        "owns the complete inventory once and shards the project union without losing QA Lab or real-Gateway siblings",
      ],
      [
        "test/vitest-ui-e2e-config.test.ts",
        "admits every prebuilt real-Gateway file once with the native worker cap %s",
      ],
      [
        "test/vitest-ui-e2e-config.test.ts",
        "keeps prebuilt preview acquisition lazy across native project initialization",
      ],
      [
        "test/vitest-ui-e2e-config.test.ts",
        "propagates prebuilt admission failure before acquiring the preview",
      ],
      ["test/scripts/test-projects-routing.test.ts", "routes %s without private-QA E2E setup"],
      [
        "test/scripts/test-projects-routing.test.ts",
        "expands a package config within mixed E2E files in input order (packageFirst=%s)",
      ],
      [
        "test/scripts/test-projects-routing.test.ts",
        "keeps an explicit package config bounded under a native substring filter: %j",
      ],
      [
        "test/scripts/test-projects-routing.test.ts",
        "keeps extension production changes on the owning extension lane",
      ],
      [
        "test/scripts/ci-workflow-guards.test.ts",
        "selects the real-Gateway tier without retrying failures: %j",
      ],
      [
        "test/scripts/ci-workflow-guards.test.ts",
        "keeps private Control UI servers and resource-sensitive files under one serial owner",
      ],
      [
        "test/scripts/openclaw-release-telegram-qa-workflow.test.ts",
        "retains only bounded, allowlisted diagnostics",
      ],
      ["test/scripts/telegram-e2e-userbot-skill.test.ts", "passes its Node test suite"],
      ["src/proxy-capture/coverage.test.ts", "summarizes captured and partial transport seams"],
      ["src/proxy-capture/coverage.test.ts", "warns about required capture gaps"],
      [
        "test/scripts/ci-changed-node-test-plan.test.ts",
        "retains precise process ownership and independent timing keys (%s)",
      ],
      [
        "test/scripts/ci-node-test-plan.test.ts",
        "retains the mapped prompt Markdown owner beside documentation",
      ],
      [
        "src/infra/update-managed-service-handoff-lifecycle.test.ts",
        "rechecks revoked chat ownership after validation before stopping the Gateway",
      ],
      [
        "src/infra/update-managed-service-handoff-lifecycle.test-support.ts",
        "rechecks the %s requester after helper readiness and parent exit",
      ],
    ],
    testRows: [
      [
        "src/plugins/bundled-plugin-metadata.test.ts",
        'collectRepoBundledChannelConfigsForTest("discord");',
      ],
      [
        "src/plugins/bundled-plugin-metadata.test.ts",
        'collectRepoBundledChannelConfigsForTest("tlon");',
      ],
      ["src/channels/ids.test.ts", '["whatsapp", "WhatsApp"]'],
      ["src/channels/ids.test.ts", '["GOOGLE-CHAT", "Google Chat"]'],
      ["src/commands/doctor/shared/legacy-tools-by-sender.test.ts", '"channels.slack.'],
      ["src/commands/doctor/shared/legacy-tools-by-sender.test.ts", '"channels.discord.'],
      ["src/commands/doctor/shared/legacy-tools-by-sender.test.ts", '"channels.msteams.'],
      ["src/plugins/bundled-plugin-categories.test.ts", 'pluginId: "a2a"'],
      ["src/plugins/bundled-plugin-categories.test.ts", 'pluginId: "feishu"'],
      ...[
        "whatsapp",
        "discord",
        "clickclack",
        "signal",
        "googlechat",
        "slack",
        "imessage",
        "matrix",
        "line",
      ].map((id) => ["src/config/dead-config-keys.test.ts", `channels.${id}.`]),
      // Full-suite run on the final branch (DEBLOAT_LOG.md 3.2).
      [
        "src/auto-reply/reply/commands-allowlist.owner.test.ts",
        '{ action: "add", target: "", revocation: "reassign" }',
      ],
      ["src/gateway/server-startup-config.ambient-channels.test.ts", '{ name: "ambient opt-in"'],
      [
        "src/plugins/contracts/bundled-extension-config-api-guardrails.test.ts",
        'path: "extensions/discord/src/config-schema.ts"',
      ],
      [
        "src/plugins/contracts/bundled-extension-config-api-guardrails.test.ts",
        'path: "extensions/slack/src/config-schema.ts"',
      ],
      [
        "src/plugins/contracts/bundled-extension-config-api-guardrails.test.ts",
        'path: "extensions/signal/src/config-schema.ts"',
      ],
      [
        "src/plugins/contracts/bundled-extension-config-api-guardrails.test.ts",
        'path: "extensions/imessage/src/config-schema.ts"',
      ],
      [
        "src/plugins/contracts/bundled-extension-config-api-guardrails.test.ts",
        'path: "extensions/whatsapp/src/config-schema.ts"',
      ],
      [
        "src/plugins/contracts/bundled-extension-config-api-guardrails.test.ts",
        'path: "extensions/googlechat/src/config-schema.ts"',
      ],
      [
        "src/plugins/contracts/bundled-extension-config-api-guardrails.test.ts",
        'path: "extensions/msteams/src/config-schema.ts"',
      ],
      ["src/plugins/contracts/package-manifest.contract.test.ts", 'pluginId: "buzz"'],
      ["src/plugins/contracts/package-manifest.contract.test.ts", 'pluginId: "discord"'],
      ["src/plugins/contracts/package-manifest.contract.test.ts", 'pluginId: "feishu"'],
      ["src/plugins/contracts/package-manifest.contract.test.ts", 'pluginId: "googlechat"'],
      ["src/plugins/contracts/package-manifest.contract.test.ts", 'pluginId: "irc"'],
      ["src/plugins/contracts/package-manifest.contract.test.ts", 'pluginId: "line"'],
      ["src/plugins/contracts/package-manifest.contract.test.ts", 'pluginId: "matrix"'],
      ["src/plugins/contracts/package-manifest.contract.test.ts", 'pluginId: "mattermost"'],
      ["src/plugins/contracts/package-manifest.contract.test.ts", 'pluginId: "msteams"'],
      ["src/plugins/contracts/package-manifest.contract.test.ts", 'pluginId: "nextcloud-talk"'],
      ["src/plugins/contracts/package-manifest.contract.test.ts", 'pluginId: "nostr"'],
      ["src/plugins/contracts/package-manifest.contract.test.ts", 'pluginId: "synology-chat"'],
      ["src/plugins/contracts/package-manifest.contract.test.ts", 'pluginId: "tlon"'],
      ["src/plugins/contracts/package-manifest.contract.test.ts", 'pluginId: "twitch"'],
      ["src/plugins/contracts/package-manifest.contract.test.ts", 'pluginId: "whatsapp"'],
      ["src/plugins/contracts/package-manifest.contract.test.ts", 'pluginId: "zalo"'],
      ["src/plugins/contracts/package-manifest.contract.test.ts", 'pluginId: "zalouser"'],
      ["src/infra/outbound/cfg-threading.guard.test.ts", 'bundledPluginFile("discord",'],
      ["src/proxy-capture/coverage.ts", 'modulePath: "extensions/discord/'],
      ["src/proxy-capture/coverage.ts", 'modulePath: "extensions/feishu/'],
      ["src/proxy-capture/coverage.ts", 'modulePath: "extensions/mattermost/'],
      ["src/plugins/contracts/channel-response-prefix.contract.test.ts", '{ channelId: "buzz"'],
      [
        "src/plugins/contracts/channel-response-prefix.contract.test.ts",
        '{ channelId: "clickclack"',
      ],
      ["src/plugins/contracts/channel-response-prefix.contract.test.ts", '{ channelId: "feishu"'],
      ["src/plugins/contracts/channel-response-prefix.contract.test.ts", '{ channelId: "twitch"'],
      [
        "src/plugins/contracts/extension-runtime-dependencies.contract.test.ts",
        '"extensions/discord",',
      ],
      [
        "test/scripts/test-projects-routing.test.ts",
        'title: "routes the Gateway loopback and LAN producer to its worker owner"',
      ],
      [
        "test/scripts/test-projects-routing.test.ts",
        'title: "routes the Gateway TLS producer to its worker owner"',
      ],
      ["test/vitest-scoped-config.test.ts", 'root: "extensions/matrix",'],
      [
        "test/scripts/database-worker-registry.test.ts",
        '"src/channels/message-access/discord-native-acp-owner.test.ts",',
      ],
      [
        "test/scripts/database-worker-registry.test.ts",
        '"src/auto-reply/reply/commands-config.owner.test.ts",',
      ],
    ],
    edits: [
      {
        // Keeps the normalization coverage: Telegram is the kept channel; the iMessage alias
        // no longer resolves because the iMessage plugin is gone.
        file: "src/utils/message-channel.test.ts",
        why: "check gateway channel normalization against the kept Telegram channel",
        apply: (text) =>
          text
            .replace(
              'expect(resolveGatewayMessageChannel("discord")).toBe("discord");',
              'expect(resolveGatewayMessageChannel("telegram")).toBe("telegram");',
            )
            .replace('    expect(resolveGatewayMessageChannel(" imsg ")).toBe("imessage");\n', "")
            .replace(
              'expect(isDeliverableMessageChannel("discord")).toBe(true);',
              'expect(isDeliverableMessageChannel("telegram")).toBe(true);',
            ),
      },
      {
        file: "test/scripts/bundled-plugin-build-entries.test.ts",
        why: "drop the helper and import only the removed Discord/Matrix/Docker cases used",
        apply: (text) =>
          text
            .replace(
              "function expectNoPrefixMatches(values: string[], prefix: string) {\n  expect(values.filter((value) => value.startsWith(prefix))).toEqual([]);\n}\n\n",
              "",
            )
            .replace(
              'import { resolvePluginNpmRuntimeBuildPlan } from "../../scripts/lib/plugin-npm-runtime-build.mts";\n',
              "",
            ),
      },
      // Full-suite run on the final branch (DEBLOAT_LOG.md 3.2).
      {
        // Every channel in the shared-sanitizer list was removed; its it.each case is pruned above.
        file: "src/channels/plugins/contracts/plugin-shape.contract.test.ts",
        why: "drop the shared-sanitizer channel list; every channel in it was removed",
        apply: (text) =>
          text.replace(/^const SHARED_SANITIZER_CHANNEL_IDS = \[[\s\S]*?\] as const;\n\n/mu, ""),
      },
      {
        file: "src/commands/startup-config-preflight.recovery.test.ts",
        why: "keep the current-config recovery row; the webhook-repair fixture needs a removed channel",
        apply: (text) =>
          // Keep the union type: the body still branches on "webhook-repair".
          text.replace(
            'it.each(["current", "webhook-repair"] as const)',
            'it.each(["current"] as Array<"current" | "webhook-repair">)',
          ),
      },
      {
        file: "src/dockerfile.test.ts",
        why: "stage manifests without selecting the removed Matrix plugin",
        apply: (text) => text.replace('.each(["", "matrix"])', '.each([""])'),
      },
      {
        file: "src/gateway/client-callsites.guard.test.ts",
        why: "drop the allowlisted QA Lab Gateway client callsite; the plugin is removed",
        apply: (text) => text.replace('  "extensions/qa-lab/src/gateway-rpc-client.ts",\n', ""),
      },
      ...SEND_SLACK_FIXTURE_FILES.map((file) => ({
        // The gateway send and plugin-approval suites register a synthetic channel plugin; only its
        // id named a removed channel. Telegram is the kept channel id.
        file,
        why: "run the synthetic channel fixture under the kept Telegram id",
        apply: (text) => text.replaceAll("slack", "telegram").replaceAll("Slack", "Telegram"),
      })),
      {
        file: "src/plugins/contracts/channel-history-limit.contract.test.ts",
        why: "check historyLimit on the kept synthetic channel; the other listed channels were removed",
        apply: (text) =>
          text.replace(
            'it.each(["clickclack", "line", "mattermost", "qa-channel", "tlon", "twitch", "zalo"])',
            'it.each(["qa-channel"])',
          ),
      },
      {
        file: "src/plugins/contracts/registry.contract.test.ts",
        why: "drop QA Lab from the activation-scoped web search plugins; the plugin is removed",
        apply: (text) =>
          text.replace(
            'ACTIVATION_SCOPED_WEB_SEARCH_PLUGIN_IDS = ["codex", "qa-lab"] as const',
            'ACTIVATION_SCOPED_WEB_SEARCH_PLUGIN_IDS = ["codex"] as const',
          ),
      },
      {
        file: "src/plugins/contracts/channel-media-max-mb.contract.test.ts",
        why: "check media caps on the kept synthetic channel; the other listed channels were removed",
        apply: (text) =>
          text.replace(
            'const CHANNELS = ["clickclack", "mattermost", "qa-channel", "sms", "tlon", "zalouser"];',
            'const CHANNELS = ["qa-channel"];',
          ),
      },
      {
        // The QA Lab scripts were pruned with the plugin (they import it); their package.json entries
        // would otherwise point at missing files (test/package-scripts.test.ts).
        file: "package.json",
        why: "drop package scripts whose QA Lab entry files were removed",
        apply: (text) =>
          text.replace(
            /^[ \t]*"[^"]+": "[^"]*scripts\/(?:qa\/render-maturity-docs|qa-e2e|qa-lab-up|code-mode-model-matrix)\.ts[^"]*",\n/gmu,
            "",
          ),
      },
      {
        // Its only table is pruned above; drop the empty registration helper and its call.
        file: "src/infra/update-managed-service-handoff-lifecycle.test-support.ts",
        why: "drop the managed-handoff owner test registration once its Slack requester table is pruned",
        apply: (text) =>
          text.replace(
            /^export function registerManagedHandoffOwnerTests\([^]*?\): void \{\n(?: {2}const allowedRequesters = \[[^\]]*\] as const;\n)?\}\n\n?/mu,
            "",
          ),
      },
      {
        file: "src/infra/update-managed-service-handoff-lifecycle.test.ts",
        why: "stop registering the pruned managed-handoff owner tests",
        apply: (text) =>
          text.replace(
            "  registerManagedHandoffOwnerTests(runManagedServiceManagerBoundary, itUnix, expect);\n",
            "",
          ),
      },
      {
        // The reassign row is pruned above; its branch no longer fits the narrowed revocation union.
        file: "src/auto-reply/reply/commands-allowlist.owner.test.ts",
        why: "drop the reassign revocation branch; that table row is pruned",
        apply: (text) =>
          text.replace(
            '            if (revocation === "reassign") {\n              linkUserChannelIdentity(admins[1]!.profile.id, admin.identity);\n            }\n',
            "",
          ),
      },
    ],
  },
  {
    id: "providers",
    apply: true,
    description: "every model provider except anthropic, local runtimes, routers and gateways",
    // Kept: openai, amazon-bedrock, openrouter, google. The Telegram and Anthropic plugins' own
    // tests load their policy artifacts, catalogs or login flows; the lean profile denies them
    // at runtime (DEBLOAT_LOG.md 2.2).
    extensions: [
      "amazon-bedrock-mantle",
      "anthropic-vertex",
      "apple-fm",
      "arcee",
      "baseten",
      "byteplus",
      "cerebras",
      "chutes",
      "clawrouter",
      "cloudflare-ai-gateway",
      "cohere",
      "copilot-proxy",
      "deepinfra",
      "deepseek",
      "featherless",
      "fireworks",
      "github-copilot",
      "gmi",
      "groq",
      "huggingface",
      "kilocode",
      "kimi-coding",
      "litellm",
      "llama-cpp",
      "lmstudio",
      "longcat",
      "meta",
      "microsoft-foundry",
      "minimax",
      "mistral",
      "moonshot",
      "novita",
      "nvidia",
      "ollama",
      "opencode",
      "opencode-go",
      "qianfan",
      "qwen",
      "radius",
      "sglang",
      "stepfun",
      "synthetic",
      "tencent",
      "together",
      "venice",
      "vercel-ai-gateway",
      "vllm",
      "volcengine",
      "voyage",
      "xai",
      "xiaomi",
      "zai",
    ],
    paths: [],
    testFiles: [
      "src/plugins/provider-model-routes.installed.test.ts",
      // Full-suite run on the final branch (DEBLOAT_LOG.md 3.2).
      "src/agents/context.opencode-go.test.ts",
      "src/agents/embedded-agent-runner/run/llm-idle-timeout.transport.test.ts",
      "src/agents/live-model-explicit-candidates.test.ts",
      "src/agents/model-catalog-visibility.arcee.test.ts",
      "src/agents/models-config.ollama-secretref.test.ts",
      "src/agents/runtime-plan/materialize-model.arcee.test.ts",
      "src/agents/runtime-plan/materialize-model.xai.test.ts",
      "src/agents/tool-surface-plan.provider-catalog.integration.test.ts",
      "src/commands/models/auth.minimax-chat.test.ts",
      "src/commands/models/auth.xai-upgrade.test.ts",
      "src/gateway/server-methods/models-list-result.arcee.test.ts",
      "src/gateway/server-methods/models-list.remote-catalog.integration.test.ts",
      "src/gateway/server.models-native-retirement.test.ts",
      "src/gateway/server.xai-fallback.test.ts",
      "src/gateway/setup-inference.first-signin.integration.test.ts",
      "src/infra/provider-usage.ollama.test.ts",
      "src/system-agent/setup-inference.groq-external.integration.test.ts",
      "test/plugins/fireworks-model-alias.test.ts",
      "test/plugins/qwen-dashscope-throttle.integration.test.ts",
      "test/scripts/sync-plugin-sdk-exports.test.ts",
      "src/tts/tts-summary.static-catalog.test.ts",
      "test/scripts/vitest-provider-catalog-prerequisite.test.ts",
    ],
    testCases: [
      [
        "test/scripts/bundled-plugin-build-entries.test.ts",
        "keeps OpenCode Go bundled until its companion artifact is available",
      ],
      [
        "src/agents/tools/pdf-tool.model-config.test.ts",
        "selects a text-extraction model for $primary",
      ],
      [
        "src/config/config-startup-corpus.test.ts",
        "retains included Copilot discovery.enabled=%j until Doctor migrates it",
      ],
      [
        "src/plugins/bundled-plugin-metadata.test.ts",
        "keeps empty-config Gateway startup narrower than declared startup sidecars",
      ],
      [
        "src/plugins/manifest-model-params.test.ts",
        "rejects invalid vLLM model options in default and per-agent scopes",
      ],
      [
        "src/plugins/manifest-model-params.test.ts",
        "exposes the model schema and server prerequisite only for vLLM model paths",
      ],
      [
        "src/plugins/manifest-model-params.test.ts",
        "uses the request metadata owner for validation and schema presentation",
      ],
      [
        "src/plugins/official-external-provider-endpoints.test.ts",
        "mirrors providerEndpoints for every dist-excluded plugin manifest that declares them",
      ],
      [
        "src/plugins/provider-public-artifacts.test.ts",
        "loads Kimi Code K3 thinking policy before runtime registration",
      ],
      [
        "src/plugins/provider-public-artifacts.test.ts",
        "preserves %s effort metadata before runtime registration",
      ],
      [
        "src/plugins/provider-public-artifacts.test.ts",
        "loads OpenCode Go model overrides before runtime registration",
      ],
      [
        "src/plugins/provider-self-hosted-setup.test.ts",
        "keeps the $providerLabel non-secret marker keyless in ref mode",
      ],
      [
        "src/plugins/web-search-providers.runtime.test.ts",
        "preserves Moonshot region and model setup without activating the plugin",
      ],
      // Full-suite run on the final branch (DEBLOAT_LOG.md 3.2).
      [
        "src/agents/agent-run-terminal-receipt.test.ts",
        "keeps an equivalent vendor wire id from producing a model-switch fact",
      ],
      [
        "src/agents/auth-profiles/oauth-identity.test.ts",
        "keeps GitHub Copilot routing scope isolated: %s",
      ],
      [
        "src/agents/auth-profiles/oauth-manager.test.ts",
        "resolves a newer main credential only for a compatible tenant upgrade",
      ],
      [
        "src/agents/auth-profiles/oauth-manager.test.ts",
        "persists local refresh without mirroring to another tenant",
      ],
      [
        "src/agents/auth-profiles/oauth-manager.test.ts",
        "recovers failed refresh only within the same tenant (%s)",
      ],
      [
        "src/agents/auth-profiles/profiles.test.ts",
        "canonicalizes every alias-equivalent provider state mutation",
      ],
      [
        "src/agents/embedded-agent-runner/model.provider-hooks.test.ts",
        "prepares $provider/$id using its $api policy",
      ],
      [
        "src/agents/embedded-agent-runner/model.provider-hooks.test.ts",
        "uses the final transport and clears a previous attempt's preference",
      ],
      [
        "src/agents/live-test-reasoning.test.ts",
        "honors the prepared OpenCode Go transport profile",
      ],
      ["src/agents/model-auth-markers.test.ts", "recognizes explicit non-secret markers"],
      [
        "src/agents/model-auth.test.ts",
        "prefers non-secret local env markers over ambient profiles",
      ],
      [
        "src/agents/model-fast-mode.test.ts",
        "uses each selected model's policy and effective agent parameters",
      ],
      [
        "src/agents/model-thinking-default.test.ts",
        "preserves fresh and serialized Kimi defaults (model=$model, thinking=$thinking, agent=$agentDefault)",
      ],
      [
        "src/agents/sessions/sdk.auth-migration.test.ts",
        "resolves $route before provider dispatch",
      ],
      [
        "src/agents/sessions/sdk.auth-migration.test.ts",
        "refuses an endpoint-dependent facade request without config",
      ],
      [
        "src/agents/sessions/sdk.auth-migration.test.ts",
        "keeps imported %s credentials fenced until lifecycle clear",
      ],
      [
        "src/agents/sessions/sdk.auth-migration.test.ts",
        "preserves distinct owners for identical imported credential bytes",
      ],
      [
        "src/agents/sessions/sdk.auth-migration.test.ts",
        "rejects imported credentials across a pending unresolved-Ref reload",
      ],
      [
        "src/agents/sessions/sdk.auth-migration.test.ts",
        "revalidates the selected owner after another reload changes the view",
      ],
      [
        "src/agents/sessions/sdk.auth-migration.test.ts",
        "bounds an imported $provider credential's ambiguous realm",
      ],
      ["src/auto-reply/fallback-state.test.ts", "Arcee wire identity"],
      [
        "src/auto-reply/reply/agent-runner-result-accounting.fallback.test.ts",
        "does not persist or project a fallback for the selected model's wire identity",
      ],
      ["src/commands/agent.thinking.test-support.ts", "enforces xAI's effort-free profile for off"],
      [
        "src/commands/doctor-config-flow.legacy-composition.test.ts",
        "converges the July upgrade fixture with an explicit local model",
      ],
      [
        "src/flows/doctor-core-checks.test.ts",
        "distinguishes migratable model refs from unknown providers and unconfirmed models",
      ],
      [
        "src/commands/doctor-retired-models.ordering.test.ts",
        "preserves the logical account while checking authored %s model retirement",
      ],
      [
        "src/commands/doctor-retired-models.ordering.test.ts",
        "repairs native xAI selections while preserving policy and unresolved pins (%s)",
      ],
      [
        "src/commands/doctor-retired-models.ordering.test.ts",
        "retains env-only model selections when native catalog ownership is ambiguous",
      ],
      [
        "src/commands/doctor-retired-models.ordering.test.ts",
        "retains selections when the native authentication route is unavailable (%s)",
      ],
      [
        "src/commands/doctor-retired-models.ordering.test.ts",
        "keeps a missing session account pinned despite an available native xAI account",
      ],
      [
        "src/commands/models/aliases.test.ts",
        "does not make an unlisted model override invalid on a fresh config",
      ],
      [
        "src/commands/models/auth-order.test.ts",
        "accepts alias-provider profiles and reports the canonical stored order",
      ],
      [
        "src/commands/models/provider-aliases.test.ts",
        "canonicalizes manifest-owned provider aliases",
      ],
      [
        "src/commands/models/set.test.ts",
        "persists manifest-owned provider aliases with the canonical provider id",
      ],
      [
        "src/commands/onboard.test.ts",
        "preflights $providerId before reset and setup (accepted: $validationResult)",
      ],
      ["src/commands/onboard.test.ts", "validates a provider-specific API key before reset"],
      ["src/commands/onboard.test.ts", "rejects ambiguous interactive provider flags before reset"],
      [
        "src/commands/status.scan.test.ts",
        "uses manifest environment credentials for cold-start JSON (%s)",
      ],
      [
        "src/gateway/dashboard-session-title.transport.test.ts",
        "disables configured native Ollama thinking only for the utility request",
      ],
      [
        "src/gateway/server.sessions.create.accounts.test.ts",
        "sessions.create applies an admin-linked Arcee default only for the $endpoint",
      ],
      [
        "src/gateway/session-companion-ask.test.ts",
        "uses the already prepared image model for %s without an extra resolution",
      ],
      [
        "src/model-catalog/pricing.test.ts",
        "accepts exact free pricing from an authoritative native source",
      ],
      [
        "src/infra/provider-usage.auth.normalizes-keys.test.ts",
        "strips embedded CR/LF from env credentials",
      ],
      [
        "src/plugins/contracts/extension-package-project-boundaries.test.ts",
        "keeps xai as the only opt-in extension with custom path overrides",
      ],
      [
        "src/plugins/contracts/extension-package-project-boundaries.test.ts",
        "keeps xai's boundary-specific path overrides derived from the shared package boundary map",
      ],
      ["src/plugins/contracts/registry.contract.test.ts", "declares canonical-first %s %s aliases"],
      [
        "src/plugins/contracts/registry.contract.test.ts",
        "exposes the GitHub Copilot non-interactive onboarding token flag from manifest metadata",
      ],
      [
        "src/plugins/contracts/shared-upstream-model.contract.test.ts",
        "keeps code-mode tiers out of plugin source so shared-model checks can see them",
      ],
      [
        "src/secrets/provider-env-vars.test.ts",
        "ignores prototype-chain keys when resolving provider env vars",
      ],
      [
        "src/secrets/runtime-provider-and-media-surfaces.test.ts",
        "does not let a managed local embedding service depend on a remote api key ref",
      ],
      [
        "src/tui/commands.test.ts",
        "falls back to provider-resolved levels when thinkingLevels is empty (#76482)",
      ],
      [
        "src/tui/commands.test.ts",
        "uses session-supported thinking levels in help before the provider fallback",
      ],
      [
        "test/openclaw-npm-postpublish-verify.test.ts",
        "verifies every bundled manifest when the build filter exists before module initialization",
      ],
      [
        "test/scripts/changed-lanes.test.ts",
        "fails real changed-check lint for $name and passes after repair",
      ],
      [
        "test/scripts/changed-lanes.test.ts",
        "targets mixed-owner lint while retaining the guard for %s",
      ],
      [
        "test/scripts/changed-lanes.test.ts",
        "runs the npm package-lock guard for dependency package surfaces",
      ],
      [
        "test/scripts/ci-node-test-plan.test.ts",
        "retains directly edited release matrices alongside PR-exempt entries",
      ],
      [
        "test/scripts/ci-node-test-plan.test.ts",
        "discovers only tooling files for a cold precise tooling plan",
      ],
      [
        "test/scripts/ci-node-test-plan.test.ts",
        "bounds the hybrid hosted seed to real consumer configs without runtime builds",
      ],
      [
        "test/scripts/ci-node-test-plan.test.ts",
        "shares one prepared runtime across affordable %s groups",
      ],
      [
        "test/scripts/ci-node-test-plan.test.ts",
        "keeps host-owned database consumers in forks and out of their former projects",
      ],
      [
        "test/scripts/ci-node-test-plan.test.ts",
        "keeps compact packing policy and runtime inputs bounded",
      ],
      [
        "test/scripts/docker-plugin-selection.test.ts",
        "adds standalone direct and Gateway provider selections to the shared live image",
      ],
      [
        "test/scripts/publish-model-catalog.test.ts",
        "publishes native DeepInfra array prices with discounts rather than generic rates",
      ],
      [
        "test/scripts/publish-model-catalog.test.ts",
        "publishes only verified source data: Venice unreachable",
      ],
      [
        "test/scripts/release-workflow-matrix-plan.test.ts",
        "builds provider owners used by every direct and Gateway Docker live lane",
      ],
      [
        "test/scripts/runtime-postbuild.test.ts",
        "discovers repo static asset metadata without scanning extension directories",
      ],
      [
        "test/scripts/test-live-shard.test.ts",
        "covers every native live test and tracks provider-filtered release fanout",
      ],
      [
        "test/scripts/test-live-shard.test.ts",
        "prepares the private QA runtime for live shards that load its built API",
      ],
      [
        "test/scripts/tsdown-config.test.ts",
        "builds retained config repairs without plugin runtime or state migration closures",
      ],
    ],
    testRows: [
      [
        "src/agents/tools/agents-list-tool.test.ts",
        'selection: "an explicit provider with a colliding alias"',
      ],
      ["src/plugins/bundled-plugin-categories.test.ts", 'pluginId: "opencode"'],
      // Full-suite run on the final branch (DEBLOAT_LOG.md 3.2).
      ["src/agents/agent-command-local.test.ts", '{ inventory: "empty"'],
      ["src/agents/agent-command-local.test.ts", '{ inventory: "explicit off"'],
      [
        "src/agents/auth-profiles/session-override.model-endpoint.test.ts",
        'name: "keeps ordinary OpenRouter ownership"',
      ],
      [
        "src/agents/minimax-vlm.normalizes-api-key.test.ts",
        'name: "pins a default hostname without broad private-network access"',
      ],
      [
        "src/agents/models-config.providers.auth-provenance.test.ts",
        '["VLLM_API_KEY", {}, undefined, undefined]',
      ],
      [
        "src/gateway/server-reload-handlers.test.ts",
        'name: "retains discovery when no endpoint was authored"',
      ],
      ["src/plugins/contracts/package-manifest.contract.test.ts", 'pluginId: "xiaomi"'],
      ["src/plugin-sdk/test-helpers/plugin-registration-contract-cases.ts", 'pluginId: "byteplus"'],
      ["src/plugin-sdk/test-helpers/plugin-registration-contract-cases.ts", 'pluginId: "groq"'],
      ["src/plugin-sdk/test-helpers/plugin-registration-contract-cases.ts", 'pluginId: "lmstudio"'],
      ["src/plugin-sdk/test-helpers/plugin-registration-contract-cases.ts", 'pluginId: "minimax"'],
      ["src/plugin-sdk/test-helpers/plugin-registration-contract-cases.ts", 'pluginId: "mistral"'],
      ["src/plugin-sdk/test-helpers/plugin-registration-contract-cases.ts", 'pluginId: "moonshot"'],
      ["src/plugin-sdk/test-helpers/plugin-registration-contract-cases.ts", 'pluginId: "novita"'],
      ["src/plugin-sdk/test-helpers/plugin-registration-contract-cases.ts", 'pluginId: "nvidia"'],
      ["src/plugin-sdk/test-helpers/plugin-registration-contract-cases.ts", 'pluginId: "ollama"'],
      ["src/plugin-sdk/test-helpers/plugin-registration-contract-cases.ts", 'pluginId: "opencode"'],
      [
        "src/plugin-sdk/test-helpers/plugin-registration-contract-cases.ts",
        'pluginId: "opencode-go"',
      ],
      ["src/plugin-sdk/test-helpers/plugin-registration-contract-cases.ts", 'pluginId: "qwen"'],
      ["src/plugin-sdk/test-helpers/plugin-registration-contract-cases.ts", 'pluginId: "together"'],
      ["src/plugin-sdk/test-helpers/plugin-registration-contract-cases.ts", 'pluginId: "xai"'],
      ["src/plugin-sdk/test-helpers/plugin-registration-contract-cases.ts", 'pluginId: "zai"'],
      ["src/plugins/contracts/providers.contract.test.ts", '"minimax",'],
      ["src/plugins/contracts/providers.contract.test.ts", '"moonshot",'],
      ["src/plugins/contracts/providers.contract.test.ts", '"xai",'],
      ["src/tui/tui-command-handlers.test.ts", 'command: "/think on",'],
    ],
    edits: [
      {
        file: "src/plugins/openai-compatible-embedding-provider.integration.test.ts",
        why: "drop the removed llama-cpp row from a managed-auth table",
        apply: (text) => text.replace('it.each(["llama-cpp", "llmman"])', 'it.each(["llmman"])'),
      },
      {
        // Operator configs in the startup corpora select removed providers (for example
        // tools.web.search.provider "grok"), which this fork rejects as unknown.
        file: "src/config/config-corpus.test-support.ts",
        why: "skip startup-corpus fixtures that configure removed providers",
        apply: (text) =>
          text.includes("DEBLOAT_REMOVED_PROVIDER_FIXTURES")
            ? text
            : text
                .replace(
                  "export function listConfigCorpusFixtureNames(): string[] {",
                  'const DEBLOAT_REMOVED_PROVIDER_FIXTURES = new Set([\n  "generic-github-token.json",\n  "hamverbot.json",\n  "operator-container.json",\n  "operator-host.json",\n  "peanutto.json",\n]);\n\nexport function listConfigCorpusFixtureNames(): string[] {',
                )
                .replace(
                  "  ].toSorted();",
                  "  ]\n    .filter((name) => !DEBLOAT_REMOVED_PROVIDER_FIXTURES.has(name))\n    .toSorted();",
                ),
      },
      // Full-suite run on the final branch (DEBLOAT_LOG.md 3.2).
      {
        file: "src/agents/embedded-agent-runner/stream-resolution.test.ts",
        why: "keep the Bedrock transport row; Bedrock Mantle is removed",
        apply: (text) =>
          text.replace(
            'it.each(["amazon-bedrock", "amazon-bedrock-mantle"])',
            'it.each(["amazon-bedrock"])',
          ),
      },
      {
        file: "src/cli/command-secret-gateway.memory-headers.test.ts",
        why: "keep the llmman row; llama.cpp is removed",
        apply: (text) => text.replace('it.each(["llama-cpp", "llmman"])', 'it.each(["llmman"])'),
      },
      {
        // Its only user, the xAI effort-free case, is pruned above.
        file: "src/commands/agent.thinking.test-support.ts",
        why: "stop loading the removed xAI plugin when registering the agent thinking tests",
        apply: (text) =>
          text.replace(
            /^ {2}const \{ applyXaiRuntimeModelCompat \} = loadBundledPluginPublicArtifactModuleSync<\{\n[\s\S]*?\}>\(\{ dirName: "xai", artifactBasename: "api\.js" \}\);\n\n/mu,
            "",
          ),
      },
      {
        file: "src/gateway/gateway-codex-harness.fixture.test.ts",
        why: "drop the Groq key from the staged-environment check; Groq is removed",
        apply: (text) =>
          text
            .replace(/^[ \t]*GROQ_API_KEY: "synthetic-groq-key",\n/mu, "")
            .replace(/^[ \t]*expect\(instance\.env\.GROQ_API_KEY\)\.toBeUndefined\(\);\n/mu, ""),
      },
      {
        // The explicit-off row is pruned above; its literal no longer fits the narrowed case union.
        file: "src/agents/agent-command-local.test.ts",
        why: "drop the explicit-off thinking flag; that table row is pruned",
        apply: (text) =>
          text.replace(
            '              ...(testCase.inventory === "explicit off" ? ["--thinking", "off"] : []),\n',
            "",
          ),
      },
    ],
  },
  {
    id: "media",
    apply: true,
    description: "speech/TTS/STT providers, voice call, talk voice, meetings, media generation",
    extensions: [
      // speech, transcription, voice
      "azure-speech",
      "deepgram",
      "elevenlabs",
      "fish-audio-speech",
      "gradium",
      "inworld",
      "microsoft",
      "senseaudio",
      "tts-local-cli",
      "talk-voice",
      "voice-call",
      // meetings
      "facetime",
      "google-meet",
      "slack-huddles",
      "teams-meetings",
      "zoom-meetings",
      // image, music, video generation
      "alibaba",
      "comfy",
      "fal",
      "kie",
      "pixverse",
      "runway",
      "vydra",
      "image-generation-core",
    ],
    paths: [
      "extensions/music-generation-providers.live.test.ts",
      "extensions/video-generation-providers.live.test.ts",
    ],
    testCases: [
      [
        "test/scripts/bundled-plugin-build-entries.test.ts",
        "includes the manifest-less runtime core support package in dist build entries",
      ],
      [
        "test/scripts/bundled-plugin-build-entries.test.ts",
        "packs the runtime core support package without requiring a plugin manifest",
      ],
      [
        "src/agents/tools/video-generate-tool.test.ts",
        "exposes video generation for an auth-backed video provider",
      ],
      // Also asserts core/channel entries; removed whole because it pins Voice Call's Twilio keys.
      [
        "src/config/doc-baseline.integration.test.ts",
        "includes core, channel, and plugin config metadata",
      ],
      [
        "src/plugins/bundled-plugin-metadata.test.ts",
        "scopes Voice Call CLI activation to the voicecall command",
      ],
      // Full-suite run on the final branch (DEBLOAT_LOG.md 3.2).
      [
        "src/plugins/contracts/registry.contract.test.ts",
        "keeps video-only provider auth choices out of text onboarding",
      ],
      [
        "src/secrets/runtime-config-collectors-plugins.bundled.test.ts",
        "collects voice-call SecretRef assignments from bundled manifest contracts",
      ],
      [
        "src/secrets/runtime-config-collectors-plugins.bundled.test.ts",
        "collects google-meet realtime provider SecretRefs from its installed manifest",
      ],
      [
        "test/scripts/plugin-prerelease-test-plan.test.ts",
        "keeps hourly extension coverage with its complete release owner and required result",
      ],
    ],
    testRows: [
      ["src/plugins/bundled-plugin-categories.test.ts", 'pluginId: "google-meet"'],
      // Full-suite run on the final branch (DEBLOAT_LOG.md 3.2).
      ["src/plugins/contracts/package-manifest.contract.test.ts", 'pluginId: "voice-call"'],
      ["src/plugin-sdk/test-helpers/plugin-registration-contract-cases.ts", 'pluginId: "alibaba"'],
      ["src/plugin-sdk/test-helpers/plugin-registration-contract-cases.ts", 'pluginId: "comfy"'],
      ["src/plugin-sdk/test-helpers/plugin-registration-contract-cases.ts", 'pluginId: "deepgram"'],
      [
        "src/plugin-sdk/test-helpers/plugin-registration-contract-cases.ts",
        'pluginId: "elevenlabs"',
      ],
      ["src/plugin-sdk/test-helpers/plugin-registration-contract-cases.ts", 'pluginId: "fal"'],
      ["src/plugin-sdk/test-helpers/plugin-registration-contract-cases.ts", 'pluginId: "gradium"'],
      ["src/plugin-sdk/test-helpers/plugin-registration-contract-cases.ts", 'pluginId: "kie"'],
      [
        "src/plugin-sdk/test-helpers/plugin-registration-contract-cases.ts",
        'pluginId: "microsoft"',
      ],
      ["src/plugin-sdk/test-helpers/plugin-registration-contract-cases.ts", 'pluginId: "pixverse"'],
      ["src/plugin-sdk/test-helpers/plugin-registration-contract-cases.ts", 'pluginId: "runway"'],
      [
        "src/plugin-sdk/test-helpers/plugin-registration-contract-cases.ts",
        'pluginId: "senseaudio"',
      ],
      [
        "src/plugin-sdk/test-helpers/plugin-registration-contract-cases.ts",
        'pluginId: "tts-local-cli"',
      ],
      ["src/plugin-sdk/test-helpers/plugin-registration-contract-cases.ts", 'pluginId: "vydra"'],
      ["src/plugins/contracts/providers.contract.test.ts", '"fal",'],
      ["src/proxy-capture/coverage.ts", 'modulePath: "extensions/microsoft/'],
      [
        "test/scripts/vitest-isolated-build.test.ts",
        '"src/plugins/setup-registry.migrations.test.ts",',
      ],
    ],
    // Its only test covers the removed Voice Call setup migration.
    testFiles: [
      "src/plugins/setup-registry.migrations.test.ts",
      // Full-suite run on the final branch (DEBLOAT_LOG.md 3.2).
      "src/meeting-bot/browser-plugin.metadata.test.ts",
      "src/meeting-bot/browser-plugin.node-host.test.ts",
      "src/meeting-bot/browser-plugin.config-setup.test.ts",
      "src/meeting-bot/session-runtime.test.ts",
      "src/secrets/runtime.coverage.test.ts",
    ],
    edits: [
      {
        // Voice Call was the only plugin with a state-retention Doctor repair. tsdown treats an
        // empty entry as "use src/index.ts", which put a 63 MB copy of the CLI in
        // dist/state-retention. The runtime resolves these files per plugin and tolerates absence.
        file: "tsdown.config.ts",
        why: "skip retained-doctor build surfaces that have no entries",
        apply: (text) =>
          text.replace(
            `  ...["config-doctor", "state-retention"].map((surface) =>
    nodeBuildConfig(
      {
        name: TSDOWN_UNIFIED_CONFIG_GROUP,
        // Keep retained config repairs in their own graph: shared public SDK chunks
        // otherwise pull state-migration exports into these pre-install artifacts.
        entry: collectRetainedDoctorBuildEntries({ ...bundledPluginBuildInventory, surface }),
        outDir: \`dist/\${surface}\`,
        deps: unifiedDeps,
      },
      false,
    ),
  ),`,
            `  ...["config-doctor", "state-retention"].flatMap((surface) => {
    const entry = collectRetainedDoctorBuildEntries({ ...bundledPluginBuildInventory, surface });
    // tsdown falls back to src/index.ts for an empty entry, which would bundle the whole CLI here.
    if (Object.keys(entry).length === 0) {
      return [];
    }
    return [
      nodeBuildConfig(
        {
          name: TSDOWN_UNIFIED_CONFIG_GROUP,
          // Keep retained config repairs in their own graph: shared public SDK chunks
          // otherwise pull state-migration exports into these pre-install artifacts.
          entry,
          outDir: \`dist/\${surface}\`,
          deps: unifiedDeps,
        },
        false,
      ),
    ];
  }),`,
          ),
      },
      // Full-suite run on the final branch (DEBLOAT_LOG.md 3.2).
      {
        file: "src/gateway/client-callsites.guard.test.ts",
        why: "drop the allowlisted Google Meet Gateway client callsite; the plugin is removed",
        apply: (text) =>
          text.replace('  "extensions/google-meet/src/voice-call-gateway.ts",\n', ""),
      },
    ],
  },
  {
    id: "nodes",
    apply: true,
    description: "native apps and node-host plugins (camera, screen, location, canvas panels)",
    extensions: ["linux-node", "canvas", "file-transfer", "logbook"],
    // apps/shared stays: the Control UI imports its tool-display.json and the mermaid renderer
    // writes into it. apps/.i18n stays for the native i18n tooling and its tests.
    paths: [
      "apps/android",
      "apps/ios",
      "apps/linux",
      "apps/macos",
      "apps/macos-mlx-tts",
      "apps/swabble",
    ],
    // Canvas-owned migration fixtures and compat records (DEBLOAT_LOG.md 2.4).
    testFiles: [
      "src/plugins/doctor-migration-resources.test.ts",
      // Full-suite run on the final branch (DEBLOAT_LOG.md 3.2).
      "src/commands/doctor-config-flow.canvas-migration.test.ts",
      "src/node-host/linux-node-plugin.integration.test.ts",
      "test/linux-dashboard-recovery.test.ts",
      "test/linux-quickchat-stream.test.ts",
      "test/scripts/android-mermaid-assets.test.ts",
      "test/scripts/android-perf-scripts.test.ts",
      "test/scripts/android-release-wrapper-args.test.ts",
      "test/scripts/canvas-cli-import-closure.test.ts",
      "test/scripts/run-swiftlint.test.ts",
    ],
    testCases: [
      ["src/commands/doctor/shared/deprecation-compat.test.ts", "keeps every record actionable"],
      [
        "src/config/config.plugin-validation.test.ts",
        "uses manifest defaults when warning about configured bundled plugins (#122746)",
      ],
      // Reads apps/macos and apps/android sources from HEAD with `git show`.
      ["src/config/talk-defaults.test.ts", "matches the Apple and Android runtime constants"],
      // Full-suite run on the final branch (DEBLOAT_LOG.md 3.2).
      [
        "packages/gateway-protocol/src/native-protocol-levels.guard.test.ts",
        "uses the min constant for native connect compatibility ranges",
      ],
      ["src/agents/openclaw-tools.browser-plugin.integration.test.ts", "binds delivery for %s"],
      [
        "src/commands/doctor-rehearsal-capture.test.ts",
        "keeps config and declared plugin resources while excluding disposable core images and aliases",
      ],
      [
        "src/gateway/config-reload.services.test-support.ts",
        "keeps sandbox tool-policy writes hot with registered Workboard and node workspace services",
      ],
      [
        "src/infra/host-env-security.test.ts",
        "keeps generated macOS host env policy in sync with shared JSON policy",
      ],
      [
        "test/scripts/android-release-signing.test.ts",
        "runs from an isolated copy without node_modules",
      ],
      [
        "test/scripts/apple-app-i18n.test.ts",
        "verification and compile-macos reject raw macOS interpolation and retain shared/iOS coverage",
      ],
      [
        "test/scripts/apple-app-i18n.test.ts",
        "warns only when obsolete Apple keys are the entire catalog drift",
      ],
      [
        "test/scripts/bundled-plugin-assets.test.ts",
        "keeps build-generated static assets out of the source watcher",
      ],
      [
        "test/scripts/changed-lanes-generated-extension-lint.test.ts",
        "still lints extension tests alongside a generated browser asset",
      ],
      [
        "test/plugin-npm-release.test.ts",
        "keeps deferred publication targets bundled with staged release metadata",
      ],
      [
        "test/scripts/android-app-i18n.test.ts",
        "counts manual resources reached only through the generated native lookup",
      ],
      [
        "test/scripts/android-app-i18n.test.ts",
        "keeps generated resources, runtime coverage, and every locale aligned",
      ],
      [
        "test/scripts/android-app-i18n.test.ts",
        "builds complete Wear and third-party resources for every native locale",
      ],
      ["test/scripts/android-app-i18n.test.ts", "preserves the existing Swedish app name"],
      [
        "test/scripts/android-screenshots.test.ts",
        "keeps fixture readiness and device restoration aligned",
      ],
      [
        "test/scripts/desktop-resize-proof.test.ts",
        "publishes fixed phases and known failure locations, not raw reporter content",
      ],
      [
        "test/scripts/full-release-validation-continuation-workflow.test.ts",
        "keeps target metadata narrow and runs the macOS preflight from the tooling tree",
      ],
      [
        "test/scripts/ios-lifecycle-workflow.test.ts",
        "executes cleanup and sibling suites with normal Debug signing: %s, main=%s",
      ],
      [
        "test/scripts/ios-lifecycle-workflow.test.ts",
        "executes auth and admitted lifecycle/UI suites in %s",
      ],
      [
        "test/scripts/ios-release-signing.test.ts",
        "emits manual App Store profile settings for every signed target",
      ],
      ["test/scripts/ios-release-signing.test.ts", "documents the canonical release signing plan"],
      [
        "test/scripts/ios-release-wrapper-args.test.ts",
        "routes stage recovery to the non-uploading lane with the saved identity",
      ],
      [
        "test/scripts/ios-release-wrapper-args.test.ts",
        "preserves Fastlane failures through the pinned shared runner",
      ],
      [
        "test/scripts/ios-release-wrapper-args.test.ts",
        "keeps the repository Gemfile after the caller changes directories",
      ],
      [
        "test/scripts/mobile-release-ci.test.ts",
        "prepares native tooling and runs the iOS signing proof through Fastlane",
      ],
      ["test/scripts/native-app-i18n.test.ts", "collects stable Android and Apple UI entries"],
      [
        "test/scripts/package-mac-app.test.ts",
        "requires the locked Peekaboo pin to match the requested elevation release source",
      ],
      [
        "test/scripts/restart-mac.test.ts",
        "keeps the restart grace period longer than the app signal failsafe",
      ],
      [
        "test/scripts/run-vitest.test.ts",
        "isolates mixed directories while respecting explicit isolation",
      ],
      [
        "test/scripts/test-extension.test.ts",
        "splits the $extensionId batch between persistence and channel owners without double counting",
      ],
      [
        "test/scripts/test-extension.test.ts",
        "infers the extension from the current working directory",
      ],
      ["test/scripts/test-extension.test.ts", "maps changed paths back to extension ids"],
      [
        "test/scripts/test-extension.test.ts",
        "lists available extension ids from git without reading extension directories",
      ],
      [
        "test/scripts/test-extension.test.ts",
        "keeps explicitly requested extensions without tests in batch plans",
      ],
      [
        "test/scripts/test-extension.test.ts",
        "counts tracked extension tests without walking extension directories",
      ],
      ["test/scripts/test-extension.test.ts", "confines extension roots $ids with $args"],
      [
        "test/scripts/test-extension.test.ts",
        "runs every Matrix process chunk after an earlier chunk fails",
      ],
      [
        "test/scripts/test-extension.test.ts",
        "keeps Matrix extension batch mode %s in one process",
      ],
      [
        "test/scripts/test-extension.test.ts",
        "fails explicitly requested extensions without tests by default",
      ],
      [
        "test/scripts/write-cli-startup-metadata.test.ts",
        "regenerates nodes help when bundled canvas CLI help sources change",
      ],
      [
        "test/vitest-projects-config.test.ts",
        "routes real extension database consumer %s to its fork owner",
      ],
      [
        "test/vitest-projects-config.test.ts",
        "routes iMessage $file through its worker owner without moving sibling tests",
      ],
      [
        "test/scripts/ci-workflow-guards.test.ts",
        "installs the Android SDK platform used by Gradle",
      ],
      [
        "test/scripts/ci-workflow-guards.test.ts",
        "isolates release credentials and verifies trusted AppImage and signing tools",
      ],
      [
        "test/scripts/test-projects-routing.test.ts",
        "keeps memory CLI runtime preparation with its infra test owner",
      ],
    ],
    edits: [
      {
        file: "scripts/write-cli-startup-metadata.ts",
        why: "stop hashing removed canvas sources into the nodes help signature",
        apply: (text) =>
          text.replace(/^[ \t]*path\.join\(sourceRootDir, "extensions\/canvas\/[^"]+"\),\n/gmu, ""),
      },
      // Full-suite run on the final branch (DEBLOAT_LOG.md 3.2).
      {
        // Its only user, the node-workspace reload case, is pruned above.
        file: "src/gateway/config-reload.services.test-support.ts",
        why: "stop loading the removed file-transfer plugin in the config-reload service tests",
        apply: (text) =>
          text.replace(/^const pluginEntries = await Promise\.all\(\n[\s\S]*?\n\);\n\n/mu, ""),
      },
    ],
    testRows: [
      // Full-suite run on the final branch (DEBLOAT_LOG.md 3.2).
      [
        "src/skills/loading/env-path-guidance.test.ts",
        'file: "extensions/canvas/skills/canvas/SKILL.md",',
      ],
    ],
  },
  {
    id: "harnesses",
    apply: true,
    description: "Codex, Copilot, ACP, OpenAI Agents API harnesses and the Crabbox cloud worker",
    // codex stays: the kept openai plugin imports ../codex/ and Telegram's tests expect the
    // Codex runtime (DEBLOAT_LOG.md 2.5).
    // agentsapi stays: the core session native-binding tests use it as their fixture harness
    // (22 of 34 cases fail without it) (DEBLOAT_LOG.md 2.5).
    // crabbox stays: the maintainer PR gates (scripts/pr-lib/gates.sh, pr-crabbox-gate-publisher,
    // package-manifest's dist/crabbox-wrapper.js launcher) run through scripts/crabbox-wrapper,
    // which imports the plugin's CLI runtime; ~25 tooling test files fail without it
    // (DEBLOAT_LOG.md 3.2). The lean profile denies it at runtime.
    extensions: ["copilot", "acpx"],
    testRows: [
      ["src/plugins/bundled-plugin-categories.test.ts", 'pluginId: "acpx"'],
      ["src/plugins/bundled-plugin-categories.test.ts", 'pluginId: "copilot"'],
    ],
    testFiles: [
      // Full-suite run on the final branch (DEBLOAT_LOG.md 3.2).
      "src/agents/harness/acp-native-approval-effect.process.test.ts",
      "src/agents/harness/acp-native-execution.process.test.ts",
      "src/agents/prepared-model-runtime.copilot.integration.test.ts",
      "src/gateway/server-methods/chat.native-runtime-consent.test.ts",
    ],
    testCases: [
      // Full-suite run on the final branch (DEBLOAT_LOG.md 3.2).
      [
        "src/acp/runtime/session-meta-doctor.test.ts",
        "migrates %s from legacy ACPX state beside an unrelated free ACP session",
      ],
      [
        "src/auto-reply/reply/commands-acp/install-hints.test.ts",
        "uses local acpx extension path when present",
      ],
      [
        "src/security/dangerous-config-flags.test.ts",
        "keeps plugin contract checks enabled for a malformed roster",
      ],
      [
        "test/scripts/ci-changed-node-test-plan.config-fallback.test.ts",
        "emits each affected-package file once through %s",
      ],
      [
        "test/scripts/ci-changed-node-test-plan.integration.test.ts",
        "selects channel chunk-contract suites when %s changes",
      ],
      [
        "test/scripts/ci-changed-node-test-plan.test.ts",
        "defers named process proofs without dropping mixed ordinary targets",
      ],
      [
        "test/scripts/ci-changed-node-test-plan.test.ts",
        "retains runtime proof child policies when release-only proofs are disabled (%s)",
      ],
      [
        "test/scripts/ci-changed-node-test-plan.test.ts",
        "keeps the complete Git tooling family in canonical serial owners (%s)",
      ],
      [
        "test/scripts/ci-changed-node-test-plan.test.ts",
        "retains delivery-cache coverage and private QA preparation",
      ],
      [
        "test/scripts/ci-changed-node-test-plan.test.ts",
        "routes lifecycle edits to the prepared QA config without losing boundary coverage",
      ],
      [
        "test/scripts/ci-proof-test-inventory.test.ts",
        "enumerates live audited files in the selected checkout without exempting renamed tests",
      ],
      [
        "test/scripts/generate-npm-package-lock.test.ts",
        "targets changed publishable plugin manifests",
      ],
      [
        "test/scripts/generate-npm-package-lock.test.ts",
        "falls back to every npm lock when lockfile ownership is ambiguous",
      ],
    ],
  },
  {
    id: "examples",
    apply: true,
    description: "bundled example app and custodian skills not needed by the keep set",
    extensions: [],
    paths: [
      "examples/ai-chat",
      "custodian-skills/add-model-provider",
      "custodian-skills/cloud-image-bake",
    ],
    testRows: [
      // Full-suite run on the final branch (DEBLOAT_LOG.md 3.2).
      ["src/skills/loading/workspace-skill-snapshot.test.ts", '"add-model-provider",'],
      ["src/skills/loading/workspace-skill-snapshot.test.ts", '"cloud-image-bake",'],
    ],
    edits: [
      // Full-suite run on the final branch (DEBLOAT_LOG.md 3.2).
      {
        // examples/ai-chat was the only workspace under examples/; git drops the empty directory,
        // so `COPY examples` fails the image build.
        file: "Dockerfile",
        why: "stop copying examples/ into the build; it no longer exists",
        apply: (text) =>
          text
            .replace("COPY examples /tmp/examples\n", "")
            .replace("mkdir -p /out/packages /out/examples ", "mkdir -p /out/packages ")
            .replace(" /tmp/examples/*/package.json", "")
            .replace("COPY --from=workspace-deps /out/examples/ ./examples/\n", ""),
      },
      {
        file: "scripts/docker/cleanup-smoke/Dockerfile",
        why: "stop copying example manifests; none remain",
        apply: (text) => text.replace("COPY --parents examples/*/package.json ./\n", ""),
      },
    ],
  },
];

const KEEP_EXTENSIONS = new Set([
  "anthropic",
  "telegram",
  "browser",
  "duckduckgo",
  "web-readability",
  "memory-core",
]);

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const skipInstall = args.includes("--skip-install");
const skipGenerate = args.includes("--skip-generate");
const onlyArg =
  args.find((arg) => arg.startsWith("--only="))?.slice("--only=".length) ??
  (args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined);
const only = onlyArg
  ? new Set(
      onlyArg
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    )
  : null;

const selected = GROUPS.filter((group) => (only ? only.has(group.id) : group.apply));
for (const group of selected) {
  for (const id of group.extensions) {
    if (KEEP_EXTENSIONS.has(id)) {
      throw new Error(`group ${group.id} lists keep plugin ${id}`);
    }
  }
}

const log = (message) => console.log(`[debloat] ${message}`);
const exists = (p) => fs.existsSync(path.join(ROOT, p));
// Files changed by registry pruning, test removals or group edits in this run; step 4b cleans
// their imports, unused declarations and formatting.
const touchedFiles = new Set();

function remove(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) {
    return false;
  }
  log(`${dryRun ? "would remove" : "remove"} ${relPath}`);
  if (!dryRun) {
    fs.rmSync(abs, { recursive: true, force: true });
  }
  return true;
}

function run(cmd, cmdArgs, { allowFailure = false } = {}) {
  log(`$ ${cmd} ${cmdArgs.join(" ")}`);
  if (dryRun) {
    return 0;
  }
  const result = spawnSync(cmd, cmdArgs, { cwd: ROOT, stdio: "inherit" });
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`${cmd} ${cmdArgs.join(" ")} exited ${result.status}`);
  }
  return result.status;
}

// ---- Lean config: allow only the keep plugins, deny every other plugin still in the tree --
// The deny list is regenerated from extensions/ so the profile never names removed plugins
// (unknown ids only warn, but a clean doctor run is part of the acceptance check).
const LEAN_CONFIG_PATH = "debloat/openclaw.lean.json5";
function writeLeanConfig() {
  const allow = [...KEEP_EXTENSIONS];
  const present = fs
    .readdirSync(path.join(ROOT, "extensions"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((id) => fs.existsSync(path.join(ROOT, "extensions", id, "openclaw.plugin.json")))
    .map(
      (id) =>
        JSON.parse(
          fs.readFileSync(path.join(ROOT, "extensions", id, "openclaw.plugin.json"), "utf8"),
        ).id ?? id,
    );
  const deny = present.filter((id) => !KEEP_EXTENSIONS.has(id)).toSorted();
  const list = (ids, indent) => ids.map((id) => `${indent}${JSON.stringify(id)},`).join("\n");
  const text = `// OpenClaw lean profile for this fork (generated by scripts/debloat/apply.mjs; edit there).
// Keeps: Telegram, Anthropic, exec/file tools, browser, web fetch, DuckDuckGo search, cron,
// heartbeat, builtin memory, sessions, goal tool, skills and plugin loaders.
// Use: OPENCLAW_CONFIG_PATH=/path/to/openclaw.lean.json5 openclaw gateway
// Secrets come from the environment: TELEGRAM_BOT_TOKEN and ANTHROPIC_API_KEY.
{
  agents: {
    defaults: {
      model: { primary: "anthropic/claude-sonnet-5-5" },
    },
  },
  channels: {
    telegram: {
      enabled: true,
      // Token: TELEGRAM_BOT_TOKEN. Unknown senders must be approved before they can chat.
      dmPolicy: "pairing",
      groups: { "*": { requireMention: true } },
    },
  },
  gateway: {
    mode: "local",
    bind: "loopback",
    // Token: OPENCLAW_GATEWAY_TOKEN (or run \`openclaw doctor --fix --generate-gateway-token\`).
    auth: { mode: "token" },
  },
  browser: {
    // Only Browser Relay Authentication v2 clients may attach.
    extensionRelay: { allowLegacyAuth: false },
  },
  memory: {
    search: {
      // Builtin engine, keyword (FTS) recall: Anthropic has no embeddings API.
      provider: "none",
      // Cross-conversation recall needs the Active Memory plugin, which this profile denies.
      rememberAcrossConversations: false,
    },
  },
  skills: {
    // Bundled skills offered to the model; add names here to bring more back.
    allowBundled: ["clawhub", "github", "gh-issues", "healthcheck", "skill-creator", "tmux", "weather"],
  },
  // No mDNS advertisement: there are no native apps or nodes to discover this Gateway.
  discovery: { mdns: { mode: "off" } },
  tools: {
    // Sessions tools see only the current session and its own sub-agents.
    sessions: { visibility: "tree" },
    // No cross-agent session reads or sends.
    agentToAgent: { enabled: false },
    web: {
      search: { provider: "duckduckgo" },
    },
  },
  update: { checkOnStart: false },
  telemetry: { enabled: false },
  plugins: {
    // Exclusive allowlist: plugin-owned tools outside it stay unavailable.
    allow: [
${list(allow, "      ")}
    ],
    // Deny wins over allow and auto-enable; lists every other plugin still in this tree.
    deny: [
${list(deny, "      ")}
    ],
    slots: { memory: "memory-core" },
    entries: {
      anthropic: { enabled: true },
      browser: { enabled: true },
      duckduckgo: { enabled: true },
    },
  },
}
`;
  const abs = path.join(ROOT, LEAN_CONFIG_PATH);
  const before = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
  if (before !== text) {
    log(
      `${dryRun ? "would write" : "write"} ${LEAN_CONFIG_PATH} (${allow.length} allowed, ${deny.length} denied)`,
    );
    if (!dryRun) {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, text);
    }
  }
}
if (args.includes("--lean-config-only")) {
  writeLeanConfig();
  process.exit(0);
}

// ---- 1. Collect removal targets -------------------------------------------------------
const removedExtensionIds = new Set();
const removedPackageNames = new Set();
const removedPaths = [];
for (const group of selected) {
  for (const id of group.extensions) {
    removedExtensionIds.add(id);
    const pkgPath = path.join(ROOT, "extensions", id, "package.json");
    if (fs.existsSync(pkgPath)) {
      const name = JSON.parse(fs.readFileSync(pkgPath, "utf8")).name;
      if (typeof name === "string") {
        removedPackageNames.add(name);
      }
    }
    removedPaths.push(`extensions/${id}`);
    for (const docsDir of ["channels", "providers", "plugins", "plugins/reference", "tools"]) {
      removedPaths.push(`docs/${docsDir}/${id}.md`, `docs/${docsDir}/${id}`);
    }
  }
  removedPaths.push(...(group.paths ?? []));
  for (const docPath of group.docs ?? []) {
    removedPaths.push(docPath);
  }
}

// ---- 2. Delete directories --------------------------------------------------------------
let removedCount = 0;
for (const target of removedPaths) {
  if (remove(target)) {
    removedCount += 1;
  }
}
log(`${removedCount} path(s) ${dryRun ? "to remove" : "removed"}`);

// ---- 3. Prune tests that import removed code ---------------------------------------------
// A test that imports a removed plugin cannot run; delete it, then delete tests that import
// those deleted helpers, until nothing changes. Production files are only reported.
const SCAN_ROOTS = ["src", "test", "packages", "ui", "scripts", "extensions", "qa", "tools"];
const CODE_EXT = /\.(?:[cm]?[jt]sx?)$/u;
const TESTISH =
  /(?:\.test\.|\.e2e\.|\.live\.|test-support|test-helpers?|test-harness|test-utils|test-fixtures?|\.cases\.|\/test\/|\/__tests__\/|\.fixture\.)/u;

function walk(dir, out) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) {
    return out;
  }
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) {
      continue;
    }
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(child, out);
    } else if (CODE_EXT.test(entry.name)) {
      out.push(child.replaceAll(path.sep, "/"));
    }
  }
  return out;
}

function escapeRe(value) {
  return value.replace(/[.*+?^${}()|[\]\\/]/gu, "\\$&");
}

const productionRefs = new Map();
// Files the prune pass deleted; later registry pruning treats them as removed too.
const prunedFiles = new Set();
{
  const idAlt = [...removedExtensionIds].map(escapeRe).join("|") || "(?!)";
  const pkgAlt = [...removedPackageNames].map(escapeRe).join("|");
  const importPrefix = String.raw`(?:from\s+|import\s*\(\s*|require\s*\(\s*|vi\.mock\(\s*|import\s+)["'\x60]`;
  // Imports of removed plugin code by workspace path or package name.
  const pluginImportRe = new RegExp(
    importPrefix +
      String.raw`(?:[^"'\x60]*extensions/(?:${idAlt})/` +
      (pkgAlt ? String.raw`|(?:${pkgAlt})(?:/|["'\x60])` : "") +
      ")",
    "u",
  );
  const specRe =
    /(?:from\s+|import\s*\(\s*|require\s*\(\s*|vi\.mock\(\s*|import\s+)["'\x60]([^"'\x60]+)["'\x60]/gu;
  const removedPrefixes = removedPaths.map((p) => p.replace(/\/$/u, ""));
  const deleted = new Set();
  const isGone = (candidate) =>
    deleted.has(candidate) ||
    removedPrefixes.some((prefix) => candidate === prefix || candidate.startsWith(`${prefix}/`));
  const resolveRel = (from, spec) => {
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
    const stem = base.replace(/\.(?:[cm]?js)$/u, "");
    return [
      base,
      ...[".ts", ".tsx", ".mts", ".cts", ".js", ".mjs"].map((ext) => stem + ext),
      `${base}/index.ts`,
    ];
  };
  const isTestish = (file) => TESTISH.test(file);
  // Standalone maintainer scripts exist to drive whatever they import (QA Lab runners,
  // live-channel probes); shared scripts/lib modules are registries and get trimmed.
  const isStandaloneScript = (file) =>
    file.startsWith("scripts/") && !file.startsWith("scripts/lib/");
  // Returns the specifiers in `text` that point at removed code.
  const removedSpecs = (file, text) => {
    const hits = [];
    for (const match of text.matchAll(specRe)) {
      const spec = match[1];
      if (pluginImportRe.test(match[0])) {
        hits.push(spec);
      } else if (spec.startsWith(".") && resolveRel(file, spec).some(isGone)) {
        hits.push(spec);
      }
    }
    return hits;
  };
  const files = SCAN_ROOTS.flatMap((dir) => walk(dir, []));
  // Read each file once; the cascade below only re-evaluates cached text.
  const textCache = new Map();
  const readCached = (file) => {
    if (!textCache.has(file)) {
      textCache.set(file, fs.readFileSync(path.join(ROOT, file), "utf8"));
    }
    return textCache.get(file);
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (const file of files) {
      if (deleted.has(file) || productionRefs.has(file) || isGone(file)) {
        continue;
      }
      const hits = removedSpecs(file, readCached(file));
      if (hits.length === 0) {
        continue;
      }
      const libOfRemovedModule =
        file.startsWith("scripts/lib/") && hits.some((spec) => !isTestish(spec));
      if (isTestish(file) || isStandaloneScript(file) || libOfRemovedModule) {
        deleted.add(file);
        changed = true;
      } else {
        productionRefs.set(file, hits);
      }
    }
  }
  for (const file of [...deleted].toSorted()) {
    remove(file);
    prunedFiles.add(file);
  }
  log(`${deleted.size} test/tool file(s) importing removed code ${dryRun ? "to prune" : "pruned"}`);
}

// Production files (build scripts, registries) lose the import and every line that only
// lists an imported binding, e.g. `  discordEntrypoint,` or `...Object.values(x),`.
function pruneImports(file, specs) {
  const abs = path.join(ROOT, file);
  if (!fs.existsSync(abs)) {
    return;
  }
  const before = fs.readFileSync(abs, "utf8");
  // `[^;]` keeps a side-effect `import "x";` from merging into the next import statement.
  const statementRe = /^import\s+(?:type\s+)?([^;]*?)\s+from\s+["']([^"']+)["'];?[ \t]*\n/gmu;
  const names = [];
  let text = before.replace(statementRe, (statement, clause, spec) => {
    if (!specs.includes(spec)) {
      return statement;
    }
    for (const part of clause.replace(/[{}]/gu, " ").split(",")) {
      const name = part
        .trim()
        .split(/\s+as\s+/u)
        .pop()
        ?.replace(/^type\s+/u, "")
        .trim();
      if (name && /^[A-Za-z_$][\w$]*$/u.test(name)) {
        names.push(name);
      }
    }
    return "";
  });
  for (const name of names) {
    const lineRe = new RegExp(
      String.raw`^[ \t]*(?:\.\.\.)?(?:Object\.values\()?${name}\)?,?[ \t]*\n`,
      "gmu",
    );
    text = text.replace(lineRe, "");
  }
  if (text !== before) {
    log(`${dryRun ? "would prune" : "prune"} removed imports in ${file}`);
    if (!dryRun) {
      fs.writeFileSync(abs, text);
    }
  }
  const leftover = specs.filter((spec) => text.includes(`"${spec}"`) || text.includes(`'${spec}'`));
  if (leftover.length > 0) {
    log(`WARNING ${file} still imports removed code (${leftover.join(", ")}); add a group edit`);
  }
  if (names.some((name) => new RegExp(String.raw`\b${name}\b`, "u").test(text))) {
    log(`WARNING ${file} still uses a pruned binding; add a group edit`);
  }
}
for (const [file, specs] of productionRefs) {
  pruneImports(file, specs);
}

// ---- 3b. String path registries (worker entrypoint maps, routing lists) -------------------
// Drop `"key": "path.ts",` object entries and `"path.ts",` list lines whose file was removed.
{
  const removedPrefixes = removedPaths.map((p) => p.replace(/\/$/u, ""));
  // Group testFiles are deleted in step 3c, after this pass, so they count as gone already.
  const groupTestFiles = new Set(selected.flatMap((group) => group.testFiles ?? []));
  const gone = (p) =>
    groupTestFiles.has(p) ||
    (!exists(p) &&
      (prunedFiles.has(p) ||
        removedPrefixes.some((prefix) => p === prefix || p.startsWith(`${prefix}/`))));
  const PATH = String.raw`"((?:extensions|test|src|scripts)\/[^"\n]+\.(?:[cm]?[jt]sx?))"`;
  const shapes = [
    // [\n  "path",\n  [...],\n],  (multi-line tuple, closed at the same indentation)
    new RegExp(String.raw`^([ \t]*)\[[ \t]*\n[ \t]*${PATH},[\s\S]*?\n\1\],?[ \t]*\n`, "gmu"),
    // ["path", ...],  (single-line tuple)
    new RegExp(String.raw`^()[ \t]*\[${PATH},.*\],?[ \t]*\n`, "gmu"),
    // "key": "path",  or  "key":\n  "path",
    new RegExp(String.raw`^()[ \t]*"[^"\n]+":\s*${PATH},?[ \t]*\n`, "gmu"),
  ];
  // "path",  as a plain list element (not the head of a tuple)
  const listLineRe = new RegExp(String.raw`^[ \t]*${PATH},?[ \t]*\n`, "gmu");
  const pruneText = (text) => {
    let out = text;
    for (const shape of shapes) {
      out = out.replace(shape, (match, _indent, target) => (gone(target) ? "" : match));
    }
    return out.replace(listLineRe, (match, target, offset, whole) => {
      if (!gone(target)) {
        return match;
      }
      const before = whole.slice(0, offset).trimEnd();
      // After `[` this is either a tuple head (`[\n "path",\n [...]`) or the first entry of
      // a flat list; it is a flat list when the next line is another string or the `]`.
      const next = whole.slice(offset + match.length).trimStart();
      const flatList = next.startsWith('"') || next.startsWith("]");
      return before.endsWith("[") && !flatList ? match : "";
    });
  };
  for (const dir of ["scripts/lib", "test/vitest"]) {
    for (const file of walk(dir, [])) {
      const abs = path.join(ROOT, file);
      if (!fs.existsSync(abs)) {
        continue;
      }
      const before = fs.readFileSync(abs, "utf8");
      // Registry rows naming a group test file (`{ testFile: "x.test.ts", ... }`,
      // `["name", "x.test.ts"]`) go whole, before the path-only pass below could leave `["name"]`.
      let rows = before;
      for (const testFile of groupTestFiles) {
        if (rows.includes(`"${testFile}"`)) {
          rows = removeTestRow(rows, `"${testFile}"`) ?? rows;
        }
      }
      const after = pruneText(rows);
      if (after !== before) {
        log(`${dryRun ? "would prune" : "prune"} removed paths listed in ${file}`);
        if (!dryRun) {
          fs.writeFileSync(abs, after);
        }
        touchedFiles.add(file);
      }
    }
  }
}

// ---- 3c. Test cases that exercise removed plugins inside otherwise-kept test files ----------
// Each group lists `testFiles` (delete whole file), `testCases` ([file, title]) for `it`/`test`
// blocks or `{ name: title }` table rows, and `testRows` ([file, text]) for `it.each` rows.
function removeLineRange(lines, from, to) {
  lines.splice(from, to - from + 1);
  if (
    from > 0 &&
    from < lines.length &&
    lines[from - 1].trim() === "" &&
    lines[from].trim() === ""
  ) {
    lines.splice(from, 1);
  }
}
// Wrapped calls (`it(\n  "title",\n  () => {...},\n);`) close with `);` instead of `});`.
// Lines inside a multi-line template literal (inline scripts, fixtures) are never the closer.
function blockEnd(lines, start, closer = /^[})]/u) {
  const indent = /^[ \t]*/u.exec(lines[start])[0];
  const backticks = (line) => (line.replace(/\\./gu, "").match(/`/gu) ?? []).length;
  let inTemplate = backticks(lines[start]) % 2 === 1;
  for (let j = start + 1; j < lines.length; j += 1) {
    const line = lines[j];
    if (
      !inTemplate &&
      line.startsWith(indent) &&
      closer.test(line.slice(indent.length)) &&
      !/^[ \t]/u.test(line.slice(indent.length))
    ) {
      return j;
    }
    if (backticks(line) % 2 === 1) {
      inTemplate = !inTemplate;
    }
  }
  return -1;
}
function removeTestCase(text, title) {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (
      !(line.includes(`"${title}`) || line.includes(`'${title}`) || line.includes(`\`${title}`))
    ) {
      continue;
    }
    let start = -1;
    // The callback closes after the `)(` line of an it.each table, not inside its type.
    let endFrom = -1;
    // Closing line of an it.each table: `])(`, `] as const)(`, `}>)(` and similar, or a bare
    // `)(` after a computed table such as `cases.map(...)`.
    const eachTail = /^\s*(?:[\]}][^"'`]*\)|\))\(/u;
    // `\w*` also admits local aliases such as `itUnix(` or `posixIt(`.
    if (/^\s*(?:it|test|describe)\w*(?:\.\w+)*\(/u.test(line)) {
      start = i;
    } else if (
      i > 0 &&
      (/^\s*(?:it|test|describe)\w*(?:\.\w+)*\(\s*$/u.test(lines[i - 1]) ||
        /^\s*(?:it|test)\.each\(.*\)\(\s*$/u.test(lines[i - 1]) ||
        // `it.skipIf(cond)(`, `it.runIf(cond)(` or an alias table such as
        // `itUnix.each([...] as const)(` with the title on the next line.
        /^\s*(?:it|test|describe)\w*(?:\.\w+)*\(.*\)\(\s*$/u.test(lines[i - 1]))
    ) {
      start = i - 1;
    } else if (
      eachTail.test(line) ||
      (i > 0 && eachTail.test(lines[i - 1]) && /^\s*["'`]/u.test(line))
    ) {
      // `])("title %s", ...)` closes an it.each table; the block starts at that it.each.
      const tail = eachTail.test(line) ? i : i - 1;
      const own = /^[ \t]*/u.exec(lines[tail])[0].length;
      for (let k = tail - 1; k >= 0; k -= 1) {
        const indent = /^[ \t]*/u.exec(lines[k])[0].length;
        // `it.each(`, `test.each(` or a local alias such as `posixIt.for(`.
        if (indent === own && /^\s*(?:it|test|\w+It)\.(?:each|for)\b/u.test(lines[k])) {
          start = k;
          endFrom = tail;
          break;
        }
        if (indent < own && lines[k].trim() !== "") {
          break;
        }
      }
    } else if (/^\s*(?:name|title|label):/u.test(line)) {
      const own = /^[ \t]*/u.exec(line)[0].length;
      for (let k = i - 1; k >= 0; k -= 1) {
        const indent = /^[ \t]*/u.exec(lines[k])[0].length;
        if (indent < own && /^\s*\{\s*$/u.test(lines[k])) {
          start = k;
          break;
        }
        if (indent < own) {
          break;
        }
      }
    }
    if (start < 0) {
      return null;
    }
    const end = blockEnd(lines, endFrom >= 0 ? endFrom : start);
    if (end < 0) {
      return null;
    }
    removeLineRange(lines, start, end);
    return lines.join("\n");
  }
  return null;
}
function removeTestRow(text, needle) {
  const lines = text.split("\n");
  let changed = false;
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].includes(needle)) {
      continue;
    }
    // A complete one-line row (`["a", "b"],`, `{ id: "a" },`) goes on its own, whatever list
    // it sits in.
    if (/^(?:\[.*\]|\{.*\}),?$/u.test(lines[i].trim())) {
      lines.splice(i, 1);
      i -= 1;
      changed = true;
      continue;
    }
    const own = /^[ \t]*/u.exec(lines[i])[0].length;
    let parent = -1;
    for (let k = i - 1; k >= 0; k -= 1) {
      if (lines[k].trim() !== "" && /^[ \t]*/u.exec(lines[k])[0].length < own) {
        parent = k;
        break;
      }
    }
    const opener = parent >= 0 ? lines[parent].trim() : "";
    // `key: {` opens a keyed entry of a registry object; it is a row as well. (`key: [` is a
    // list property, whose elements are removed one line at a time below.)
    const keyed = /^["']?[\w$-]+["']?:\s*\{$/u.test(opener);
    if (opener === "[" || opener === "{" || keyed) {
      // Element of a multi-line tuple or object row: drop the whole row.
      const end = blockEnd(lines, parent, opener.endsWith("[") ? /^\]/u : /^\}/u);
      if (end < 0) {
        continue;
      }
      lines.splice(parent, end - parent + 1);
      i = parent - 1;
      changed = true;
    } else if (
      /^(?:\[.*\]|\{.*\}|["'`][^"'`]*["'`]),?$|^[\w.]+\(.*\)[;,]$/u.test(lines[i].trim())
    ) {
      lines.splice(i, 1);
      i -= 1;
      changed = true;
    }
  }
  return changed ? lines.join("\n") : null;
}
for (const group of selected) {
  for (const file of group.testFiles ?? []) {
    remove(file);
  }
  const edits = [
    ...(group.testCases ?? []).map(([file, title]) => ({
      file,
      apply: (t) => removeTestCase(t, title),
      what: title,
    })),
    ...(group.testRows ?? []).map(([file, needle]) => ({
      file,
      apply: (t) => removeTestRow(t, needle),
      what: needle,
    })),
  ];
  for (const edit of edits) {
    const abs = path.join(ROOT, edit.file);
    if (!fs.existsSync(abs)) {
      continue;
    }
    const before = fs.readFileSync(abs, "utf8");
    const after = edit.apply(before);
    if (after === null) {
      // Already removed on an earlier run, or upstream renamed it; report so it is checked.
      if (before.includes(edit.what)) {
        log(`WARNING could not remove test "${edit.what}" from ${edit.file}`);
      }
      continue;
    }
    log(`${dryRun ? "would remove" : "remove"} test "${edit.what}" from ${edit.file}`);
    if (!dryRun) {
      fs.writeFileSync(abs, after);
    }
    touchedFiles.add(edit.file);
  }
}

// ---- 4. Prune per-group extra edits --------------------------------------------------------
for (const group of selected) {
  for (const edit of group.edits ?? []) {
    const abs = path.join(ROOT, edit.file);
    if (!fs.existsSync(abs)) {
      continue;
    }
    const before = fs.readFileSync(abs, "utf8");
    const after = edit.apply(before);
    if (after !== before) {
      log(`${dryRun ? "would edit" : "edit"} ${edit.file} (${edit.why})`);
      if (!dryRun) {
        fs.writeFileSync(abs, after);
      }
      touchedFiles.add(edit.file);
    }
  }
}

// ---- 4b. Imports left unused by removed tests, then formatting of every touched file ------
// noUnusedLocals and oxlint reject unused imports, and removals leave blank-line gaps; a
// re-run touches nothing, so this only acts on files changed in this run.
// `unused` names come from oxlint and are dropped even when the name still appears in a string
// or property key (`vi.spyOn(module, "name")`, `path: "..."`).
function pruneUnusedImports(text, unused = new Set()) {
  // `[^;]` keeps a side-effect `import "x";` from merging into the next import statement.
  const statementRe = /^import\s+(type\s+)?([^;]*?)\s+from\s+(["'][^"']+["']);?[ \t]*\n/gmu;
  return text.replace(statementRe, (statement, typeOnly, clause, spec, offset, whole) => {
    const rest = whole.slice(0, offset) + whole.slice(offset + statement.length);
    // `obj.name` is a property, not a use; `...name` (spread) is a use.
    const used = (name) =>
      !unused.has(name) &&
      new RegExp(String.raw`(?<![\w$])(?<![^.]\.)${escapeRe(name)}(?![\w$])`, "u").test(rest);
    const localName = (part) =>
      part
        .split(/\s+as\s+/u)
        .pop()
        .replace(/^type\s+/u, "")
        .trim();
    const braced = /\{([\s\S]*)\}/u.exec(clause);
    const head = clause
      .replace(/\{[\s\S]*\}/u, "")
      .replace(/,\s*$/u, "")
      .trim();
    const keepHead = head !== "" && used(head.replace(/^\*\s+as\s+/u, ""));
    const named = braced
      ? braced[1]
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean)
      : [];
    const keptNamed = named.filter((part) => used(localName(part)));
    if ((head === "" || keepHead) && keptNamed.length === named.length) {
      return statement;
    }
    if (!keepHead && keptNamed.length === 0) {
      return "";
    }
    // Only type specifiers left: `import type { X }`, not `import { type X }`.
    if (!keepHead && !typeOnly && keptNamed.every((part) => part.startsWith("type "))) {
      const names = keptNamed.map((part) => part.replace(/^type\s+/u, ""));
      return `import type { ${names.join(", ")} } from ${spec};\n`;
    }
    const parts = [
      ...(keepHead ? [head] : []),
      ...(keptNamed.length ? [`{ ${keptNamed.join(", ")} }`] : []),
    ];
    return `import ${typeOnly ?? ""}${parts.join(", ")} from ${spec};\n`;
  });
}
// Helpers, constants and fixtures that only removed tests used: drop each declaration oxlint
// reports unused. Destructuring and parameters are left for a group edit.
function declarationEnd(lines, start) {
  const head = lines[start];
  const opens = (head.match(/[{[(]/gu) ?? []).length;
  const closes = (head.match(/[}\])]/gu) ?? []).length;
  if (opens === closes && /;\s*$/u.test(head)) {
    return start;
  }
  let end = blockEnd(lines, start, /^[}\])>]/u);
  // `}) {` or `}): Promise<T> {` closes a multi-line signature and opens the body;
  // `} as const satisfies Record<` opens a type argument list.
  while (end >= 0 && /[{[(<]\s*$/u.test(lines[end])) {
    end = blockEnd(lines, end, /^[}\])>]/u);
  }
  // A variable or type statement runs to its semicolon: `]\n  .map(...)\n  .concat(x);`.
  if (end >= 0 && /^\s*(?:const|let|type)\s/u.test(head)) {
    while (end < lines.length - 1 && !/;\s*$/u.test(lines[end])) {
      end += 1;
    }
  }
  return end;
}
// A describe whose tests were all removed fails Vitest with "No test found in suite". Blocks
// that still call a registration helper (`registerXTests(...)`) keep their tests.
function pruneEmptyDescribes(text) {
  const lines = text.split("\n");
  for (let changed = true; changed;) {
    changed = false;
    for (let i = 0; i < lines.length; i += 1) {
      if (!/^\s*describe(?:\.\w+)*\(/u.test(lines[i]) || lines[i].includes(".each")) {
        continue;
      }
      const end = blockEnd(lines, i);
      const body = lines.slice(i + 1, end).join("\n");
      if (
        end < 0 ||
        /\b(?:it|test|\w+It)(?:\s*\.\s*\w+)*\s*\(|\b(?:register|install|describe)\w*\(/u.test(body)
      ) {
        continue;
      }
      removeLineRange(lines, i, end);
      changed = true;
      break;
    }
  }
  return lines.join("\n");
}
// `const { a, b } = await import(...)`: drop unused names from the pattern, and the whole
// statement once none is left.
function pruneUnusedBindings(text, unused) {
  const patternRe = /^([ \t]*)(?:const|let)\s+\{([^{}]*)\}\s*=/gmu;
  let out = text;
  for (const match of [...text.matchAll(patternRe)].toReversed()) {
    const parts = match[2]
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const local = (part) => part.split(":").pop().split("=")[0].trim();
    const kept = parts.filter((part) => !unused.has(local(part)));
    if (kept.length === parts.length) {
      continue;
    }
    const start = match.index;
    if (kept.length > 0) {
      const pattern = `{ ${kept.join(", ")} }`;
      const open = out.indexOf("{", start);
      const close = out.indexOf("}", open);
      out = out.slice(0, open) + pattern + out.slice(close + 1);
      continue;
    }
    // Whole statement: through the first line that ends with a semicolon.
    const endOfStatement = out.slice(start).search(/;[ \t]*\n/u);
    if (endOfStatement < 0) {
      continue;
    }
    const stop = start + endOfStatement + out.slice(start + endOfStatement).indexOf("\n") + 1;
    out = out.slice(0, start) + out.slice(stop);
  }
  return out;
}
function pruneUnusedDeclarations(files) {
  for (let pass = 0; pass < 6; pass += 1) {
    const result = spawnSync("pnpm", ["exec", "oxlint", "--format", "json", ...files], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
    });
    let report;
    try {
      report = JSON.parse(result.stdout.slice(result.stdout.indexOf("{")));
    } catch {
      log("WARNING could not read oxlint output; unused declarations were not pruned");
      return;
    }
    const byFile = new Map();
    const namesByFile = new Map();
    for (const diagnostic of report.diagnostics ?? []) {
      const line = diagnostic.labels?.[0]?.span?.line;
      const name = /'([^']+)'/u.exec(diagnostic.message)?.[1];
      if (diagnostic.code !== "eslint(no-unused-vars)" || !line || !name) {
        continue;
      }
      namesByFile.set(diagnostic.filename, [...(namesByFile.get(diagnostic.filename) ?? []), name]);
      if (/^(?:Variable|Function|Class|Type alias|Interface) /u.test(diagnostic.message)) {
        byFile.set(diagnostic.filename, [...(byFile.get(diagnostic.filename) ?? []), line - 1]);
      } else if (!byFile.has(diagnostic.filename)) {
        byFile.set(diagnostic.filename, []);
      }
    }
    let changed = false;
    for (const [file, starts] of byFile) {
      const abs = path.join(ROOT, file);
      const unusedNames = new Set(namesByFile.get(file) ?? []);
      let lines = fs.readFileSync(abs, "utf8").split("\n");
      const removedLets = [];
      // Bottom-up, so the line numbers of earlier declarations stay valid.
      for (const start of [...new Set(starts)].toSorted((a, b) => b - a)) {
        const text = lines[start] ?? "";
        if (
          !/^\s*(?:const|let|function|async function|class|type|interface)\s/u.test(text) ||
          /^\s*(?:const|let)\s+[{[]/u.test(text)
        ) {
          continue;
        }
        const end = declarationEnd(lines, start);
        if (end < 0) {
          continue;
        }
        let from = start;
        const indent = /^[ \t]*/u.exec(text)[0];
        while (from > 0 && lines[from - 1].startsWith(`${indent}//`)) {
          from -= 1;
        }
        removeLineRange(lines, from, end);
        const letName = /^\s*let\s+([\w$]+)/u.exec(text)?.[1];
        if (letName) {
          removedLets.push(letName);
        }
        changed = true;
      }
      // An unused `let x` may still be assigned (`x = module.x;` in a beforeAll); those
      // assignments would throw once the declaration is gone.
      for (const name of removedLets) {
        const assignment = new RegExp(String.raw`^\s*${escapeRe(name)}\s*=(?!=)[^;]*;\s*$`, "u");
        lines = lines.filter((line) => !assignment.test(line));
      }
      const before = lines.join("\n");
      // A describe kept only for an unused hook fixture (`const x = installHooks()`) is empty now.
      const after = pruneUnusedImports(
        pruneEmptyDescribes(pruneUnusedBindings(before, unusedNames)),
        unusedNames,
      );
      changed ||= after !== before;
      log(`${dryRun ? "would prune" : "prune"} unused declarations in ${file}`);
      if (!dryRun) {
        fs.writeFileSync(abs, after);
      }
    }
    if (!changed || dryRun) {
      return;
    }
  }
}
{
  const files = [...touchedFiles].filter((file) => exists(file) && CODE_EXT.test(file)).toSorted();
  for (const file of files) {
    const abs = path.join(ROOT, file);
    const before = fs.readFileSync(abs, "utf8");
    const after = pruneUnusedImports(pruneEmptyDescribes(before));
    if (after !== before) {
      log(`${dryRun ? "would prune" : "prune"} unused imports in ${file}`);
      if (!dryRun) {
        fs.writeFileSync(abs, after);
      }
    }
  }
  if (files.length > 0) {
    pruneUnusedDeclarations(files);
    run("pnpm", ["exec", "oxfmt", "--write", ...files], { allowFailure: true });
  }
}

// ---- 5. Docs navigation: drop pages and redirects that no longer exist ---------------------
function docExists(page) {
  const clean = page.replace(/^\//u, "").replace(/#.*$/u, "");
  return ["", ".md", ".mdx", "/index.md", "/index.mdx"].some((suffix) =>
    exists(`docs/${clean}${suffix}`),
  );
}
function pruneNav(node) {
  if (typeof node === "string") {
    return docExists(node) ? node : undefined;
  }
  if (Array.isArray(node)) {
    return node.map(pruneNav).filter((entry) => entry !== undefined);
  }
  if (node && typeof node === "object") {
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      if (
        key === "pages" ||
        key === "groups" ||
        key === "tabs" ||
        key === "navigation" ||
        key === "languages" ||
        key === "anchors" ||
        key === "dropdowns" ||
        key === "versions"
      ) {
        const pruned = pruneNav(value);
        out[key] = pruned;
      } else {
        out[key] = value;
      }
    }
    if (Array.isArray(out.pages) && out.pages.length === 0 && !out.groups && !out.root) {
      return undefined;
    }
    if (Array.isArray(out.groups) && out.groups.length === 0 && !out.pages) {
      return undefined;
    }
    return out;
  }
  return node;
}
{
  const docsJsonPath = path.join(ROOT, "docs/docs.json");
  if (fs.existsSync(docsJsonPath)) {
    const before = fs.readFileSync(docsJsonPath, "utf8");
    const docs = JSON.parse(before);
    docs.navigation = pruneNav(docs.navigation);
    if (Array.isArray(docs.redirects)) {
      docs.redirects = docs.redirects.filter(
        (redirect) =>
          typeof redirect.destination !== "string" ||
          /^https?:/u.test(redirect.destination) ||
          docExists(redirect.destination),
      );
    }
    const after = `${JSON.stringify(docs, null, 2)}\n`;
    if (after !== before) {
      log(`${dryRun ? "would prune" : "prune"} docs/docs.json navigation and redirects`);
      if (!dryRun) {
        fs.writeFileSync(docsJsonPath, after);
      }
    }
  }
}

// ---- 6. Reinstall (prunes lockfile importers) and regenerate inventories -------------------
// pnpm refuses patches whose package left the graph; drop those entries and retry.
function installPruningUnusedPatches() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    log("$ pnpm install --no-frozen-lockfile --prefer-offline");
    if (dryRun) {
      return;
    }
    const result = spawnSync("pnpm", ["install", "--no-frozen-lockfile", "--prefer-offline"], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
    });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    if (result.status === 0) {
      log("pnpm install ok");
      return;
    }
    const unused = /The following patches were not used:\s*([^\n]+)/u.exec(output);
    if (!unused) {
      process.stdout.write(output.slice(-4000));
      throw new Error(`pnpm install exited ${result.status}`);
    }
    const specs = unused[1]
      .split(",")
      .map((spec) => spec.trim())
      .filter(Boolean);
    const workspacePath = path.join(ROOT, "pnpm-workspace.yaml");
    let workspace = fs.readFileSync(workspacePath, "utf8");
    for (const spec of specs) {
      const lineRe = new RegExp(String.raw`^\s*"?${escapeRe(spec)}"?:\s*(patches/\S+)\s*\n`, "mu");
      const match = lineRe.exec(workspace);
      if (!match) {
        throw new Error(`unused patch ${spec} not found in pnpm-workspace.yaml`);
      }
      workspace = workspace.replace(lineRe, "");
      remove(match[1]);
      log(`drop unused patch ${spec}`);
    }
    fs.writeFileSync(workspacePath, workspace);
  }
  throw new Error("pnpm install kept reporting unused patches");
}
if (!skipInstall) {
  installPruningUnusedPatches();
}
if (!skipGenerate) {
  // The official external channel catalog is not regenerated: it keeps install-on-demand
  // hints (`openclaw plugins install @openclaw/<id>`) for plugins removed from this tree.
  for (const script of [
    "config:channels:gen",
    "config:schema:gen",
    "config:docs:gen",
    "plugins:inventory:gen",
    "runtime-sidecars:gen",
    "native-catalogs:gen",
  ]) {
    // A generator that does not apply on this checkout is reported, not fatal.
    if (run("pnpm", ["-s", script], { allowFailure: true }) !== 0) {
      log(`WARNING generator ${script} failed; inspect before committing`);
    }
  }
  // The SecretRef credential matrix doc has no package script; it is rendered from the secret
  // target registry exactly as src/secrets/target-registry.docs.test.ts expects.
  const matrixScript = [
    'import fs from "node:fs";',
    'process.env.OPENCLAW_BUNDLED_PLUGINS_DIR ??= "extensions";',
    'process.env.OPENCLAW_TEST_TRUST_BUNDLED_PLUGINS_DIR ??= "1";',
    'const { buildSecretRefCredentialMatrix } = await import("./src/secrets/credential-matrix.test-support.ts");',
    'fs.writeFileSync("docs/reference/secretref-user-supplied-credentials-matrix.json", `${JSON.stringify(buildSecretRefCredentialMatrix(), null, 2)}\\n`);',
  ].join("\n");
  const matrixArgs = ["--import", "./scripts/tsx.mjs", "--input-type=module", "-e", matrixScript];
  if (run("node", matrixArgs, { allowFailure: true }) !== 0) {
    log("WARNING SecretRef credential matrix generation failed; inspect before committing");
  }
}
// Generators such as native-catalogs:gen write into app trees; drop anything they recreated.
for (const target of removedPaths) {
  remove(target);
}
writeLeanConfig();
log("done");
