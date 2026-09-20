export function initNavigation() {
  const toggle = document.querySelector(".menu-toggle");
  const navigation = document.querySelector(".nav");
  const close = () => {
    navigation.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Открыть меню");
  };
  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    navigation.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Закрыть меню" : "Открыть меню");
  });
  navigation.addEventListener("click", (event) => {
    if (event.target.closest("a")) close();
  });
  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      toggle.getAttribute("aria-expanded") === "true"
    ) {
      close();
      toggle.focus();
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (!navigation.contains(event.target) && !toggle.contains(event.target))
      close();
  });
  matchMedia("(min-width: 801px)").addEventListener("change", (event) => {
    if (event.matches) close();
  });
}
