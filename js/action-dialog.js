/** Shared confirmation and field-editing dialog. Returns null on cancellation. */
import { t } from "./i18n.js";

const $ = (id) => document.getElementById(id);

export function openActionDialog({ eyebrow, title, subtitle = "", confirmLabel = "Confirm", danger = false, deleteLabel = "", closeOnBackdrop = true, closeOnEscape = true, fields = [] }) {
  const previousFocus = document.activeElement;
  const modal = $("actionModal");
  const form = $("actionForm");
  const fieldList = $("actionFields");
  const confirmButton = $("confirmAction");
  const deleteButton = $("deleteAction");
  $("actionEyebrow").textContent = t(eyebrow);
  $("actionModalTitle").textContent = t(title);
  $("actionSubtitle").textContent = t(subtitle);
  confirmButton.textContent = t(confirmLabel);
  confirmButton.classList.toggle("danger", danger);
  deleteButton.hidden = !deleteLabel;
  deleteButton.textContent = t(deleteLabel || "Delete");
  modal.classList.toggle("price-edit", Boolean(deleteLabel));
  fieldList.classList.toggle("price-history-fields", eyebrow === "PRICE HISTORY");
  fieldList.replaceChildren();
  for (const field of fields) {
    const label = document.createElement("label");
    label.className = field.wide === false ? "field" : "field wide";
    label.htmlFor = `action-${field.name}`;
    label.textContent = t(field.label);
    const input = field.options ? document.createElement("select") : document.createElement("input");
    input.id = `action-${field.name}`;
    input.name = field.name;
    if (field.options) {
      for (const optionData of field.options) {
        const option = document.createElement("option");
        option.value = optionData.value;
        option.textContent = t(optionData.label);
        input.append(option);
      }
    } else {
      input.type = field.type || "text";
      if (field.min !== undefined) input.min = field.min;
      if (field.max !== undefined) input.max = field.max;
      if (field.step !== undefined) input.step = field.step;
      if (field.inputMode) input.inputMode = field.inputMode;
      if (field.placeholder) input.placeholder = field.placeholder;
    }
    input.value = field.value ?? "";
    input.required = field.required !== false;
    label.append(input);
    fieldList.append(label);
  }
  modal.classList.add("open");
  const firstInput = fieldList.querySelector("input, select");
  const focusTimer = setTimeout(() => (firstInput || confirmButton).focus(), 20);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(focusTimer);
      modal.classList.remove("open");
      modal.classList.remove("price-edit");
      fieldList.classList.remove("price-history-fields");
      form.onsubmit = null;
      $("cancelAction").onclick = null;
      $("closeActionModal").onclick = null;
      deleteButton.onclick = null;
      modal.onclick = null;
      document.removeEventListener("keydown", onKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
      resolve(value);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape" && closeOnEscape) finish(null);
    };
    form.onsubmit = (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form).entries());
      finish(deleteLabel ? { action: "save", values } : fields.length ? values : true);
    };
    $("cancelAction").onclick = () => finish(null);
    $("closeActionModal").onclick = () => finish(null);
    deleteButton.onclick = () => finish({ action: "delete" });
    modal.onclick = (event) => { if (closeOnBackdrop && event.target === modal) finish(null); };
    document.addEventListener("keydown", onKeyDown);
  });
}
