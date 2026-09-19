# Stock UX Contract

This file defines the interaction rules shared by mobile and desktop clients.

## 1. Dashboard attention hierarchy

- The first screen presents one attention panel with negative, out-of-stock, and low-stock counts.
- Selecting a count opens the parts view with the matching filter applied.
- Urgent rows use the Stock Rail and open the canonical action menu.
- Loading placeholders must reserve the final content footprint; avoid layout shift.

## 2. Canonical action menu

- The bottom `ทำรายการ` control opens the action sheet without requiring a selected part.
- Selecting an inventory card opens the same sheet with that part as context.
- Part context enables receive, issue, history, and edit. Count remains available globally.
- The sheet closes through its close control, backdrop, or Escape and returns focus safely.
- Mutating forms disable submit immediately and show a pending label while saving.

## 3. Mutation safety and idempotency

- Receive, issue, and count requests send a unique `Idempotency-Key`.
- A duplicate response is treated as already processed and triggers a safe refresh.
- Negative stock is allowed only after the operator sees the explicit deficit preview before saving.
- Editing sends the current version. A conflict never silently overwrites newer data.

## 4. Operator memory

- After a successful mutation, store the trimmed operator name in `stock_last_operator_name`.
- Pre-fill that value in receive, issue, and count flows to reduce mobile typing.

## 5. Network and recovery

- Never blindly retry an uncertain mutation after a timeout or network failure.
- Check health, show the uncertain state, and offer an explicit retry or refresh.
- Preserve entered form data when recovery is possible.

## 6. Responsive behavior

- Mobile uses inventory cards with one action affordance and a fixed bottom navigation.
- Desktop may use a data table, but it must preserve the same statuses, action names, and mutation rules.
- Touch targets are at least 44 × 44px, safe-area insets are respected, and status is never color-only.
