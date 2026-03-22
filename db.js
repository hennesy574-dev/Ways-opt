import { createClient } from '@supabase/supabase-js'

const URL = 'https://vqcsocjxfrhzkwlubhha.supabase.co'
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxY3NvY2p4ZnJoemt3bHViaGhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwNTc2NjIsImV4cCI6MjA4OTYzMzY2Mn0.N9ESHWWIvlT8OJqnOCCblXEtpsjg3UJmlzWoqziw7Rs'
export const sb = createClient(URL, KEY)

// Управление cookie/localStorage
export function getCookie(name) {
  try {
    const v = document.cookie.split(';').find(c => c.trim().startsWith(name+'='))
    return v ? decodeURIComponent(v.trim().split('=')[1]) : null
  } catch { return null }
}
export function setCookie(name, value, days = 365) {
  try {
    const exp = new Date(Date.now() + days * 86400000).toUTCString()
    document.cookie = `${name}=${encodeURIComponent(value)};expires=${exp};path=/;SameSite=Lax`
  } catch {}
}
export function getVisitorId() {
  let id = getCookie('wp_vid') || localStorage.getItem('wp_vid')
  if (!id) {
    id = 'v_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
    setCookie('wp_vid', id, 365)
    localStorage.setItem('wp_vid', id)
  }
  return id
}
export function getSavedPhone() {
  return getCookie('wp_phone') || localStorage.getItem('wp_phone') || ''
}
export function savePhone(phone) {
  setCookie('wp_phone', phone, 365)
  localStorage.setItem('wp_phone', phone)
}
export function getSavedName() {
  return getCookie('wp_name') || localStorage.getItem('wp_name') || ''
}
export function saveName(name) {
  setCookie('wp_name', name, 365)
  localStorage.setItem('wp_name', name)
}
export function getSavedCart() {
  try { return JSON.parse(localStorage.getItem('wp_cart') || '{}') } catch { return {} }
}
export function saveCart(cart) {
  try { localStorage.setItem('wp_cart', JSON.stringify(cart)) } catch {}
}
export function getSavedDelivery() {
  return localStorage.getItem('wp_delivery') || 'sdek'
}
export function saveDelivery(d) { localStorage.setItem('wp_delivery', d) }
export function getSavedAddr() {
  return localStorage.getItem('wp_addr') || ''
}
export function saveAddr(a) { localStorage.setItem('wp_addr', a) }

export async function dbGetProducts() {
  try { const { data } = await sb.from('products').select('*').order('cat'); return data || [] } catch { return [] }
}
export async function dbUpsertProduct(p) {
  try { await sb.from('products').upsert(p, { onConflict: 'id' }) } catch(e) { console.error(e) }
}
export async function dbDeleteProduct(id) {
  try { await sb.from('products').delete().eq('id', id) } catch(e) { console.error(e) }
}
export async function dbGetOrders() {
  try { const { data } = await sb.from('orders').select('*').order('created_at', { ascending: false }); return data || [] } catch { return [] }
}
export async function dbInsertOrder(order) {
  try { await sb.from('orders').insert(order) } catch(e) { console.error(e) }
}
export async function dbGetSettings() {
  try { const { data } = await sb.from('settings').select('*').eq('id', 1).single(); return data || null } catch { return null }
}
export async function dbSaveSettings(fields) {
  try { await sb.from('settings').upsert({ id: 1, ...fields }) } catch(e) { console.error(e) }
}
export async function dbGetPush() {
  try { const { data } = await sb.from('push_history').select('*').order('created_at', { ascending: false }).limit(30); return data || [] } catch { return [] }
}
export async function dbAddPush(text) {
  try { await sb.from('push_history').insert({ text }) } catch(e) { console.error(e) }
}
export async function dbGetUsers() {
  try { const { data } = await sb.from('users').select('*').order('created_at', { ascending: false }); return data || [] } catch { return [] }
}
export async function dbUpsertUser(user) {
  try { await sb.from('users').upsert(user, { onConflict: 'phone' }) } catch(e) { console.error(e) }
}
export async function dbTrackVisitor(visitorId) {
  try { await sb.from('visitors').upsert({ id: visitorId, last_seen: new Date().toISOString() }, { onConflict: 'id' }) } catch {}
}
