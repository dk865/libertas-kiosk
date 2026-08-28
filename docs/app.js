import { t } from "./translations.js";

const app = document.getElementById("app");

const state = {
  authenticated: false,
  customerName: "",
  categories: [],
  items: [],
  selectedCategoryId: null,
  bag: [],
  paymentMethod: "CASH",
  error: "",
  successMessage: ""
};

const PLACEHOLDER_SVG = "data:image/svg+xml;utf8," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="100%" height="100%" fill="#f4e5cf"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#a54b2a" font-size="32" font-family="sans-serif">libertas cafe</text></svg>'
);

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || t("requestFailed"));
  }
  return data;
}

function setError(message) {
  state.error = message;
  render();
}

function clearError() {
  state.error = "";
}

function bagCount() {
  return state.bag.reduce((sum, line) => sum + line.quantity, 0);
}

function lineTotal(line) {
  const modifierSum = line.selectedModifiers.reduce((sum, modifier) => sum + modifier.priceCents, 0);
  return (line.variation.priceCents + modifierSum) * line.quantity;
}

function bagTotal() {
  return state.bag.reduce((sum, line) => sum + lineTotal(line), 0);
}

function filteredItems() {
  return state.items.filter((item) => !state.selectedCategoryId || item.categoryId === state.selectedCategoryId);
}

function resetSession() {
  state.customerName = "";
  state.bag = [];
  state.paymentMethod = "CASH";
  state.error = "";
  state.successMessage = "";
}

function closeModal() {
  document.querySelector(".modal")?.remove();
}

function showModal(html, afterRender) {
  closeModal();
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.appendChild(host.firstElementChild);
  document.querySelector(".modal")?.addEventListener("click", (event) => {
    if (event.target.classList.contains("modal")) closeModal();
  });
  if (afterRender) afterRender();
}

async function loadCatalog() {
  const data = await api("/api/catalog");
  state.categories = data.categories;
  state.items = data.items;
  state.selectedCategoryId = null;
}

function addBagLine(item, variation, selectedModifiers) {
  const key = JSON.stringify([item.id, variation.id, selectedModifiers.map((mod) => mod.id).sort()]);
  const existing = state.bag.find((line) => line.key === key);
  if (existing) {
    existing.quantity += 1;
  } else {
    state.bag.push({ key, item, variation, selectedModifiers, quantity: 1 });
  }
}

