import crypto from "node:crypto";
import { FastifyPluginAsync, FastifyReply } from "fastify";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { config } from "../config";
import { db } from "../db/client";
import { users } from "../db/schema";
import { hashPassword } from "../auth/password";
import { issueTokens } from "../auth/tokens";
import { ensureKoboSettingsRow } from "../services/koboSettings";
import { ensureSystemCollectionsForUser } from "../services/systemCollections";
import { randomToken } from "../utils/hash";
import { getSqliteUniqueConstraintColumns } from "../utils/sqliteErrors";
import { nowIso } from "../utils/time";

const COOKIE_NAME = "booklite_oidc";
const OIDC_PATH = "/api/v1/auth/oidc";
const FAILURE_REDIRECT = "/login?error=sso";

const discoverySchema = z.object({
  authorization_endpoint: z.string().url(),
  token_endpoint: z.string().url(),
  userinfo_endpoint: z.string().url()
});

const tokenSchema = z.object({ access_token: z.string().min(1) });

const userInfoSchema = z.object({
  email: z.string().email(),
  email_verified: z.literal(true),
  name: z.string().optional()
});

const callbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1)
});

type Discovery = z.infer<typeof discoverySchema>;

const fetchJson = async (url: string, init?: RequestInit): Promise<unknown> => {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`OIDC request to ${new URL(url).pathname} failed with ${response.status}`);
  return response.json();
};

const setCookie = (reply: FastifyReply, value: string, maxAgeSeconds: number): void => {
  const secure = config.baseUrl.startsWith("https://") ? "; Secure" : "";
  void reply.header(
    "set-cookie",
    `${COOKIE_NAME}=${value}; Path=${OIDC_PATH}; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax${secure}`
  );
};

const readCookie = (header: string | undefined): string | null => {
  for (const part of header?.split(";") ?? []) {
    const [name, value] = part.trim().split("=");
    if (name === COOKIE_NAME && value) return value;
  }
  return null;
};

const createMember = async (email: string, name: string | undefined): Promise<number> => {
  const base = [name?.trim(), email.split("@")[0]].find((value) => value && value.length >= 3) ?? "reader";
  const passwordHash = await hashPassword(randomToken());

  for (let attempt = 1; ; attempt += 1) {
    try {
      const [created] = await db
        .insert(users)
        .values({
          email,
          username: attempt === 1 ? base : `${base} ${attempt}`,
          passwordHash,
          role: "MEMBER",
          createdAt: nowIso(),
          disabledAt: null
        })
        .returning({ id: users.id });
      await ensureKoboSettingsRow(created.id);
      await ensureSystemCollectionsForUser(created.id, { preselectFavoritesForKobo: true });
      return created.id;
    } catch (error) {
      if (attempt >= 20 || !getSqliteUniqueConstraintColumns(error).includes("users.username")) throw error;
    }
  }
};

export const oidcRoutes: FastifyPluginAsync = async (fastify) => {
  const oidc = config.oidc;
  if (!oidc) return;

  const redirectUri = `${config.baseUrl.replace(/\/$/, "")}${OIDC_PATH}/callback`;
  let discovery: Promise<Discovery> | null = null;

  const discover = (): Promise<Discovery> => {
    discovery ??= fetchJson(`${oidc.issuer}/.well-known/openid-configuration`)
      .then((document) => discoverySchema.parse(document))
      .catch((error: unknown) => {
        discovery = null;
        throw error;
      });
    return discovery;
  };

  fastify.get(`${OIDC_PATH}/start`, async (_request, reply) => {
    const { authorization_endpoint } = await discover();
    const state = crypto.randomBytes(16).toString("base64url");
    const verifier = crypto.randomBytes(32).toString("base64url");

    const url = new URL(authorization_endpoint);
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: oidc.clientId,
      redirect_uri: redirectUri,
      scope: "openid profile email",
      state,
      code_challenge: crypto.createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256"
    }).toString();

    setCookie(reply, `${state}.${verifier}`, 600);
    return reply.redirect(url.toString());
  });

  fastify.get(`${OIDC_PATH}/callback`, async (request, reply) => {
    const [state, verifier] = readCookie(request.headers.cookie)?.split(".") ?? [];
    setCookie(reply, "", 0);

    const query = callbackSchema.safeParse(request.query);
    if (!query.success || !state || !verifier || query.data.state !== state) {
      return reply.redirect(FAILURE_REDIRECT);
    }

    try {
      const { token_endpoint, userinfo_endpoint } = await discover();
      const { access_token } = tokenSchema.parse(
        await fetchJson(token_endpoint, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code: query.data.code,
            redirect_uri: redirectUri,
            client_id: oidc.clientId,
            client_secret: oidc.clientSecret,
            code_verifier: verifier
          })
        })
      );
      const profile = userInfoSchema.parse(
        await fetchJson(userinfo_endpoint, { headers: { authorization: `Bearer ${access_token}` } })
      );
      const email = profile.email.trim().toLowerCase();

      const [existing] = await db
        .select({ id: users.id, disabledAt: users.disabledAt })
        .from(users)
        .where(sql`lower(trim(${users.email})) = ${email}`)
        .limit(1);
      if (existing?.disabledAt) return reply.redirect(FAILURE_REDIRECT);

      const userId = existing?.id ?? (await createMember(email, profile.name));
      const [user] = await db
        .select({ id: users.id, username: users.username, role: users.role })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const tokens = await issueTokens({ userId: user.id, username: user.username, role: user.role });
      return reply.redirect(`/login#sso=${tokens.refreshToken}`);
    } catch (error) {
      request.log.warn({ err: error }, "Single sign-on failed");
      return reply.redirect(FAILURE_REDIRECT);
    }
  });
};
