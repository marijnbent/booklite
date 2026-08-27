const REDACTED = "***";

export const redactRequestUrl = (input: string): string => {
  const withRedactedKoboToken = input.replace(
    /^(\/api\/kobo\/)[^/?]+/,
    `$1${REDACTED}`
  );

  try {
    const url = new URL(withRedactedKoboToken, "http://booklite.local");
    for (const key of ["token", "access_token", "api_key", "apikey"]) {
      if (url.searchParams.has(key)) url.searchParams.set(key, REDACTED);
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return withRedactedKoboToken;
  }
};
