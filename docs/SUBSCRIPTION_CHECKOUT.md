# Subscription Checkout

The subscription checkout is separate from restaurant bill payments. It reads the platform bank account only from server environment variables:

```dotenv
SUBSCRIPTION_VIETQR_BANK_CODE="VCB"
SUBSCRIPTION_VIETQR_ACCOUNT_NUMBER="0123456789"
SUBSCRIPTION_VIETQR_ACCOUNT_NAME="QUANPILOT"
```

`SUBSCRIPTION_VIETQR_BANK_CODE` and `SUBSCRIPTION_VIETQR_ACCOUNT_NUMBER` are required. If either is absent, the owner sees a not-ready state and no QR is generated.

The checkout creates or returns one pending `SubscriptionPaymentOrder` for the server-created subscription request. It displays the exact snapshot amount, unique transfer code and expiry. The client polls only that order every 15 seconds while it remains pending.

There is no browser action, mock confirmation, webhook, or QR scan action that changes a subscription. Phase D must verify a provider transaction and persist an entitlement before a Platform Admin can activate a plan.

For AWS staging, add the same three environment mappings to the `app` service in `/opt/websites/restaurant-staging/docker-compose.staging.yml` before rebuilding that service. Do not put these values in a `NEXT_PUBLIC_*` variable.
