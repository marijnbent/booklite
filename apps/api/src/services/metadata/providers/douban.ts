import type { MetadataResult } from "../types";
import {
  cleanText,
  getFirstMatch,
  normalizeUrl,
  readMeta,
  stripTags,
  toQuery
} from "../text";

export const getDoubanMetadata = async (
  title: string,
  author?: string
): Promise<MetadataResult | null> => {
  const query = encodeURIComponent(toQuery(title, author)).replace(/%20/g, "+");
  const searchUrl = `https://search.douban.com/book/subject_search?search_text=${query}`;

  const searchResponse = await fetch(searchUrl, {
    method: "GET",
    signal: AbortSignal.timeout(10000)
  });
  if (!searchResponse.ok) return null;
  const searchHtml = await searchResponse.text();

  const firstBookHref = getFirstMatch(searchHtml, [
    /href="(https?:\/\/book\.douban\.com\/subject\/\d+\/)"/i,
    /(https?:\\\/\\\/book\.douban\.com\\\/subject\\\/\d+\\\/)/i
  ]);
  if (!firstBookHref) return null;

  const detailUrl = normalizeUrl(firstBookHref);
  const detailResponse = await fetch(detailUrl, {
    method: "GET",
    signal: AbortSignal.timeout(10000)
  });
  if (!detailResponse.ok) return null;
  const detailHtml = await detailResponse.text();

  const titleMatch = detailHtml.match(/<title>\s*([^<]+?)\s*\(豆瓣\)\s*<\/title>/i);
  const parsedTitle = titleMatch?.[1] ? cleanText(titleMatch[1]) : undefined;

  const authorMatch = detailHtml.match(/作者[^<]*<\/span>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);
  const parsedAuthor = authorMatch?.[1] ? cleanText(authorMatch[1]) : undefined;

  const parsedDescription =
    readMeta(detailHtml, "description", "name") ??
    (() => {
      const match = detailHtml.match(/id="link-report"[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i);
      return match?.[1] ? stripTags(match[1]) : undefined;
    })();

  const parsedCover =
    readMeta(detailHtml, "og:image", "property") ??
    (() => {
      const coverMatch = detailHtml.match(/id="mainpic"[\s\S]*?<img[^>]+src="([^"]+)"/i);
      return coverMatch?.[1];
    })();

  if (!parsedTitle) return null;

  return {
    title: parsedTitle,
    author: parsedAuthor,
    description: parsedDescription,
    coverPath: parsedCover,
    source: "DOUBAN"
  };
};
