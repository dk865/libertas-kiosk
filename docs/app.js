import { t } from "./translations.js";

const app = document.getElementById("app");
const mode = new URL(window.location.href).searchParams.get("mode") || "kiosk";

const state = {
  backendUrl: "",
  connected: false,
  customerName: "",
  categories: [],
  items: [],
  selectedCategoryId: null,
  bag: [],
  paymentMethod: "CASH",
  starCardStudentId: "",
  modal: null,
  error: ""
};

function money(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

function imageOrPlaceholder(url) {
  return url || "https://placehold.co/600x400/e5e7eb/6b7280?text=libertas+caf%C3%A9";
}

async function api(path, options = {}) {
  const response = await fetch(`${state.backendUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
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

function bagTotal() {
  return state.bag.reduce((sum, line) => {
    const modifierSum = line.selectedModifiers.reduce((acc, modifier) => acc + modifier.priceCents, 0);
    return sum + (line.variation.priceCents + modifierSum) * line.quantity;
  }, 0);
}

function openModal(content) {
  state.modal = content;
  render();
}

function closeModal() {
  state.modal = null;
  render();
}

async function loadCatalog() {
  const data = await api("/api/catalog");
  state.categories = data.categories;
  state.items = data.items;
  state.selectedCategoryId = data.categories[0]?.id || null;
}

function filteredItems() {
  return state.items.filter((item) => !state.selectedCategoryId || item.categoryId === state.selectedCategoryId);
}

function addBagLine(item, variation, selectedModifiers) {
  const existing = state.bag.find((line) =>
    line.item.id === item.id &&
    line.variation.id === variation.id &&
    JSON.stringify(line.selectedModifiers.map((m) => m.id).sort()) === JSON.stringify(selectedModifiers.map((m) => m.id).sort())
  );

  if (existing) {
    existing.quantity += 1;
  } else {
    state.bag.push({ item, variation, selectedModifiers, quantity: 1 });
  }
  render();
}

function openCustomize(item) {
  const variation = item.variations.find((entry) => entry.available);
  const selected = new Map();

  openModal(() => {
    const lists = item.modifierLists || [];

    return `
      <div class="modal"><div class="card modal-content stack">
        <h2>${item.name}</h2>
        <p class="muted">${item.description || ""}</p>
        ${lists.map((list) => {
          return `
            <section class="stack">
              <h3>${list.name} ${list.minSelections > 0 ? `(required)` : ""}</h3>
              ${list.modifiers.map((modifier) => {
                const key = `${list.id}:${modifier.id}`;
                return `<label class="row"><input type="checkbox" data-key="${key}" ${selected.get(key) ? "checked" : ""} ${modifier.available ? "" : "disabled"}/> ${modifier.name} (${money(modifier.priceCents)})</label>`;
              }).join("")}
            </section>
          `;
        }).join("")}
        <div class="row space-between">
          <button data-action="cancel">${t("back")}</button>
          <button data-action="add">${t("addToBag")}</button>
        </div>
      </div></div>
    `;
  });

  setTimeout(() => {
    document.querySelectorAll("input[data-key]").forEach((input) => {
      input.addEventListener("change", (event) => {
        const key = event.target.getAttribute("data-key");
        selected.set(key, event.target.checked);
      });
    });

    document.querySelector("button[data-action='cancel']")?.addEventListener("click", closeModal);
    document.querySelector("button[data-action='add']")?.addEventListener("click", () => {
      const selectedModifiers = [];
      for (const list of lists) {
        const selectedInList = list.modifiers.filter((modifier) => selected.get(`${list.id}:${modifier.id}`));
        if (selectedInList.length < list.minSelections || selectedInList.length > list.maxSelections) {
          setError(`${list.name}: select between ${list.minSelections} and ${list.maxSelections}.`);
          return;
        }
        selectedModifiers.push(...selectedInList);
      }
      clearError();
      addBagLine(item, variation, selectedModifiers);
      closeModal();
    });
  }, 0);
}

function openBag() {
  openModal(() => `
    <div class="modal"><div class="card modal-content stack">
      <h2>${t("bag")} (${bagCount()})</h2>
      ${state.bag.length === 0 ? `<p class="muted">Your bag is empty.</p>` : state.bag.map((line, index) => {
        const modText = line.selectedModifiers.map((m) => m.name).join(", ");
        const lineTotal = (line.variation.priceCents + line.selectedModifiers.reduce((sum, m) => sum + m.priceCents, 0)) * line.quantity;
        return `
          <article class="card stack">
            <div class="row space-between"><strong>${line.item.name}</strong><span>${money(lineTotal)}</span></div>
            <div class="muted">${line.variation.name}${modText ? ` · ${modText}` : ""}</div>
            <div class="row">
              <button data-qminus="${index}">-</button>
              <span>${line.quantity}</span>
              <button data-qplus="${index}">+</button>
              <button data-remove="${index}">Remove</button>
            </div>
          </article>
        `;
      }).join("")}
      <div class="row space-between"><strong>Total</strong><strong>${money(bagTotal())}</strong></div>
      <div class="stack">
        <label>${t("paymentMethod")}
          <select id="payment-method" class="input">
            <option value="CASH" ${state.paymentMethod === "CASH" ? "selected" : ""}>${t("cash")}</option>
            <option value="STAR_CARDS" ${state.paymentMethod === "STAR_CARDS" ? "selected" : ""}>${t("starCards")}</option>
          </select>
        </label>
        ${state.paymentMethod === "STAR_CARDS" ? `<label>${t("starCardId")}<input id="star-card-id" class="input" value="${state.starCardStudentId}" /></label>` : ""}
      </div>
      <div class="row space-between">
        <button data-close>${t("back")}</button>
        <button data-checkout ${state.bag.length === 0 ? "disabled" : ""}>${t("checkout")}</button>
      </div>
    </div></div>
  `);

  setTimeout(() => {
    document.querySelector("[data-close]")?.addEventListener("click", closeModal);
    document.querySelector("#payment-method")?.addEventListener("change", (event) => {
      state.paymentMethod = event.target.value;
      openBag();
    });
    document.querySelector("#star-card-id")?.addEventListener("input", (event) => {
      state.starCardStudentId = event.target.value;
    });

    document.querySelectorAll("[data-qminus]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.getAttribute("data-qminus"));
        state.bag[index].quantity = Math.max(1, state.bag[index].quantity - 1);
        openBag();
      });
    });

    document.querySelectorAll("[data-qplus]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.getAttribute("data-qplus"));
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
  }, 0);
}

function toSubmitPayload() {
  return {
    customerName: state.customerName,
    paymentMethod: state.paymentMethod,
    starCardStudentId: state.starCardStudentId || undefined,
    idempotencyKey: crypto.randomUUID(),
    items: state.bag.map((line) => ({
      itemId: line.item.id,
      variationId: line.variation.id,
      quantity: line.quantity,
      modifierIds: line.selectedModifiers.map((m) => m.id)
    }))
  };
}

function submitOrderConfirm() {
  if (state.paymentMethod === "STAR_CARDS" && !state.starCardStudentId.trim()) {
    setError("Please provide your student ID for star-card validation.");
    return;
  }

  openModal(() => `
    <div class="modal"><div class="card modal-content stack">
      <h2>${t("finalConfirm")}</h2>
      <p><strong>${state.customerName}</strong></p>
      ${state.bag.map((line) => `<div>${line.quantity} × ${line.item.name}</div>`).join("")}
      <p><strong>Total: ${money(bagTotal())}</strong></p>
      <p>Payment: ${state.paymentMethod === "CASH" ? t("cash") : t("starCards")}</p>
      <div class="row space-between">
        <button data-back>${t("back")}</button>
        <button data-submit>${t("placeOrder")}</button>
      </div>
    </div></div>
  `);

  setTimeout(() => {
    document.querySelector("[data-back]")?.addEventListener("click", openBag);
    document.querySelector("[data-submit]")?.addEventListener("click", async () => {
      try {
        clearError();
        const payload = toSubmitPayload();
        await api("/api/orders", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        state.bag = [];
        state.paymentMethod = "CASH";
        state.starCardStudentId = "";
        closeModal();
        renderSuccess();
      } catch (error) {
        setError(error.message);
        openBag();
      }
    });
  }, 0);
}

function renderConnection() {
  app.innerHTML = `
    <section class="card stack">
      <h1>${t("startupTitle")}</h1>
      <p class="muted">${t("startupSubtitle")}</p>
      <label>${t("backendAddress")}<input id="backend" class="input" placeholder="https://your-vercel-app.vercel.app"/></label>
      <div class="row">
        <button id="test-btn">${t("testConnection")}</button>
        <button id="continue-btn" disabled>${t("continueToKiosk")}</button>
      </div>
      ${state.error ? `<p class="muted" style="color:#b91c1c;">${state.error}</p>` : ""}
    </section>
  `;

  const input = document.getElementById("backend");
  const test = document.getElementById("test-btn");
  const proceed = document.getElementById("continue-btn");

  test.addEventListener("click", async () => {
    try {
      clearError();
      state.backendUrl = input.value.trim().replace(/\/$/, "");
      await api("/api/health");
      proceed.disabled = false;
      setError(t("connectionSuccess"));
    } catch {
      proceed.disabled = true;
      setError(t("connectionFail"));
    }
  });

  proceed.addEventListener("click", async () => {
    try {
      await loadCatalog();
      state.connected = true;
      clearError();
      render();
    } catch {
      setError("Unable to load menu from Square.");
    }
  });
}

function renderWelcome() {
  app.innerHTML = `
    <section class="card stack">
      <h1>${t("welcomeTitle")}</h1>
      <p class="muted">${t("welcomeSubtitle")}</p>
      <label>${t("yourName")}<input id="name" class="input" maxlength="64" /></label>
      <button id="name-continue">${t("continue")}</button>
      ${state.error ? `<p class="muted" style="color:#b91c1c;">${state.error}</p>` : ""}
    </section>
  `;

  document.getElementById("name-continue")?.addEventListener("click", () => {
    const value = document.getElementById("name").value.trim();
    if (!value) {
      setError("Please enter your name.");
      return;
    }
    clearError();
    state.customerName = value;
    render();
  });
}

function renderMenu() {
  const categories = state.categories;
  const items = filteredItems();

  app.innerHTML = `
    <header class="row space-between card">
      <div>
        <strong>${t("appName")}</strong>
        <div class="muted">${state.customerName}</div>
      </div>
      <button id="bag-btn">${t("bag")} (${bagCount()})</button>
    </header>
    <nav class="category-row">
      ${categories.map((category) => `<button data-category="${category.id}" class="${state.selectedCategoryId === category.id ? "active" : ""}">${category.name}</button>`).join("")}
    </nav>
    ${state.error ? `<p class="muted" style="color:#b91c1c;">${state.error}</p>` : ""}
    <section class="grid">
      ${items.map((item) => {
        const price = Math.min(...item.variations.filter((entry) => entry.available).map((entry) => entry.priceCents));
        return `
          <article class="card item-card">
            <img class="item-image" src="${imageOrPlaceholder(item.imageUrl)}" alt="${item.name}"/>
            <strong>${item.name}</strong>
            <div class="muted">${item.description || ""}</div>
            <div class="row space-between">
              <strong>${money(Number.isFinite(price) ? price : 0)}</strong>
              ${item.available ? `<button data-item="${item.id}">${t("addToBag")}</button>` : `<span class="badge unpaid">${t("unavailable")}</span>`}
            </div>
          </article>
        `;
      }).join("")}
    </section>
  `;

  document.getElementById("bag-btn")?.addEventListener("click", openBag);

  document.querySelectorAll("button[data-category]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedCategoryId = button.getAttribute("data-category");
      render();
    });
  });

  document.querySelectorAll("button[data-item]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = state.items.find((entry) => entry.id === button.getAttribute("data-item"));
      if (!item) return;
      openCustomize(item);
    });
  });
}

function renderSuccess() {
  app.innerHTML = `
    <section class="card stack">
      <h1>${t("orderReceived")}</h1>
      <p>${t("thankYou")}</p>
    </section>
  `;

  setTimeout(() => {
    state.customerName = "";
    state.bag = [];
    state.paymentMethod = "CASH";
    state.starCardStudentId = "";
    state.error = "";
    render();
  }, 3000);
}

async function renderEmployee(modeType) {
  app.innerHTML = `<section class="card"><h1>${modeType === "cashier" ? t("cashierView") : t("kdsView")}</h1><p class="muted">Loading…</p></section>`;
  if (!state.connected) {
    return renderConnection();
  }

  try {
    const { orders } = await api("/api/orders");
    app.innerHTML = `
      <header class="card row space-between">
        <strong>${t("appName")}</strong>
        <span class="muted">${modeType === "cashier" ? t("cashierView") : t("kdsView")}</span>
      </header>
      <section class="grid" style="margin-top:16px;">
        ${orders.map((order) => `
          <article class="card order-card ${order.status}">
            <h3>${order.customerName}</h3>
            <p class="muted">#${order.orderId}</p>
            <p>${order.lineItems.map((line) => `${line.quantity}× ${line.name}${line.modifiers.length ? ` (${line.modifiers.join(", ")})` : ""}`).join("<br/>")}</p>
            <div class="row space-between"><strong>${money(order.amountDueCents)}</strong><span class="badge ${order.paymentStatus === "paid" ? "paid" : "unpaid"}">${order.paymentStatus}</span></div>
            <div class="row">
              ${modeType === "cashier" && order.paymentStatus !== "paid" ? `<button data-pay="${order.orderId}" data-amount="${order.amountDueCents}">${t("markPaid")}</button>` : ""}
              ${modeType === "kds" && order.paymentStatus === "paid" && order.status !== "preparing" && order.status !== "completed" ? `<button data-prep="${order.orderId}">${t("startPreparing")}</button>` : ""}
              ${modeType === "kds" && order.status === "preparing" ? `<button data-done="${order.orderId}">${t("markCompleted")}</button>` : ""}
            </div>
          </article>
        `).join("")}
      </section>
    `;

    document.querySelectorAll("button[data-pay]").forEach((button) => {
      button.addEventListener("click", async () => {
        await api("/api/orders-pay", {
          method: "POST",
          body: JSON.stringify({
            orderId: button.getAttribute("data-pay"),
            amountCents: Number(button.getAttribute("data-amount"))
          })
        });
        renderEmployee(modeType);
      });
    });

    document.querySelectorAll("button[data-prep]").forEach((button) => {
      button.addEventListener("click", async () => {
        await api("/api/orders-status", {
          method: "POST",
          body: JSON.stringify({ orderId: button.getAttribute("data-prep"), status: "preparing" })
        });
        renderEmployee(modeType);
      });
    });

    document.querySelectorAll("button[data-done]").forEach((button) => {
      button.addEventListener("click", async () => {
        await api("/api/orders-status", {
          method: "POST",
          body: JSON.stringify({ orderId: button.getAttribute("data-done"), status: "completed" })
        });
        renderEmployee(modeType);
      });
    });
  } catch (error) {
    app.innerHTML = `<section class="card"><h1>Error</h1><p class="muted">${error.message}</p></section>`;
  }

  setTimeout(() => renderEmployee(modeType), 5000);
}

function renderModal() {
  if (!state.modal) return;
  const host = document.createElement("div");
  host.innerHTML = typeof state.modal === "function" ? state.modal() : state.modal;
  document.body.appendChild(host.firstElementChild);
}

function render() {
  document.querySelector(".modal")?.remove();

  if (mode === "cashier" || mode === "kds") {
    renderEmployee(mode);
    return;
  }

  if (!state.connected) {
    renderConnection();
  } else if (!state.customerName) {
    renderWelcome();
  } else {
    renderMenu();
  }

  renderModal();
}

render();
