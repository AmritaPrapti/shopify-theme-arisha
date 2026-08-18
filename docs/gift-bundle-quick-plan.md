# Gift Bundle — Quick Plan (Recipient Email + Gift Message)

> **Short version.** One path, no options. Full details, other options and the reasons
> behind each choice are in
> [`gift-bundle-recipient-email-and-message.md`](gift-bundle-recipient-email-and-message.md).

---

## The short version

| Her request | Status | Work needed |
|---|---|---|
| Fulfillment staff see the message and copy it into Canva | **Already works today** | Nothing. Only test it once. |
| Recipient gets an email through Klaviyo | **Not built** | Shopify Flow → Klaviyo. See section 4. |

Two facts to tell the client clearly:

1. The recipient gets **no email today**. The email address is only saved as text on the order.
2. Klaviyo **cannot** do this alone. It is not a settings toggle. Section 3 explains why.

---

## 1. What the storefront saves today

When the buyer fills the gift popup, the theme saves three notes on that product line of
the order (see [`blocks/gift_bundle_gift.liquid`](../blocks/gift_bundle_gift.liquid)):

| Name | Value |
|---|---|
| `Send as gift` | `Yes` |
| `Recipient first name` | required |
| `Recipient last name` | optional |
| `Recipient email` | what the buyer typed |
| `Message` | the personalized gift message |

These are called **line item properties** — extra text attached to one product line in the
order. It is only text. It does not send email and it does not create a customer.

The same details are **also** saved as **cart attributes**, which become the order's note
attributes. These are much easier to read in Shopify Flow and Klaviyo, and they appear in
the order CSV export:

| Attribute | Value |
|---|---|
| `Is gift order` | `Yes` |
| `Gift recipient first name` / `last name` / `email` | from the popup |
| `Gift message` | from the popup |
| `Gift bundle name` / `Gift bundle URL` | the product title and link |

**One limit:** a cart has only one set of attributes. On an order with two gifts for two
people, these hold the **last** gift only. The line item properties stay correct for every
gift, so use those when accuracy matters.

The text is visible in the Shopify admin on the order page, under the product name. It is
also on the packing slip and in the buyer's order confirmation email.

If a buyer buys two bundles for two different people, Shopify keeps them as two separate
lines, each with its own recipient and message. So multi-gift orders already work.

---

## 2. Request 2 — the gift message for the kitchen: already done

She only wants the staff to **see** the message so they can copy and paste it themselves
into their own Canva design. That works today. **There is nothing to build.**

**What the staff do:**

1. Open the order in the Shopify admin.
2. Look under the product name — the `Message` is printed there.
3. Select the text, copy it.
4. Paste into their Canva design, print on the kitchen printer.

Steps 3 and 4 are their own manual work. Canva is their tool, so there is nothing for us
to connect there.

**One thing to do:** place one test order and let the staff try this once, in the place
where they actually work (Shopify admin on desktop, or the Shopify mobile app). This
confirms they can see and copy the message. If they use an outside fulfillment app instead
of the Shopify admin, tell me and I will check that app shows the message too.

**Optional, not urgent:** the message field allows 500 characters, which may not fit a
small printed card. If she gives the card size, I can lower the limit in the code — I
suggest **200 characters**. This is an improvement, not a blocker.

---

## 3. Request 1 — why Klaviyo cannot do this alone

This is the part to explain to the client before promising anything.

Klaviyo sends email **to a profile**. A profile is a person that Klaviyo knows — one email
address with a history.

- Klaviyo knows the **buyer**, because Shopify sends the buyer to Klaviyo on every order.
- Klaviyo does **not** know the **recipient**. The recipient's email is only text on the order.

So a normal Klaviyo flow like "Placed Order" always mails the buyer. Even if the
recipient's email is visible inside the order data, Klaviyo has no setting that says
"send this one to the address in the line item property."

```
Buyer      rahim@gmail.com   → Klaviyo has a profile → email works ✅
Recipient  karim@gmail.com   → only text on the order → Klaviyo cannot mail him ❌
```

To fix this, the recipient must **become a profile in Klaviyo**, and a custom event must
fire **on that profile**. Then a Klaviyo flow can email them.

**Good news for the client:** Klaviyo stays the email tool. The design, the sending and
the reporting all happen inside Klaviyo, exactly like their marketing and abandoned cart
emails. We only add a small connection that tells Klaviyo *who* to send to. It uses
Shopify Flow, which is a **free** Shopify app, so there is no server and no hosting cost.

---

