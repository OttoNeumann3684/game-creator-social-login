export type CreatorState = {
  asset: { id: string; ownerId: string; status: "draft" | "approved" };
  event: { id: string; opensAt: string; closesAt: string };
  queue: { pendingAssetIds: string[] };
};

export function creatorAccess(state: CreatorState, playerId: string, now: Date) {
  const eligible = state.asset.ownerId === playerId &&
    state.asset.status === "approved" &&
    !state.queue.pendingAssetIds.includes(state.asset.id) &&
    now >= new Date(state.event.opensAt) && now < new Date(state.event.closesAt);
  return { playerId, assetId: state.asset.id, eventId: state.event.id, canPublish: eligible };
}
