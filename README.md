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

1. In the Cloudflare dashboard go to **Workers & Pages → Create**, choose the
   **Pages** option (not the default Worker), then **Import an existing Git
   repository** and pick the `inventory_intake_form` repository. A Worker
   ignores the `functions/` folder, so the password and AI features wouldn't
   run, and it can't take a custom domain whose DNS is outside Cloudflare.
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
2. The domain's DNS is managed by **Squarespace**. Sign in at
   [account.squarespace.com/domains](https://account.squarespace.com/domains),
   click `lapluscharmante.com`, open **DNS**, and under **Custom records** add:
   - **Type:** CNAME
   - **Host:** `inventory`
   - **Data:** the `….pages.dev` target from step 1 (for this site,
     `lpc-inventory.pages.dev`)
3. Back in Cloudflare, wait for the domain to show **Active**. That's usually
   a few minutes, and can take up to a day.

Leave the other Squarespace DNS records alone. They connect the main domain
to the Shopify store and email.

## Updating it

Merging a pull request into `main` starts a new Cloudflare build
automatically. If no new entry appears under **Deployments**, commit any small
change to `main` (e.g. edit this README on GitHub) to start one. **Retry
deployment** only rebuilds the same older commit.

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

- Invoice scan adds **every jewelry item** on the invoice straight to the
  queue, each with its own AI description. Invoices in other languages are
  translated into English. Prices in other currencies are converted to
  dollars at the central-bank reference rate for the invoice's purchase date
  (from the free [Frankfurter](https://frankfurter.dev) service), and the
  original amounts and rate are shown on each queue item. If a rate isn't
  available, prices stay in the invoice's currency and the tool says so. Use
  **✎ Edit** on a queue item to correct it or add a photo.
- Invoice scan accepts PDFs (up to 20 MB) as well as photos. Photos are
  shrunk and converted to JPEG in the browser before scanning. HEIC photos
  only convert in Safari (iPhone or Mac). In other browsers, save the invoice
  as JPG, PNG or PDF first.
- AI requests use the `claude-opus-5-5` model at low effort. Each description
  or invoice scan costs a fraction of a cent. If the AI is unavailable, the
  tool says why and falls back to a basic description.

## IG Live Sale cards

**↓ IG Live cards** in the queue downloads a PDF with one 4×6" card per queue
item, sized for thermal mailing-label printers (Rollo, Zebra, MUNBYN, DYMO
4XL…). Each card shows the title, SKU, length × width, stone, ring size (when
there is one), weight, a large sale price and condition; empty fields are left
off. Print at 100% / actual size. The PDF library loads from jsDelivr the first
time, so it needs an internet connection.

## Shopify product tags

The **Shopify tags** tab prints product labels on **Avery Presta 94749**
barbell jewelry labels (½" × 2½", 45 per Letter sheet, 3 across × 15 down)
for products already listed in your store. Export your products from Shopify
admin (**Products → Export → CSV for Excel, Numbers, or other spreadsheet
programs**), choose that file in the tab, tick the products you want and set
how many labels each, then **↓ Labels PDF**.

Each label has the title, price, variant (e.g. size) and SKU on the left end
and a QR code on the right end that opens the product's page
(`https://lapluscharmante.com/products/<handle>`; the store address can be
changed in the tab). Draft and archived products are hidden unless **Active
only** is unticked. **Start at label #** skips labels already used on a partly
used sheet.

**Roll labels:** choose **Roll label 1" × 2.125"** under **Labels** to get a
PDF with one 2.125" × 1" label per page instead, for label printers such as a
DYMO LabelWriter (30336 labels) or a Rollo / Zebra / MUNBYN thermal printer.
These have a larger QR code and room for a long variant on its own line. In
the print dialog pick the label printer and the 1" × 2-1/8" (2.125 × 1 in)
paper size at 100%; turn on landscape if it prints sideways. Start at label #
and the alignment settings apply only to the Avery sheet.

Avery labels download as an exact Letter-size PDF. Open it and print with scale
**100% / Actual size**, not "Fit to page", which shrinks the sheet so labels
drift further off toward the bottom.

To calibrate a printer, open **Printer alignment** and download the
**alignment test**. Print it on plain paper and measure from the top edge of
label #1 to the top edge of label #43. On an exact print that's 233.4 mm; if
yours differs, enter your measurement and the labels are stretched to cancel
out the printer's scaling. Then hold the test over a label sheet and use
**Move right / Move down** (mm) for any remaining even shift. Settings are
remembered per browser. The PDF and QR code libraries load from jsDelivr the
first time, so they need an internet connection.

## Running it locally (optional, for development)

```sh
npm install
printf 'APP_PASSWORD="choose-one"\nANTHROPIC_API_KEY="sk-ant-..."\n' > .dev.vars
npm run dev    # http://localhost:8788
```

