# Realtime Events

The app will subscribe clients only to the current restaurant channel.

Channel shape:

```text
restaurant:{restaurantId}
```

Events:

| Event | Trigger | Primary recipients |
| --- | --- | --- |
| `order.created` | Customer submits order | Staff, kitchen |
| `order.confirmed` | Staff confirms new order | Staff, kitchen |
| `order.preparing` | Kitchen starts preparation | Staff, kitchen, customer |
| `order.ready` | Kitchen marks order ready | Staff, customer |
| `order.served` | Waiter marks order served | Staff, customer |
| `service_request.created` | Customer calls staff | Staff |
| `service_request.acknowledged` | Staff acknowledges request | Staff |
| `service_request.completed` | Staff completes request | Staff |
| `payment.requested` | Customer requests payment | Cashier, staff |
| `payment.confirmed` | Cashier confirms payment | Cashier, staff, customer |
| `table.session_opened` | Dining session opens | Staff |
| `table.session_closed` | Dining session closes | Staff |

Staff sound unlock is required before playing notification audio.
