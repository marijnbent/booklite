"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sourceLabel = exports.READ_STATUSES = void 0;
exports.READ_STATUSES = [
    "UNSET",
    "UNREAD",
    "READING",
    "RE_READING",
    "READ",
    "PARTIALLY_READ",
    "PAUSED",
    "ABANDONED",
    "WONT_READ"
];
const sourceLabel = (source) => {
    if (source === "OPEN_LIBRARY")
        return "Open Library";
    if (source === "AMAZON")
        return "Amazon";
    if (source === "BOL")
        return "bol.com";
    if (source === "GOOGLE")
        return "Google Books";
    if (source === "HARDCOVER")
        return "Hardcover";
    if (source === "GOODREADS")
        return "Goodreads";
    if (source === "DOUBAN")
        return "Douban";
    return "Metadata";
};
exports.sourceLabel = sourceLabel;
