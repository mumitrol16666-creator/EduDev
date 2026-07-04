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
const API_BASE_URL = window.EDUDEV_API_BASE_URL
  || (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://127.0.0.1:4100"
    : "https://api.edudev.kz");

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

const leadForm = document.querySelector("[data-lead-form]");
const formButton = document.querySelector("[data-form-button]");
const formNote = document.querySelector("[data-form-note]");

if (leadForm && formButton && formNote) {
  leadForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    formNote.textContent = "";
    formButton.disabled = true;
    formButton.textContent = "Отправляем...";

    try {
      await submitLead(formDataToLeadPayload(new FormData(leadForm), "website_contact"));
      formNote.textContent = "Заявка отправлена. Мы свяжемся с вами и разберем учет.";
      leadForm.reset();
      if (selectedModulesInput) selectedModulesInput.value = selectedModulesOutput?.textContent || "Клиенты, авто и заказы";
    } catch (error) {
      formNote.textContent = error.message || "Не удалось отправить заявку. Попробуйте еще раз.";
    } finally {
      formButton.disabled = false;
      formButton.textContent = "Получить разбор учета";
    }
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
  callbackForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = callbackForm.querySelector("button[type='submit']");
    callbackNote.textContent = "";
    if (submit) {
      submit.disabled = true;
      submit.textContent = "Отправляем...";
    }

    try {
      const data = new FormData(callbackForm);
      await submitLead({
        ...formDataToLeadPayload(data, "website_callback"),
        preferredTime: String(data.get("time") || "").trim(),
        message: "Заявка на обратный звонок",
      });
      callbackNote.textContent = "Заявка отправлена. Перезвоним в выбранное время.";
      callbackForm.reset();
    } catch (error) {
      callbackNote.textContent = error.message || "Не удалось отправить заявку. Попробуйте еще раз.";
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.textContent = "Жду звонка";
      }
    }
  });
}

function formDataToLeadPayload(data, source) {
  return {
    source,
    name: String(data.get("name") || "").trim(),
    phone: String(data.get("phone") || "").trim(),
    business: String(data.get("business") || "").trim(),
    city: String(data.get("city") || "").trim(),
    message: String(data.get("message") || "").trim(),
    selectedModules: String(data.get("selected_modules") || "").trim(),
  };
}

async function submitLead(payload) {
  const response = await fetch(`${API_BASE_URL}/api/public/leads`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    throw new Error(data.error || "Ошибка отправки заявки");
  }
  return data.lead;
}
