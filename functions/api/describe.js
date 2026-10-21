// POST /api/describe — writes a listing description from the item's form fields.

import { askClaude, errorResponse, jsonResponse, readJson, HttpError } from '../../lib/claude.js';

export async function onRequestPost({ request, env }) {
  try {
    const data = await readJson(request);
    if (!data || typeof data.title !== 'string' || !data.title.trim()) {
      throw new HttpError(400, 'Item title is required.');
    }
    const description = await askClaude(env, { content: buildPrompt(data) });
    return jsonResponse({ description });
  } catch (error) {
    return errorResponse(error);
  }
}

function buildPrompt(data) {
  const field = (key) => (typeof data[key] === 'string' ? data[key].trim() : '');
  const unit = field('dimUnit') || 'mm';
  const parts = [];
  if (field('metal')) parts.push('Metal: ' + field('metal'));
  if (field('category')) parts.push('Category: ' + field('category'));
  if (field('condition')) parts.push('Condition: ' + field('condition'));
  if (field('stone')) parts.push('Stone: ' + field('stone') + (field('stoneDetail') ? ' (' + field('stoneDetail') + ')' : ''));
  if (field('size')) parts.push('Size: ' + field('size'));
  if (field('weight')) parts.push('Weight: ' + field('weight') + 'g');
  if (field('length') || field('width')) {
    parts.push('Dimensions: ' + [
      field('length') ? field('length') + unit + ' length' : '',
      field('width') ? field('width') + unit + ' width' : '',
    ].filter(Boolean).join(', '));
  }
  if (field('desc')) parts.push('Additional notes: ' + field('desc'));
  return 'Write a compelling, accurate product listing description for an online jewelry store. '
    + 'Item: ' + field('title') + '. '
    + parts.join('. ') + '. '
    + 'Write 2-3 sentences in English, even if any details above are in another language. Professional tone, no fluff, no made-up claims. '
    + 'End with one sentence listing weight in grams'
    + (field('length') || field('width') ? ' and dimensions' : '')
    + '. Return only the description text, no headers or labels.';
}
