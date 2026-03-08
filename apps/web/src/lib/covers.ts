import { getAccessToken } from "./api";

const appendToken = (input: string): string => {
  const token = getAccessToken();
  if (!token) return input;

  try {
    const url = input.startsWith("/")
      ? new URL(input, window.location.origin)
      : new URL(input);

    const sameOrigin = input.startsWith("/") || url.origin === window.location.origin;
    if (!sameOrigin || !url.pathname.startsWith("/api/")) {
      return input;
    }

    url.searchParams.set("token", token);
    return input.startsWith("/") ? `${url.pathname}${url.search}${url.hash}` : url.toString();
  } catch {
    return input;
  }
};

export const toRenderableCoverSrc = (coverPath: string | null | undefined): string | null => {
  if (!coverPath) return null;
  return appendToken(coverPath);
};
