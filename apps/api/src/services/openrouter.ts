interface OpenRouterJsonRequest {
  apiKey: string;
  model: string;
  systemMessage: string;
  userMessage: string;
  timeoutMs?: number;
}

const hasText = (value: string | undefined): value is string =>
  typeof value === "string" && value.trim().length > 0;

const parseJsonObject = (content: string): Record<string, unknown> | null => {
  const trimmed = content.trim();
  const strippedCodeFence = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  const start = strippedCodeFence.indexOf("{");
  const end = strippedCodeFence.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) return null;

  try {
    const parsed = JSON.parse(strippedCodeFence.slice(start, end + 1));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
};

const readMessageContent = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object") return null;
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;

  const first = choices[0];
  if (!first || typeof first !== "object") return null;
  const message = (first as { message?: unknown }).message;
  if (!message || typeof message !== "object") return null;
  const content = (message as { content?: unknown }).content;

  if (typeof content === "string") {
    return hasText(content) ? content : null;
  }

  if (Array.isArray(content)) {
    const joined = content
      .map((entry) => {
        if (!entry || typeof entry !== "object") return "";
        const text = (entry as { text?: unknown }).text;
        return typeof text === "string" ? text : "";
      })
      .filter((entry) => entry.length > 0)
      .join("\n")
      .trim();

    return hasText(joined) ? joined : null;
  }

  return null;
};

export const callOpenRouterJsonObject = async (
  request: OpenRouterJsonRequest
): Promise<Record<string, unknown> | null> => {
  if (!hasText(request.apiKey) || !hasText(request.model)) return null;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${request.apiKey}`
      },
      signal: AbortSignal.timeout(request.timeoutMs ?? 15000),
      body: JSON.stringify({
        model: request.model,
        response_format: { type: "json_object" },
        temperature: 0,
        messages: [
          { role: "system", content: request.systemMessage },
          { role: "user", content: request.userMessage }
        ]
      })
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as unknown;
    const content = readMessageContent(payload);
    if (!content) return null;

    return parseJsonObject(content);
  } catch {
    return null;
  }
};
