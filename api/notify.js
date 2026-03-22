import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { createClient } from '@supabase/supabase-js'

const SB_URL = 'https://vqcsocjxfrhzkwlubhha.supabase.co'
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxY3NvY2p4ZnJoemt3bHViaGhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwNTc2NjIsImV4cCI6MjA4OTYzMzY2Mn0.N9ESHWWIvlT8OJqnOCCblXEtpsjg3UJmlzWoqziw7Rs'

export const config = { api: { bodyParser: { sizeLimit: '8mb' } } }

function mskTime() {
  return new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })
}
function mskDate() {
  return new Date().toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { order, tgToken, tgChatId } = req.body
    if (!order || !tgToken || !tgChatId) {
      return res.status(400).json({ error: 'Missing fields', got: { order: !!order, token: !!tgToken, chat: !!tgChatId } })
    }

    const token  = String(tgToken).trim()
    const chatId = String(tgChatId).trim()

    // Статистика клиента из Supabase
    let userOrdersCount = 0, userTotal = 0, regDate = 'Новый клиент', isNew = false
    try {
      const sb = createClient(SB_URL, SB_KEY)
      const [{ data: uOrds }, { data: uData }] = await Promise.all([
        sb.from('orders').select('total').eq('phone', order.phone),
        sb.from('users').select('created_at,visitor_id').eq('phone', order.phone).single(),
      ])
      userOrdersCount = (uOrds || []).length
      userTotal = (uOrds || []).reduce((s, o) => s + (o.total || 0), 0)
      if (uData?.created_at) {
        regDate = new Date(uData.created_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })
        const diffMin = (Date.now() - new Date(uData.created_at).getTime()) / 60000
        isNew = diffMin < 5
      }
    } catch {}

    const dl = order.delivery_type === 'sdek' ? '📦 СДЭК' : '📮 Почта России'
    const items = (order.items || [])
      .map(i => `  • ${i.name} × ${i.qty} = ${(i.price * i.qty).toLocaleString('ru')} ₽`)
      .join('\n')

    const newBadge = isNew ? '\n🆕 *НОВЫЙ КЛИЕНТ*' : ''
    const msg =
      `🛒 *НОВЫЙ ЗАКАЗ #${order.id}*${newBadge}\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `👤 *${order.name}*\n` +
      `📞 ${order.phone}\n` +
      `${dl}: ${order.delivery_addr || '—'}\n` +
      `🕐 ${mskTime()} МСК\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `📦 *Товары:*\n${items}\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `💰 *ИТОГО: ${(order.total || 0).toLocaleString('ru')} ₽*\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `📊 Всего заказов: ${userOrdersCount} · ${userTotal.toLocaleString('ru')} ₽\n` +
      `📅 Регистрация: ${regDate}`

    // 1. Отправляем текст
    const msgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'Markdown' }),
    })
    const msgData = await msgRes.json()
    if (!msgData.ok) {
      console.error('sendMessage failed:', msgData)
      return res.status(200).json({ success: false, error: msgData.description, step: 'message' })
    }

    // 2. Генерируем PDF
    const pdfBytes = await generatePDF(order)

    // 3. Отправляем PDF
    const fd = new FormData()
    fd.append('chat_id', chatId)
    fd.append('caption', `📄 Накладная #${order.id} · ${(order.total || 0).toLocaleString('ru')} ₽ · ${mskDate()} МСК`)
    fd.append('document', new Blob([pdfBytes], { type: 'application/pdf' }), `invoice_${order.id}.pdf`)

    const docRes = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: 'POST', body: fd,
    })
    const docData = await docRes.json()
    if (!docData.ok) console.error('sendDocument failed:', docData)

    return res.status(200).json({ success: true, msgOk: msgData.ok, docOk: docData.ok })
  } catch (err) {
    console.error('notify error:', err)
    return res.status(500).json({ error: err.message })
  }
}

