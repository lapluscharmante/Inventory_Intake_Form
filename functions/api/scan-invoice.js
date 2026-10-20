// POST /api/scan-invoice — reads a photo of an invoice or receipt and returns
// the jewelry item details it finds, in the same shape the form fields use.

import { askClaude, errorResponse, jsonResponse, readJson, HttpError } from '../../lib/claude.js';

const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const METALS = ['14k Yellow Gold', '14k White Gold', '14k Rose Gold', '18k Yellow Gold', '18k White Gold', 'Sterling Silver', 'Platinum', 'Gold Filled', 'Gold Plated', 'Other'];
const CATEGORIES = ['Ring', 'Necklace', 'Bracelet', 'Earrings', 'Pendant', 'Brooch', 'Anklet', 'Other'];
const CONDITIONS = ['New', 'Excellent', 'Very Good', 'Good', 'Fair'];

const FIELDS = {
  title: { type: 'string' },
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
  cost: { type: 'string', description: 'Purchase price paid, digits and decimal point only' },
  price: { type: 'string', description: 'Retail or sale price if listed, digits and decimal point only' },
  qty: { type: 'string' },
  vendor: { type: 'string' },
  purchase_date: { type: 'string', description: 'YYYY-MM-DD' },
};

const OUTPUT_FORMAT = {
  type: 'json_schema',
  schema: {
    type: 'object',
    properties: FIELDS,
    required: Object.keys(FIELDS),
    additionalProperties: false,
  },
};

const SYSTEM = 'You read jewelry invoices or purchase receipts and extract structured data about the item. '
  + 'Use an empty string for anything the invoice does not show. Do not guess. '
  + 'Numbers (weight, dimensions, prices, quantity) must be plain numbers with no units or currency symbols.';

export async function onRequestPost({ request, env }) {
  try {
    const { image, mediaType } = await readJson(request);
    if (typeof image !== 'string' || !image) throw new HttpError(400, 'No invoice image was sent.');
    if (!SUPPORTED_TYPES.includes(mediaType)) {
      throw new HttpError(415, 'This image format can\'t be read. Use a JPG or PNG (HEIC only works when opened in Safari).');
    }

    const text = await askClaude(env, {
      system: SYSTEM,
      outputFormat: OUTPUT_FORMAT,
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
        { type: 'text', text: 'Extract the jewelry item details from this invoice or receipt.' },
      ],
    });

    let fields;
    try {
      fields = JSON.parse(text);
    } catch (e) {
      throw new HttpError(502, 'Claude\'s answer could not be read.');
    }
    return jsonResponse({ fields });
  } catch (error) {
    return errorResponse(error);
  }
}
