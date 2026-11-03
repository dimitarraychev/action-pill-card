/*!
 * Action Pill Card
 * A single-row Lovelace button card in Bubble or Mushroom style. Works as a plain button or as a
 * two-state toggle whose name, icon, colour and tap action follow an entity's state.
 */

const CARD_TAG = "action-pill-card";
const EDITOR_TAG = "action-pill-card-editor";
const CARD_NAME = "Action Pill Card";
const CARD_VERSION = "0.1.0";
const HOLD_MS = 500;

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
          background: color-mix(in srgb, var(--apc-color) 12%, transparent);
          box-shadow: inset 0 0 10px color-mix(in srgb, var(--apc-color) 45%, transparent);
        }
        .card:focus, .card:focus-visible { outline: none; }
        .card.kbd:focus-visible .pill { outline: 2px solid var(--apc-color); outline-offset: 2px; }
        .icon {
          flex: none;
          width: 42px;
          height: 42px;
          margin: 7px;
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
          margin-left: 2px;
          padding-right: 16px;
          font-size: 14px;
          font-weight: 600;
          color: var(--apc-text);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        /* ---------- Mushroom style ---------- */
        .card.mushroom { height: 68px; }
        .card.mushroom .pill {
          overflow: hidden;
          padding: 13px 9px;
          gap: 12px;
          border-radius: var(--ha-card-border-radius, 12px);
          -webkit-backdrop-filter: blur(12px);
          backdrop-filter: blur(12px);
        }
        .card.mushroom .icon {
          width: 65px;
          height: 65px;
          margin: -18px 0 0 -18px;
          --mdc-icon-size: 44px;
        }
        .card.mushroom .name { margin: 0; padding-right: 4px; }
      </style>
      <div class="card" tabindex="0" role="button">
        <div class="pill">
          <div class="icon"></div>
          <div class="name"></div>
        </div>
      </div>`;
    const $ = (s) => this.shadowRoot.querySelector(s);
    this._card = $(".card");
    this._icon = $(".icon");
    this._name = $(".name");
    this._timer = null;
    this._held = false;

    this._card.addEventListener("click", (e) => {
      if (this._held) {
        this._held = false;
        return;
      }
      this._run("tap_action");
      if (e.detail) this._card.blur();
    });
    this._card.addEventListener("pointerdown", () => {
      this._card.classList.remove("kbd");
      this._held = false;
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
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this._run("tap_action");
      }
    });
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
      colorIconBg: cfg.color_icon_background !== false,
      colorText: cfg.color_text !== false,
      cardStyle: cfg.card_style === "mushroom" ? "mushroom" : "bubble",
      unavailable,
      inert: unavailable || (this._action("tap_action", s)?.action ?? "none") === "none",
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
      "--apc-icon-bg",
      m.colorIconBg ? `color-mix(in srgb, ${m.color} 20%, transparent)` : "color-mix(in srgb, var(--primary-text-color) 10%, transparent)"
    );
    this._card.style.setProperty("--apc-text", m.colorText ? m.color : "var(--primary-text-color)");
    this._card.classList.toggle("mushroom", m.cardStyle === "mushroom");
    this._card.classList.toggle("unavailable", m.unavailable);
    this._card.classList.toggle("inert", m.inert);
    this._card.setAttribute("aria-disabled", String(m.inert));
    this._icon.innerHTML = `<ha-icon icon="${esc(m.icon)}"></ha-icon>`;
    this._name.textContent = m.name;
    this._card.setAttribute("aria-label", m.name);
  }

  _fire(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  _run(which) {
    const a = this._action(which);
    if (!a || a.action === "none") return;
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
  color_icon_background: "Color icon background",
  color_text: "Color text",
  tap_action: "Tap action",
  hold_action: "Hold action",
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
  return [
    {
      name: "mode",
      selector: { select: { mode: "box", options: [{ value: "button", label: "Button" }, { value: "toggle", label: "Toggle" }] } },
    },
    { name: "entity", required: toggle, selector: { entity: {} } },
    ...(toggle ? [{ name: "active_state", selector: { text: {} } }] : []),
    {
      name: "card_style",
      selector: { select: { mode: "dropdown", options: [{ value: "bubble", label: "Bubble" }, { value: "mushroom", label: "Mushroom" }] } },
    },
    { name: "color_icon_background", selector: { boolean: {} } },
    { name: "color_text", selector: { boolean: {} } },
    { name: "name", selector: { text: {} } },
    { name: "icon", selector: { icon: {} } },
    { name: "color", selector: COLOR_SELECTOR },
    { name: "tap_action", selector: { ui_action: {} } },
    { name: "hold_action", selector: { ui_action: {} } },
    ...(toggle
      ? [
          { type: "expandable", name: "state_on", title: "Active state overrides", schema: stateSchema },
          { type: "expandable", name: "state_off", title: "Inactive state overrides", schema: stateSchema },
        ]
      : []),
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
      this._form.addEventListener("value-changed", (ev) => {
        ev.stopPropagation();
        const config = prune({ ...this._config, ...ev.detail.value });
        if (config.card_style === "bubble") delete config.card_style;
        if (config.color_icon_background === true) delete config.color_icon_background;
        if (config.color_text === true) delete config.color_text;
        if (config.mode === "button") delete config.mode;
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
      });
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.schema = getEditorSchema({ mode: "button", ...this._config });
    this._form.data = { mode: "button", card_style: "bubble", color_icon_background: true, color_text: true, ...this._config };
  }
}

if (!customElements.get(CARD_TAG)) customElements.define(CARD_TAG, ActionPillCard);
if (!customElements.get(EDITOR_TAG)) customElements.define(EDITOR_TAG, ActionPillCardEditor);

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === CARD_TAG)) {
  window.customCards.push({
    type: CARD_TAG,
    name: CARD_NAME,
    description: "Bubble or Mushroom style button card. Plain button, or a toggle that changes text, icon, color and action with an entity's state.",
    preview: true,
  });
}

console.info(`%c ACTION-PILL-CARD %c v${CARD_VERSION} `, "color:white;background:#30D158;font-weight:700", "color:#30D158;background:white");
