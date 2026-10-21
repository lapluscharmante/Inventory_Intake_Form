# Jewelry Inventory Intake

The jewelry inventory intake tool, set up to run at `inventory.lapluscharmante.com`
behind a shared password.

- **Separate instances:** each person's queue is saved in their own browser,
  so several people can use the tool at once without seeing or overwriting each
  other's items. Auto-generated SKUs start with each person's initials
  (`AF-RI-001`), so they never clash when queues are merged or imported.
- **Password protected:** nothing is sent, not even the page, until the
  browser's login box is answered with the shared password. Any username works.
- **AI features:** description writing and invoice scanning go through a small
  server-side function that holds the Anthropic API key, so the key is never
  exposed in the page.

## What's in here

| Path | What it does |
|---|---|
| `public/index.html` | The intake tool itself |
| `functions/_middleware.js` | Password check that runs before every request |
| `functions/api/describe.js` | Writes listing descriptions with Claude |
| `functions/api/scan-invoice.js` | Reads invoice photos with Claude |
| `lib/claude.js` | Shared code for calling the Claude API |

## One-time setup (about 15 minutes)

You need a free [Cloudflare](https://dash.cloudflare.com/sign-up) account and an
Anthropic API key from the [Claude Console](https://platform.claude.com/)
(set a monthly spend limit there while you're at it).

### 1. Create the site on Cloudflare Pages

1. In the Cloudflare dashboard go to **Workers & Pages → Create → Pages →
   Connect to Git**, and pick the `inventory_intake_form` repository.
2. Build settings:
   - **Production branch:** `main`
   - **Framework preset:** None
   - **Build command:** `npm ci`
   - **Build output directory:** `public`
3. Click **Save and Deploy**. The first deploy will show "Not configured yet",
   which is expected until step 2 is done.

### 2. Add the two secrets

In the Pages project go to **Settings → Variables and Secrets → Add**, and add
both of these as type **Secret** for **Production** (and **Preview** if you use
preview branches):

| Name | Value |
|---|---|
| `APP_PASSWORD` | The password your team will type. Use a long one, e.g. four random words. |
| `ANTHROPIC_API_KEY` | Your Anthropic API key (starts with `sk-ant-`) |

Then go to **Deployments**, open the latest one's **⋯** menu and choose
**Retry deployment**. Secrets only take effect on a new deploy.

### 3. Put it on `inventory.lapluscharmante.com`

Do these in this order, so the address doesn't briefly show an error:

1. In the Pages project go to **Custom domains → Set up a custom domain**,
   enter `inventory.lapluscharmante.com` and continue. Cloudflare shows a
   CNAME target like `your-project.pages.dev`. Copy it.
2. In **Shopify admin → Settings → Domains**, click `lapluscharmante.com`,
   then **Domain settings → Edit DNS settings → Add custom record**:
   - **Type:** CNAME
   - **Name:** `inventory`
   - **Points to:** the `….pages.dev` target from step 1
3. Back in Cloudflare, wait for the domain to show **Active**. That's usually
   a few minutes, and can take up to a day.

If the domain was bought somewhere else (GoDaddy, Namecheap, etc.) and only
connected to Shopify, add the same CNAME record at that registrar instead. Your
store, `www` and email are unaffected either way.

## Sharing it

Send teammates the address and the password. On first use each person should:

1. Enter their initials in the **Your initials** box at the top. Their browser
   remembers it.
2. Use **↓ Export session** now and then as a backup. The queue lives in that
   browser only, so clearing browser data or switching devices loses it. Use
   **↑ Load session** to bring it back or to merge a teammate's items into
   yours.

If you already have items queued in the old copy of the tool, export a session
there and load it here. Browsers keep each site's saved data separate.

**To remove someone's access:** change `APP_PASSWORD` in Cloudflare, retry the
latest deployment, and send the new password to everyone who should keep
access.

## Notes

- Invoice scan accepts PDFs (up to 20 MB) as well as photos. Photos are
  shrunk and converted to JPEG in the browser before scanning. HEIC photos
  only convert in Safari (iPhone or Mac). In other browsers, save the invoice
  as JPG, PNG or PDF first.
- AI requests use the `claude-opus-5-5` model at low effort. Each description
  or invoice scan costs a fraction of a cent. If the AI is unavailable, the
  tool says why and falls back to a basic description.

## Running it locally (optional, for development)

```sh
npm install
printf 'APP_PASSWORD="choose-one"\nANTHROPIC_API_KEY="sk-ant-..."\n' > .dev.vars
npm run dev    # http://localhost:8788
```
