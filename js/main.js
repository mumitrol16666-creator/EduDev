import { initNavigation } from "./navigation.js";
import { initPortfolio } from "./portfolio.js";
import { initContact } from "./contact.js";

initNavigation();
initPortfolio();
initContact();
document.querySelector("[data-year]").textContent = String(
  new Date().getFullYear(),
);
