async (page) => {
  const base = await page.evaluate(() => {
    if (!["127.0.0.1", "localhost"].includes(location.hostname))
      throw new Error("Run this check on a local preview only")
    return location.origin
  })
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  const check = (condition, message) => {
    if (!condition) throw new Error(message)
  }
  await page.goto(base)
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.evaluate(() => document.fonts.ready)
  for (const width of [320, 390, 768, 1024, 1360, 1920]) {
    await page.setViewportSize({ width, height: 900 })
    check(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Horizontal overflow at ${width}px`,
    )
  }
  await page.setViewportSize({ width: 1360, height: 900 })
  await page.getByRole("button", { name: "Системы и CRM", exact: true }).click()
  check(
    (await page.locator(".project-card:visible").count()) === 3,
    "Systems filter",
  )
  await page
    .getByRole("button", { name: "Сайты и контент", exact: true })
    .click()
  check(
    (await page.locator(".project-card:visible").count()) === 4,
    "Web filter",
  )
  await page.locator('[data-filter="all"]').click()
  check(
    (await page.locator(".project-card:visible").count()) === 5,
    "All filter",
  )
  for (const id of ["pacman", "istanbul", "alim", "maestro", "edudev"]) {
    await page.locator(`[data-project="${id}"]`).click()
    check(await page.locator(".project-dialog").isVisible(), `Dialog ${id}`)
    check(
      (await page.locator("#project-dialog-title").innerText()).length > 0,
      "Case title",
    )
    await page.keyboard.press("Escape")
    check(
      !(await page.locator(".project-dialog").isVisible()),
      "Escape closes dialog",
    )
    await page.waitForFunction(
      () => !document.body.classList.contains("modal-open"),
    )
    check(
      !(await page
        .locator("body")
        .evaluate((body) => body.classList.contains("modal-open"))),
      "Scroll unlocked",
    )
  }
  await page.locator('[data-project="alim"]').click()
  await page.locator("[data-case-contact]").click()
  check(
    await page
      .getByRole("checkbox", { name: "Система и CRM", exact: true })
      .isChecked(),
    "Case prefills service",
  )
  await page.locator('[data-service="Контент"]').click()
  check(
    await page
      .getByRole("checkbox", { name: "Контент", exact: true })
      .isChecked(),
    "Service link prefills choice",
  )
  await page.locator("#brief-name").fill("Проверка & тест")
  await page
    .locator("#brief-message")
    .fill("Нужен сайт для кафе: меню + заказ.")
  // Intercept the browser action, never open WhatsApp or send a real lead.
  await page.evaluate(() => {
    window.open = (url) => {
      window.__testWhatsAppUrl = url
      return null
    }
  })
  await page.getByRole("button", { name: "Обсудить в WhatsApp" }).click()
  const whatsapp = await page.evaluate(() => window.__testWhatsAppUrl)
  const url = await page.evaluate((value) => {
    const url = new URL(value)
    return {
      origin: url.origin,
      pathname: url.pathname,
      text: url.searchParams.get("text"),
    }
  }, whatsapp)
  check(
    url.origin === "https://wa.me" && url.pathname === "/77782508349",
    "WhatsApp destination",
  )
  check(url.text.includes("Проверка & тест"), "Encoded customer name")
  check(url.text.includes("Система и CRM, Контент"), "Selected services")
  check(url.text.includes("меню + заказ"), "Encoded message")
  check(
    await page.locator(".form-fallback").isVisible(),
    "Popup fallback available",
  )
  await page.locator("#brief-message").fill("   ")
  await page.evaluate(() => {
    window.__testWhatsAppUrl = null
  })
  await page.getByRole("button", { name: "Обсудить в WhatsApp" }).click()
  check(
    await page.evaluate(() => window.__testWhatsAppUrl === null),
    "Whitespace-only message rejected",
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => scrollTo(0, 0))
  await page.getByRole("button", { name: "Открыть меню" }).click()
  check(
    (await page.locator(".menu-toggle").getAttribute("aria-expanded")) ===
      "true",
    "Mobile menu opens",
  )
  await page.locator(".nav").getByRole("link", { name: "Проекты" }).click()
  check(
    (await page.locator(".menu-toggle").getAttribute("aria-expanded")) ===
      "false",
    "Mobile menu closes after link",
  )
  await page.locator('[data-project="istanbul"]').click()
  check(await page.locator(".project-dialog").isVisible(), "Mobile case dialog")
  await page.getByRole("button", { name: "Закрыть проект" }).click()
  const invalidAnchors = await page
    .locator('a[href^="#"]')
    .evaluateAll((links) =>
      links
        .map((a) => a.getAttribute("href"))
        .filter(
          (href) => href.length > 1 && !document.getElementById(href.slice(1)),
        ),
    )
  check(invalidAnchors.length === 0, "All internal anchors resolve")
  for (const image of await page.locator(".project-cover img").all()) {
    await image.scrollIntoViewIfNeeded()
    await image.evaluate((img) => img.decode())
  }
  for (const path of [
    "crm-dlya-punkta-zameny-masla",
    "crm-dlya-sto",
    "crm-dlya-shinomontazha",
    "crm-dlya-avtomoiki",
  ]) {
    const response = await page.request.get(`${base}/${path}/`)
    check(response.ok(), `Existing page ${path} available`)
    const text = await response.text()
    check(
      !/href="\/#(?:suite|solution|segments|pricing|implementation|seo-pages)"/.test(
        text,
      ),
      "Legacy navigation updated",
    )
  }
  check(errors.length === 0, `Browser errors: ${errors.join(", ")}`)
  return {
    passed: [
      "six viewport widths",
      "portfolio filters",
      "five case dialogs",
      "keyboard dismissal",
      "service selection",
      "WhatsApp message without sending",
      "form validation",
      "mobile navigation",
      "images",
      "internal anchors",
      "legacy CRM pages",
    ],
    errors,
  }
}
