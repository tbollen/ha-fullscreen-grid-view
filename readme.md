# Fullscreen Grid View

## Overview

`fullscreen-grid-view` is a custom Home Assistant dashboard view that arranges cards in a configurable grid. Cards can occupy multiple columns and rows, remain fixed-size, or grow within configured limits to use available space.

The view also provides an editing mode that allows cards to be positioned beyond the grid boundaries, making it possible to edit layouts even when all cards cannot fit in the normal view.

## How it works

- **Visibility:** Cards are filtered using `hidden`, `condition`, and `view_layout.condition`.
- **Initial sizing:** Each card starts at its configured minimum size, unless a width or height is fixed.
- **Placement:** Cards are placed in sequence according to the configured flow direction. Cards that cannot fit within the grid are excluded from normal rendering.
- **Automatic sizing:** Remaining grid space is allocated by growing eligible cards toward their maximum dimensions. Fixed dimensions are not expanded.
- **Editing:** The view allows overflow placements so cards remain accessible in the editor. A separate normal-placement pass determines which cards fit within the grid and sets their `outOfBounds` status.
- **Static cards:** Cards marked `view_layout.static: true` can be used for elements that should stay in a fixed position, subject to the view/editor's static-card handling.

## Configuration

The view-level options control the grid:

| Option      | Description                                                                                           |
| ----------- | ----------------------------------------------------------------------------------------------------- |
| `columns`   | Number of grid columns.                                                                               |
| `rows`      | Number of grid rows.                                                                                  |
| `direction` | Placement flow. Use `row` to fill across rows, or the other supported direction to fill down columns. |
| `gap`       | Spacing between grid cells, for example `12px`.                                                       |
| `scroll`    | Controls the view's scrolling behavior, for example `none`.                                           |
| `edit_size` | Card size used while editing: `minimum` or `maximum`.                                                 |

Card sizing is configured under each card's `view_layout`:

| Option                  | Description                                                                                                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `width`                 | Fixed width in grid columns.                                                                                                                                                        |
| `height`                | Fixed height in grid rows.                                                                                                                                                          |
| `min_width`             | Minimum width. Defaults to `1`.                                                                                                                                                     |
| `min_height`            | Minimum height. Defaults to `1`.                                                                                                                                                    |
| `max_width`             | Maximum width. Defaults to the grid's column count.                                                                                                                                 |
| `max_height`            | Maximum height. Defaults to the grid's row count.                                                                                                                                   |
| `order`                 | Visibility and automatic-sizing priority. Lower values get space first; omitted values default to `0`. It does not change placement order, which stays in card configuration order. |
| `static`                | Marks a card as static for the view/editor's static-card handling.                                                                                                                  |
| `hidden`                | Hides the card when set to `true`.                                                                                                                                                  |
| `condition`             | Supports a boolean or a list of entity-state conditions.                                                                                                                            |
| `view_layout.condition` | JavaScript expression evaluated with `hass` and `states` available.                                                                                                                 |

A fixed `width` or `height` takes precedence over the corresponding minimum and maximum settings. For example, `width: 2` fixes a card at two columns wide.

## Example

```yaml
type: custom:fullscreen-grid-view
columns: 4
rows: 4
direction: row
gap: 12px
scroll: none
edit_size: minimum
cards:
  - type: markdown
    content: Example card
    view_layout:
      min_width: 2
      min_height: 1
      max_width: 3
      max_height: 2
```

Adapt the top-level view type and card structure to match the installation's existing dashboard configuration.

## Notes

- Grid dimensions are measured in cells, not pixels.
- `min_width` and `min_height` determine whether a card can fit during normal placement.
- Cards that cannot be placed are omitted from the normal layout; the editor can still show them using overflow placement and mark them out of bounds.
- `edit_size: minimum` uses minimum dimensions in the editor; `edit_size: maximum` uses maximum dimensions.
- `view_layout.condition` is evaluated as JavaScript. Only use expressions you trust.
