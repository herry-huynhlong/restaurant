# Permission Matrix

Server authorization is enforced through `requirePlatformAdmin`, `requireRestaurantAccess`, and role checks. UI hiding is never considered sufficient.

| Area | PLATFORM_ADMIN | OWNER | MANAGER | CASHIER | WAITER | KITCHEN |
| --- | --- | --- | --- | --- | --- | --- |
| Platform dashboard | Yes | No | No | No | No | No |
| Create restaurant | Yes | No | No | No | No | No |
| Activate/deactivate restaurant | Yes | No | No | No | No | No |
| Restaurant dashboard | No | Yes | Yes | Limited | Limited | Limited |
| Settings | No | Yes | Yes | No | No | No |
| Staff management | No | Yes | Yes | No | No | No |
| Menu/category/product management | No | Yes | Yes | No | No | No |
| Area/table/QR management | No | Yes | Yes | No | No | No |
| View orders | No | Yes | Yes | Yes | Yes | Yes |
| Confirm order | No | Yes | Yes | No | Yes | No |
| Kitchen preparation state | No | Yes | Yes | No | No | Yes |
| Serve ready order | No | Yes | Yes | No | Yes | No |
| View bill | No | Yes | Yes | Yes | No | No |
| Confirm payment | No | Yes | Yes | Yes | No | No |
| Reports | No | Yes | Yes | No | No | No |

No role has permission to cancel orders, cancel order items, or split bills.
