const cheerio = createCheerio()

const UA: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
 
let appConfig = {
    ver: 1,
    title: '91Jav',
    // 91jav.fun
    site: 'https://041.bndmpsjx.com',
}
}

// ================= 工具函数 =================
const safeFetch = async (url, options = {}) => {
  let retry = 0
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), options.timeout || CRAWLER_CONFIG.timeout)

  while (retry <= CRAWLER_CONFIG.retries) {
    try {
      const proxy = CRAWLER_CONFIG.proxyPool[retry % CRAWLER_CONFIG.proxyPool.length]
      const response = await $fetch.get(url, {
        ...options,
        headers: {
          'User-Agent': CRAWLER_CONFIG.UA,
          'Referer': CRAWLER_CONFIG.site,
          'X-Requested-With': 'XMLHttpRequest',
          ...options.headers
        },
        proxy,
        signal: controller.signal
      })
      clearTimeout(timeoutId)
      return response
    } catch (error) {
      if (++retry > CRAWLER_CONFIG.retries) throw error
      await new Promise(resolve => setTimeout(resolve, 1000 * retry))
    }
  }
}

const sanitizeInput = (text) => {
  return text.replace(/[^a-zA-Z0-9\u4e00-\u9fa5\-_]/g, '').trim()
}

// ================= 核心逻辑 =================
async function getConfig() {
  return jsonify({
    ...CRAWLER_CONFIG,
    tabs: await getTabs()
  })
}

async function getTabs() {
  try {
    const { data } = await safeFetch(`${CRAWLER_CONFIG.site}/index/getMvStyle/order/count`)
    const $ = cheerio.load(data)
    const ignoreList = new Set(['首页'])

    return $('.pb-3.pb-e-lg-40 .col-6.col-sm-4.col-lg-3')
      .map((_, e) => {
        const $e = $(e)
        const name = $e.find('h4').text().trim()
        return ignoreList.has(name) ? null : {
          name,
          ext: { typeurl: $e.find('a').attr('href') },
          ui: 1
        }
      }).get().filter(Boolean)
  } catch (error) {
    console.error(`[Tab Error] ${error.message}`)
    return []
  }
}

async function getCards(ext) {
  const { page = 1, typeurl } = argsify(ext)
  const url = page > 1 
    ? `${CRAWLER_CONFIG.site}${typeurl}/sort/update/page/${page}`
    : `${CRAWLER_CONFIG.site}${typeurl}`

  try {
    const { data } = await safeFetch(url)
    const $ = cheerio.load(data)
    
    const cards = $('.pb-3.pb-e-lg-40 .col-6.col-sm-4.col-lg-3')
      .map((_, element) => {
        const $element = $(element)
        const href = $element.find('.title a').attr('href') || ''
        
        return {
          vod_id: href,
          vod_name: $element.find('.title a').text().trim(),
          vod_pic: extractCover($element),
          vod_duration: $element.find('.label').text().trim(),
          ext: { url: new URL(href, CRAWLER_CONFIG.site).href }
        }
      }).get()

    return jsonify({
      list: cards,
      meta: await extractPagination($)
    })
  } catch (error) {
    return handleError(error, 'Cards')
  }
}

// ================= 辅助函数 =================
function extractCover($element) {
  const img = $element.find('img').first()
  const src = img.attr('data-src') || img.attr('src') || ''
  return src ? new URL(src, CRAWLER_CONFIG.site).href : ''
}

async function extractPagination($) {
  const pagination = $('.pagination').first()
  return {
    page: parseInt($('.page-item.active').text()) || 1,
    total: pagination.find('.page-item').length - 2 || 1,
    hasMore: pagination.find('.page-item.next').length > 0
  }
}

function handleError(error, context = '') {
  console.error(`[${context} Error] ${error.message}`)
  return jsonify({
    error: {
      code: error.code || 500,
      message: `Failed to load ${context} data`
    },
    list: []
  })
}

// ================= 播放处理 =================
const HLS_REGEX = /var\s+hlsUrl\s*=\s*"(.*?)";/g

async function getTracks(ext) {
  try {
    const { data } = await safeFetch(argsify(ext).url)
    const matches = [...data.matchAll(HLS_REGEX)]
    
    return jsonify({
      list: [{
        title: '多码率播放',
        tracks: matches.map(([, url], index) => ({
          name: `线路${index + 1}`,
          ext: { url, quality: index === 0 ? 'HD' : 'SD' }
        }))
      }]
    })
  } catch (error) {
    return handleError(error, 'Tracks')
  }
}

// ================= 搜索优化 =================
async function search(ext) {
  const { text, page = 1 } = argsify(ext)
  const keyword = encodeURIComponent(sanitizeInput(text))
  const url = `${CRAWLER_CONFIG.site}/search/index/keyword/${keyword}${page > 1 ? `/page/${page}` : ''}`

  try {
    const { data } = await safeFetch(url)
    return jsonify({
      list: parseCards(cheerio.load(data)),
      meta: { searchTerm: text }
    })
  } catch (error) {
    return handleError(error, 'Search')
  }
}

function parseCards($) {
  return $('.pb-3.pb-e-lg-40 .col-6.col-sm-4.col-lg-3').map((_, element) => {
    const $element = $(element)
    const href = $element.find('.title a').attr('href') || ''
    
    return {
      vod_id: href,
      vod_name: $element.find('.title a').text().trim(),
      vod_pic: extractCover($element),
      vod_duration: $element.find('.label').text().trim(),
      ext: { url: new URL(href, CRAWLER_CONFIG.site).href }
    }
  }).get()
}
