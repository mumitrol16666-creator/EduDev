const PHONE = "77782508349";

export function selectService(service) {
  document.querySelectorAll(".brief-choices input").forEach((input) => {
    if (input.value === service) input.checked = true;
  });
}

export function buildWhatsAppUrl(data) {
  const lines = [
    "Здравствуйте, EduDev! Хочу обсудить проект.",
    `Меня зовут: ${String(data.get("name") || "").trim()}`,
    `Интересует: ${data.getAll("service").join(", ") || "Нужна консультация"}`,
    "",
    String(data.get("message") || "").trim(),
  ];
  return `https://wa.me/${PHONE}?text=${encodeURIComponent(lines.join("\n"))}`;
}

export function initContact() {
  const form = document.querySelector("#brief-form");
  const feedback = form.querySelector(".form-feedback");
  const fallback = form.querySelector(".form-fallback");
  document
    .querySelectorAll("[data-service]")
    .forEach((link) =>
      link.addEventListener("click", () => selectService(link.dataset.service)),
    );
  form.addEventListener("input", () => {
    feedback.hidden = true;
    fallback.hidden = true;
    form
      .querySelectorAll("input, textarea")
      .forEach((field) => field.setCustomValidity(""));
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = form.elements.name;
    const message = form.elements.message;
    name.setCustomValidity(name.value.trim() ? "" : "Укажите имя");
    message.setCustomValidity(
      message.value.trim() ? "" : "Напишите пару слов о задаче",
    );
    if (!form.reportValidity()) return;
    fallback.href = buildWhatsAppUrl(new FormData(form));
    fallback.hidden = false;
    feedback.textContent =
      "Сообщение подготовлено. Отправьте его в WhatsApp. Если окно не открылось, воспользуйтесь ссылкой ниже.";
    feedback.hidden = false;
    window.open(fallback.href, "_blank", "noopener,noreferrer");
  });
}
