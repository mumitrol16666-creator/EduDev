const navToggle = document.querySelector("[data-nav-toggle]");
const nav = document.querySelector("[data-nav]");
const navBackdrop = document.querySelector("[data-nav-backdrop]");

if (navToggle && nav) {
  let lockedScrollY = 0;

  const lockPageScroll = () => {
    lockedScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    document.documentElement.classList.add("nav-open");
    document.body.classList.add("nav-open");
    document.body.style.top = `-${lockedScrollY}px`;
  };

  const unlockPageScroll = () => {
    document.documentElement.classList.remove("nav-open");
    document.body.classList.remove("nav-open");
    document.body.style.top = "";
    window.scrollTo(0, lockedScrollY);
  };

  const closeNav = () => {
    if (!nav.classList.contains("open")) return;
    nav.classList.remove("open");
    navToggle.setAttribute("aria-expanded", "false");
    navBackdrop?.setAttribute("hidden", "");
    unlockPageScroll();
    nav.querySelectorAll("details[open]").forEach((item) => {
      item.open = false;
    });
  };

  navToggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
    if (isOpen) {
      lockPageScroll();
      navBackdrop?.removeAttribute("hidden");
    }
    if (!isOpen) {
      closeNav();
    }
  });

  navBackdrop?.addEventListener("click", closeNav);
  navBackdrop?.addEventListener("touchmove", (event) => event.preventDefault(), { passive: false });

  nav.querySelectorAll("details").forEach((details) => {
    details.addEventListener("toggle", () => {
      if (!details.open) return;
      nav.querySelectorAll("details[open]").forEach((item) => {
        if (item !== details) item.open = false;
      });
    });
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeNav);
  });

  document.addEventListener("pointerdown", (event) => {
    if (!nav.classList.contains("open")) return;
    if (nav.contains(event.target) || navToggle.contains(event.target)) return;
    closeNav();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && nav.classList.contains("open")) {
      closeNav();
    }
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
const WHATSAPP_PHONE = window.EDUDEV_WHATSAPP_PHONE || "77782750874";
const WHATSAPP_TEXT = "Здравствуйте! Хочу разобрать учет EduDev для автосервиса.";

document.querySelectorAll("[data-whatsapp-link]").forEach((link) => {
  link.href = `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(WHATSAPP_TEXT)}`;
  link.target = "_blank";
  link.rel = "noopener";
});

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
  "section:not(.hero):not(.seo-hero), .suite-card, .module-card, .pricing-grid article, .trust-points article, .timeline article"
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
const quizModal = document.querySelector("[data-quiz-modal]");
const quizOpeners = document.querySelectorAll("[data-quiz-open]");
const quizClosers = document.querySelectorAll("[data-quiz-close]");
const quizForm = document.querySelector("[data-quiz-form]");
const quizNote = document.querySelector("[data-quiz-note]");
const quizResult = document.querySelector("[data-quiz-result]");
const stickyCta = document.querySelector("[data-sticky-cta]");
const liveScore = document.querySelector("[data-live-score]");

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

const openQuiz = () => {
  if (!quizModal) return;
  quizModal.classList.add("open");
  quizModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  const firstInput = quizModal.querySelector("select, input");
  firstInput?.focus();
};

const closeQuiz = () => {
  if (!quizModal) return;
  quizModal.classList.remove("open");
  quizModal.setAttribute("aria-hidden", "true");
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

quizOpeners.forEach((opener) => {
  opener.addEventListener("click", (event) => {
    event.preventDefault();
    openQuiz();
  });
});

quizClosers.forEach((closer) => {
  closer.addEventListener("click", closeQuiz);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && callbackModal?.classList.contains("open")) {
    closeCallback();
  }
  if (event.key === "Escape" && quizModal?.classList.contains("open")) {
    closeQuiz();
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

if (quizForm && quizNote) {
  const updateQuizResult = () => {
    const data = new FormData(quizForm);
    const pains = data.getAll("pain");
    const hasWarehouse = pains.includes("теряется склад");
    const hasReturn = pains.includes("нет повторных визитов");
    const hasProfit = pains.includes("не видно прибыль");
    const modules = ["Клиенты, авто и заказы"];

    if (hasWarehouse) modules.push("Склад и остатки");
    if (hasReturn) modules.push("Напоминания клиентам");
    if (hasProfit) modules.push("Деньги и отчеты");
    if (pains.includes("сотрудники работают по памяти")) modules.push("Доступы и история действий");

    const recommendation = modules.slice(0, 4).join(" + ");
    quizResult.querySelector("strong").textContent = recommendation;
    quizResult.querySelector("small").textContent = pains.length
      ? `Выбрано проблем: ${pains.length}. Эти разделы лучше ставить первыми.`
      : "Выберите главные боли, и мы соберем стартовый набор.";
  };

  quizForm.addEventListener("change", updateQuizResult);
  updateQuizResult();

  quizForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = quizForm.querySelector("button[type='submit']");
    const data = new FormData(quizForm);
    const pains = data.getAll("pain").join(", ");
    const recommendation = quizResult?.querySelector("strong")?.textContent || "";
    quizNote.textContent = "";
    if (submit) {
      submit.disabled = true;
      submit.textContent = "Отправляем...";
    }

    try {
      await submitLead({
        ...formDataToLeadPayload(data, "website_quiz"),
        message: `Мини-аудит. Боли: ${pains || "не выбраны"}. Рекомендация: ${recommendation}.`,
        selectedModules: recommendation,
      });
      quizNote.textContent = "Готово. Мы свяжемся с вами и покажем карту внедрения.";
      quizForm.reset();
      updateQuizResult();
    } catch (error) {
      quizNote.textContent = error.message || "Не удалось отправить заявку. Попробуйте еще раз.";
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.textContent = "Получить план запуска";
      }
    }
  });
}

if (stickyCta) {
  const toggleStickyCta = () => {
    stickyCta.classList.toggle("open", window.scrollY > 420);
  };
  window.addEventListener("scroll", toggleStickyCta, { passive: true });
  toggleStickyCta();
}

if (liveScore) {
  const scores = ["+18%", "+24%", "+31%", "+16%"];
  let scoreIndex = 0;
  window.setInterval(() => {
    scoreIndex = (scoreIndex + 1) % scores.length;
    liveScore.textContent = scores[scoreIndex];
  }, 2800);
}

document.querySelectorAll("[data-pzm-simulator]").forEach((simulator) => {
  const visitsInput = simulator.querySelector("input[name='visits']");
  const ticketInput = simulator.querySelector("input[name='ticket']");
  const lostInput = simulator.querySelector("input[name='lost']");
  const visitsOutput = simulator.querySelector("[data-pzm-visits]");
  const ticketOutput = simulator.querySelector("[data-pzm-ticket]");
  const lostOutput = simulator.querySelector("[data-pzm-lost]");
  const returnOutput = simulator.querySelector("[data-pzm-return]");
  const revenueOutput = simulator.querySelector("[data-pzm-revenue]");
  const stockOutput = simulator.querySelector("[data-pzm-stock]");
  const gauge = simulator.querySelector(".pzm-gauge");
  const gaugeValue = simulator.querySelector("[data-pzm-gauge-value]");
  const money = (value) => `${new Intl.NumberFormat("ru-RU").format(Math.round(value / 1000) * 1000)} ₸`;

  const update = () => {
    const visits = Number(visitsInput?.value || 0);
    const ticket = Number(ticketInput?.value || 0);
    const lost = Number(lostInput?.value || 0);
    const returnedClients = Math.round(visits * (lost / 100) * 0.62);
    const revenue = returnedClients * ticket;
    const stockRisk = Math.max(6, Math.round(visits / 15));
    const control = Math.min(92, Math.max(36, Math.round(100 - lost * 0.55 + visits / 22)));
    const angle = Math.round(control * 3.6);

    if (visitsOutput) visitsOutput.textContent = String(visits);
    if (ticketOutput) ticketOutput.textContent = money(ticket);
    if (lostOutput) lostOutput.textContent = `${lost}%`;
    if (returnOutput) returnOutput.textContent = `${returnedClients} клиентов`;
    if (revenueOutput) revenueOutput.textContent = money(revenue);
    if (stockOutput) stockOutput.textContent = `${stockRisk} позиций`;
    if (gauge) gauge.style.setProperty("--pzm-gauge-angle", `${angle}deg`);
    if (gaugeValue) gaugeValue.textContent = `${control}%`;
  };

  simulator.querySelectorAll("input[type='range']").forEach((input) => {
    input.addEventListener("input", update);
  });
  update();
});

document.querySelectorAll("[data-niche-simulator]").forEach((simulator) => {
  const type = simulator.dataset.nicheSimulator;
  const volumeInput = simulator.querySelector("input[name='volume']");
  const ticketInput = simulator.querySelector("input[name='ticket']");
  const factorInput = simulator.querySelector("input[name='factor']");
  const volumeOutput = simulator.querySelector("[data-niche-volume]");
  const ticketOutput = simulator.querySelector("[data-niche-ticket]");
  const factorOutput = simulator.querySelector("[data-niche-factor]");
  const mainOutput = simulator.querySelector("[data-niche-main]");
  const moneyOutput = simulator.querySelector("[data-niche-money]");
  const extraOutput = simulator.querySelector("[data-niche-extra]");
  const gauge = simulator.querySelector(".pzm-gauge");
  const gaugeValue = simulator.querySelector("[data-niche-gauge]");
  const money = (value) => `${new Intl.NumberFormat("ru-RU").format(Math.round(value / 1000) * 1000)} ₸`;

  const update = () => {
    const volume = Number(volumeInput?.value || 0);
    const ticket = Number(ticketInput?.value || 0);
    const factor = Number(factorInput?.value || 0);
    let control = 70;
    let main = "";
    let amount = 0;
    let extra = "";

    if (type === "tire") {
      const returned = Math.round(volume * (factor / 100) * 0.55);
      control = Math.min(96, Math.max(44, Math.round(48 + volume / 10 + factor * 0.38)));
      main = `${returned} клиентов`;
      amount = returned * ticket;
      extra = `${Math.max(8, Math.round(volume / 18))} слотов`;
    }

    if (type === "sto") {
      const partsControl = Math.round(factor * 0.62);
      control = Math.min(97, Math.max(42, Math.round(64 + volume / 16 - factor * 0.3)));
      main = `${partsControl}%`;
      amount = volume * ticket * (factor / 100) * 0.35;
      extra = `${Math.round(volume * 1.8)} работ`;
    }

    if (type === "wash") {
      const monthlyCars = volume * 30;
      control = Math.min(94, Math.max(38, Math.round(volume / 1.4 + factor * 0.25)));
      main = `${new Intl.NumberFormat("ru-RU").format(monthlyCars)} авто`;
      amount = monthlyCars * ticket;
      extra = `${Math.max(2, Math.round(volume / 18))} бокса`;
    }

    if (volumeOutput) volumeOutput.textContent = String(volume);
    if (ticketOutput) ticketOutput.textContent = money(ticket);
    if (factorOutput) factorOutput.textContent = `${factor}%`;
    if (mainOutput) mainOutput.textContent = main;
    if (moneyOutput) moneyOutput.textContent = money(amount);
    if (extraOutput) extraOutput.textContent = extra;
    if (gauge) gauge.style.setProperty("--pzm-gauge-angle", `${Math.round(control * 3.6)}deg`);
    if (gaugeValue) gaugeValue.textContent = `${control}%`;
  };

  simulator.querySelectorAll("input[type='range']").forEach((input) => {
    input.addEventListener("input", update);
  });
  update();
});

if (quizModal && !sessionStorage.getItem("edudevQuizShown")) {
  window.setTimeout(() => {
    const width = Math.min(window.innerWidth || 0, document.documentElement.clientWidth || window.innerWidth || 0);
    const isMobile = width <= 760 || window.matchMedia("(max-width: 760px)").matches;
    if ((!isMobile && window.scrollY < 420) || callbackModal?.classList.contains("open") || quizModal.classList.contains("open")) return;
    openQuiz();
    sessionStorage.setItem("edudevQuizShown", "1");
  }, 14000);
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
