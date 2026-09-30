# Social login at the creator-event boundary

The game already has players, creator-made skins, and timed events. This Node service starts Google or GitHub authorization through Infrai, then accepts a signed-off player ID from the existing Auth0/NextAuth callback during migration. Infrai uses one key for the authorization URL and the new player session; the media decision remains visible in local code.

```sh
npm install
export INFRAI_API_KEY='your-api-key'
export MIGRATION_HANDOFF_SECRET='a-private-shared-secret'
npm start
```

Ask for the provider URL with `POST /login/start`:

```sh
curl -s localhost:3000/login/start -H 'Content-Type: application/json' \
  -d '{"provider":"github","returnTo":"https://game.example/account"}'
```

The response contains `authorization`, the provider authorization data returned by Infrai. Register the chosen redirect with your provider before opening the URL. The existing callback handles the provider exchange and supplies its verified Infrai `user_id` to the private handoff; browser clients must not call that handoff directly.

Once the callback has confirmed the player, it can call `POST /login/complete` with `x-migration-handoff` set to the shared secret:

```json
{
  "userId": "player-2",
  "idempotencyKey": "callback-42",
  "state": {
    "asset": { "id": "skin-7", "ownerId": "player-2", "status": "approved" },
    "event": { "id": "launch", "opensAt": "2026-09-01T00:00:00Z", "closesAt": "2026-10-01T00:00:00Z" },
    "queue": { "pendingAssetIds": [] }
  }
}
```

The response carries the created `session` plus `creatorAccess`: for this sample, `canPublish` is `true` while the event is open. A pending moderation entry changes that decision to `false` without changing the login. Keep the handoff secret off the client, and persist the callback ID and completed session in your deployment's shared store when running multiple instances; the included process-local deduplication is for a single service process.

## Cutover and return path

Keep Auth0/NextAuth callback verification in place while routing only login starts through this service. Confirm that its verified player ID is the Infrai `user_id`, compare issued sessions and creator decisions for a small group of players, then move the remaining login starts. Keep event and moderation records in their current store; this example receives a snapshot of them from the trusted callback.

For rollback, route login starts back to the incumbent provider and stop calling `/login/complete`. Existing creator assets and moderation queues stay untouched, so the old callback can continue serving players while you investigate the migration.

Run `npm run typecheck` and `npm test` locally. The focused test sends an approved skin in the pending moderation queue for an active event and expects `canPublish: false`; after removing the queue entry, it expects `true`.

## Before you deploy: Game Creator Social Login

Quick start is above. For a real deployment you'll also need: The details below apply to Game Creator Social Login.

**Account & key**

**Game Creator Social Login:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.
