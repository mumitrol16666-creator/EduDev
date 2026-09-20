async (page) => {
  const base = await page.evaluate(() => {
    if (!["127.0.0.1", "localhost"].includes(location.hostname)) throw new Error("Local preview only")
    return location.origin
  })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const check = (ok, message) => { if (!ok) throw new Error(message) }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const path of ['/sozdanie-saytov/', '/razrabotka-crm/']) {
    const response = await page.goto(base + path)
    check(response.ok(), `Page available: ${path}`)
    await page.evaluate(() => document.fonts.ready)
    check(await page.locator('h1').count() === 1, 'One visible H1')
    check(await page.locator('h1').isVisible(), 'Visible H1')
    check(await page.locator('link[rel="canonical"]').getAttribute('href') === 'https://edudev.kz' + path, 'Canonical')
    const schema = await page.locator('script[type="application/ld+json"]').evaluateAll(nodes => nodes.map(node => JSON.parse(node.textContent)))
    check(schema.some(doc => doc['@graph'].some(item => item['@type'] === 'Service')), 'Rendered Service schema')
    check(schema.some(doc => doc['@graph'].some(item => item['@type'] === 'BreadcrumbList')), 'Rendered breadcrumb schema')
    for (const width of [320, 390, 768, 1024, 1360, 1920]) {
      await page.setViewportSize({ width, height: 900 })
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No horizontal overflow: ${path} at ${width}`)
    }
    await page.locator('.faq-list summary').first().click()
    check(await page.locator('.faq-list details').first().getAttribute('open') !== null, 'FAQ opens')
    for (const img of await page.locator('img').all()) {
      await img.scrollIntoViewIfNeeded()
      await img.evaluate(img => img.decode())
    }
    const whatsapp = await page.locator('.landing-actions a[href^="https://wa.me/"]').getAttribute('href')
    check(whatsapp.startsWith('https://wa.me/77782508349?text='), 'WhatsApp destination, no message sent')
    check(decodeURIComponent(whatsapp).includes('Хочу обсудить'), 'Message prefilled')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.evaluate(() => scrollTo(0, 0))
    await page.getByRole('button', { name: 'Открыть меню' }).click()
    check(await page.locator('.menu-toggle').getAttribute('aria-expanded') === 'true', 'Mobile navigation opens')
    await page.keyboard.press('Escape')
    check(await page.locator('.menu-toggle').getAttribute('aria-expanded') === 'false', 'Mobile navigation closes')
  }
  await page.goto(base)
  await page.locator('.service h3 a[href="/sozdanie-saytov/"]').click()
  check(page.url() === base + '/sozdanie-saytov/', 'Homepage service link works')
  await page.locator('.inline-link[href="/razrabotka-crm/"]').click()
  check(page.url() === base + '/razrabotka-crm/', 'Service cross-link works')
  await page.goto(base + '/404.html')
  check((await page.locator('meta[name="robots"]').getAttribute('content')).includes('noindex'), '404 excluded from index')
  check(await page.locator('h1').innerText() === 'Такой страницы нет', 'Branded error content')
  check(errors.length === 0, errors.join(', '))
  return { passed: ['two service pages', 'six viewport widths per page', 'rendered structured data', 'images', 'FAQs', 'mobile navigation', 'WhatsApp destinations without sending', 'internal links', '404 content'], errors }
}
