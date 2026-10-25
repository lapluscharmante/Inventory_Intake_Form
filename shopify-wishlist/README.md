# Wishlist for the Shopify store

A wishlist built into the store's Dawn theme. You don't install an app, pay a
subscription or sign up for anything.

- **Hearts everywhere:** a heart appears on every product card (collections,
  search, featured products, recommendations) and an **Add to wishlist**
  button sits under **Add to cart** on product pages. A heart icon with a
  count appears next to the cart in the header.
- **Multiple wishlists:** customers can create, rename and delete lists, and
  move pieces between them. With more than one list, tapping a heart asks
  which list(s) to save to.
- **Sharing:** each list can be shared by **email**, **text message**,
  **copy link**, or the phone's own share sheet. The person receiving it sees
  the list with live prices and stock, can buy from it, and can save a copy
  to their own wishlists.
- **Buy now:** every item has a **Buy now** button that adds it to the cart
  and goes straight to checkout. **Buy all** does the same for the whole list,
  skipping anything sold out. Customers choose a size or other option on the
  wishlist page. The size picked on the product page is remembered.
- **Matches the store:** fonts, colours, buttons, corners and borders come
  from the theme settings, so changes made in the theme editor carry over.
- **Desktop and mobile:** a two-column grid and bottom-sheet menus on phones,
  with 44px tap targets and no zooming when a field is tapped.

## How it works, and its limits

Wishlists are saved in each customer's browser, the same way a cart is
remembered before checkout. Nothing is stored on a server, so there's nothing
to host or pay for. This means:

- A customer's wishlists stay on the device and browser where they made them.
  They won't follow them from phone to laptop, and clearing browser data
  erases them. Sharing a list to themselves moves it to another device.
- **Email** and **Text message** open the customer's own Mail or Messages app
  with the message and link filled in, and the customer picks who to send it
  to. The store doesn't send any messages itself.
- The share link contains the list itself. Prices and stock are looked up
  fresh each time it's opened, so they're always current.

## Install (about 15 minutes)

You only need the Shopify admin. Try it on a copy of the theme first.

### 1. Make a copy of the live theme

**Online Store → Themes**, then on the live **Dawn** theme click **⋯ →
Duplicate**. Do the following steps on the copy (**⋯ → Edit code**).

### 2. Upload the files

In the code editor, add each file below to the folder with the same name.
Use **Add a new file** (or **Upload** for assets), name it exactly as shown,
and paste in the contents from this folder:

| Folder in Shopify | File |
|---|---|
| `assets` | `wishlist.js` |
| `assets` | `wishlist.css` |
| `snippets` | `wishlist.liquid` |
| `snippets` | `wishlist-heart.liquid` (optional) |
| `sections` | `wishlist-page.liquid` |
| `sections` | `wishlist-loader.liquid` |
| `templates` | `page.wishlist.json` |

### 3. Turn it on across the store

On the copy, click **Customize**. In the left sidebar, under **Footer**,
click **Add section** and choose **Wishlist**. Save. The section shows
nothing itself; it switches the hearts on everywhere. Its settings set the
filled heart colour (e.g. gold `#99793a`) and the header icon.

If you'd rather not use a section, paste `{% render 'wishlist' %}` just above
`</body>` in `layout/theme.liquid` instead.

### 4. Create the wishlist page

**Online Store → Pages → Add page**. Title it **Wishlist**, leave the content
empty, and under **Theme template** choose **wishlist**. Save. The address
must be `/pages/wishlist` (check **Search engine listing** at the bottom).

### 5. Turn off Wishlist Plus

The live theme has the **Wishlist Plus** app embed switched on. Turn it off
on the copy so customers don't see two sets of hearts: **Customize → App
embeds** (the icon in the left sidebar), switch off **Wishlist Plus**, and
**Save**. Once the new wishlist is live, you can uninstall Wishlist Plus
under **Settings → Apps**.

### 6. Preview, then publish

Use **⋯ → Preview** on the copy. Tap a few hearts, open the wishlist from the
header heart, try **Share** and **Buy now** on your phone. When it all looks
right, **Publish** the copy.

## Adjusting it

- **Page heading and spacing:** **Customize**, open the Wishlist page, and
  click the **Wishlist** section.
- **Heart colour and header icon:** the **Wishlist** section in the footer
  (step 3). Without a header icon, add a menu link to `/pages/wishlist`.
- **Wording:** everything customers read is in the `TEXT` list at the top of
  `wishlist.js`. It can also be overridden without editing that file, e.g.
  add `strings: { buyNow: 'Buy it now' }` to `window.WishlistConfig` in
  `snippets/wishlist.liquid`.
- **A heart somewhere else:** `{% render 'wishlist-heart', product: product %}`
  places a heart button anywhere a product is available.
- **Another theme:** hearts are found automatically on most themes. If a
  theme's product cards are missed, set `cardSelector` and
  `cardMediaSelector` in `window.WishlistConfig`, and change the button
  classes there (Dawn uses `button` and `button--secondary`).

## Files

| File | What it does |
|---|---|
| `assets/wishlist.js` | Hearts, saving lists, the wishlist page, sharing and Buy now |
| `assets/wishlist.css` | Styles, built on Dawn's theme settings |
| `snippets/wishlist.liquid` | Loads the above and passes in shop settings |
| `snippets/wishlist-heart.liquid` | Optional heart for placing by hand |
| `sections/wishlist-loader.liquid` | Turns the wishlist on store-wide from the footer group (editable in Customize) |
| `sections/wishlist-page.liquid` | The wishlist page section (editable in Customize) |
| `templates/page.wishlist.json` | Page template that uses that section |
