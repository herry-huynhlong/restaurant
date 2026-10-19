export const subscriptionPaymentOrderLifetimeMs = 30 * 60 * 1000;

export function getSubscriptionPaymentOrderExpiryCutoff(now = new Date()) {
  return new Date(now.getTime() - subscriptionPaymentOrderLifetimeMs);
}

export function getSubscriptionPaymentOrderExpiresAt({
  createdAt,
  expiresAt
}: {
  createdAt: Date;
  expiresAt: Date;
}) {
  return new Date(Math.min(createdAt.getTime() + subscriptionPaymentOrderLifetimeMs, expiresAt.getTime()));
}
