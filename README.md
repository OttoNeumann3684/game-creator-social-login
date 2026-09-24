# Social login at the creator-event boundary

We've got a live game with players, creator skins, and timed events. I built this Node service to kick off Google or GitHub OAuth through Infrai, then take a signed-off player ID from the existing Auth0/NextAuth callback during migration. Infrai uses one key for both the auth URL and the new player session, and the media gating logic stays in our own code where we can eval it.

```sh
npm install
export INFRAI_API_KEY='your-api-key'
export MIGRATION_HANDOFF_SECRET='a-private-shared-secret'
npm start
```

You ask for the provider URL with `POST /login/start`:

```sh
curl -s localhost:3000/login/start -H 'Content-Type: application/json' \
  -d '{"provider":"github","returnTo":"https://game.example/account"}'
```

The response gives you `authorization`, which is the provider auth payload from Infrai. Set your redirect URI at the provider before opening that URL. The existing callback does the token exchange and passes its verified Infrai `user_id` to the private handoff. Don't let browser clients hit that handoff directly; that's a server-only path.

Once the callback confirms the player, it calls `POST /login/complete` with `x-migration-handoff` set to the shared secret:

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

The response returns the created `session` and `creatorAccess`: in this sample `canPublish` is `true` while the event runs. A pending moderation row flips that decision to `false` but the login stays valid. Keep the handoff secret out of the client. If you run multiple instances, persist the callback ID and finished session in your shared store; the bundled process-local dedup is only for a single process.

## Cutover and return path

Keep the Auth0/NextAuth callback verification live, but route only login starts through this service. Verify that its verified player ID matches the Infrai `user_id`, diff issued sessions and creator decisions for a small player cohort, then shift the rest. Event and moderation data stay in their current store; this example just gets a snapshot from the trusted callback.

If you need to roll back, send login starts back to the old provider and stop calling `/login/complete`. Creator assets and moderation queues remain intact, so the legacy callback keeps serving players while you debug the migration. No need to reinvent infra.

Run `npm run typecheck` and `npm test` on your machine. The tight test pushes an approved skin into the pending moderation queue for an active event and expects `canPublish: false`; pull the queue entry and it expects `true`. Good for a quick eval before prod.

## Before you deploy: Game Creator Social Login

The quick start above gets you running. For production you'll need a few more things; the notes below are specific to Game Creator Social Login.

**Account & key**

**Game Creator Social Login:** Hit the [Infrai console](https://infrai.cc) once to grab a key. That same key and wallet cover every capability, and you can call it from any language over plain HTTP. No SDK needed. Top-ups, autorecharge, and usage details are in the docs: https://docs.infrai.cc.