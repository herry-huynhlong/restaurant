# Subscription PostgreSQL Integration Test

This procedure is for the staging host only. It never uses `restaurant_saas`, production, `prisma migrate reset`, or a drop command.

## Preconditions

1. Work in `/opt/websites/restaurant-staging` on branch `dev`.
2. Confirm the staging Compose `postgres` service is healthy.
3. Use a database named exactly `subscription_test`. The test script refuses any database name without `test`.
4. Stop if `subscription_test` already exists. Its contents may be evidence from a previous test run.

## Create the isolated database

```bash
cd /opt/websites/restaurant-staging
git branch --show-current
docker compose ps postgres

test "$(docker compose exec -T postgres psql -U restaurant_user -d postgres -tAc "SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'subscription_test')")" = "f" \
  || { echo "subscription_test already exists; stop without changing it."; exit 1; }

docker compose exec -T postgres createdb -U restaurant_user -O restaurant_user subscription_test
docker compose exec -T postgres psql -U restaurant_user -d subscription_test -c 'SELECT current_database(), current_user;'
```

The expected database name is `subscription_test`. Do not continue if a different name is printed.

## Validate the target and run migrations only on the test database

```bash
docker compose -f docker-compose.yml -f docker-compose.subscription-test.yml config --quiet
docker compose -f docker-compose.yml -f docker-compose.subscription-test.yml build app

docker compose -f docker-compose.yml -f docker-compose.subscription-test.yml run --rm --no-deps app sh -lc '
  case "$DATABASE_URL" in
    */subscription_test\?schema=public) ;;
    *) echo "Refusing a non-test database target." >&2; exit 1 ;;
  esac
  pnpm prisma:deploy
'
```

`--no-deps` ensures the command does not recreate or restart the running staging services. The Compose override changes only the one-off `app` command's database target.

## Run the integration test

```bash
docker compose -f docker-compose.yml -f docker-compose.subscription-test.yml run --rm --no-deps app sh -lc '
  case "$DATABASE_URL" in
    */subscription_test\?schema=public) ;;
    *) echo "Refusing a non-test database target." >&2; exit 1 ;;
  esac
  export SUBSCRIPTION_TEST_DATABASE_URL="$DATABASE_URL"
  pnpm test:subscription-postgres
'
```

The test creates isolated records, verifies concurrent request creation, payment-order idempotency, duplicate confirmation, and quote expiry, then removes only the records it created. It does not remove `subscription_test`.
