import { initNavigation } from "./navigation.js";

initNavigation();
document.querySelector("[data-year]").textContent = String(
  new Date().getFullYear(),
);
