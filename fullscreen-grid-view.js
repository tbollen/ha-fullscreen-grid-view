import { DEFAULT_VALUES } from "./default-values.js";
import { positive, conditionMatches, allocate } from "./grid-layout.js";
import { openDialog } from "./dialog-editor.js";
import { addCardControls } from "./card-controls.js";
import { registerFullscreenGridView } from "./hui-view-editor.js";

const STYLES = await fetch(
  new URL("./fullscreen-grid-styles.css", import.meta.url),
).then((response) => {
  if (!response.ok) {
    throw new Error("Failed to load fullscreen-grid-styles.css");
  }
  return response.text();
});

class FullscreenGridView extends HTMLElement {
  constructor() {
    super();

    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = undefined;
    this._lovelace = undefined;
    this._editMode = false;
    this._cards = [];

    this._conditionRecords = new Map();
    this._globalRecords = new Map();
    this._globals = {};

    this._gridDimensions = { columns: 0, rows: 0 };
    this._resizeFrame = 0;
    this._renderFrame = 0;

    this._renderShell();

    this._resizeObserver = new ResizeObserver(() => {
      this._updateGridDimensions();
    });

    this._resizeObserver.observe(this._viewport);
  }

  setConfig(config) {
    this._config = structuredClone(config || {});
    this._config.cards ??= [];
    this._gridDimensions = { columns: 0, rows: 0 };
    this._render();
  }

  set hass(hass) {
    const previousHass = this._hass;

    const records = [
      ...this._conditionRecords.values(),
      ...this._globalRecords.values(),
    ];

    const dependenciesChanged = records.some(({ dependencies }) => {
      if (dependencies.has("*")) {
        return previousHass !== hass;
      }

      for (const entityId of dependencies) {
        if (previousHass?.states?.[entityId] !== hass?.states?.[entityId]) {
          return true;
        }
      }

      return false;
    });

    this._hass = hass;

    for (const card of this._cards) {
      if (card) card.hass = hass;
    }

    if (dependenciesChanged) {
      this._render();
    }
  }

  get hass() {
    return this._hass;
  }

  set lovelace(lovelace) {
    this._lovelace = lovelace;
    this._editMode = Boolean(lovelace?.editMode);
    this._render();
  }

  get lovelace() {
    return this._lovelace;
  }

  set narrow(value) {
    this.toggleAttribute("narrow", Boolean(value));
  }

  getCardSize() {
    return 1;
  }