function openCustomize(item) {
  const availableVariations = item.variations.filter((variation) => variation.available);
  let selectedVariation = availableVariations[0];
  const selectedModifiersByList = new Map();

  showModal(
    `<div class="modal"><div class="card modal-content stack">
      <button class="sheet-close" data-modal-back aria-label="${t("close")}">×</button>
      <p class="eyebrow">${t("customize")}</p>
      <h2>${escapeHtml(item.name)}</h2>
      <p class="muted">${escapeHtml(item.description || "")}</p>
      ${item.variations.length === 1 && !(item.modifierLists || []).length ? `<p class="muted option-note">${t("noCustomizableOptions")}</p>` : ""}
      ${item.variations.length > 1 ? `<fieldset class="choice-group"><legend>${t("options")}</legend>${item.variations.map((variation, index) => `<label class="choice ${variation.available ? "" : "disabled-choice"}"><input type="radio" name="variation" data-variation="${escapeHtml(variation.id)}" ${variation.available && index === item.variations.findIndex((entry) => entry.available) ? "checked" : ""} ${variation.available ? "" : "disabled"}/><span>${escapeHtml(variation.name)}${variation.available ? "" : ` <small>${t("unavailable")}</small>`}</span><strong>${money(variation.priceCents)}</strong></label>`).join("")}</fieldset>` : ""}
      ${(item.modifierLists || []).map((list) => `
        <section class="stack">
          <h3>${escapeHtml(list.name)} ${list.minSelections > 0 ? `<span class="muted">(${t("requiredTag")})</span>` : ""}</h3>
          ${list.modifiers.map((modifier) => `
            <label class="row">
              <input type="checkbox" data-list="${escapeHtml(list.id)}" data-modifier="${escapeHtml(modifier.id)}" ${modifier.available ? "" : "disabled"} />
              ${escapeHtml(modifier.name)}${modifier.available ? ` (${money(modifier.priceCents)})` : ` <span class="sold-out-note">(${escapeHtml(modifier.availabilityNote || t("soldOut"))})</span>`}
            </label>
          `).join("")}
        </section>
      `).join("")}
      <div class="row space-between">
        <button data-modal-add ${availableVariations.length ? "" : "disabled"}>${availableVariations.length ? t("addToBag") : t("soldOut")}</button>
      </div>
    </div></div>`,
    () => {
      document.querySelectorAll("input[data-list][data-modifier]").forEach((input) => {
        input.addEventListener("change", (event) => {
          const listId = event.target.getAttribute("data-list");
          const modifierId = event.target.getAttribute("data-modifier");
          const selected = selectedModifiersByList.get(listId) || new Set();
          if (event.target.checked) selected.add(modifierId);
          else selected.delete(modifierId);
          selectedModifiersByList.set(listId, selected);
        });
      });

      document.querySelectorAll("[data-variation]").forEach((input) => input.addEventListener("change", () => {
        selectedVariation = item.variations.find((variation) => variation.id === input.getAttribute("data-variation"));
      }));

      document.querySelector("[data-modal-back]")?.addEventListener("click", closeModal);

      document.querySelector("[data-modal-add]")?.addEventListener("click", () => {
        const selectedModifiers = [];
        for (const list of item.modifierLists || []) {
          const selectedSet = selectedModifiersByList.get(list.id) || new Set();
          const selected = list.modifiers.filter((modifier) => selectedSet.has(modifier.id));
          if (selected.length < list.minSelections || selected.length > list.maxSelections) {
            setError(t("modifierSelectionError"));
            return;
          }
          selectedModifiers.push(...selected);
        }

        clearError();
        addBagLine(item, selectedVariation, selectedModifiers);
        closeModal();
        render();
      });
    }
  );
}

function openBag() {
  showModal(
    `<div class="modal"><div class="card modal-content stack">
      <h2>${t("bag")} (${bagCount()})</h2>
      ${state.bag.length === 0 ? `<p class="muted">${t("emptyBag")}</p>` : state.bag.map((line, index) => `
        <article class="card stack">
          <div class="row space-between"><strong>${escapeHtml(line.item.name)}</strong><span>${money(lineTotal(line))}</span></div>
          <div class="muted">${escapeHtml(line.variation.name)}${line.selectedModifiers.length ? ` · ${escapeHtml(line.selectedModifiers.map((mod) => mod.name).join(", "))}` : ""}</div>
          <div class="row">
            <button data-minus="${index}">-</button>
            <span>${line.quantity}</span>
            <button data-plus="${index}">+</button>
            <button data-remove="${index}">${t("remove")}</button>
          </div>
        </article>
      `).join("")}
      <div class="row space-between"><strong>${t("total")}</strong><strong>${money(bagTotal())}</strong></div>
      <label>${t("paymentMethod")}
        <select id="payment-method" class="input">
          <option value="CASH" ${state.paymentMethod === "CASH" ? "selected" : ""}>${t("cash")}</option>
          <option value="STAR_CARDS" ${state.paymentMethod === "STAR_CARDS" ? "selected" : ""}>${t("starCards")}</option>
        </select>
      </label>
      <p class="muted">${state.paymentMethod === "CASH" ? t("cashInstructions") : t("starCardsInstructions")}</p>
      <div class="row space-between">
        <button data-close>${t("back")}</button>
        <button data-checkout ${state.bag.length === 0 ? "disabled" : ""}>${t("checkout")}</button>
      </div>
    </div></div>`,
    () => {
      document.querySelector("[data-close]")?.addEventListener("click", closeModal);
      document.querySelector("#payment-method")?.addEventListener("change", (event) => {
        state.paymentMethod = event.target.value;
        openBag();
      });
      document.querySelectorAll("[data-minus]").forEach((button) => {
        button.addEventListener("click", () => {
          const index = Number(button.getAttribute("data-minus"));
          state.bag[index].quantity = Math.max(1, state.bag[index].quantity - 1);
          openBag();
        });
      });

      document.querySelectorAll("[data-plus]").forEach((button) => {
        button.addEventListener("click", () => {
          const index = Number(button.getAttribute("data-plus"));
          state.bag[index].quantity += 1;
          openBag();
        });
      });

      document.querySelectorAll("[data-remove]").forEach((button) => {
        button.addEventListener("click", () => {
          const index = Number(button.getAttribute("data-remove"));
          state.bag.splice(index, 1);
          openBag();
        });
      });

      document.querySelector("[data-checkout]")?.addEventListener("click", submitOrderConfirm);
    }
  );
}

