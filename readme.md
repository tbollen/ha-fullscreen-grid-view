# Fullscreen Grid View

A custom Home Assistant view for tablets, wall-mounted dashboards, and smart home hubs.

**Status: Highly experimental.** Expect bugs, breaking changes, and incomplete functionality. Back up your dashboard configuration before experimenting with it.

The code is created with AI assistance, but _always_ human-verified!

## What is it?

Fullscreen Grid View is a custom Home Assistant view designed to make dashboards work well on tablets and dedicated smart home hubs.

It provides a fullscreen, grid-based layout while keeping dashboard creation and editing UI-friendly. Instead of manually calculating card positions or writing a complex layout from scratch, you configure a grid and let the view place and size your cards.

The goal is to combine a dashboard that feels purpose-built for a touchscreen with a configuration process that remains manageable through Home Assistant's UI.

## Features

- **Responsive grid:** Configure fixed grid dimensions or let the view calculate them from the available screen space.
- **Automatic card sizing:** Cards can grow within their configured size limits to use available grid space.
- **Row-first and column-first placement:** Choose whether cards flow across rows or down columns.
- **Layout editing:** Add, configure, duplicate, move, and delete cards through the UI.
- **Overflow editing:** Cards that cannot fit in the normal grid can still be accessed in the editor.
- **Static cards:** Keep elements such as navigation bars and popup cards outside the grid layout.
- **Conditional visibility:** Show cards based on entity states or custom JavaScript.
- **Globals:** Define reusable values and JavaScript expressions for use throughout your dashboard configuration.
- **Scrolling:** Choose how the grid behaves when its contents exceed the available space.

## Installation

Install the JavaScript and supporting files using the method provided by your project repository. The view depends on its accompanying modules and stylesheet, so keep the project files together.

After installation, register the resource in Home Assistant if your installation method does not do so automatically. Add a new dashboard view using the custom view type:

```yaml
type: custom:fullscreen-grid-view
```

Configure the view using the `layout` and `cards` sections described below.

> **Important:** This project is experimental. Keep a backup of your dashboard configuration before testing it.

## Configuration

The view configuration has two main sections:

- `layout`: Grid settings and reusable global values.
- `cards`: The cards to display, each with its own optional `view_layout` settings.

### Grid settings

Configure these options under `layout`.

| Option                  | Description                                                                                       | Default     |
| ----------------------- | ------------------------------------------------------------------------------------------------- | ----------- |
| `columns`               | Fixed number of columns. Must be configured together with `rows` to enable fixed grid dimensions. | `5`         |
| `rows`                  | Fixed number of rows. Must be configured together with `columns` to enable fixed grid dimensions. | `4`         |
| `direction`             | Placement direction: `row` fills across rows; `column` fills down columns.                        | `"row"`     |
| `gap`                   | Spacing between grid cells.                                                                       | `"8px"`     |
| `padding`               | Space inside the grid around its contents. Defaults to the configured gap when omitted.           | Same as gap |
| `scroll`                | Scrolling behavior: `none`, `vertical`, or `horizontal`.                                          | `"none"`    |
| `edit_size`             | Card sizing in the editor: `minimum` or `maximum`.                                                | `"minimum"` |
| `min_cell_width`        | Minimum preferred cell width, in pixels, for automatic grid sizing.                               | `120`       |
| `preferred_cell_width`  | Preferred cell width, in pixels, for automatic grid sizing.                                       | `150`       |
| `max_cell_width`        | Maximum cell width, in pixels, before the grid adds columns.                                      | `200`       |
| `min_cell_height`       | Minimum cell height, in pixels, for automatic grid sizing.                                        | `120`       |
| `preferred_cell_height` | Preferred cell height, in pixels, for automatic grid sizing.                                      | `150`       |
| `max_cell_height`       | Maximum cell height, in pixels, before the grid adds rows.                                        | `200`       |
| `globals`               | Reusable values and JavaScript expressions accessible to cards and conditions.                    | `{}`        |

The default values for these settings are defined in `default-values.js`.

#### Fixed and automatic dimensions

If both `columns` and `rows` are supplied with positive values, the view uses those dimensions.

```yaml
layout:
  columns: 6
  rows: 4
```

If either value is missing, the view calculates both dimensions from the available viewport size and the configured cell dimensions.

#### Placement direction

```yaml
layout:
  direction: row
```

- `row`: Places cards from left to right, moving to the next row as needed.
- `column`: Places cards from top to bottom, moving to the next column as needed.

The allocator checks positions according to the selected direction while respecting each card's dimensions.