  _renderShell() {
    this.shadowRoot.innerHTML = `
      <style>${STYLES}</style>

      <div id="root">
        <div id="grid-viewport">
          <div id="grid"></div>
        </div>

        <section id="add-card-section">
          <button id="add-card" class="toolbar-button">
            <ha-icon icon="mdi:plus-circle-outline"></ha-icon>
            <span>Add card to grid</span>
          </button>
        </section>

        <section id="static-editor">
          <div class="section-heading">
            <ha-icon
              style="cursor:help;"
              icon="mdi:information-outline"
              title="Add cards with a fixed position here, such as popup cards, navbars or custom:button-cards with position: fixed. They will not appear in the grid."
            ></ha-icon>
            <span>Static cards</span>
          </div>
          <div id="static-list"></div>
        </section>

        <div id="runtime-static"></div>
      </div>

      <div id="dialog-backdrop">
        <div id="dialog" role="dialog" aria-modal="true"></div>
      </div>
    `;

    this._viewport = this.shadowRoot.getElementById("grid-viewport");
    this._grid = this.shadowRoot.getElementById("grid");
    this._addCardSection = this.shadowRoot.getElementById("add-card-section");
    this._staticEditor = this.shadowRoot.getElementById("static-editor");
    this._staticList = this.shadowRoot.getElementById("static-list");
    this._runtimeStatic = this.shadowRoot.getElementById("runtime-static");
    this._backdrop = this.shadowRoot.getElementById("dialog-backdrop");
    this._dialog = this.shadowRoot.getElementById("dialog");

    this.shadowRoot
      .getElementById("add-card")
      .addEventListener("click", () => this._dispatchCreateCard());

    this._backdrop.addEventListener("click", (event) => {
      if (event.target === this._backdrop) {
        this._closeDialog();
      }
    });

    this.shadowRoot.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this._closeDialog();
    });
  }

  // Resolve layout settings, falling back to shared defaults.
  _getLayoutSettings() {
    const layout = this._config.layout || {};
    const defaults = DEFAULT_VALUES;

    const hasFixedDimensions =
      layout.columns != null &&
      layout.rows != null &&
      positive(layout.columns, 0) > 0 &&
      positive(layout.rows, 0) > 0;

    return {
      layout,
      defaults,
      fixed: hasFixedDimensions,

      columns: hasFixedDimensions
        ? positive(layout.columns, defaults.columns)
        : 0,

      rows: hasFixedDimensions ? positive(layout.rows, defaults.rows) : 0,

      minCellWidth: positive(layout.min_cell_width, defaults.min_cell_width),

      preferredCellWidth: positive(
        layout.preferred_cell_width,
        defaults.preferred_cell_width,
      ),

      maxCellWidth: positive(layout.max_cell_width, defaults.max_cell_width),

      minCellHeight: positive(layout.min_cell_height, defaults.min_cell_height),

      preferredCellHeight: positive(
        layout.preferred_cell_height,
        defaults.preferred_cell_height,
      ),

      maxCellHeight: positive(layout.max_cell_height, defaults.max_cell_height),
    };
  }

  // Calculate the grid from the viewport's available space.
  _updateGridDimensions() {
    if (!this._viewport || !this._grid) return;

    const settings = this._getLayoutSettings();

    if (settings.fixed) {
      const { columns, rows } = settings;

      if (
        columns !== this._gridDimensions.columns ||
        rows !== this._gridDimensions.rows
      ) {
        this._gridDimensions = { columns, rows };
        this._render();
      }

      return;
    }

    cancelAnimationFrame(this._resizeFrame);

    this._resizeFrame = requestAnimationFrame(() => {
      const width = this._viewport.clientWidth;
      const height = this._viewport.clientHeight;

      if (width <= 0 || height <= 0) return;

      const { layout, defaults } = settings;
      const gapValue = layout.gap ?? defaults.gap;
      const paddingValue = layout.padding ?? gapValue;

      const gap = this._toPixels(gapValue);
      const padding = this._toPixels(paddingValue);

      const availableWidth = Math.max(0, width - padding * 2);
      const availableHeight = Math.max(0, height - padding * 2);

      const minWidth = settings.minCellWidth;
      const preferredWidth = Math.max(minWidth, settings.preferredCellWidth);
      const maxWidth = Math.max(preferredWidth, settings.maxCellWidth);

      const minHeight = settings.minCellHeight;
      const preferredHeight = Math.max(minHeight, settings.preferredCellHeight);
      const maxHeight = Math.max(preferredHeight, settings.maxCellHeight);

      // Start with the preferred dimensions.
      let columns = Math.max(
        1,
        Math.floor((availableWidth + gap) / (preferredWidth + gap)),
      );

      let rows = Math.max(
        1,
        Math.floor((availableHeight + gap) / (preferredHeight + gap)),
      );

      // Increase the count when cells would exceed their maximum size.
      const initialCellWidth = (availableWidth - gap * (columns - 1)) / columns;

      if (initialCellWidth > maxWidth) {
        columns = Math.max(
          1,
          Math.ceil((availableWidth + gap) / (maxWidth + gap)),
        );
      }

      const initialCellHeight = (availableHeight - gap * (rows - 1)) / rows;

      if (initialCellHeight > maxHeight) {
        rows = Math.max(
          1,
          Math.ceil((availableHeight + gap) / (maxHeight + gap)),
        );
      }

      // Reduce the count if cells would be smaller than the minimum.
      const finalCellWidth = (availableWidth - gap * (columns - 1)) / columns;

      if (finalCellWidth < minWidth && columns > 1) {
        columns = Math.max(
          1,
          Math.floor((availableWidth + gap) / (minWidth + gap)),
        );
      }

      const finalCellHeight = (availableHeight - gap * (rows - 1)) / rows;

      if (finalCellHeight < minHeight && rows > 1) {
        rows = Math.max(
          1,
          Math.floor((availableHeight + gap) / (minHeight + gap)),
        );
      }

      if (
        columns === this._gridDimensions.columns &&
        rows === this._gridDimensions.rows
      ) {
        return;
      }

      this._gridDimensions = { columns, rows };
      this._render();
    });
  }

  _toPixels(value) {
    if (typeof value === "number") {
      return Number.isFinite(value) ? Math.max(0, value) : 0;
    }

    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }

  // Resolve [global.NAME] references recursively.
  _resolveGlobals(value) {
    const globals = this._globals ?? {};

    if (typeof value === "string") {
      // Preserve the original value's type when the entire string is a reference.
      const exactMatch = value.match(/^\[global\.([^\]]+)\]$/);

      if (exactMatch) {
        const name = exactMatch[1].trim();

        if (Object.prototype.hasOwnProperty.call(globals, name)) {
          return globals[name];
        }

        console.warn(
          `[fullscreen-grid-view] Unknown global variable: "${name}"`,
        );

        return value;
      }

      // Replace references embedded in larger strings.
      return value.replace(/\[global\.([^\]]+)\]/g, (match, name) => {
        name = name.trim();

        if (!Object.prototype.hasOwnProperty.call(globals, name)) {
          console.warn(
            `[fullscreen-grid-view] Unknown global variable: "${name}"`,
          );
          return match;
        }

        const replacement = globals[name];

        if (replacement !== null && typeof replacement === "object") {
          console.warn(
            `[fullscreen-grid-view] Cannot interpolate object global "${name}" into a string.`,
          );
          return match;
        }

        return String(replacement);
      });
    }

    if (Array.isArray(value)) {
      return value.map((item) => this._resolveGlobals(item));
    }

    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          this._resolveGlobals(item),
        ]),
      );
    }

    return value;
  }

  // Evaluate globals and record the entities each expression reads.
  _evaluateGlobals() {
    const source = this._config?.layout?.globals ?? {};
    const globals = {};
    const nextRecords = new Map();
    const hass = this._hass;

    for (const [name, value] of Object.entries(source)) {
      if (typeof value !== "string") {
        globals[name] = value;
        continue;
      }

      const match = value.trim().match(/^\[\[\[([\s\S]*?)\]\]\]$/);

      if (!match) {
        globals[name] = value;
        continue;
      }

      const dependencies = new Set();

      const trackedStates = new Proxy(hass?.states ?? {}, {
        get(target, property) {
          if (typeof property === "string") {
            dependencies.add(property);
          }

          return Reflect.get(target, property, target);
        },

        has(target, property) {
          if (typeof property === "string") {
            dependencies.add(property);
          }

          return Reflect.has(target, property);
        },

        ownKeys(target) {
          dependencies.add("*");
          return Reflect.ownKeys(target);
        },

        getOwnPropertyDescriptor(target, property) {
          if (typeof property === "string") {
            dependencies.add(property);
          }

          return Reflect.getOwnPropertyDescriptor(target, property);
        },
      });

      const trackedHass = new Proxy(hass ?? {}, {
        get(target, property, receiver) {
          if (property === "states") {
            return trackedStates;
          }

          return Reflect.get(target, property, receiver);
        },
      });

      try {
        globals[name] = Function(
          "hass",
          "states",
          "globals",
          `"use strict"; ${match[1]}`,
        )(trackedHass, trackedStates, globals);
      } catch (err) {
        console.warn(
          `[fullscreen-grid-view] Failed to evaluate global "${name}":`,
          err,
        );

        globals[name] = undefined;
      }

      nextRecords.set(name, { dependencies });
    }

    this._globalRecords = nextRecords;
    this._globals = globals;
  }

  _render() {
    if (!this._grid || !this._config) return;

    const settings = this._getLayoutSettings();

    // Wait for the viewport to be measurable before rendering a responsive grid.
    if (!settings.fixed && !this._gridDimensions.columns) {
      this._updateGridDimensions();
      return;
    }

    this._evaluateGlobals();
    this._grid.replaceChildren();
    this._staticList.replaceChildren();
    this._runtimeStatic.replaceChildren();
    this._cards = [];

    const { layout, defaults } = settings;
    const columns = settings.fixed
      ? settings.columns
      : this._gridDimensions.columns;
    const rows = settings.fixed ? settings.rows : this._gridDimensions.rows;

    const direction = ["row", "column"].includes(layout.direction)
      ? layout.direction
      : defaults.direction;

    const scroll = ["none", "vertical", "horizontal"].includes(layout.scroll)
      ? layout.scroll
      : defaults.scroll;

    const gap = layout.gap ?? defaults.gap;
    const padding = layout.padding ?? gap;

    const editSize = ["minimum", "maximum"].includes(layout.edit_size)
      ? layout.edit_size
      : defaults.edit_size;

    this._grid.style.setProperty("--columns", columns);
    this._grid.style.setProperty("--rows", rows);
    this._grid.style.setProperty("--grid-gap", gap);
    this._grid.style.setProperty("--grid-padding", padding);
    this._grid.style.setProperty("--grid-auto-flow", direction);

    this._grid.classList.toggle("editing", this._editMode);
    this._grid.classList.toggle(
      "scroll-vertical",
      scroll === "vertical" || (this._editMode && direction === "row"),
    );
    this._grid.classList.toggle(
      "scroll-horizontal",
      scroll === "horizontal" || (this._editMode && direction === "column"),
    );

    this._viewport.classList.toggle("editing", this._editMode);
    this._viewport.classList.toggle(
      "scroll-vertical",
      scroll === "vertical" || (this._editMode && direction === "row"),
    );
    this._viewport.classList.toggle(
      "scroll-horizontal",
      scroll === "horizontal" || (this._editMode && direction === "column"),
    );

    this._addCardSection.classList.toggle("visible", this._editMode);
    this._staticEditor.classList.toggle("visible", this._editMode);

    const source = Array.isArray(this._config.cards) ? this._config.cards : [];

    const allEntries = source
      .map((config, index) => ({ config, index }))
      .filter(({ config }) => Boolean(config?.type));

    const staticEntries = allEntries.filter(
      ({ config }) => config.view_layout?.static === true,
    );

    const candidates = allEntries.filter(
      ({ config }) => config.view_layout?.static !== true,
    );

    // Evaluate each condition once and rebuild its dependency index.
    this._conditionRecords.clear();

    const entries = candidates
      .map(({ config, index }) => {
        const dependencies = new Set();

        const conditionVisible = conditionMatches(
          this._hass,
          config,
          dependencies,
          this._globals ?? {},
        );

        this._conditionRecords.set(index, {
          dependencies,
          visible: conditionVisible,
        });

        return {
          config,
          index,
          conditionVisible,
        };
      })
      .filter(({ conditionVisible }) => this._editMode || conditionVisible)
      .sort((a, b) => {
        const orderA = positive(a.config.view_layout?.order, a.index + 1);
        const orderB = positive(b.config.view_layout?.order, b.index + 1);
        return orderA - orderB || a.index - b.index;
      });

    // DEBUG HERE!!!
    console.log(
      "Cards entering allocation:",
      candidates.map(({ config, index }) => ({
        index,
        type: config.type,
        entity: config.entity,
        view_layout: config.view_layout,
      })),
    );
    const placements = allocate(
      entries,
      columns,
      rows,
      direction,
      this._editMode,
      editSize,
      this._hass,
    );

    const shownPlacements = this._editMode
      ? placements
      : placements.filter((placement) => !placement.outOfBounds);

    if (!shownPlacements.length && this._editMode) {
      this._grid.append(this._empty("No grid cards configured."));
    }

    for (const placement of shownPlacements) {
      const cell = document.createElement("div");

      cell.className = [
        "card-cell",
        ...(this._editMode ? ["editable"] : []),
        ...(placement.outOfBounds ? ["out-of-bounds"] : []),
        ...(placement.conditionVisible === false ? ["condition-hidden"] : []),
      ].join(" ");

      cell.style.gridColumn = `span ${placement.width}`;
      cell.style.gridRow = `span ${placement.height}`;

      const card = this._createCard(placement.config);
      if (!card) continue;

      cell.append(card);

      if (this._editMode) {
        addCardControls(this, cell, placement.index);
      }

      this._grid.append(cell);
      this._cards.push(card);
    }

    for (const entry of staticEntries) {
      const card = this._createCard(entry.config);
      if (!card) continue;

      this._cards.push(card);

      if (this._editMode) {
        const cell = document.createElement("div");
        cell.className = "static-cell";

        const label = document.createElement("div");
        label.className = "static-label";
        label.textContent =
          entry.config.title ||
          entry.config.name ||
          entry.config.type ||
          `Static card ${entry.index + 1}`;

        cell.append(label, card);
        addCardControls(this, cell, entry.index);
        this._staticList.append(cell);
      } else {
        this._runtimeStatic.append(card);
      }
    }

    if (this._editMode && !staticEntries.length) {
      this._staticList.append(this._empty("No static cards configured."));
    }

    if (this._hass) {
      for (const card of this._cards) {
        card.hass = this._hass;
      }
    }
  }

  _createCard(config) {
    const resolvedConfig = this._resolveGlobals(structuredClone(config));

    const card = document.createElement("hui-card");
    card.setAttribute("type", resolvedConfig.type);
    card.config = resolvedConfig;

    if (this._hass) card.hass = this._hass;
    if (this._lovelace) card.lovelace = this._lovelace;

    return card;
  }

  _empty(message) {
    const element = document.createElement("div");
    element.className = "empty";
    element.textContent = message;
    return element;
  }

  _dispatchEditCard(index) {
    this.dispatchEvent(
      new CustomEvent("ll-edit-card", {
        bubbles: true,
        composed: true,
        detail: { path: [this.index, "cards", index] },
      }),
    );
  }

  _dispatchCreateCard() {
    this.dispatchEvent(
      new CustomEvent("ll-create-card", {
        bubbles: true,
        composed: true,
      }),
    );
  }

  _saveCards(cards) {
    const nextConfig = { ...this._config, cards };
    delete nextConfig.static_cards;

    if (
      this._lovelace?.config &&
      typeof this._lovelace.saveConfig === "function"
    ) {
      const dashboardConfig = structuredClone(this._lovelace.config);
      const views = dashboardConfig.views || [];

      if (!views[this.index]) {
        this._showMessage("Unable to find this view in the dashboard config.");
        return;
      }

      views[this.index] = {
        ...views[this.index],
        ...nextConfig,
      };

      this._lovelace.saveConfig(dashboardConfig);
      this._config = nextConfig;
      this._render();
    } else {
      this._showMessage(
        "Unable to save the layout because the dashboard configuration is unavailable.",
      );
    }
  }

  _duplicateCard(index) {
    const cards = structuredClone(this._config.cards || []);
    if (!cards[index]) return;

    cards.splice(index + 1, 0, structuredClone(cards[index]));
    this._saveCards(cards);
  }

  _deleteCard(index, confirmDelete = false) {
    const card = this._config.cards?.[index];
    if (!card) return;

    if (
      confirmDelete &&
      !window.confirm(
        `Delete this card (${card.title || card.type || "card"})?`,
      )
    ) {
      return;
    }

    const cards = structuredClone(this._config.cards || []);
    cards.splice(index, 1);
    this._saveCards(cards);
  }

  _moveCard(index, offset) {
    const cards = structuredClone(this._config.cards || []);
    const target = index + offset;

    if (
      index < 0 ||
      index >= cards.length ||
      target < 0 ||
      target >= cards.length
    ) {
      return;
    }

    [cards[index], cards[target]] = [cards[target], cards[index]];

    this._saveCards(cards);
    this._closeDialog();
  }

  _openLayoutEditor(index) {
    const card = this._config.cards?.[index];
    if (!card) return;

    const layout = card.view_layout || {};
    const cards = this._config.cards || [];

    openDialog(
      this,
      "Card layout",
      [
        {
          label: "Order",
          key: "order",
          value: layout.order ?? "",
          type: "number",
          min: 1,
          hint: "Optional sizing priority. Leave blank for default priority.",
        },
        {
          label: "Width",
          key: "width",
          value: layout.width ?? "",
          type: "number",
          min: 1,
          hint: "Leave blank to use automatic sizing.",
        },
        {
          label: "Height",
          key: "height",
          value: layout.height ?? "",
          type: "number",
          min: 1,
          hint: "Leave blank to use automatic sizing.",
        },
        {
          label: "Minimum width",
          key: "min_width",
          value: layout.min_width ?? 1,
          type: "number",
          min: 1,
        },
        {
          label: "Maximum width",
          key: "max_width",
          value: layout.max_width ?? 1,
          type: "number",
          min: 1,
          hint: "Leave blank to allow the full grid width.",
        },
        {
          label: "Minimum height",
          key: "min_height",
          value: layout.min_height ?? 1,
          type: "number",
          min: 1,
        },
        {
          label: "Maximum height",
          key: "max_height",
          value: layout.max_height ?? 1,
          type: "number",
          min: 1,
          hint: "Leave blank to allow the full grid height.",
        },
        {
          label: "Static card",
          key: "static",
          value: layout.static === true,
          type: "checkbox",
          hint: "Static cards are excluded from grid allocation.",
        },
        {
          label: "Condition (JavaScript)",
          key: "condition",
          value: layout.condition ?? "",
          type: "textarea",
          hint: "Optional JavaScript expression. Available variables: hass and states. Leave blank to use the card's existing condition/hidden configuration.",
        },
      ],
      (values) => {
        const nextCards = structuredClone(this._config.cards || []);
        const nextLayout = {};

        for (const key of [
          "order",
          "width",
          "height",
          "min_width",
          "max_width",
          "min_height",
          "max_height",
        ]) {
          const raw = values[key];

          if (raw !== "" && raw !== undefined && raw !== null) {
            const number = Math.floor(Number(raw));

            if (Number.isFinite(number) && number > 0) {
              nextLayout[key] = number;
            }
          }
        }

        if (values.static) {
          nextLayout.static = true;
        }

        if (String(values.condition || "").trim()) {
          nextLayout.condition = String(values.condition).trim();
        }

        nextCards[index].view_layout = nextLayout;
        this._saveCards(nextCards);
      },
      [
        {
          label: "↑ Move up",
          disabled: index === 0,
          onClick: () => this._moveCard(index, -1),
        },
        {
          label: "↓ Move down",
          disabled: index === cards.length - 1,
          onClick: () => this._moveCard(index, 1),
        },
      ],
    );
  }

  _openViewSettings() {
    const layout = this._config.layout || {};
    const settings = this._getLayoutSettings();
    const defaults = settings.defaults;

    openDialog(
      this,
      "Grid settings",
      [
        {
          label: "Columns",
          key: "columns",
          value: settings.fixed ? settings.columns : "",
          type: "number",
          min: 1,
          hint: "Set both columns and rows to use fixed grid dimensions. Leave both blank for automatic sizing.",
        },
        {
          label: "Rows",
          key: "rows",
          value: settings.fixed ? settings.rows : "",
          type: "number",
          min: 1,
          hint: "Set both rows and columns to use fixed grid dimensions. Leave both blank for automatic sizing.",
        },
        {
          label: "Allocation direction",
          key: "direction",
          value: layout.direction ?? defaults.direction,
          type: "select",
          options: [
            ["column", "Column first"],
            ["row", "Row first"],
          ],
        },
        {
          label: "Scrolling",
          key: "scroll",
          value: layout.scroll ?? defaults.scroll,
          type: "select",
          options: [
            ["none", "None"],
            ["vertical", "Vertical"],
            ["horizontal", "Horizontal"],
          ],
        },
        {
          label: "Edit card sizing",
          key: "edit_size",
          value: ["minimum", "maximum"].includes(layout.edit_size)
            ? layout.edit_size
            : defaults.edit_size,
          type: "select",
          options: [
            ["minimum", "Minimum"],
            ["maximum", "Maximum"],
          ],
        },
      ],
      (values) => {
        const nextLayout = { ...layout };

        // Fixed dimensions are active only when both values are supplied.
        const columns = positive(values.columns, 0);
        const rows = positive(values.rows, 0);

        if (columns && rows) {
          nextLayout.columns = columns;
          nextLayout.rows = rows;
        } else {
          delete nextLayout.columns;
          delete nextLayout.rows;
        }

        nextLayout.direction = ["row", "column"].includes(values.direction)
          ? values.direction
          : defaults.direction;

        nextLayout.scroll = ["none", "vertical", "horizontal"].includes(
          values.scroll,
        )
          ? values.scroll
          : defaults.scroll;

        nextLayout.edit_size = ["minimum", "maximum"].includes(values.edit_size)
          ? values.edit_size
          : defaults.edit_size;

        const nextConfig = {
          ...this._config,
          layout: nextLayout,
        };

        delete nextConfig.columns;
        delete nextConfig.rows;
        delete nextConfig.direction;
        delete nextConfig.scroll;

        const dashboardConfig = structuredClone(this._lovelace?.config || {});
        const views = dashboardConfig.views || [];

        if (!views[this.index]) {
          this._showMessage(
            "Unable to find this view in the dashboard config.",
          );
          return;
        }

        views[this.index] = {
          ...views[this.index],
          ...nextConfig,
        };

        this._lovelace.saveConfig(dashboardConfig);
        this._config = nextConfig;
        this._gridDimensions = { columns: 0, rows: 0 };
        this._render();
      },
    );
  }

  _closeDialog() {
    this._backdrop.classList.remove("open");
  }

  _showMessage(message) {
    openDialog(
      this,
      "Notice",
      [
        {
          label: message,
          key: "notice",
          value: "",
          type: "text",
        },
      ],
      () => {},
    );
  }

  disconnectedCallback() {
    this._resizeObserver?.disconnect();
    cancelAnimationFrame(this._resizeFrame);
    cancelAnimationFrame(this._renderFrame);
  }
}

if (!customElements.get("fullscreen-grid-view")) {
  customElements.define("fullscreen-grid-view", FullscreenGridView);
}

customElements.whenDefined("hui-view-editor").then(() => {
  registerFullscreenGridView();
});

window.customCards = window.customCards || [];

if (!window.customCards.some((card) => card.type === "fullscreen-grid-view")) {
  window.customCards.push({
    type: "fullscreen-grid-view",
    name: "Fullscreen Grid View",
    description:
      "Responsive grid with preferred cell sizing, static cards and layout editing.",
  });
}
