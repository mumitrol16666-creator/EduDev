const navToggle = document.querySelector("[data-nav-toggle]");
const nav = document.querySelector("[data-nav]");

if (navToggle && nav) {
  navToggle.addEventListener("click", () => {
    nav.classList.toggle("open");
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => nav.classList.remove("open"));
  });
}

document.querySelectorAll("[data-tabs]").forEach((tabs) => {
  const buttons = tabs.querySelectorAll("[data-tab]");
  const panels = tabs.querySelectorAll("[data-panel]");

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.tab;
      buttons.forEach((item) => item.classList.toggle("active", item === button));
      panels.forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === key));
    });
  });
});

const modulePicker = document.querySelector("[data-module-picker]");
const selectedModulesOutput = document.querySelector("[data-selected-modules]");
const selectedModulesInput = document.querySelector("[data-selected-modules-input]");

if (modulePicker && selectedModulesOutput && selectedModulesInput) {
  const cards = [...modulePicker.querySelectorAll("[data-module]")];

  const updateSelectedModules = () => {
    const selected = cards
      .filter((card) => card.classList.contains("selected"))
      .map((card) => card.dataset.module);
    const value = selected.join(", ");
    selectedModulesOutput.textContent = value;
    selectedModulesInput.value = value;
  };

  cards.forEach((card) => {
    card.addEventListener("click", () => {
      if (card.classList.contains("locked")) return;
      card.classList.toggle("selected");
      updateSelectedModules();
    });
  });

  updateSelectedModules();
}

const calculator = document.querySelector("[data-calculator]");

if (calculator) {
  const output = calculator.querySelector("[data-total]");
  const basePrices = {
    start: 80000,
    business: 180000,
    pro: 400000,
    network: 800000,
  };
  const modulePrices = {
    warehouse: 80000,
    reminders: 70000,
    analytics: 120000,
    multi: 250000,
  };

  const format = (value) => new Intl.NumberFormat("ru-RU").format(value);

  const updateTotal = () => {
    const data = new FormData(calculator);
    let total = basePrices[data.get("base")] || basePrices.business;

    Object.entries(modulePrices).forEach(([name, price]) => {
      if (data.get(name)) total += price;
    });

    output.value = `от ${format(total)} ₸ разовая настройка`;
    output.textContent = output.value;
  };

  calculator.addEventListener("change", updateTotal);
  updateTotal();
}

const formButton = document.querySelector("[data-form-button]");
const formNote = document.querySelector("[data-form-note]");

if (formButton && formNote) {
  formButton.addEventListener("click", () => {
    const selected = selectedModulesInput?.value || "Клиенты, авто и заказы";
    formNote.textContent = `Заявка подготовлена с набором: ${selected}. Для реальной отправки подключим выбранный способ связи.`;
  });
}

const revealItems = document.querySelectorAll(
  "section:not(.hero), .suite-card, .module-card, .pricing-grid article, .trust-points article, .timeline article"
);

if ("IntersectionObserver" in window) {
  revealItems.forEach((item) => item.classList.add("reveal"));

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      });
    },
    { threshold: 0.12 }
  );

  revealItems.forEach((item) => revealObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}

const heroCard = document.querySelector(".hero-image-card");

if (heroCard) {
  heroCard.addEventListener("pointermove", (event) => {
    const rect = heroCard.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    heroCard.style.setProperty("--tilt-x", `${x * 5}deg`);
    heroCard.style.setProperty("--tilt-y", `${y * -5}deg`);
  });

  heroCard.addEventListener("pointerleave", () => {
    heroCard.style.setProperty("--tilt-x", "0deg");
    heroCard.style.setProperty("--tilt-y", "0deg");
  });
}

const callbackModal = document.querySelector("[data-callback-modal]");
const callbackOpeners = document.querySelectorAll("[data-callback-open]");
const callbackClosers = document.querySelectorAll("[data-callback-close]");
const callbackForm = document.querySelector("[data-callback-form]");
const callbackNote = document.querySelector("[data-callback-note]");

const openCallback = () => {
  if (!callbackModal) return;
  callbackModal.classList.add("open");
  callbackModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  const firstInput = callbackModal.querySelector("input");
  firstInput?.focus();
};

const closeCallback = () => {
  if (!callbackModal) return;
  callbackModal.classList.remove("open");
  callbackModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
};

callbackOpeners.forEach((opener) => {
  opener.addEventListener("click", (event) => {
    event.preventDefault();
    openCallback();
  });
});

callbackClosers.forEach((closer) => {
  closer.addEventListener("click", closeCallback);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && callbackModal?.classList.contains("open")) {
    closeCallback();
  }
});

if (callbackForm && callbackNote) {
  callbackForm.addEventListener("submit", (event) => {
    event.preventDefault();
    callbackNote.textContent = "Заявка подготовлена. Осталось подключить отправку в удобный канал связи.";
    callbackForm.reset();
  });
}
