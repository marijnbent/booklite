"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const app_1 = require("../src/app");
const helpers_1 = require("./helpers");
(0, helpers_1.createTempEnv)();
const app = (0, app_1.buildApp)();
(0, vitest_1.describe)("auth", () => {
    (0, vitest_1.beforeAll)(async () => {
        await app.ready();
    });
    (0, vitest_1.it)("supports setup + login + me", async () => {
        const setup = await app.inject({
            method: "POST",
            url: "/api/v1/setup",
            payload: {
                email: "owner@example.com",
                username: "owner",
                password: "secret123"
            }
        });
        (0, vitest_1.expect)(setup.statusCode).toBe(201);
        const login = await app.inject({
            method: "POST",
            url: "/api/v1/auth/login",
            payload: {
                usernameOrEmail: "owner",
                password: "secret123"
            }
        });
        (0, vitest_1.expect)(login.statusCode).toBe(200);
        const tokens = login.json();
        (0, vitest_1.expect)(tokens.accessToken).toBeTypeOf("string");
        (0, vitest_1.expect)(tokens.refreshToken).toBeTypeOf("string");
        const me = await app.inject({
            method: "GET",
            url: "/api/v1/me",
            headers: {
                authorization: `Bearer ${tokens.accessToken}`
            }
        });
        (0, vitest_1.expect)(me.statusCode).toBe(200);
        (0, vitest_1.expect)(me.json().username).toBe("owner");
    });
    (0, vitest_1.it)("refresh rotates tokens", async () => {
        const login = await app.inject({
            method: "POST",
            url: "/api/v1/auth/login",
            payload: {
                usernameOrEmail: "owner",
                password: "secret123"
            }
        });
        const first = login.json();
        const refreshed = await app.inject({
            method: "POST",
            url: "/api/v1/auth/refresh",
            payload: {
                refreshToken: first.refreshToken
            }
        });
        (0, vitest_1.expect)(refreshed.statusCode).toBe(200);
        const second = refreshed.json();
        (0, vitest_1.expect)(second.refreshToken).not.toBe(first.refreshToken);
    });
});
