export function registerFullscreenGridView() {
  const HuiViewEditor = customElements.get("hui-view-editor");
  if (!HuiViewEditor) return;

  const proto = HuiViewEditor.prototype;

  if (proto._fullscreenGridViewPatched) return;
  proto._fullscreenGridViewPatched = true;

  const firstUpdated = proto.firstUpdated;

  proto.firstUpdated = function (...args) {
    firstUpdated?.apply(this, args);

    const oldSchema = this._schema;

    this._schema = (...schemaArgs) => {
      const schema = oldSchema.call(this, ...schemaArgs);
      const typeSelector = schema.find((item) => item.name === "type");
      const options = typeSelector?.selector?.select?.options;

      if (
        options &&
        !options.some(
          (option) => option.value === "custom:fullscreen-grid-view",
        )
      ) {
        options.push({
          value: "custom:fullscreen-grid-view",
          label: "Fullscreen Grid View",
        });
      }

      return schema;
    };

    this.requestUpdate();
  };
}