#### Scrolling

| Value        | Behavior                                       |
| ------------ | ---------------------------------------------- |
| `none`       | No scrolling is enabled for the grid viewport. |
| `vertical`   | Enables vertical scrolling.                    |
| `horizontal` | Enables horizontal scrolling.                  |

The editor can enable scrolling automatically to keep overflowing cards accessible, depending on the selected direction.

### Card layout options

Card-specific settings belong under `view_layout` on each card.

| Option       | Description                                                                          | Default                                                                                      |
| ------------ | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `width`      | Fixed width in grid columns. When set, the card does not automatically grow wider.   | Unset                                                                                        |
| `height`     | Fixed height in grid rows. When set, the card does not automatically grow taller.    | Unset                                                                                        |
| `min_width`  | Minimum width in grid columns.                                                       | `1`                                                                                          |
| `min_height` | Minimum height in grid rows.                                                         | `1`                                                                                          |
| `max_width`  | Maximum width in grid columns.                                                       | `1` for newly configured cards; otherwise the allocation fallback is the grid's column count |
| `max_height` | Maximum height in grid rows.                                                         | `1` for newly configured cards; otherwise the allocation fallback is the grid's row count    |
| `order`      | Optional numeric priority for automatic resizing. Lower values are considered first. | Configuration order                                                                          |
| `static`     | Keeps the card outside the grid allocation.                                          | `false`                                                                                      |
| `condition`  | JavaScript expression that determines whether the card should be shown.              | Unset                                                                                        |

A fixed `width` or `height` takes precedence over the corresponding minimum and maximum settings.

Minimum dimensions determine the initial size of a card. The allocator then attempts to expand eligible cards towards their maximum dimensions while space remains available.

The maximum dimensions are sizing limits, not requirements that a card must reach. Cards are not guaranteed to expand to their maximum size.

### Static cards

Set `view_layout.static: true` for cards that should not participate in grid allocation.

```yaml
- type: custom:button-card
  view_layout:
    static: true
```

Static cards are useful for elements that position themselves independently of the grid, such as:

- Navigation bars using fixed positioning.
- Popup cards.
- Floating controls or overlays.
- Other cards that should not occupy grid cells.

Static cards are excluded from the normal grid placement algorithm. In editing mode, they appear in a separate **Static cards** section so they can still be configured.

The view does not automatically position static cards for you. Their own configuration determines where they appear.

FYI: Vanilla Home Assistant Cards typically have no use as a "static" card.

## Conditions

Conditions let you control which cards are visible.

The view supports existing Home Assistant card visibility settings and a JavaScript condition under `view_layout.condition`.

### JavaScript conditions

A condition is a JavaScript function body. It must return a truthy value to show the card or a falsy value to hide it.

The following variables are available:

| Variable | Description                                           |
| -------- | ----------------------------------------------------- |
| `hass`   | Home Assistant's current frontend object.             |
| `states` | Entity states, accessible by entity ID.               |
| `global` | The evaluated globals defined under `layout.globals`. |

For example, show a card only when a light is on:

```yaml
- type: tile
  entity: light.kitchen
  view_layout:
    condition: |
      return states['light.kitchen']?.state === 'on';
```

A more complex example:

```yaml
- type: tile
  entity: media_player.living_room
  view_layout:
    condition: |
      const state = states['media_player.living_room']?.state;
      return state === 'playing' || state === 'paused';
```

**NOTE** that JS in conditions are _not_ wrapped in `[[[ ]]]`.

Conditions are evaluated against current Home Assistant state. Entity references accessed through `states` are tracked so the view can reevaluate the condition when relevant state objects change.

**Security:** JavaScript conditions execute as code in the Home Assistant frontend. Only use expressions you trust.

## Globals

Globals provide reusable values and JavaScript expressions that can be referenced from multiple cards and conditions.

Define them under `layout.globals`.

### Static globals

A static global can hold a string, number, boolean, or other supported YAML value.

```yaml
layout:
  globals:
    main_media_player: media_player.speaker_1
    show_media_controls: true
    columns_for_media: 2
```

Use a global in a card configuration by writing `[global.NAME]`:

```yaml
- type: tile
  entity: "[global.main_media_player]"
```

When the entire value is a global reference, the original value's type is preserved. This means a global can resolve to a boolean, number, string, or `null`, rather than always becoming text.

Global references can also be embedded in larger strings when the value is scalar.

### JavaScript globals

Wrap a JavaScript function body in `[[[ ... ]]]` to evaluate it as JavaScript. The expression must return the value you want to store.

