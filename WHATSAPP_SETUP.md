# RushGlow WhatsApp setup

The integration uses the existing Vercel Node functions and Neon database. Customer messages, bot state and outbound messages persist in Postgres. The bot is OFF until an authenticated administrator enables it. Publishing the Meta app or linking WhatsApp Business app to Business Suite does not activate the Cloud API.

## Required production settings

Set these secrets directly in Vercel. Never commit them or paste them into customer messages:

- `WA_VERIFY_TOKEN`: random webhook handshake token, already provisioned for this project.
- `WA_APP_SECRET`: the app secret for Meta app `2167897747154399`.
- `WA_ACCESS_TOKEN`: a production token with the WhatsApp messaging permissions for the connected business number. A short-lived test token is not suitable for unattended production use.
- `WA_PHONE_NUMBER_ID`: the Cloud API phone number ID returned after successful onboarding. Verify it matches the intended number; do not assume a Business App-linked asset is registered for Cloud API.

Redeploy after changing settings. Configure the Meta app webhook callback as `https://rushglow.org/api/whatsapp`, verify with the same token, subscribe to `messages`, and subscribe the app to the correct messaging account as required by the selected onboarding flow.

## Preserve the owner's WhatsApp Business app

Complete Meta's supported Coexistence Embedded Signup flow through an eligible provider/partner before connecting the existing WhatsApp Business app number to the API. Do not delete the app account or migrate the number to an API-only setup when the owner needs to keep using the app. Business Suite account linking alone is insufficient.

## Shared inbox and activation

Open `/whatsapp-inbox.html`; log in using the website's existing admin email OTP. Both existing admin email recipients can access the same chats. This uses the existing shared admin role; there are no separate staff identities or per-person audit attribution.

1. Check API connection and confirm the displayed number.
2. Enable the bot.
3. From another WhatsApp number, send `MENU`, select an in-stock product, choose Yes, send phone/full address, then choose COD.
4. Confirm the reply, one saved order, one stock reservation, both admin notification emails and the shared inbox transcript. Do not claim production readiness before this test passes.
5. Test EasyPaisa proof and a manual inbox reply. Manual reply pauses automation for that customer; Resume bot restores it. `HUMAN` also pauses automation.

Delivery is free only for Swabi district, otherwise Rs 200. EasyPaisa is `03409505282`; the owner verifies payment manually. The bot never marks a transfer paid based on a screenshot. Orders are tagged `WhatsApp`. No commission rate is configured.

## Reliability and limits

- Incoming Meta message IDs are unique. A database transaction, customer lock and a unique order message ID prevent duplicate order creation and duplicate stock reservation on webhook retries.
- Price and stock are checked against the database at checkout. A price change requires another confirmation.
- Outgoing messages use a persistent queue. A message is claimed before sending; failed/uncertain deliveries are displayed in the inbox and are not automatically retried, avoiding blind duplicate customer replies. An interrupted send can remain `sending` and needs operator inspection. This implementation does not provide a scheduled queue recovery worker.
- Free-form replies are limited to the customer service window. Starting conversations later requires approved templates, which are not implemented here.
- Only new API-delivered messages appear. Import of old app history and app-sent echo synchronization are not implemented. During Coexistence, pause this inbox bot before manually answering from the owner's phone to avoid overlapping replies.
- A product selection orders one unit. Multi-item WhatsApp carts, automatic EasyPaisa reconciliation, commission accounting and template campaigns are not implemented.

## Tests

Run `node --test test/whatsapp-bot.test.js` for the order dialogue, delivery calculations, webhook signatures and admin authorization. To run the database integration test, install `@electric-sql/pglite` as a local test dependency and run `node --test test/whatsapp-orders.integration.test.js`. It runs in an isolated PostgreSQL-compatible in-memory database and mocks the Meta send API; it does not send real messages or emails.
