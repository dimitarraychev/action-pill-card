/*!
 * Action Pill Card
 * A single-row Lovelace button card in Bubble or Mushroom style. Works as a plain button or as a
 * two-state toggle whose name, icon, colour and tap action follow an entity's state.
 * Optional confirmation: the pill asks "Are you sure?" with confirm / cancel buttons before it acts.
 */

const CARD_TAG = "action-pill-card";
const EDITOR_TAG = "action-pill-card-editor";
const CARD_NAME = "Action Pill Card";
const CARD_VERSION = "0.2.0-beta";
const HOLD_MS = 500;
const DEFAULT_CONFIRM = "Are you sure?";
const DEFAULT_CONFIRM_TIMEOUT = 6;

const COLOR_MAP = {
  gray: "#8E8E93",
  cyan: "#64D2FF",
  blue: "#0A84FF",
  green: "#30D158",
  lime: "#A2E04B",
  yellow: "#FFD60A",
  orange: "#FF9F0A",
  red: "#FF453A",
  purple: "#BF5AF2",
  pink: "#FF375F",
};

const UNAVAILABLE = ["unknown", "unavailable", "", undefined, null];
const ENTITY_ID = /^[a-z0-9_]+\.[a-z0-9_]+$/;

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const DEFAULTS = {
  button: { name: "Button", icon: "mdi:gesture-tap", color: "blue" },
  on: { name: "On", icon: "mdi:check-bold", color: "green" },
  off: { name: "Off", icon: "mdi:power", color: "gray" },
};

class ActionPillCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        .card {
          position: relative;
          box-sizing: border-box;
          height: 56px;
          border-radius: 32px;
          box-shadow: var(--ha-card-box-shadow, none);
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
          user-select: none;
          -webkit-user-select: none;
          -webkit-touch-callout: none;
        }
        .card.inert { cursor: default; }
        .card.unavailable { opacity: 0.5; }
        .pill {
          position: relative;
          box-sizing: border-box;
          height: 100%;
          display: flex;
          align-items: center;
          border-radius: 32px;
          background: var(--apc-pill-bg);
          box-shadow: var(--apc-pill-shadow);
          overflow: hidden;
          border: none;
          -webkit-backdrop-filter: var(--ha-card-backdrop-filter, blur(8px) saturate(1.2));
          backdrop-filter: var(--ha-card-backdrop-filter, blur(8px) saturate(1.2));
        }
        .card:focus, .card:focus-visible { outline: none; }
        .card.kbd:focus-visible .pill { outline: 2px solid var(--apc-color); outline-offset: 2px; }
        .icon {
          flex: none;
          width: 36px;
          height: 36px;
          margin: 10px 0 10px 10px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--apc-color);
          background: var(--apc-icon-bg);
          --mdc-icon-size: 24px;
        }
        .name {
          flex: 1;
          min-width: 0;
          margin-left: 8px;
          padding-right: 16px;
          font-size: 14px;
          font-weight: var(--card-primary-font-weight, 500);
          color: var(--apc-text);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* ---------- Confirmation ---------- */
        .actions { flex: none; display: none; align-items: center; gap: 6px; margin-right: 10px; }
        .card.confirming { cursor: default; }
        .card.confirming .actions { display: flex; }
        .card.confirming .name {
          padding-right: 8px; white-space: normal; line-height: 1.2; font-size: 13px;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
        }
        .cbtn {
          all: unset; box-sizing: border-box; cursor: pointer; width: 36px; height: 36px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center; --mdc-icon-size: 22px;
          transition: transform .1s; -webkit-tap-highlight-color: transparent;
        }
        .cbtn:active { transform: scale(.9); }
        .cbtn:focus-visible { outline: 2px solid var(--apc-color); outline-offset: 2px; }
        .cbtn.no { color: var(--secondary-text-color); background: color-mix(in srgb, var(--primary-text-color) 10%, transparent); }
        .cbtn.yes { color: #fff; background: var(--apc-color); }

        /* ---------- Mushroom style ---------- */
        .card.mushroom { height: 68px; border-radius: var(--ha-card-border-radius, 12px); }
        .card.mushroom .pill {
          overflow: hidden;
          padding: 13px 9px;
          gap: 12px;
          border-radius: var(--ha-card-border-radius, 12px);
        }
        .card.mushroom .icon {
          width: 65px;
          height: 65px;
          margin: -18px 0 0 -18px;
          --mdc-icon-size: 44px;
        }
        .card.mushroom .name { margin: 0; padding-right: 4px; }
        .card.mushroom .actions { margin-right: 0; }
      </style>
      <div class="card" tabindex="0" role="button">
        <div class="pill">
          <div class="icon"></div>
          <div class="name"></div>
          <div class="actions">
            <button class="cbtn no" aria-label="Cancel"><ha-icon icon="mdi:close"></ha-icon></button>
            <button class="cbtn yes" aria-label="Confirm"><ha-icon icon="mdi:check"></ha-icon></button>
          </div>
        </div>
      </div>`;
    const $ = (s) => this.shadowRoot.querySelector(s);
    this._card = $(".card");
    this._icon = $(".icon");
    this._name = $(".name");
    this._timer = null;
    this._held = false;
    this._confirm = null;

    this._card.addEventListener("click", (e) => {
      if (this._confirm) return; // while asking, only the two buttons act
      if (this._held) {
        this._held = false;
        return;
      }
      this._run("tap_action");
      if (e.detail) this._card.blur();
    });
    $(".cbtn.yes").addEventListener("click", (e) => { e.stopPropagation(); this._acceptConfirm(); });
    $(".cbtn.no").addEventListener("click", (e) => { e.stopPropagation(); this._cancelConfirm(); });

    this._card.addEventListener("pointerdown", () => {
      this._card.classList.remove("kbd");
      this._held = false;
      if (this._confirm) return;
      if (!this._action("hold_action") || this._action("hold_action").action === "none") return;
      this._timer = setTimeout(() => {
        this._held = true;
        this._run("hold_action");
      }, HOLD_MS);
    });
    const cancel = () => clearTimeout(this._timer);
    ["pointerup", "pointerleave", "pointercancel"].forEach((t) => this._card.addEventListener(t, cancel));
    this._card.addEventListener("contextmenu", (e) => {
      if (this._action("hold_action")) e.preventDefault();
    });
    this.shadowRoot.addEventListener("keydown", (e) => { if (e.key === "Tab") this._card.classList.add("kbd"); }, true);
    this._card.addEventListener("keydown", (e) => {
      if (this._confirm) {
        if (e.key === "Escape") { e.preventDefault(); this._cancelConfirm(); return; }
        if (e.target.closest && e.target.closest(".cbtn")) return; // the buttons handle Enter / Space themselves
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this._acceptConfirm(); }
        return;
      }
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this._run("tap_action");
      }
    });
  }

  disconnectedCallback() {
    clearTimeout(this._timer);
    this._clearConfirm();
  }

  static getConfigElement() {
    return document.createElement(EDITOR_TAG);
  }

  static getStubConfig() {
    return { mode: "button", name: "Button", icon: "mdi:gesture-tap" };
  }

  setConfig(config) {
    if (!config) throw new Error("Invalid configuration.");
    const mode = config.mode || "button";
    if (!["button", "toggle"].includes(mode)) throw new Error("`mode` must be `button` or `toggle`.");
    if (mode === "toggle" && !config.entity) throw new Error("Toggle mode needs an `entity`.");
    if (config.card_style && !["bubble", "mushroom"].includes(config.card_style)) {
      throw new Error("`card_style` must be `bubble` or `mushroom`.");
    }
    this._config = { ...config, mode };
    this._clearConfirm();
    this._key = null;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return 1;
  }

  getGridOptions() {
    if (this._config?.card_style === "mushroom") return { columns: 12, rows: "auto", min_columns: 3 };
    return { columns: 12, rows: 1, min_columns: 3, min_rows: 1 };
  }

  _color(spec, fallback) {
    if (!spec) return this._color(fallback, "gray");
    if (COLOR_MAP[spec]) return COLOR_MAP[spec];
    if (ENTITY_ID.test(spec) && this._hass?.states[spec]) {
      const s = this._hass.states[spec].state;
      return UNAVAILABLE.includes(s) ? COLOR_MAP.gray : s;
    }
    return spec;
  }

  // Resolved view: the state slot (toggle) or the card itself (button).
  _slot() {
    const cfg = this._config;
    if (cfg.mode !== "toggle") return { ...DEFAULTS.button, ...prune(cfg), _state: "button" };
    const st = this._hass?.states[cfg.entity];
    if (!st || st.state === "unavailable") return { ...DEFAULTS.off, ...shared(cfg), _state: "unavailable" };
    const active = String(cfg.active_state ?? "on").split(",").map((s) => s.trim()).includes(st.state);
    const key = active ? "on" : "off";
    return { ...DEFAULTS[key], ...shared(cfg), ...prune(cfg[`state_${key}`] || {}), _state: key };
  }

  _compute() {
    const cfg = this._config;
    const s = this._slot();
    const stateObj = cfg.entity ? this._hass?.states[cfg.entity] : null;
    const color = this._color(s.color, "gray");
    const unavailable = s._state === "unavailable";
    return {
      name: s.name ?? stateObj?.attributes?.friendly_name ?? DEFAULTS.button.name,
      icon: s.icon || stateObj?.attributes?.icon || DEFAULTS.button.icon,
      color,
      colorBackground: cfg.color_background !== false,
      colorIconBg: cfg.color_icon_background !== false,
      colorText: cfg.color_text !== false,
      cardStyle: cfg.card_style === "mushroom" ? "mushroom" : "bubble",
      unavailable,
      inert: unavailable || (this._action("tap_action", s)?.action ?? "none") === "none",
      confirm: this._confirm ? this._confirm.text : null,
    };
  }

  _action(which, slot) {
    const s = slot || this._slot();
    const a = s[which] ?? this._config[which];
    if (a) return a;
    if (which === "tap_action") {
      if (this._config.mode === "toggle") return { action: "toggle" };
      return { action: "none" };
    }
    return null;
  }

  _render() {
    if (!this._config || !this._hass) return;
    const m = this._compute();
    const key = JSON.stringify(m);
    if (key === this._key) return;
    this._key = key;

    this._card.style.setProperty("--apc-color", m.color);
    this._card.style.setProperty(
      "--apc-pill-bg",
      m.colorBackground ? `color-mix(in srgb, ${m.color} 15%, transparent)` : "color-mix(in srgb, var(--primary-text-color) 4%, transparent)"
    );
    this._card.style.setProperty(
      "--apc-pill-shadow",
      "var(--ha-card-glass-inset-shadow, 3px 3px 0.5px -3.5px rgba(255, 255, 255, 0.30) inset, -2px -2px 0.5px -2px rgba(255, 255, 255, 0.30) inset, 0 0 8px 1px rgba(255, 255, 255, 0.10) inset, 0 0 2px 0 rgba(0, 0, 0, 0.10))"
    );
    this._card.style.setProperty(
      "--apc-icon-bg",
      m.colorIconBg ? `color-mix(in srgb, ${m.color} 20%, transparent)` : "color-mix(in srgb, var(--primary-text-color) 10%, transparent)"
    );
    this._card.style.setProperty("--apc-text", m.colorText ? m.color : "var(--primary-text-color)");
    this._card.classList.toggle("mushroom", m.cardStyle === "mushroom");
    this._card.classList.toggle("unavailable", m.unavailable);
    this._card.classList.toggle("inert", m.inert);
    this._card.setAttribute("aria-disabled", String(m.inert));
    const asking = m.confirm != null;
    this._card.classList.toggle("confirming", asking);
    this._icon.innerHTML = `<ha-icon icon="${esc(asking ? "mdi:help" : m.icon)}"></ha-icon>`;
    this._name.textContent = asking ? m.confirm : m.name;
    this._card.setAttribute("aria-label", asking ? m.confirm : m.name);
  }

  _fire(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  // ---------- confirmation ----------
  // Returns the message to ask, or null when the action runs straight away.
  // An action's own `confirmation` (the Home Assistant way: `true` or `{ text, exemptions }`)
  // wins over the card's confirm_* settings.
  _confirmFor(which, a) {
    const cfg = this._config;
    const name = this._compute().name;
    const fill = (t) => String(t).replace(/\{name\}/g, name);
    const c = a.confirmation;
    if (c) {
      const exemptions = typeof c === "object" && Array.isArray(c.exemptions) ? c.exemptions : [];
      if (exemptions.some((e) => e && e.user && e.user === this._hass?.user?.id)) return null;
      return fill(typeof c === "object" && c.text ? c.text : cfg.confirm_text || DEFAULT_CONFIRM);
    }
    if (!(which === "hold_action" ? cfg.confirm_hold : cfg.confirm_tap)) return null;
    if (cfg.mode === "toggle") {
      const when = cfg.confirm_when || "always";
      const state = this._slot()._state;
      if (when === "active" && state !== "on") return null;
      if (when === "inactive" && state !== "off") return null;
    }
    return fill(cfg.confirm_text || DEFAULT_CONFIRM);
  }

  _ask(which, text) {
    this._clearConfirm();
    this._confirm = { which, text };
    const secs = this._config.confirm_timeout == null ? DEFAULT_CONFIRM_TIMEOUT : Number(this._config.confirm_timeout);
    if (secs > 0) this._confirmTimer = setTimeout(() => this._cancelConfirm(), secs * 1000);
    // tapping anywhere else cancels
    this._outside = (e) => { if (!e.composedPath().includes(this)) this._cancelConfirm(); };
    document.addEventListener("pointerdown", this._outside, true);
    this._fire("haptic", "light");
    this._render();
  }

  _clearConfirm() {
    clearTimeout(this._confirmTimer);
    if (this._outside) document.removeEventListener("pointerdown", this._outside, true);
    this._outside = null;
    this._confirm = null;
  }

  _cancelConfirm() {
    if (!this._confirm) return;
    this._clearConfirm();
    this._render();
  }

  _acceptConfirm() {
    const which = this._confirm?.which;
    if (!which) return;
    this._clearConfirm();
    this._render();
    this._run(which, true);
  }

  _run(which, confirmed = false) {
    const a = this._action(which);
    if (!a || a.action === "none") return;
    if (!confirmed) {
      const text = this._confirmFor(which, a);
      if (text) { this._ask(which, text); return; }
    }
    const hass = this._hass;
    const entityId = a.entity || this._config.entity;
    this._fire("haptic", which === "hold_action" ? "medium" : "light");
    switch (a.action) {
      case "navigate":
        if (!a.navigation_path) return;
        if (a.navigation_replace) history.replaceState(null, "", a.navigation_path);
        else history.pushState(null, "", a.navigation_path);
        window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: !!a.navigation_replace } }));
        break;
      case "more-info":
        if (entityId) this._fire("hass-more-info", { entityId });
        break;
      case "toggle":
        if (entityId) hass.callService("homeassistant", "toggle", { entity_id: entityId });
        break;
      case "perform-action":
      case "call-service": {
        const svc = a.perform_action || a.service;
        if (!svc) return;
        const [domain, service] = svc.split(".");
        hass.callService(domain, service, a.data || a.service_data || {}, a.target);
        break;
      }
      case "url":
        if (a.url_path) window.open(a.url_path, "_blank");
        break;
      default:
        break;
    }
  }
}

// Remove empty values so blank editor fields fall back to defaults.
const prune = (obj) => {
  if (Array.isArray(obj)) return obj;
  if (obj && typeof obj === "object") {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      const p = prune(v);
      const empty =
        p === undefined || p === null || p === "" ||
        (Array.isArray(p) && p.length === 0) ||
        (typeof p === "object" && !Array.isArray(p) && Object.keys(p).length === 0);
      if (!empty) out[k] = p;
    }
    return out;
  }
  return obj;
};

// Top-level name/icon/color/actions shared by both toggle states unless a state overrides them.
const shared = (cfg) => prune({ name: cfg.name, icon: cfg.icon, color: cfg.color, tap_action: cfg.tap_action, hold_action: cfg.hold_action });

// ---------- Visual editor ----------
const EDITOR_LABELS = {
  mode: "Mode",
  entity: "Entity",
  active_state: "Active state(s) (comma separated)",
  name: "Name",
  icon: "Icon",
  color: "Color (name, hex, CSS color or entity ID)",
  card_style: "Card style",
  color_background: "Color card background",
  color_icon_background: "Color icon background",
  color_text: "Color text",
  tap_action: "Tap action",
  hold_action: "Hold action",
  confirm_tap: "Ask for confirmation before the tap action",
  confirm_hold: "Ask for confirmation before the hold action",
  confirm_text: "Message (use {name} for the button name)",
  confirm_when: "Ask when",
  confirm_timeout: "Dismiss automatically after (seconds, 0 = never)",
};
const EDITOR_HELPERS = {
  confirm_text: `Default: ${DEFAULT_CONFIRM}`,
};

const COLOR_SELECTOR = {
  select: {
    mode: "dropdown",
    custom_value: true,
    options: Object.keys(COLOR_MAP).map((c) => ({ value: c, label: c[0].toUpperCase() + c.slice(1) })),
  },
};

const stateSchema = [
  { name: "name", selector: { text: {} } },
  { name: "icon", selector: { icon: {} } },
  { name: "color", selector: COLOR_SELECTOR },
  { name: "tap_action", selector: { ui_action: {} } },
  { name: "hold_action", selector: { ui_action: {} } },
];

const getEditorSchema = (config) => {
  const toggle = config.mode === "toggle";
  const asking = !!(config.confirm_tap || config.confirm_hold);
  return [
    {
      name: "mode",
      selector: { select: { mode: "box", options: [{ value: "button", label: "Button" }, { value: "toggle", label: "Toggle" }] } },
    },
    { name: "entity", required: toggle, selector: { entity: {} } },
    ...(toggle
      ? [
          { name: "active_state", selector: { text: {} } },
          { type: "expandable", name: "state_on", title: "Active state", schema: stateSchema },
          { type: "expandable", name: "state_off", title: "Inactive state", schema: stateSchema },
        ]
      : [
          { name: "name", selector: { text: {} } },
          { name: "icon", selector: { icon: {} } },
          { name: "color", selector: COLOR_SELECTOR },
          { name: "tap_action", selector: { ui_action: {} } },
          { name: "hold_action", selector: { ui_action: {} } },
        ]),
    {
      type: "expandable",
      name: "confirmation_section",
      title: "Confirmation",
      flatten: true,
      schema: [
        { name: "confirm_tap", selector: { boolean: {} } },
        { name: "confirm_hold", selector: { boolean: {} } },
        ...(asking
          ? [
              { name: "confirm_text", selector: { text: {} } },
              ...(toggle
                ? [
                    {
                      name: "confirm_when",
                      selector: {
                        select: {
                          mode: "dropdown",
                          options: [
                            { value: "always", label: "Always" },
                            { value: "active", label: "Only when active" },
                            { value: "inactive", label: "Only when inactive" },
                          ],
                        },
                      },
                    },
                  ]
                : []),
              { name: "confirm_timeout", selector: { number: { min: 0, max: 30, step: 1, mode: "box", unit_of_measurement: "s" } } },
            ]
          : []),
      ],
    },
    {
      type: "expandable",
      name: "display_section",
      title: "Display settings",
      flatten: true,
      schema: [
        {
          name: "card_style",
          selector: { select: { mode: "dropdown", options: [{ value: "bubble", label: "Bubble" }, { value: "mushroom", label: "Mushroom" }] } },
        },
        { name: "color_background", selector: { boolean: {} } },
        { name: "color_icon_background", selector: { boolean: {} } },
        { name: "color_text", selector: { boolean: {} } },
      ],
    },
  ];
};

class ActionPillCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config;
    this._update();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
    this._update();
  }

  _update() {
    if (!this._config || !this._hass) return;
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.computeLabel = (s) => EDITOR_LABELS[s.name] || s.name;
      this._form.computeHelper = (s) => EDITOR_HELPERS[s.name] || "";
      this._form.addEventListener("value-changed", (ev) => {
        ev.stopPropagation();
        const config = prune({ ...this._config, ...ev.detail.value });
        if (config.card_style === "bubble") delete config.card_style;
        if (config.color_background === true) delete config.color_background;
        if (config.color_icon_background === true) delete config.color_icon_background;
        if (config.color_text === true) delete config.color_text;
        if (config.mode === "button") delete config.mode;
        // confirmation: don't write defaults / switched-off flags
        if (!config.confirm_tap) delete config.confirm_tap;
        if (!config.confirm_hold) delete config.confirm_hold;
        if (config.confirm_when === "always") delete config.confirm_when;
        if (config.confirm_timeout === DEFAULT_CONFIRM_TIMEOUT) delete config.confirm_timeout;
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
      });
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    // only replace the schema when its shape changes, so open sections stay open
    const cfg = { mode: "button", ...this._config };
    const schemaKey = JSON.stringify([cfg.mode, !!(cfg.confirm_tap || cfg.confirm_hold)]);
    if (schemaKey !== this._schemaKey) {
      this._schemaKey = schemaKey;
      this._form.schema = getEditorSchema(cfg);
    }
    this._form.data = {
      mode: "button",
      card_style: "bubble",
      color_background: true,
      color_icon_background: true,
      color_text: true,
      confirm_tap: false,
      confirm_hold: false,
      confirm_when: "always",
      confirm_timeout: DEFAULT_CONFIRM_TIMEOUT,
      ...this._config,
    };
  }
}

if (!customElements.get(CARD_TAG)) customElements.define(CARD_TAG, ActionPillCard);
if (!customElements.get(EDITOR_TAG)) customElements.define(EDITOR_TAG, ActionPillCardEditor);

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === CARD_TAG)) {
  window.customCards.push({
    type: CARD_TAG,
    name: CARD_NAME,
    description: "Bubble or Mushroom style button card. Plain button, or a toggle that changes text, icon, color and action with an entity's state. Optional confirmation.",
    preview: true,
  });
}

console.info(`%c ACTION-PILL-CARD %c v${CARD_VERSION} `, "color:white;background:#30D158;font-weight:700", "color:#30D158;background:white");