```yaml
layout:
  globals:
    main_media_player: |
      [[[
        const players = [
          'media_player.speaker_1',
          'media_player.speaker_2',
          'media_player.speaker_3',
        ];

        const activePlayers = players.filter((entityId) => {
          const state = states[entityId]?.state;
          return ['playing', 'paused', 'idle'].includes(state);
        });

        return activePlayers[0] ?? null;
      ]]]
```

JavaScript globals have access to the same `hass`, `states`, and `global` variables.

For example, another global can refer to a previously defined global:

```yaml
layout:
  globals:
    main_media_player: media_player.speaker_1
    media_player_playing: |
      [[[
        return states[global.main_media_player]?.state == "playing";
      ]]]
```

Globals are evaluated in configuration order. A JavaScript global can reference globals that have already been defined; define dependencies before the globals that use them.

The view tracks entity-state reads made by JavaScript globals and reevaluates them when relevant state objects change.

### Using globals in conditions

Globals are also available inside JavaScript conditions:

```yaml
- type: tile
  entity: "[global.main_media_player]"
  view_layout:
    condition: |
      const entityId = global.main_media_player;
      const state = states[entityId]?.state;

      return ['playing', 'paused'].includes(state);
```

This keeps the entity ID in one place instead of repeating it throughout the dashboard.
Globals are processed before rendering, so you can use them in vanilla Home Assistant cards! They won't work in the editor UI though and will display an error.

**Security:** JavaScript globals, like JavaScript conditions, execute code in the frontend. Only use expressions you trust.

## Complete example

The following example demonstrates fixed grid dimensions, automatic card sizing, a static navigation card, conditional visibility, and reusable globals.

```yaml
type: custom:fullscreen-grid-view

layout:
  # Define a fixed grid of six columns and four rows.
  columns: 6
  rows: 4

  # Fill cards down columns before moving to the next column.
  direction: column

  # Space between cells and around the grid.
  gap: 12px
  padding: 12px

  # Grid scrolling and editor sizing.
  scroll: none
  edit_size: minimum

  # Reusable values.
  globals:
    main_media_player: media_player.speaker_1

    media_player_active: |
      [[[
        const state = states[global.main_media_player]?.state;
        return ['playing', 'paused'].includes(state);
      ]]]

cards:
  # A card that starts at two columns wide and can grow to three.
  - type: markdown
    content: |
      # Home
      Welcome home.
    view_layout:
      min_width: 2
      max_width: 3
      min_height: 1
      max_height: 2

  # A tile that is visible only when the kitchen light is on.
  - type: tile
    entity: light.kitchen
    view_layout:
      min_width: 1
      max_width: 2
      min_height: 1
      max_height: 1
      condition: |
        return states['light.kitchen']?.state === 'on';

  # Media controls using a reusable entity ID.
  - type: media-control
    entity: "[global.main_media_player]"
    view_layout:
      min_width: 2
      max_width: 3
      min_height: 1
      max_height: 2
      condition: |
        return global.media_player_active;

  # A navigation card that positions itself independently of the grid.
  - type: custom:button-card
    name: Navigation
    view_layout:
      static: true
    styles:
      card:
        - position: fixed
        - bottom: 16px
        - left: 16px
        - width: 180px
```

Adapt the card types, entities, and layout settings to your installation.

## Editing and troubleshooting

### Editing mode

The editor provides controls to add, configure, duplicate, move, and delete cards.

Cards that cannot be placed within the normal grid can still be shown in the editor using overflow placement. These cards are marked as out of bounds.

The `edit_size` setting controls the size used while editing:

- `minimum`: Uses minimum dimensions.
- `maximum`: Uses maximum dimensions.

### Cards that do not appear

If a card is missing, check:

1. Whether the card has `hidden: true`.
2. Whether its condition evaluates to `false`.
3. Whether its minimum dimensions allow it to fit within the configured grid.
4. Whether other cards occupy the available space.
5. Whether it should be configured as a static card instead.

Cards that cannot be placed are omitted from normal rendering. Editing mode can expose cards that do not fit within the grid.

### Globals not resolving

Check that:

- Globals are defined under `layout.globals`.
- JavaScript expressions are wrapped in `[[[ ... ]]]`.
- Card references use the exact syntax `[global.NAME]`.
- JavaScript conditions use `global.NAME`.
- Globals are defined before other globals that depend on them.

## Known limitations

This project is experimental. Behavior may change as the view develops, and some Home Assistant cards or combinations of layout constraints may not behave as expected.

The grid allocator determines card placement and sizing, but individual cards still control their own internal layout and appearance.
