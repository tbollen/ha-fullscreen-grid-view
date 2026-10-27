export function openDialog(view, title, fields, onSave) {
  view._dialog.replaceChildren();

  const header = document.createElement("div");
  header.className = "dialog-header";

  const heading = document.createElement("h2");
  heading.textContent = title;
  header.append(heading);

  const body = document.createElement("div");
  body.className = "dialog-body";

  const inputs = {};

  for (const field of fields) {
    const wrapper = document.createElement("div");
    wrapper.className = "field";

    const label = document.createElement("label");
    label.textContent = field.label;
    wrapper.append(label);

    let input;

    if (field.type === "select") {
      input = document.createElement("select");

      for (const [value, text] of field.options || []) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = text;
        input.append(option);
      }

      input.value = field.value;
    } else if (field.type === "checkbox") {
      input = document.createElement("input");
      input.type = "checkbox";
      input.checked = Boolean(field.value);
      input.style.width = "auto";
      input.style.minHeight = "auto";
    } else if (field.type === "textarea") {
      input = document.createElement("textarea");
      input.value = field.value ?? "";
      input.placeholder = field.placeholder || "";
    } else {
      input = document.createElement("input");
      input.type = field.type || "text";
      input.value = field.value ?? "";

      if (field.min !== undefined) input.min = field.min;
      if (field.max !== undefined) input.max = field.max;
      if (field.step !== undefined) input.step = field.step;
    }

    inputs[field.key] = input;
    wrapper.append(input);

    if (field.hint) {
      const hint = document.createElement("div");
      hint.className = "hint";
      hint.textContent = field.hint;
      wrapper.append(hint);
    }

    body.append(wrapper);
  }

  const actions = document.createElement("div");
  actions.className = "dialog-actions";

  const cancel = document.createElement("button");
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", () => view._closeDialog());

  const save = document.createElement("button");
  save.className = "primary";
  save.textContent = "Save";

  const handleKeydown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      view._closeDialog();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      save.click();
    }
  };

  const cleanupKeydown = () => {
    document.removeEventListener("keydown", handleKeydown);
  };

  document.addEventListener("keydown", handleKeydown);

  save.addEventListener("click", () => {
    cleanupKeydown();

    const values = {};

    for (const field of fields) {
      values[field.key] =
        field.type === "checkbox"
          ? inputs[field.key].checked
          : inputs[field.key].value;
    }

    view._closeDialog();
    onSave(values);
  });

  cancel.addEventListener("click", cleanupKeydown);

  actions.append(cancel, save);
  view._dialog.append(header, body, actions);
  view._backdrop.classList.add("open");
}