## 4. Request 1 — the path to build

```
Order is fulfilled
      │
      ▼
Shopify Flow (free app)  ──►  Klaviyo Events API
                               profile = RECIPIENT's email   ← the important part
                               metric  = "Gift Sent"
      │
      ▼
Klaviyo flow "Gift Sent"  ──►  email arrives to the recipient ✅
```

### Step 1 — Shopify Flow

Create one workflow in the Shopify Flow app:

- **Trigger:** Fulfillment created.
- **For each** line item in the order:
  - **Condition:** the line item property `Send as gift` is `Yes`.
  - **Action:** Send HTTP request (details in step 2).

### Step 2 — the HTTP request to Klaviyo

```
POST https://a.klaviyo.com/api/events/
Authorization: Klaviyo-API-Key <private api key>
revision: <current api revision date>
Content-Type: application/json
```

```json
{
  "data": {
    "type": "event",
    "attributes": {
      "metric":  { "data": { "type": "metric",  "attributes": { "name": "Gift Sent" } } },
      "profile": { "data": { "type": "profile", "attributes": { "email": "RECIPIENT_EMAIL" } } },
      "properties": {
        "recipient_first_name": "RECIPIENT FIRST NAME",
        "recipient_last_name":  "RECIPIENT LAST NAME",
        "gift_message": "MESSAGE TEXT",
        "buyer_name":   "BUYER FIRST NAME",
        "bundle_name":  "PRODUCT TITLE",
        "order_number": "1234"
      }
    }
  }
}
```

`RECIPIENT_EMAIL` and `MESSAGE TEXT` come from the line item properties of the current
line item. Confirm the current API revision date in Klaviyo's documentation before going
live.

### Step 3 — the Klaviyo flow

In Klaviyo, create a flow triggered by the metric **Gift Sent**. In the email template use
the event properties, for example `{{ event.gift_message }}` and `{{ event.buyer_name }}`.
Their team can edit this design themselves later, like any other Klaviyo email.

---

## 5. Rules we must follow

1. **Send when the order is fulfilled — not when the order is placed.** Cancelled orders,
   fraud orders and failed payments would email recipients about gifts that never ship.
   Fulfillment also means the note arrives near the parcel.
2. **Do not add recipients to marketing lists.** The recipient never gave permission.
   One gift notification is a transactional message and is fine, but adding them to
   marketing lists breaks GDPR / CAN-SPAM rules and damages the client's email
   reputation. Creating the profile through the Events API above does not subscribe them,
   which is what we want.
3. **No prices in the recipient's email.** The recipient must not see what the gift cost.
4. **Bounces are silent.** If the buyer types the email wrong, nobody notices. Someone
   must check failed sends to recipients in Klaviyo, at least in the first weeks.
5. **Test with real addresses before launch.** Place a test order and confirm the buyer
   gets the normal confirmation and the recipient gets the gift email.

---

## 6. Three questions for the client

1. **What does "delivery" mean?** Three possible meanings: (a) the recipient also gets
   shipping and delivered updates, (b) the buyer chooses **when** the gift email is sent,
   or (c) the parcel ships to the **recipient's address** instead of the buyer's. (c)
   changes checkout, not only email, so it is much bigger work.
2. **What is the printed card size?** Only to shorten the message field so it always fits
   the card. Optional.
3. **Who writes the recipient email design and text in Klaviyo** — her team or us?

---

## 7. What to do, in order

1. Place a test order. Confirm the staff can see and copy the message. *(Request 2 done.)*
2. Ask the client the three questions above.
3. Build the Shopify Flow → Klaviyo connection (steps 1–3 in section 4).
4. Lower the message character limit once she gives the card size.

If she answers question 1 with (b) — the buyer chooses the send date — we must also add a
**"Send on" date field** to the gift popup. It is not collected now. The recipient's first
and last name **are** already collected, so "Dear ___" on the card or in the email works.

---

## 8. Words used here

| Word | Simple meaning |
|---|---|
| **Line item property** | Extra text saved on one product line of an order. Only text. |
| **Profile** (Klaviyo) | One person in Klaviyo. Emails are sent to profiles. |
| **Metric / event** (Klaviyo) | Something that happened, e.g. "Placed Order", "Gift Sent". |
| **Flow** (Klaviyo) | Automatic email that starts when an event happens. |
| **Shopify Flow** | A free Shopify automation app. Not the same as a Klaviyo flow. |
| **Transactional email** | An email about an order, not marketing. Allowed without marketing consent. |
