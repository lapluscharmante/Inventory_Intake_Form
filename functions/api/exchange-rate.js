// POST /api/exchange-rate — the US dollar rate for a currency, for converting
// invoice prices. Uses the free Frankfurter API (central-bank reference rates,
// no key needed): the rate for the invoice's purchase date when there is one,
// otherwise the latest.

import { errorResponse, jsonResponse, readJson, HttpError } from '../../lib/claude.js';

const FRANKFURTER_URL = 'https://api.frankfurter.dev/v2/rates';

export async function onRequestPost({ request }) {
  try {
    const { from, date } = await readJson(request);
    const currency = typeof from === 'string' ? from.trim().toUpperCase() : '';
    if (!/^[A-Z]{3}$/.test(currency)) throw new HttpError(400, 'Unknown currency code.');
    if (currency === 'USD') return jsonResponse({ rate: 1, date: date || '', currency });

    const today = new Date().toISOString().slice(0, 10);
    const validDate = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today ? date : '';

    // A historical date can fail (e.g. before the currency's data starts); fall back to the latest rate
    let found = validDate ? await fetchUsdRate(currency, validDate) : null;
    if (!found) found = await fetchUsdRate(currency, '');
    if (!found) throw new HttpError(502, 'No exchange rate is available for ' + currency + '.');
    return jsonResponse({ rate: found.rate, date: found.date, currency });
  } catch (error) {
    return errorResponse(error);
  }
}

async function fetchUsdRate(currency, date) {
  const params = new URLSearchParams({ base: currency, quotes: 'USD' });
  if (date) params.set('date', date);
  let response;
  try {
    response = await fetch(FRANKFURTER_URL + '?' + params, { headers: { Accept: 'application/json' } });
  } catch (e) {
    return null;
  }
  if (!response.ok) return null;
  const rates = await response.json().catch(() => null);
  const match = Array.isArray(rates) && rates.find((r) => r && r.quote === 'USD' && typeof r.rate === 'number' && r.rate > 0);
  return match ? { rate: match.rate, date: match.date } : null;
}
