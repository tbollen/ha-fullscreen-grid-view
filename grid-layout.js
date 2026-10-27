export function positive(value, fallback) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function conditionMatches(
  hass,
  config,
  dependencies = null,
  globals = {},
) {
  const actualStates = hass?.states ?? {};

  const states = new Proxy(actualStates, {
    get(target, property, receiver) {
      if (property === Symbol.iterator) {
        dependencies?.add("*");
      } else if (typeof property === "string" && property.includes(".")) {
        dependencies?.add(property);
      }

      return Reflect.get(target, property, receiver);
    },

    ownKeys(target) {
      dependencies?.add("*");
      return Reflect.ownKeys(target);
    },

    has(target, property) {
      if (typeof property === "string" && property.includes(".")) {
        dependencies?.add(property);
      }

      return Reflect.has(target, property);
    },
  });

  const viewCondition = config?.view_layout?.condition;

  if (
    viewCondition !== undefined &&
    viewCondition !== null &&
    String(viewCondition).trim() !== ""
  ) {
    try {
      return Boolean(
        Function(
          "hass",
          "states",
          "global",
          `"use strict"; ${String(viewCondition).trim()}`,
        )(hass, states, globals),
      );
    } catch (err) {
      console.warn(
        "[fullscreen-grid-view] Invalid view_layout.condition:",
        err,
      );
      return false;
    }
  }

  const condition = config?.condition;

  if (condition !== undefined && condition !== null) {
    if (typeof condition === "boolean") return condition;

    const conditions = Array.isArray(condition) ? condition : [condition];

    return conditions.every((item) => {
      if (!item || !item.entity) return Boolean(item);

      dependencies?.add(item.entity);

      const state = actualStates[item.entity];
      if (!state) return false;

      if (item.state !== undefined) {
        const expected = Array.isArray(item.state)
          ? item.state.map(String)
          : [String(item.state)];

        if (!expected.includes(state.state)) return false;
      }

      if (item.state_not !== undefined) {
        const excluded = Array.isArray(item.state_not)
          ? item.state_not.map(String)
          : [String(item.state_not)];

        if (excluded.includes(state.state)) return false;
      }

      return true;
    });
  }

  return config?.hidden !== true;
}

