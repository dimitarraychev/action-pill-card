# Action Pill Card

Bubble- or Mushroom-style button card for Home Assistant with a visual editor. Use it as a plain **button**, or as a **toggle** whose text, icon, color and tap action follow an entity's state.

## Install (HACS)
1. HACS → ⋮ → **Custom repositories** → add this repo, category **Dashboard**.
​2. Install **Action Pill Card**, then reload the browser.

## Options
| Option | Default | Notes |
|---|---|---|
| `mode` | `button` | `button` or `toggle` |
| `entity` | – | Required for `toggle` |
| `active_state` | `on` | State(s) counted as active, comma separated |
| `card_style` | `bubble` | `bubble` or `mushroom` |
| `color` | blue | Name (`red`, `green`, …), hex, CSS color/variable, or an entity ID whose state is a color |
| `color_background` | `true` | Tint the card background; off gives a plain glass card. The glass edge highlight is always on (uses your theme's `--ha-card-backdrop-filter` and `--ha-card-glass-inset-shadow` if set) |
| `color_icon_background` | `true` | Tint the icon circle |
| `color_text` | `true` | Color the label |
| `name`, `icon` | – | Shared by both toggle states unless overridden |
| `tap_action`, `hold_action` | button: none / toggle: toggle | Standard HA actions |
| `state_on`, `state_off` | – | Per-state `name`, `icon`, `color`, `tap_action`, `hold_action` |
| `confirmation` | – | Inline confirmation options for tap and hold actions (supports custom message, conditional triggering, and auto-dismiss timer) |

Unavailable toggle entities dim the card and disable taps. Use HA's native `visibility:` for screen-size/state conditions.

## Example
```yaml
type: custom:action-pill-card
mode: toggle
entity: input_boolean.mobile_dashboard_edit_mode
card_style: bubble
state_off:
  name: Edit Dashboard
  icon: mdi:view-dashboard-edit
  color: red
  tap_action:
    action: perform-action
    perform_action: input_boolean.turn_on
    target:
      entity_id: input_boolean.mobile_dashboard_edit_mode
state_on:
  name: Finish Editing
  icon: mdi:check-bold
  color: input_text.apple_green
  tap_action:
    action: perform-action
    perform_action: input_boolean.turn_off
    target:
      entity_id: input_boolean.mobile_dashboard_edit_mode
```
