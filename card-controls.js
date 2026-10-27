export function addCardControls(view, cell, index) {
  const overlay = document.createElement("div");
  overlay.className = "card-overlay";

  const makeButton = (icon, title, callback) => {
    const button = document.createElement("button");
    button.className = "overlay-action";
    button.title = title;
    button.setAttribute("aria-label", title);

    const haIcon = document.createElement("ha-icon");
    haIcon.setAttribute("icon", icon);
    button.append(haIcon);

    button.addEventListener("click", (event) => {
      event.stopPropagation();
      callback();
    });

    return button;
  };

  overlay.append(
    makeButton("mdi:pencil", "Edit card", () =>
      view._dispatchEditCard(index)
    ),
    makeButton("mdi:card-text-outline", "Card layout", () => {
      overlay.classList.add("menu-open");
      view._openLayoutEditor(index);
    })
  );

  const menu = document.createElement("ha-dropdown");
  menu.className = "overlay-menu";
  menu.setAttribute("placement", "bottom-end");
  menu.setAttribute("size", "m");

  const trigger = document.createElement("ha-icon-button");
  trigger.setAttribute("slot", "trigger");
  trigger.setAttribute("aria-label", "Card actions");

  const dots = document.createElement("ha-svg-icon");
  dots.setAttribute(
    "path",
    "M12,16A2,2 0 0,1 14,18A2,2 0 0,1 12,20A2,2 0 0,1 10,18A2,2 0 0,1 12,16M12,10A2,2 0 0,1 14,12A2,2 0 0,1 12,14A2,2 0 0,1 10,12A2,2 0 0,1 12,10M12,4A2,2 0 0,1 14,6A2,2 0 0,1 12,8A2,2 0 0,1 10,6A2,2 0 0,1 12,4Z"
  );

  trigger.append(dots);
  menu.append(trigger);

  const actions = {
    edit: () => view._dispatchEditCard(index),
    layout: () => view._openLayoutEditor(index),
    moveUp: () => view._moveCard(index, -1),
    moveDown: () => view._moveCard(index, 1),
    duplicate: () => view._duplicateCard(index),
    delete: () => view._deleteCard(index, true),
  };

  // Dropdown items with icons.
  const menuItems = [
    ["Edit", "edit", "mdi:pencil"],
    ["Layout", "layout", "mdi:card-text-outline"],
    ["Duplicate", "duplicate", "mdi:content-copy"],
    ["Move Up", "moveUp", "mdi:arrow-up"],
    ["Move Down", "moveDown", "mdi:arrow-down"],
  ];

  for (const [label, value, icon] of menuItems) {
    const item = document.createElement("ha-dropdown-item");
    item.setAttribute("value", value);

    const haIcon = document.createElement("ha-icon");
    haIcon.setAttribute("icon", icon);

    item.append(haIcon, document.createTextNode(label));
    menu.append(item);
  }

  menu.append(document.createElement("wa-divider"));

  const deleteItem = document.createElement("ha-dropdown-item");
  deleteItem.setAttribute("value", "delete");
  deleteItem.setAttribute("variant", "danger");

  const deleteIcon = document.createElement("ha-icon");
  deleteIcon.setAttribute("icon", "mdi:delete-outline");

  deleteItem.append(deleteIcon, document.createTextNode("Delete"));
  menu.append(deleteItem);

  const setMenuOpen = (open) => {
    overlay.classList.toggle("menu-open", open);
  };

  menu.addEventListener("open", () => setMenuOpen(true));
  menu.addEventListener("close", () => setMenuOpen(false));

  overlay.addEventListener("click", (event) => {
    if (
      event.target instanceof Element &&
      event.target.closest(
        ".overlay-action, ha-dropdown, ha-icon-button, ha-dropdown-item"
      )
    ) {
      return;
    }

    event.stopPropagation();

    if (menu.open) return;

    menu.open = true;
    setMenuOpen(true);
  });

  // Keep clicks inside the dropdown from reaching the card.
  menu.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  menu.addEventListener("wa-select", (event) => {
    event.stopPropagation();

    const action = actions[event.detail?.item?.value];

    menu.open = false;
    setMenuOpen(false);

    action?.();
  });

  // Close the menu when clicking outside this dropdown.
  // A single listener is installed for this module, not one per card.
  if (!view._cardControlsOutsideClickHandler) {
    view._cardControlsOutsideClickHandler = (event) => {
      const path = event.composedPath();

      for (const cell of view.shadowRoot.querySelectorAll(
        ".card-cell, .static-cell"
      )) {
        const overlay = cell.querySelector(".card-overlay.menu-open");
        if (!overlay) continue;

        const menu = overlay.querySelector("ha-dropdown");
        if (!menu) continue;

        if (path.includes(overlay) || path.includes(menu)) continue;

        menu.open = false;
        overlay.classList.remove("menu-open");
      }
    };

    document.addEventListener(
      "click",
      view._cardControlsOutsideClickHandler
    );
  }

  overlay.append(menu);
  cell.append(overlay);
}