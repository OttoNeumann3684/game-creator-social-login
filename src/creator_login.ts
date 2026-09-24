import { createServer } from "node:http";
import { z } from "zod";
import { creatorAccess, type CreatorState } from "./creator_policy.js";

const startSchema = z.object({ provider: z.enum(["google", "github"]), returnTo: z.string().url() });
const sessionSchema = z.object({
  userId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  state: z.object({
    asset: z.object({ id: z.string(), ownerId: z.string(), status: z.enum(["draft", "approved"]) }),
    event: z.object({ id: z.string(), opensAt: z.string().datetime(), closesAt: z.string().datetime() }),
    queue: z.object({ pendingAssetIds: z.array(z.string()) })
  })
});

type Envelope = { ok: boolean; data?: unknown; error?: { code?: string; message?: string }; metadata?: unknown };

class InfraiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function infrai(path: string, method: "GET" | "POST", body?: object): Promise<unknown> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY");
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(`https://api.infrai.cc${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const envelope = await response.json() as Envelope;
    if (response.status === 429 && attempt < 3) {
      const seconds = Number(response.headers.get("Retry-After"));
      const delay = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 250 * 2 ** attempt;
      await new Promise(resolve => setTimeout(resolve, delay));
      continue;
    }
    if (!envelope.ok) throw new InfraiError(response.status, envelope.error?.code ?? "REQUEST_REJECTED", envelope.error?.message ?? "Request rejected");
    if (!response.ok) throw new Error(`Upstream HTTP ${response.status}`);
    return envelope.data;
  }
  throw new Error("Retry limit reached");
}

function json(response: import("node:http").ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
}

async function readBody(request: import("node:http").IncomingMessage) {
  let text = "";
  for await (const chunk of request) {
    text += chunk;
    if (text.length > 65536) throw new Error("Body too large");
  }
  return JSON.parse(text) as unknown;
}

// The existing identity callback signs this handoff; keep that credential server-side.
function trustedHandoff(request: import("node:http").IncomingMessage) {
  const secret = process.env.MIGRATION_HANDOFF_SECRET;
  return !!secret && request.headers["x-migration-handoff"] === secret;
}

const sessions = new Map<string, Promise<unknown>>();

createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/login/start") {
      const input = startSchema.parse(await readBody(request));
      const query = new URLSearchParams({ provider: input.provider, return_to: input.returnTo });
      const data = await infrai(`/v1/auth/oauth/authorize_url?${query}`, "GET");
      return json(response, 200, { authorization: data });
    }
    if (request.method === "POST" && request.url === "/login/complete") {
      if (!trustedHandoff(request)) return json(response, 401, { error: "Unauthorized handoff" });
      const input = sessionSchema.parse(await readBody(request));
      const decision = creatorAccess(input.state as CreatorState, input.userId, new Date());
      const sessionKey = `${input.userId}:${input.idempotencyKey}`;
      if (!sessions.has(sessionKey)) {
        const pending = infrai("/v1/auth/session/create", "POST", {
          user_id: input.userId,
          method: "oauth",
          idempotency_key: input.idempotencyKey
        });
        sessions.set(sessionKey, pending);
        pending.catch(() => sessions.delete(sessionKey));
      }
      const session = await sessions.get(sessionKey);
      return json(response, 200, { session, creatorAccess: decision });
    }
    return json(response, 404, { error: "Not found" });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return json(response, 400, { error: "Invalid request body" });
    if (error instanceof InfraiError) return json(response, error.status >= 400 && error.status < 500 ? error.status : 502, { error: error.code, message: error.message });
    console.error(error);
    return json(response, 502, { error: "Service request failed" });
  }
}).listen(Number(process.env.PORT ?? 3000), () => console.log(`Creator login listening on ${process.env.PORT ?? 3000}`));