export function allocate(
  entries,
  columns,
  rows,
  direction,
  allowOverflow = false,
  editSize = "minimum",
  hass = null,
) {
  const editing = allowOverflow;
  const rowFlow = direction === "row";

  const visibleEntries = entries.filter(
    ({ config, conditionVisible }) =>
      config?.hidden !== true &&
      (editing || (conditionVisible ?? conditionMatches(hass, config))),
  );
  const getDimensions = (layout = {}) => {
    const fixedWidth = layout.width != null && layout.width !== "";
    const fixedHeight = layout.height != null && layout.height !== "";

    const minWidth = Math.min(
      columns,
      fixedWidth ? positive(layout.width, 1) : positive(layout.min_width, 1),
    );

    const minHeight = Math.min(
      rows,
      fixedHeight ? positive(layout.height, 1) : positive(layout.min_height, 1),
    );

    const maxWidth = fixedWidth
      ? minWidth
      : Math.min(
          columns,
          Math.max(minWidth, positive(layout.max_width, columns)),
        );

    const maxHeight = fixedHeight
      ? minHeight
      : Math.min(rows, Math.max(minHeight, positive(layout.max_height, rows)));

    return {
      fixedWidth,
      fixedHeight,
      minWidth,
      minHeight,
      maxWidth,
      maxHeight,
    };
  };

  const cards = visibleEntries.map(({ config, index, conditionVisible }) => {
    const dimensions = getDimensions(config.view_layout || {});

    return {
      config,
      index,
      conditionVisible,
      ...dimensions,
      width:
        editing && editSize === "maximum"
          ? dimensions.maxWidth
          : dimensions.minWidth,
      height:
        editing && editSize === "maximum"
          ? dimensions.maxHeight
          : dimensions.minHeight,
      row: 0,
      col: 0,
      outOfBounds: false,
    };
  });

  if (editing) {
    // Allow overflow placements while editing.
    const placements = placeCards(cards, true);

    // Identify cards that fit within the grid using normal placement rules.
    const inBoundsIndices = new Set(
      placeCards(cards, false).map(({ index }) => index),
    );

    // Mark cards that cannot be placed within the grid as out of bounds.
    return placements
      .map((placement) => ({
        ...placement,
        outOfBounds: !inBoundsIndices.has(placement.index),
      }))
      .map(stripDimensions);
  }

  // Keep only cards that fit when every card uses its minimum dimensions.
  let placements = placeCards(cards, false);
  const placedIndices = new Set(placements.map(({ index }) => index));

  const allocatableCards = cards.filter((card) =>
    placedIndices.has(card.index),
  );

  const cardByIndex = new Map(
    allocatableCards.map((card) => [card.index, card]),
  );

  const sizingOrder = [...allocatableCards].sort((a, b) => {
    const aRaw = a.config.view_layout?.order;
    const bRaw = b.config.view_layout?.order;

    const aOrder = Number(aRaw);
    const bOrder = Number(bRaw);

    const aValid = aRaw != null && aRaw !== "" && Number.isFinite(aOrder);

    const bValid = bRaw != null && bRaw !== "" && Number.isFinite(bOrder);

    if (aValid && bValid) return aOrder - bOrder;
    if (aValid) return -1;
    if (bValid) return 1;

    return a.index - b.index;
  });

  let occupiedCells = allocatableCards.reduce(
    (total, card) => total + card.width * card.height,
    0,
  );

  const totalCells = columns * rows;
  let availableCells = totalCells - occupiedCells;

  const failedAttempts = new Set();

  const syncPlacements = (result) => {
    placements = result;

    for (const placement of result) {
      const card = cardByIndex.get(placement.index);
      if (!card) continue;

      card.row = placement.row;
      card.col = placement.col;
      card.outOfBounds = placement.outOfBounds;
    }
  };

  const tryResize = (card, dimension) => {
    if (dimension === "width") {
      if (card.fixedWidth || card.width >= card.maxWidth) return false;
    } else if (card.fixedHeight || card.height >= card.maxHeight) {
      return false;
    }

    const key = `${card.index}:${dimension}`;
    if (failedAttempts.has(key)) return false;

    const requiredCells = dimension === "width" ? card.height : card.width;

    if (availableCells < requiredCells) {
      failedAttempts.add(key);
      return false;
    }

    const oldWidth = card.width;
    const oldHeight = card.height;

    if (dimension === "width") card.width++;
    else card.height++;

    const result = placeCards(allocatableCards, false);

    if (result.length !== allocatableCards.length) {
      card.width = oldWidth;
      card.height = oldHeight;
      failedAttempts.add(key);
      return false;
    }

    occupiedCells += requiredCells;
    availableCells = totalCells - occupiedCells;

    syncPlacements(result);
    failedAttempts.clear();

    return true;
  };

  for (const card of sizingOrder) {
    while (card.width < card.maxWidth || card.height < card.maxHeight) {
      if (availableCells <= 0) break;

      if (tryResize(card, "width")) continue;
      if (tryResize(card, "height")) continue;

      break;
    }

    if (availableCells <= 0) break;
  }

  // LOG PLACEMENTS TO THE CONSOLE
  console.group("fullscreen-grid-view");
  console.info("Fullscreen grid view placements");
  console.table(
    placeCards(allocatableCards, false).map((p) => ({
      index: p.index,
      row: p.row,
      col: p.col,
      width: p.width,
      height: p.height,
      columns,
      rows,
    })),
  );
  console.groupEnd();

  return placeCards(allocatableCards, false).map(stripDimensions);

  function placeCards(items, overflow) {
    const occupied = [];
    const placed = [];

    const ensureRow = (row) => {
      while (occupied.length <= row) {
        occupied.push(Array(columns).fill(false));
      }
    };

    const fits = (row, col, width, height) => {
      if (col < 0 || col + width > columns) return false;
      if (!overflow && row + height > rows) return false;

      ensureRow(row + height - 1);

      for (let y = row; y < row + height; y++) {
        for (let x = col; x < col + width; x++) {
          if (occupied[y][x]) return false;
        }
      }

      return true;
    };

    const mark = (row, col, width, height) => {
      ensureRow(row + height - 1);

      for (let y = row; y < row + height; y++) {
        for (let x = col; x < col + width; x++) {
          occupied[y][x] = true;
        }
      }
    };

    const findPosition = (width, height, cursor) => {
      const maxRows = overflow
        ? Math.max(rows, occupied.length + items.length * height + height)
        : rows;

      const maxColumns = overflow ? columns + items.length * columns : columns;

      let { row, col } = cursor;

      while (row < maxRows && col < maxColumns) {
        if (col + width > columns) {
          if (!rowFlow) {
            if (!overflow) return null;
            col++;
            row = 0;
          } else {
            row++;
            col = 0;
          }
          continue;
        }

        if (fits(row, col, width, height)) {
          return { row, col };
        }

        if (rowFlow) {
          col++;
          if (col >= columns) {
            row++;
            col = 0;
          }
        } else {
          row++;
          if (row + height > rows) {
            col++;
            row = 0;
          }
        }
      }

      return null;
    };
    let cursor = { row: 0, col: 0 };

    for (const card of items) {
      const { width, height } = card;

      if (width > columns || (!overflow && height > rows)) {
        continue;
      }

      let position = findPosition(width, height, cursor);

      if (!position && overflow) {
        position = rowFlow
          ? { row: occupied.length, col: 0 }
          : { row: 0, col: columns };
      }

      // Skip cards that cannot fit, but continue testing later cards.
      if (!position) continue;

      const { row, col } = position;

      mark(row, col, width, height);

      placed.push({
        ...card,
        row,
        col,
        outOfBounds: row + height > rows,
      });

      if (rowFlow) {
        cursor = { row, col: col + width };

        if (cursor.col >= columns) {
          cursor = { row: row + 1, col: 0 };
        }
      } else {
        cursor = { row: row + height, col };

        if (cursor.row + height > rows) {
          cursor = { row: 0, col: col + 1 };
        }
      }
    }

    return placed;
  }

  function stripDimensions({
    minWidth,
    minHeight,
    maxWidth,
    maxHeight,
    fixedWidth,
    fixedHeight,
    ...placement
  }) {
    return placement;
  }
}
