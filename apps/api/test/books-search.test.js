"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const vitest_1 = require("vitest");
const app_1 = require("../src/app");
const helpers_1 = require("./helpers");
const { booksDir } = (0, helpers_1.createTempEnv)();
const app = (0, app_1.buildApp)();
let accessToken = "";
(0, vitest_1.describe)("books + search", () => {
    (0, vitest_1.beforeAll)(async () => {
        await app.ready();
        await app.inject({
            method: "POST",
            url: "/api/v1/setup",
            payload: {
                email: "owner2@example.com",
                username: "owner2",
                password: "secret123"
            }
        });
        const login = await app.inject({
            method: "POST",
            url: "/api/v1/auth/login",
            payload: {
                usernameOrEmail: "owner2",
                password: "secret123"
            }
        });
        accessToken = login.json().accessToken;
        const testFile = node_path_1.default.join(booksDir, "book.epub");
        node_fs_1.default.writeFileSync(testFile, "test", "utf8");
        const upload = await app.inject({
            method: "POST",
            url: "/api/v1/uploads",
            headers: {
                authorization: `Bearer ${accessToken}`
            },
            payload: {
                file: {
                    value: node_fs_1.default.readFileSync(testFile),
                    options: {
                        filename: "Author - Searchable Book.epub"
                    }
                }
            }
        });
        (0, vitest_1.expect)(upload.statusCode).toBe(202);
        await new Promise((resolve) => setTimeout(resolve, 2200));
    });
    (0, vitest_1.it)("returns books and supports FTS query", async () => {
        const allBooks = await app.inject({
            method: "GET",
            url: "/api/v1/books",
            headers: { authorization: `Bearer ${accessToken}` }
        });
        (0, vitest_1.expect)(allBooks.statusCode).toBe(200);
        const payload = allBooks.json();
        (0, vitest_1.expect)(payload.length).toBeGreaterThan(0);
        const search = await app.inject({
            method: "GET",
            url: "/api/v1/books?q=Searchable",
            headers: { authorization: `Bearer ${accessToken}` }
        });
        (0, vitest_1.expect)(search.statusCode).toBe(200);
        (0, vitest_1.expect)(search.json().length).toBeGreaterThan(0);
    });
});
