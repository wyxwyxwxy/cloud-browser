// TinyFish Browser API 客户端
// 文档: https://docs.tinyfish.ai/browser-api/reference
const CREATE_URL = 'https://api.browser.tinyfish.ai'

export async function createTinyFishSession(apiKey, { url, timeout_seconds = 3600, proxy_config } = {}) {
  const payload = { timeout_seconds }
  if (url) payload.url = normalizeUrl(url)
  if (proxy_config) payload.proxy_config = proxy_config

  const res = await fetch(CREATE_URL, {
    method: 'POST',
    headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(70000),
  })
  const text = await res.text()
  let body
  try { body = text ? JSON.parse(text) : {} } catch { body = { raw: text } }
  if (!res.ok) {
    const msg = body?.error?.message || body?.message || `TinyFish 返回 ${res.status}`
    const err = new Error(msg)
    err.status = res.status
    err.body = body
    throw err
  }
  if (!body.cdp_url) throw new Error('TinyFish 未返回 cdp_url，请检查账户余额与密钥权限')
  return body // { session_id, cdp_url, base_url }
}

export async function deleteTinyFishSession(apiKey, sessionId) {
  if (!apiKey || !sessionId) return
  try {
    await fetch(`${CREATE_URL}/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
      headers: { 'X-API-Key': apiKey },
      signal: AbortSignal.timeout(20000),
    })
  } catch (e) {
    console.warn('[tinyfish] 终止会话失败:', e.message)
  }
}

export function normalizeUrl(input) {
  if (!input) return 'about:blank'
  let u = String(input).trim()
  if (/^(about:|data:|chrome:|file:)/i.test(u)) return u
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u
  try { new URL(u); return u } catch { return 'https://' + u.replace(/^\/+/, '') }
}