function createOrderPayload() {
  return {
    customerName: state.customerName,
    paymentMethod: state.paymentMethod,
    idempotencyKey: crypto.randomUUID(),
    items: state.bag.map((line) => ({
      itemId: line.item.id,
      variationId: line.variation.id,
      quantity: line.quantity,
      modifierIds: line.selectedModifiers.map((mod) => mod.id)
    }))
  };
}

function submitOrderConfirm() {
  showModal(
    `<div class="modal"><div class="card modal-content stack">
      <h2>${t("finalConfirm")}</h2>
      <label class="row"><input id="confirm-check" type="checkbox" /> ${t("confirmChecklist")}</label>
      <p><strong>${escapeHtml(state.customerName)}</strong></p>
      ${state.bag.map((line) => `<div>${line.quantity} × ${escapeHtml(line.item.name)}</div>`).join("")}
      <p><strong>${t("total")}: ${money(bagTotal())}</strong></p>
      <p>${t("paymentMethod")}: ${state.paymentMethod === "CASH" ? t("cash") : t("starCards")}</p>
      <div class="row space-between">
        <button data-back>${t("back")}</button>
        <button data-submit disabled>${t("placeOrder")}</button>
      </div>
    </div></div>`,
    () => {
      const checkbox = document.querySelector("#confirm-check");
      const submitButton = document.querySelector("[data-submit]");
      checkbox?.addEventListener("change", () => {
        submitButton.disabled = !checkbox.checked;
      });

      document.querySelector("[data-back]")?.addEventListener("click", openBag);
      submitButton?.addEventListener("click", async () => {
        try {
          clearError();
          submitButton.disabled = true;
          const payload = createOrderPayload();
          await api("/api/orders", {
            method: "POST",
            body: JSON.stringify(payload)
          });
          try {
            await loadCatalog();
          } catch {}
          closeModal();
          state.successMessage = state.paymentMethod === "CASH" ? t("orderSubmittedCash") : t("orderSubmittedStar");
          resetAfterSuccess();
          renderSuccess();
        } catch (error) {
          setError(error.message);
          openBag();
        }
      });
    }
  );
}

function resetAfterSuccess() {
  setTimeout(() => {
    resetSession();
    render();
  }, 3000);
}

function renderPassword() {
  app.innerHTML = `
    <section class="card stack">
      <h1>${t("passwordTitle")}</h1>
      <p class="muted">${t("passwordSubtitle")}</p>
      <label>${t("passwordLabel")}<input id="kiosk-password" class="input" type="password" autocomplete="current-password" aria-label="${t("passwordLabel")}" /></label>
      <button id="unlock-kiosk">${t("unlockKiosk")}</button>
      ${state.error ? `<p class="muted" style="color:#b91c1c;">${escapeHtml(state.error)}</p>` : ""}
    </section>
  `;

  document.querySelector("#unlock-kiosk")?.addEventListener("click", async () => {
    try {
      clearError();
      await api("/api/auth", {
        method: "POST",
        body: JSON.stringify({ password: document.querySelector("#kiosk-password").value })
      });
      state.authenticated = true;
      render();
    } catch (error) {
      setError(error.message || t("authenticationFailed"));
    }
  });
}

