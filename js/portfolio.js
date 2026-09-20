import { projects } from "./projects.js";
import { selectService } from "./contact.js";

export function initPortfolio() {
  const cards = [...document.querySelectorAll(".project-card")];
  const filters = [...document.querySelectorAll("[data-filter]")];
  filters.forEach((button) =>
    button.addEventListener("click", () => {
      filters.forEach((filter) =>
        filter.setAttribute("aria-pressed", String(filter === button)),
      );
      cards.forEach((card) => {
        card.hidden =
          button.dataset.filter !== "all" &&
          !card.dataset.category.split(" ").includes(button.dataset.filter);
      });
      document.querySelector("#filter-status").textContent =
        `Показано проектов: ${cards.filter((card) => !card.hidden).length}`;
    }),
  );
  const dialog = document.querySelector(".project-dialog");
  let activeProject;
  document.querySelectorAll("[data-project]").forEach((button) =>
    button.addEventListener("click", () => {
      activeProject = projects[button.dataset.project];
      if (!activeProject) return;
      dialog.querySelector("#project-dialog-title").textContent =
        activeProject.title;
      dialog.querySelector("[data-case-type]").textContent = activeProject.type;
      dialog.querySelector("[data-case-intro]").textContent =
        activeProject.intro;
      dialog.querySelector("[data-case-task]").textContent = activeProject.task;
      const image = dialog.querySelector("[data-case-image]");
      image.hidden = !activeProject.image;
      if (activeProject.image) {
        image.src = activeProject.image;
        image.alt = `Сайт ${activeProject.title}`;
      }
      const features = activeProject.features.map((feature) => {
        const li = document.createElement("li");
        li.textContent = feature;
        return li;
      });
      dialog.querySelector("[data-case-features]").replaceChildren(...features);
      const link = dialog.querySelector("[data-case-link]");
      link.hidden = !activeProject.url;
      if (activeProject.url) link.href = activeProject.url;
      dialog.showModal();
      dialog.scrollTop = 0;
      document.body.classList.add("modal-open");
      dialog.querySelector(".dialog-close").focus({ preventScroll: true });
    }),
  );
  dialog
    .querySelector(".dialog-close")
    .addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    const rect = dialog.getBoundingClientRect();
    if (
      event.target === dialog &&
      (event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom)
    )
      dialog.close();
  });
  dialog.addEventListener("close", () =>
    document.body.classList.remove("modal-open"),
  );
  dialog.querySelector("[data-case-contact]").addEventListener("click", () => {
    selectService(activeProject.service);
    dialog.close();
    requestAnimationFrame(() =>
      document.querySelector("#brief-name").focus({ preventScroll: true }),
    );
  });
}
