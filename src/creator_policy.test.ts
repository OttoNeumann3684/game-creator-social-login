import assert from "node:assert/strict";
import test from "node:test";
import { creatorAccess, type CreatorState } from "./creator_policy.js";

test("an asset in the moderation queue cannot enter a live event", () => {
  const state: CreatorState = {
    asset: { id: "skin-7", ownerId: "player-2", status: "approved" },
    event: { id: "launch", opensAt: "2026-09-01T00:00:00Z", closesAt: "2026-10-01T00:00:00Z" },
    queue: { pendingAssetIds: ["skin-7"] }
  };
  assert.equal(creatorAccess(state, "player-2", new Date("2026-09-19T00:00:00Z")).canPublish, false);
  assert.equal(creatorAccess({ ...state, queue: { pendingAssetIds: [] } }, "player-2", new Date("2026-09-19T00:00:00Z")).canPublish, true);
});