function renderWelcome() {
  app.innerHTML = `
    <section class="card stack">
      <h1>${t("welcomeTitle")}</h1>
      <p class="muted">${t("welcomeSubtitle")}</p>
      <label>${t("yourName")}<input id="customer-name" class="input" maxlength="64" aria-label="${t("yourName")}" /></label>
      <button id="continue-name">${t("continue")}</button>
      ${state.error ? `<p class="muted" style="color:#b91c1c;">${escapeHtml(state.error)}</p>` : ""}
    </section>
  `;

  document.querySelector("#continue-name")?.addEventListener("click", async () => {
    const customerName = document.querySelector("#customer-name").value.trim();
    if (!customerName) {
      setError(t("nameRequired"));
      return;
    }

    try {
      clearError();
      state.customerName = customerName;
      await loadCatalog();
      render();
    } catch {
      state.customerName = "";
      setError(t("menuLoadFail"));
    }
  });
}

function renderMenu() {
  app.innerHTML = `
    <header class="card row space-between">
      <div>
        <strong>${t("appName")}</strong>
        <div class="muted">${escapeHtml(state.customerName)}</div>
      </div>
      <button id="bag-open">${t("bag")} (${bagCount()})</button>
    </header>
    <nav class="category-row" aria-label="Categories">
      <button data-category="" class="${state.selectedCategoryId === null ? "active" : ""}">${t("allItems")}</button>
      ${state.categories.map((category) => `<button data-category="${escapeHtml(category.id)}" class="${state.selectedCategoryId === category.id ? "active" : ""}">${escapeHtml(category.name)}</button>`).join("")}
    </nav>
    ${state.error ? `<p class="muted" style="color:#b91c1c;">${escapeHtml(state.error)}</p>` : ""}
    <section class="grid">
      ${filteredItems().map((item) => {
        const availableVariations = item.variations.filter((variation) => variation.available);
        const startingPrice = Math.min(...(availableVariations.length > 0 ? availableVariations : item.variations).map((variation) => variation.priceCents));

        return `
          <article class="card item-card">
            <img class="item-image" src="${escapeHtml(item.imageUrl || PLACEHOLDER_SVG)}" alt="${escapeHtml(item.name)}" />
            <strong>${escapeHtml(item.name)}</strong>
            <div class="muted">${escapeHtml(item.description || "")}</div>
            <div class="row space-between">
              <strong>${money(startingPrice)}</strong>
              ${item.available ? `<button data-item="${escapeHtml(item.id)}">${t("addToBag")}</button>` : `<span class="badge unpaid">${t("unavailable")}</span>`}
            </div>
          </article>
        `;
      }).join("")}
    </section>
  `;

  document.querySelector("#bag-open")?.addEventListener("click", openBag);

  document.querySelectorAll("button[data-category]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedCategoryId = button.getAttribute("data-category");
      render();
    });
  });

  document.querySelectorAll("button[data-item]").forEach((button) => {
    button.addEventListener("click", () => {
      const selected = state.items.find((item) => item.id === button.getAttribute("data-item"));
      if (selected) openCustomize(selected);
    });
  });
}

function renderSuccess() {
  app.innerHTML = `
    <section class="card stack">
      <h1>${t("orderReceived")}</h1>
      <p>${escapeHtml(state.successMessage || t("thankYou"))}</p>
      <p>${t("thankYou")}</p>
    </section>
  `;
}

function render() {
  if (!state.authenticated) {
    renderPassword();
    return;
  }
  if (!state.customerName) {
    renderWelcome();
    return;
  }
  renderMenu();
}

render();
