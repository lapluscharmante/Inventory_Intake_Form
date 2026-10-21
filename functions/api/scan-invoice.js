// POST /api/scan-invoice — reads a photo or PDF of an invoice or receipt, in any
// language, and returns every jewelry item on it translated into English.

import { askClaude, errorResponse, jsonResponse, readJson, HttpError } from '../../lib/claude.js';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const METALS = ['14k Yellow Gold', '14k White Gold', '14k Rose Gold', '18k Yellow Gold', '18k White Gold', 'Sterling Silver', 'Platinum', 'Gold Filled', 'Gold Plated', 'Other'];
const CATEGORIES = ['Ring', 'Necklace', 'Bracelet', 'Earrings', 'Pendant', 'Brooch', 'Anklet', 'Other'];
const CONDITIONS = ['New', 'Excellent', 'Very Good', 'Good', 'Fair'];

// One entry per jewelry line item on the invoice.
const ITEM_FIELDS = {
  title: { type: 'string', description: 'Short English product title, e.g. "18k Yellow Gold Diamond Solitaire Ring"' },
  metal: { type: 'string', enum: [''].concat(METALS) },
  category: { type: 'string', enum: [''].concat(CATEGORIES) },
  condition: { type: 'string', enum: [''].concat(CONDITIONS) },
  weight_g: { type: 'string' },
  length: { type: 'string' },
  width: { type: 'string' },
  dim_unit: { type: 'string', enum: ['', 'mm', 'in'] },
  ring_size: { type: 'string' },
  stone: { type: 'string' },
  stone_detail: { type: 'string' },
  cost: { type: 'string', description: 'Price paid per unit (not the line total)' },
  price: { type: 'string', description: 'Retail or sale price per unit, only if the invoice lists one' },
  qty: { type: 'string' },
  notes: { type: 'string', description: 'Other useful details from the line, in English (item codes, finish, style); empty if none' },
};

const OUTPUT_FORMAT = {
  type: 'json_schema',
  schema: {
    type: 'object',
    properties: {
      language: { type: 'string', description: 'English name of the invoice\'s main language, e.g. "Italian"' },
      currency: { type: 'string', description: 'ISO 4217 code of the invoice\'s currency, e.g. "USD", "EUR"; empty if unclear' },
      vendor: { type: 'string', description: 'Seller\'s business name, in Latin letters (transliterated if needed)' },
      purchase_date: { type: 'string', description: 'YYYY-MM-DD' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: ITEM_FIELDS,
          required: Object.keys(ITEM_FIELDS),
          additionalProperties: false,
        },
      },
    },
    required: ['language', 'currency', 'vendor', 'purchase_date', 'items'],
    additionalProperties: false,
  },
};

const SYSTEM = 'You read jewelry invoices or purchase receipts and extract every jewelry item on them, one entry per line item. '
  + 'Skip lines that are not jewelry, such as shipping, tax, discounts, packaging or fees. '
  + 'The invoice may be in any language: translate all text into English, using standard English jewelry terms '
  + '(for example "oro giallo 18kt" is "18k Yellow Gold", "Ohrringe" is "Earrings"). '
  + 'Use an empty string for anything the invoice does not show. Do not guess. '
  + 'Numbers (weight, dimensions, prices, quantity) must be plain numbers with a period as the decimal separator and no thousands separators, units or currency symbols '
  + '(for example "1.250,50 €" is "1250.50"). Do not convert currencies.';

export async function onRequestPost({ request, env }) {
  try {
    const { image, mediaType } = await readJson(request);
    if (typeof image !== 'string' || !image) throw new HttpError(400, 'No invoice file was sent.');
    let fileBlock;
    if (mediaType === 'application/pdf') {
      fileBlock = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: image } };
    } else if (IMAGE_TYPES.includes(mediaType)) {
      fileBlock = { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } };
    } else {
      throw new HttpError(415, 'This file format can\'t be read. Use a PDF, JPG or PNG (HEIC only works when opened in Safari).');
    }

    const text = await askClaude(env, {
      system: SYSTEM,
      outputFormat: OUTPUT_FORMAT,
      content: [
        fileBlock,
        { type: 'text', text: 'Extract every jewelry item from this invoice or receipt, translated into English.' },
      ],
    });

    let invoice;
    try {
      invoice = JSON.parse(text);
    } catch (e) {
      throw new HttpError(502, 'Claude\'s answer could not be read.');
    }
    return jsonResponse({ invoice });
  } catch (error) {
    return errorResponse(error);
  }
}
