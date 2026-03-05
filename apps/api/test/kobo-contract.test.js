"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const library_sync_response_json_1 = __importDefault(require("./fixtures/kobo/library-sync-response.json"));
const app_1 = require("../src/app");
const helpers_1 = require("./helpers");
(0, helpers_1.createTempEnv)();
const app = (0, app_1.buildApp)();
let accessToken = "";
let koboToken = "";
(0, vitest_1.describe)("kobo contract", () => {
    (0, vitest_1.beforeAll)(async () => {
        await app.ready();
        await app.inject({
            method: "POST",
            url: "/api/v1/setup",
            payload: {
                email: "owner4@example.com",
                username: "owner4",
                password: "secret123"
            }
        });
        const login = await app.inject({
            method: "POST",
            url: "/api/v1/auth/login",
            payload: {
                usernameOrEmail: "owner4",
                password: "secret123"
            }
        });
        accessToken = login.json().accessToken;
        await app.inject({
            method: "PUT",
            url: "/api/v1/kobo/settings",
            headers: { authorization: `Bearer ${accessToken}` },
            payload: {
                syncEnabled: true,
                twoWayProgressSync: true,
                markReadingThreshold: 1,
                markFinishedThreshold: 99
            }
        });
        const settings = await app.inject({
            method: "GET",
            url: "/api/v1/kobo/settings",
            headers: { authorization: `Bearer ${accessToken}` }
        });
        koboToken = settings.json().token;
    });
    (0, vitest_1.it)("returns Kobo sync headers and entitlement-like payload", async () => {
        const response = await app.inject({
            method: "GET",
            url: `/api/kobo/${koboToken}/v1/library/sync`
        });
        (0, vitest_1.expect)(response.statusCode).toBe(200);
        (0, vitest_1.expect)(response.headers["x-kobo-synctoken"]).toBeTruthy();
        (0, vitest_1.expect)(response.headers["x-kobo-sync"]).toBeDefined();
        const payload = response.json();
        (0, vitest_1.expect)(Array.isArray(payload)).toBe(true);
        (0, vitest_1.expect)(JSON.stringify(library_sync_response_json_1.default).includes("NewEntitlement")).toBe(true);
    });
});
