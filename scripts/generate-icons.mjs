import { copyFile, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
const sharp = require("sharp");
const publicDir = new URL("../apps/web/public/", import.meta.url);
const logo = await readFile(new URL("logo.svg", publicDir));

await copyFile(new URL("logo.svg", publicDir), new URL("../favicon.svg", import.meta.url));
await sharp(logo).resize(32, 32).png().toFile(new URL("favicon-32.png", publicDir).pathname);

for (const [filename, size] of [["apple-touch-icon.png", 180], ["icon-192.png", 192], ["icon-512.png", 512]]) {
  const inset = Math.round(size * 0.2);
  const mark = await sharp(logo).resize(size - inset * 2, size - inset * 2).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: "#f8f6f3" } })
    .composite([{ input: mark, left: inset, top: inset }])
    .png()
    .toFile(new URL(filename, publicDir).pathname);
}

const png = await sharp(logo).resize(32, 32).png().toBuffer();
const header = Buffer.alloc(22);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header[6] = 32;
header[7] = 32;
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.length, 14);
header.writeUInt32LE(22, 18);
await writeFile(new URL("favicon.ico", publicDir), Buffer.concat([header, png]));
