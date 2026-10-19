# Subscription Checkout

The subscription checkout is separate from restaurant bill payments. A Platform Owner or Platform Admin configures the receiving bank in **Platform settings → Subscription payment bank**. The database configuration is disabled by default and does not contain a sample account.

The per-restaurant `RestaurantSetting` bank account remains exclusive to restaurant bill payments. The subscription checkout never reads or changes it. Every new subscription payment order snapshots its receiving bank; changing the platform configuration later never redirects an existing pending order.

The checkout creates or returns one pending `SubscriptionPaymentOrder` for the server-created subscription request. It displays the exact snapshot amount, unique transfer code and expiry. The client polls only that order every 15 seconds while it remains pending.

There is no browser action, mock confirmation, webhook, or QR scan action that changes a subscription. Phase D must verify a provider transaction and persist an entitlement before a Platform Admin can activate a plan.

After the migration is deployed to AWS staging, configure the account through the Platform Admin website. No subscription bank account is required in `.env` or Docker Compose.
