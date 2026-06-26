import { chromium } from 'playwright'
const base = 'http://localhost:5173'
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1440, height: 820 } })).newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(String(e)))

// CV đi draft (248) → drawer, cuộn body, footer phải vẫn hiện
await page.goto(`${base}/cong-van-di?cv=248`, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
await page.evaluate(() => { const el = document.querySelector('.drawer-body'); if (el) el.scrollTop = 9999 })
await page.waitForTimeout(300)
await page.screenshot({ path: 'scripts/shots/J-di-draft.png' })
console.log('shot: J-di-draft')

// CV đến (0123 restricted) → drawer footer đủ nút
await page.goto(`${base}/cong-van-den?cv=0123`, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
await page.evaluate(() => { const el = document.querySelector('.drawer-body'); if (el) el.scrollTop = 9999 })
await page.waitForTimeout(300)
await page.screenshot({ path: 'scripts/shots/J-den.png' })
console.log('shot: J-den')

// list CV đi không còn cột ⋮
await page.goto(`${base}/cong-van-di`, { waitUntil: 'networkidle' })
await page.waitForTimeout(400)
await page.screenshot({ path: 'scripts/shots/J-list.png' })
console.log('shot: J-list')

console.log(errors.length ? `CONSOLE ERRORS:\n${errors.join('\n')}` : 'NO CONSOLE ERRORS')
await browser.close()
