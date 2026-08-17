# Gift Bundle — Recipient Email and Gift Message

> **Detailed version.** For the short, decided plan with no options, read
> [`gift-bundle-quick-plan.md`](gift-bundle-quick-plan.md). This file keeps every
> detail, including the options we did not choose and the reasons why.

**What this document is for:** the client asked two things — (1) send an email to the
gift recipient using Klaviyo, and (2) let the kitchen staff see and print the
personalized message. This document explains what already works today, what does
not work, and how to build the missing parts.

Written in simple English so it can be shared with the client and the team.

---

## 1. Quick answers

| Question | Answer |
|---|---|
| Does the recipient get any email now? | **No.** Nobody emails the recipient today. |
| Does the fulfillment staff see the personalized message now? | **Yes.** It is visible on the order page in the Shopify admin. |
| So is request 2 already solved? | **Yes, fully.** Staff can see the message and copy it themselves. Nothing to build. |
| When someone buys, whose email goes to Klaviyo? | **Only the buyer's email.** The recipient's email does not go to Klaviyo. |
| Can we just switch Klaviyo on for the recipient? | **No.** It needs a small piece of plumbing. Section 4 explains why. |

**In one line:** Request 2 is already finished — nothing to build. Request 1 is not built
at all and needs real work.

---

## 2. What the storefront saves today

When a customer fills the gift popup and adds a bundle to the cart, the theme saves
three **line item properties** on that cart line
(see [`blocks/gift_bundle_gift.liquid`](../blocks/gift_bundle_gift.liquid)):

| Property name | Value |
|---|---|
| `Send as gift` | `Yes` (always, because gift details are now required) |
| `Recipient first name` | required |
| `Recipient last name` | optional (can be made required in the block settings) |
| `Recipient email` | what the buyer typed, e.g. `friend@example.com` |
| `Message` | the personalized gift message |

**What is a "line item property"?** It is extra text attached to one product line in
the order. Think of it as a small note stuck to that one item. It is only text.
It does not send email. It does not create a customer. It just sits on the order.

This is important to understand clearly:

> Saving the recipient email on the order **does not** mean Shopify or Klaviyo will
> ever email that person. It only means the address is written down.

Where this text is visible:

- ✅ Shopify admin → the order page, under the product name
- ✅ Checkout page and the buyer's order confirmation email
- ✅ Packing slips and most fulfillment apps
- ❌ **Not** in Klaviyo as a person who can be emailed
- ❌ **Not** in the normal Shopify order CSV export (please verify in the admin)

One more useful behaviour: if a buyer buys two bundles for two different people,
Shopify keeps them as **two separate lines**, each with its own recipient and message,
because their properties are different. So multi-gift orders already work correctly.

---

## 3. Request 2 first (the easy one): gift message for the kitchen — already done

She is not asking us to build a printing system. She only wants the staff to **see** the
message so they can copy and paste it themselves into their own Canva design. That already
works today. **Nothing needs to be built.**

**What the staff do:**

1. Open the order in the Shopify admin.
2. Look under the product name — `Recipient email` and `Message` are printed there.
3. Select the message text and copy it.
4. Paste it into their Canva design and print on the kitchen printer.

Steps 3 and 4 are their own manual work. Canva is their tool, not part of the theme, so
there is nothing for us to connect or support there.

**Action item — one test order.** Create one test order and check the staff can see and
copy the message in the place where they actually work. That may be:

- the Shopify admin on a desktop, or
- the Shopify mobile app, or
- a 3PL / fulfillment app dashboard, if they use one.

If they use an outside fulfillment app instead of the Shopify admin, we must confirm that
app shows line item properties. Most do, but it must be tested.

**Optional, not urgent.** The message field allows 500 characters, which may not fit a
small printed card. If she tells us the card size, we can lower the limit in the code so
buyers cannot write more than the card can hold. This is a nice improvement, not a
blocker.

---

## 4. Request 1 (the hard one): email the recipient with Klaviyo

### 4.1 What happens today

Today Klaviyo only knows the **buyer**. When an order is placed, Klaviyo's Shopify
integration creates or updates a profile for the buyer's email and records events like
"Placed Order" on that profile. That is how their marketing and abandoned cart emails
work today, and that part is fine.

The recipient's email is only text inside the order. Klaviyo does not treat it as a
person. So no email is ever sent to the recipient.

### 4.2 Why this is not just a setting (very important)

This is the point that must be explained to the client before any promise is made.

**Klaviyo always sends email to a "profile", not to an address written inside an event.**

A **profile** in Klaviyo is a person — one email address with a history. A **flow** in
Klaviyo is triggered by an event on a profile, and the email goes to *that* profile.

So if we trigger a flow from the normal "Placed Order" event:

- The event belongs to the **buyer's** profile.
- Therefore the email goes to the **buyer**.
- Even if the recipient's email is visible inside the event data, Klaviyo has **no
  option** that says "send this one to the address in the line item property".

Simple picture of the problem:

```
Buyer  rahim@gmail.com   ← Klaviyo has a profile for him.   Email goes here. ✅
Recipient karim@gmail.com ← Only text on the order.          Klaviyo cannot mail him. ❌
```

### 4.3 The solution

We must make the recipient a **profile in Klaviyo**, and fire a **custom event on that
profile**. Then a Klaviyo flow can email them.

Good news for the client: **Klaviyo stays the email tool.** The design, the sending, the
reporting — all inside Klaviyo, exactly like their other emails. We only add a small
piece of plumbing that tells Klaviyo *who* to send to.

```
Shopify order (paid or fulfilled)
        │
        │  read the line items that have "Send as gift = Yes"
        ▼
Shopify Flow  ──HTTP request──►  Klaviyo Events API
                                  metric  = "Gift Sent"
                                  profile = RECIPIENT's email   ← this is the key part
                                  properties = message, buyer name, bundle name
        │
        ▼
Klaviyo Flow triggered by "Gift Sent"  →  email goes to the recipient ✅
```

