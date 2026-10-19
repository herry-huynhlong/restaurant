# Subscription Checkout

The subscription checkout is separate from restaurant bill payments. A Platform Owner or Platform Admin configures the receiving bank in **Platform settings → Subscription payment bank**. The database configuration is disabled by default and does not contain a sample account.

The per-restaurant `RestaurantSetting` bank account remains exclusive to restaurant bill payments. The subscription checkout never reads or changes it. Every new subscription payment order snapshots its receiving bank; changing the platform configuration later never redirects an existing pending order.

The checkout creates or returns one pending `SubscriptionPaymentOrder` for the server-created subscription request. It displays the exact snapshot amount, unique transfer code and expiry. The client polls only that order every 15 seconds while it remains pending.

There is no browser action, mock confirmation, or QR scan action that changes a subscription. The SePay webhook validates the provider event identity, inbound direction, exact amount, snapshotted receiving account and order expiry. A matching callback atomically marks the order `PAID`, creates one entitlement for that payment order, and activates the subscription. The database transaction rolls back in full if activation cannot be completed.

After the migration is deployed to AWS staging, configure the receiving account through the Platform Admin website. No subscription bank account is required in `.env` or Docker Compose.

## SePay webhook

The subscription webhook endpoint is `POST /api/webhooks/sepay/subscription`. It is separate from restaurant-bill QR payment flows.

Set `SEPAY_SUBSCRIPTION_WEBHOOK_API_KEY` only in the server environment used by the `app` service. Never expose it through a `NEXT_PUBLIC_` variable or the Platform Admin UI. When this secret is set, new subscription payment orders use the `SEPAY` provider and short `QP` transfer codes that SePay can recognize. Existing longer `QP` codes are still matched from the transfer content.

Configure SePay to send its JSON callback to the environment-specific HTTPS endpoint, use the same API key in its `Authorization: Apikey ...` setting, and filter for inbound transactions on the platform subscription account. A callback with an unknown code, incorrect amount, wrong receiving account, expired order, or non-inbound transfer never activates a subscription. Mismatched transactions are retained for audit and the payment order is marked `NEEDS_REVIEW`.