async function generatePDF(order) {
  const doc  = await PDFDocument.create()
  const page = doc.addPage([595, 842])
  const W = 595, H = 842
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const reg  = await doc.embedFont(StandardFonts.Helvetica)

  const ink    = rgb(0.07, 0.09, 0.12)
  const accent = rgb(0.15, 0.39, 0.92)
  const gray   = rgb(0.50, 0.55, 0.62)
  const light  = rgb(0.95, 0.96, 0.97)
  const white  = rgb(1, 1, 1)
  const green  = rgb(0.08, 0.60, 0.35)

  const dateStr = new Date().toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })
  const timeStr = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })

  // ── Шапка ──
  page.drawRectangle({ x:0, y:H-92, width:W, height:92, color:ink })
  page.drawText('WAYS POD', { x:40, y:H-42, size:26, font:bold, color:accent })
  page.drawText('ООО «Ways Pod» · Оптовые поставки', { x:40, y:H-60, size:8.5, font:reg, color:gray })
  page.drawText('wayspod.ru', { x:40, y:H-74, size:8, font:reg, color:rgb(0.4,0.5,0.7) })

  const inv = `НАКЛАДНАЯ #${order.id}`
  page.drawText(inv, { x:W-bold.widthOfTextAtSize(inv,15)-40, y:H-42, size:15, font:bold, color:white })
  page.drawText(`Дата: ${dateStr}`, { x:W-reg.widthOfTextAtSize(`Дата: ${dateStr}`,9)-40, y:H-60, size:9, font:reg, color:gray })
  page.drawText(timeStr+' МСК', { x:W-reg.widthOfTextAtSize(timeStr+' МСК',8)-40, y:H-74, size:8, font:reg, color:gray })

  page.drawRectangle({ x:0, y:H-96, width:W, height:4, color:accent })

  // ── Блок клиента и поставщика ──
  let y = H - 118
  page.drawRectangle({ x:40, y:y-54, width:W-80, height:62, color:light, borderColor:rgb(0.85,0.87,0.9), borderWidth:0.5 })

  const dlLabel = order.delivery_type === 'sdek' ? 'СДЭК' : 'Почта России'
  ;[
    ['Поставщик:', 'ООО «Ways Pod» · wayspod.ru'],
    ['Покупатель:', (order.name || '—').slice(0,45)],
    ['Телефон:', order.phone || '—'],
    ['Доставка:', `${dlLabel} · ${(order.delivery_addr||'—').slice(0,40)}`],
  ].forEach(([l,v], i) => {
    const yy = y - i*14
    page.drawText(l,  { x:50, y:yy, size:8.5, font:bold, color:ink })
    page.drawText(v,  { x:130, y:yy, size:8.5, font:reg, color:ink })
  })

  // ── Таблица товаров ──
  y -= 68
  page.drawRectangle({ x:40, y:y-2, width:W-80, height:20, color:ink })
  const cx = { num:46, name:78, qty:362, price:416, sum:488 }
  ;[['№',cx.num],['Наименование товара',cx.name],['Кол.',cx.qty],['Цена, ₽',cx.price],['Сумма, ₽',cx.sum]].forEach(([t,x])=>{
    page.drawText(t, { x, y:y+5, size:7.5, font:bold, color:white })
  })
  y -= 20

  const items = order.items || []
  items.forEach((item, i) => {
    const bg = i%2===0 ? white : light
    page.drawRectangle({ x:40, y:y-2, width:W-80, height:17, color:bg })
    const name = (item.name || '').slice(0, 44)
    const price = item.price || 0
    const qty   = item.qty   || 0
    page.drawText(String(i+1),                              { x:cx.num,   y:y+3, size:7.5, font:reg,  color:ink })
    page.drawText(name,                                     { x:cx.name,  y:y+3, size:7.5, font:reg,  color:ink })
    page.drawText(String(qty),                              { x:cx.qty,   y:y+3, size:7.5, font:reg,  color:ink })
    page.drawText(price.toLocaleString('ru'),               { x:cx.price, y:y+3, size:7.5, font:reg,  color:ink })
    page.drawText((price*qty).toLocaleString('ru'),         { x:cx.sum,   y:y+3, size:7.5, font:bold, color:ink })
    y -= 17
  })

  // Итоговая строка
  page.drawLine({ start:{x:40,y:y+2}, end:{x:W-40,y:y+2}, thickness:0.8, color:rgb(0.75,0.78,0.82) })
  y -= 14
  const totQty = items.reduce((s,i)=>s+(i.qty||0),0)
  page.drawText(`Позиций: ${items.length}   Единиц товара: ${totQty}`, { x:44, y, size:8, font:reg, color:gray })

  page.drawRectangle({ x:W-215, y:y-6, width:175, height:26, color:green })
  page.drawText('ИТОГО:', { x:W-205, y:y+6, size:10, font:bold, color:white })
  const totStr = (order.total||0).toLocaleString('ru')+' руб.'
  page.drawText(totStr, { x:W-205+58, y:y+7, size:12, font:bold, color:white })

  // ── Блок подписей ──
  y -= 50
  page.drawLine({ start:{x:40,y:y+30}, end:{x:W-40,y:y+30}, thickness:0.4, color:rgb(0.85,0.87,0.9) })

  page.drawText('Поставщик:', { x:44, y:y+18, size:8.5, font:bold, color:ink })
  page.drawText('ООО «Ways Pod»', { x:44, y:y+4, size:8.5, font:reg, color:ink })
  page.drawText('Подпись: ________________________', { x:44, y:y-10, size:8, font:reg, color:ink })

  page.drawText('Покупатель:', { x:W/2+10, y:y+18, size:8.5, font:bold, color:ink })
  page.drawText((order.name||'').slice(0,30), { x:W/2+10, y:y+4, size:8.5, font:reg, color:ink })
  page.drawText('Подпись: ________________________', { x:W/2+10, y:y-10, size:8, font:reg, color:ink })

  // ── Футер ──
  page.drawRectangle({ x:0, y:0, width:W, height:28, color:ink })
  page.drawText(`Ways Pod  ©  2026  •  Накладная #${order.id}  •  ${dateStr} МСК`, { x:40, y:8, size:7.5, font:reg, color:gray })
  page.drawText('wayspod.ru', { x:W-reg.widthOfTextAtSize('wayspod.ru',8.5)-40, y:8, size:8.5, font:bold, color:accent })

  return doc.save()
}
