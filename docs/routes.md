# Route map

## Chung

`/`, `/login`, `/post-login`, `/select-restaurant`, `/unauthorized`.

## Platform

`/platform`, `/platform/restaurants`, `/platform/restaurants/new`, `/platform/restaurants/[restaurantId]`, `/platform/restaurants/[restaurantId]/edit`, `/platform/owners`, `/platform/admins`, `/platform/plans`, `/platform/activity`, `/platform/settings`, `/platform/storage`.

## Cửa hàng và khách

`/[rSlug]`, `/welcome`, `/menu`, `/cart`, `/orders`, `/payment`, `/login`, `/locked`, `/device-setup`.

## Quản trị/vận hành

`/[rSlug]/admin`, `/admin/menu`, `/admin/categories`, `/admin/tables`, `/admin/orders`, `/admin/staff`, `/admin/top-items`, `/admin/reports`, `/admin/settings`, `/admin/subscription`, cùng `/staff`, `/kitchen`, `/cashier`.

## PWA

Manifest động: `/[rSlug]/manifest.webmanifest` và các context `/admin`, `/staff`, `/kitchen`, `/cashier`; icon động tại `/[rSlug]/icons/[icon]`.

API chi tiết: [API.md](API.md).
