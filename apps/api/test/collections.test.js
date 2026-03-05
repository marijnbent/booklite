"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const app_1 = require("../src/app");
const helpers_1 = require("./helpers");
(0, helpers_1.createTempEnv)();
const app = (0, app_1.buildApp)();
let accessToken = "";
let bookId = 0;
(0, vitest_1.describe)("collections", () => {
    (0, vitest_1.beforeAll)(async () => {
        await app.ready();
        await app.inject({
            method: "POST",
            url: "/api/v1/setup",
            payload: {
                email: "owner3@example.com",
                username: "owner3",
                password: "secret123"
            }
        });
        const login = await app.inject({
            method: "POST",
            url: "/api/v1/auth/login",
            payload: {
                usernameOrEmail: "owner3",
                password: "secret123"
            }
        });
        accessToken = login.json().accessToken;
        const books = await app.inject({
            method: "GET",
            url: "/api/v1/books",
            headers: { authorization: `Bearer ${accessToken}` }
        });
        if (books.json().length > 0) {
            bookId = books.json()[0].id;
        }
    });
    (0, vitest_1.it)("creates and lists collections", async () => {
        const created = await app.inject({
            method: "POST",
            url: "/api/v1/collections",
            headers: { authorization: `Bearer ${accessToken}` },
            payload: {
                name: "Favorites",
                icon: "star"
            }
        });
        (0, vitest_1.expect)(created.statusCode).toBe(201);
        const list = await app.inject({
            method: "GET",
            url: "/api/v1/collections",
            headers: { authorization: `Bearer ${accessToken}` }
        });
        (0, vitest_1.expect)(list.statusCode).toBe(200);
        (0, vitest_1.expect)(list.json().some((c) => c.name === "Favorites")).toBe(true);
    });
});