### 4.4 The three build steps

**Step 1 — Shopify Flow (free Shopify app, no server needed)**

Create a workflow:

- **Trigger:** Order paid (or Fulfillment created — see timing rules below).
- **Condition:** the line item has the property `Send as gift` = `Yes`.
- **Loop:** use Flow's *For each* action over the order's line items, so an order with
  two gifts sends two events.
- **Action:** *Send HTTP request* to Klaviyo.

**Step 2 — the HTTP request to Klaviyo**

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
        "gift_message":  "MESSAGE TEXT",
        "buyer_name":    "BUYER FIRST NAME",
        "bundle_name":   "PRODUCT TITLE",
        "order_number":  "1234"
      }
    }
  }
}
```

Notes:

- Creating a profile this way does **not** subscribe the person to marketing. That is
  exactly what we want. See the consent rule below.
- Confirm the current API revision date in Klaviyo's documentation before going live.
- If sending one request per line item is awkward in Flow, Klaviyo also has a bulk event
  endpoint that accepts several events in one call.

**Step 3 — the Klaviyo flow**

In Klaviyo, create a new flow triggered by the metric **Gift Sent**. Use the event
properties in the email template, for example `{{ event.gift_message }}` and
`{{ event.buyer_name }}`. Klaviyo's own template editor is used, so the client's team
can edit the design themselves later.

### 4.5 Rules we must follow

These are not optional details. Each one prevents a real problem.

1. **Timing — do not send on "order created".** Cancelled orders, fraud orders and
   failed payments would notify recipients about gifts that never arrive. Use
   **order paid**, or better **fulfillment created**, so the email arrives near the
   parcel.
2. **Consent — do not add recipients to marketing lists.** The recipient never gave
   permission. A single gift notification is a transactional message and is acceptable,
   but adding them to marketing lists is a legal problem (GDPR / CAN-SPAM) and also
   hurts the client's email reputation. Keep them unsubscribed from marketing. In
   Klaviyo, check whether the flow email can be marked as **transactional** on their
   account so it still reaches non-subscribers.
3. **No prices in recipient emails.** The recipient must not see what the gift cost.
   Do not put order totals in the template.
4. **Bounces are silent.** If the buyer types the email wrong, nobody notices. Someone
   should check failed sends to recipients in Klaviyo, at least in the first weeks.
5. **Test with real addresses** before launch. Place a test order and confirm that the
   buyer gets the normal confirmation and the recipient gets the gift email.

### 4.6 Other options (if the client prefers)

| Option | Good | Bad |
|---|---|---|
| **Shopify Flow + Klaviyo** (recommended) | Free, no server, Klaviyo stays the email tool | Flow's HTTP action needs careful setup |
| **Gifting app** (Giftship and similar) | Fastest setup | Monthly cost; usually wants to replace the gift form we built |
| **Custom app / small webhook service** | Full control: scheduled sending, delivery tracking, retries | Development and hosting cost |

Start with Shopify Flow. If the needs grow (scheduled send dates, delivery tracking,
retry on failure), move that plumbing into a small custom app later. The Klaviyo side
does not need to change when we do that.

---

## 5. Small storefront changes that may be needed

The popup now collects **recipient first name**, **recipient last name**, **email** and
**message**. So a printed card or an email can say "Dear ___" — the name is available on
the order and can be passed to Klaviyo.

Depending on the client's answers we may still need to add:

- **"Send on" date** — only if they want to schedule the gift email for a future date
  (for example, a birthday). Not collected now.
- **Shorter message limit** — the field currently allows 500 characters. A printed card
  cannot fit 500 characters. Once the card size is decided, lower the limit to match, so
  the buyer cannot write more than we can print.

---

## 6. Questions for the client

1. **What does "delivery" mean?** This word has three possible meanings and each one is a
   different amount of work:
   - (a) send tracking / delivered notifications to the **recipient**, or
   - (b) let the buyer choose **when** the gift email is sent, or
   - (c) ship the parcel to the **recipient's address** instead of the buyer's — this one
     changes checkout, not just email.
2. **When should the recipient's email be sent?** At payment, at fulfillment, or on a
   date chosen by the buyer?
3. **Who writes the recipient email content?** Klaviyo template design and copy — their
   team or us?
4. **Should the gift message be included in the recipient's email**, or only printed on
   the card inside the box?
5. **Card size for printing?** Only needed if she wants the message field shortened so it
   always fits the printed card. Optional.

---

## 7. Suggested order of work

| Phase | Work | Why first |
|---|---|---|
| 1 | Test order; confirm staff can see and copy the message where they work | Free, confirms request 2 is already done |
| 2 | Shopify Flow → Klaviyo "Gift Sent" event + Klaviyo flow | The real new feature |
| 3 | Add "send on" date / recipient name to the form, if needed | Only after the client answers Q1 and Q2 |
| 4 | Delivery notifications to the recipient | Biggest work; do last |

---

## 8. Glossary

| Term | Simple meaning |
|---|---|
| **Line item property** | Extra text saved on one product line of an order. Just text. |
| **Profile** (Klaviyo) | One person in Klaviyo — an email address with a history. Emails are sent to profiles. |
| **Metric / event** (Klaviyo) | Something that happened to a profile, e.g. "Placed Order", "Gift Sent". |
| **Flow** (Klaviyo) | Automatic email(s) that start when an event happens. |
| **Shopify Flow** | A free Shopify automation app. Different from a Klaviyo flow. Used here as plumbing. |
| **Transactional email** | An email about an order, not marketing. Can be sent without marketing consent. |
