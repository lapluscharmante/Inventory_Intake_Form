// Shared helper for the /api routes. The Anthropic API key only ever lives
// here on the server (the ANTHROPIC_API_KEY secret); the browser never sees it.

import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-opus-5-5';

export async function askClaude(env, { system, content, outputFormat }) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    // If Claude's safety filters wrongly decline a request, retry it on
    // Anthropic's recommended fallback model instead of failing.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: outputFormat ? { effort: 'low', format: outputFormat } : { effort: 'low' },
    ...(system ? { system } : {}),
    messages: [{ role: 'user', content }],
  });

  if (response.stop_reason === 'refusal') {
    throw new HttpError(422, 'Claude declined this request.');
  }
  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
  if (!text) throw new HttpError(502, 'Claude returned an empty response.');
  return text;
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Turns any failure into a JSON error the page can show.
export function errorResponse(error) {
  if (error instanceof HttpError) return jsonResponse({ error: error.message }, error.status);
  if (error instanceof Anthropic.AuthenticationError) {
    return jsonResponse({ error: 'The Anthropic API key is missing or invalid. Check the ANTHROPIC_API_KEY secret in Cloudflare.' }, 500);
  }
  if (error instanceof Anthropic.RateLimitError) {
    return jsonResponse({ error: 'Too many requests to Claude right now. Wait a moment and try again.' }, 429);
  }
  if (error instanceof Anthropic.BadRequestError) {
    return jsonResponse({ error: 'Claude rejected the request: ' + error.message }, 400);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return jsonResponse({ error: 'Couldn\'t reach Claude. Try again shortly.' }, 502);
  }
  if (error instanceof Anthropic.APIError) {
    return jsonResponse({ error: 'Claude API error (' + error.status + '). Try again shortly.' }, 502);
  }
  return jsonResponse({ error: 'Unexpected server error.' }, 500);
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch (e) {
    throw new HttpError(400, 'Request body must be JSON.');
  }
}
