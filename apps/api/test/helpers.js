"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTempEnv = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const createTempEnv = () => {
    const appDataDir = node_fs_1.default.mkdtempSync(node_path_1.default.join(node_os_1.default.tmpdir(), "booklite-api-data-"));
    const booksDir = node_fs_1.default.mkdtempSync(node_path_1.default.join(node_os_1.default.tmpdir(), "booklite-api-books-"));
    process.env.APP_DATA_DIR = appDataDir;
    process.env.BOOKS_DIR = booksDir;
    process.env.JWT_SECRET = "test-secret";
    process.env.PORT = "0";
    return { appDataDir, booksDir };
};
exports.createTempEnv = createTempEnv;
