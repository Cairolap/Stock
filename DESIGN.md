# Stock UI Design System

## Direction: Inventory Control Label

The interface should feel like a clear industrial inventory label: practical, calm, and easy to scan with one hand. Color communicates meaning; it is not decoration.

## Visual hierarchy

- Use one brand color (`--brand-primary`, deep teal) for navigation, links, focus, and the primary action.
- Reserve red for negative/out-of-stock, amber for low stock, green for normal stock, and violet for stock-count adjustments.
- The dashboard has one attention summary, not a row of competing KPI cards.
- Surfaces are flat with thin borders. Avoid glow, gradients, oversized shadows, decorative badges, and emoji icons.
- Corner radii stay compact: 8px for controls, 10px for cards, and 14px for sheets/dialogs.

## Signature component: Stock Rail

Every inventory card starts with a narrow vertical `.stock-rail`. Its color is the fastest status signal, while the adjacent Thai text remains the accessible source of truth. Never communicate stock state through color alone.

| State | Token | Color | Label |
|---|---|---|---|
| Negative / out | `--status-negative` | `#c63f4c` | ยอดติดลบ / หมด |
| Low | `--status-low` | `#b86800` | ถึง Min |
| Normal | `--status-normal` | `#34835b` | ปกติ |
| At Max | `--status-max` | `#0d6878` | ถึง Max |

## Typography

- Thai and UI text: `Leelawadee UI`, system sans-serif fallback.
- Part numbers and quantities: `Consolas`, system monospace, with tabular numerals.
- Use weight and spacing before color to establish hierarchy.

## Mobile interaction

- Minimum touch target is 44 × 44px; primary controls target 48px.
- Bottom navigation contains `หน้าหลัก`, `วัสดุ`, a central `ทำรายการ`, and `ประวัติ`.
- `ทำรายการ` is the canonical entry point for receive, issue, count, history, and edit actions.
- Inventory cards expose one clear action path instead of repeating many colored buttons.
- Respect safe-area insets and reduced-motion preferences.

## Accessibility

- All interactive controls need visible `:focus-visible` treatment.
- Pair status colors with text labels and preserve AA contrast.
- Dialogs must close from their explicit close control, backdrop, or Escape.
- Loading, empty, error, and disabled states keep their footprint stable to avoid layout shifts.
