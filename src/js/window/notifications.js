let count = 0
let timeout
let notifications = []
let messages
let container

const removeNotification = (index) => {
  let notification = notifications.find(n => n.index == index)
  if (notification) {
    let el = notification.el
    el.style.opacity = 0
      el.style.height = '0px'

    clearTimeout(notification.index)
    if (el.parentNode) {
      setTimeout(() => {
        if (el.parentNode) {
          el.parentNode.removeChild(el)
        }
      }, 1000)
    }
  }
}

const addNotification = (data) => {
  let el, content, height, index

  index = count++

  el = document.createElement('div')
  el.classList.add('notification')
  el.dataset.index = index
  // Individual notification layout for top-left stack
  el.style.background = 'rgba(15, 23, 42, 0.95)'
  el.style.color = 'white'
  el.style.borderRadius = '8px'
  el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'
  el.style.overflow = 'hidden'
  el.style.margin = '0'
  el.style.width = 'auto'
  el.style.maxWidth = '360px'
  el.style.transition = 'opacity 200ms ease, height 200ms ease'

  if (data.onClick) el.onclick = event => {
    event.preventDefault()
    data.onClick(event)
  }

  content = document.createElement('div')
  content.classList.add('notification-content')
  content.style.padding = '10px 12px'
  content.style.fontSize = '13px'
  content.style.lineHeight = '1.35'
  content.innerHTML = 
  `
    <div>
      <div>
        ${data.message.replace(/\*\*([^*]+)\*\*/g, "<strong>$1<\/strong>")}
      </div>
    ` +
    (data.author ? `<div class="notification-content_author">
                      ${data.author}
                    </div>`
                 : '') +
    `</div>`

  el.appendChild(content)

  container.appendChild(el)
  height = el.offsetHeight
  el.style.height = '0px'
  requestAnimationFrame(() =>
    requestAnimationFrame(() =>
      el.style.height = height + 'px'
    )
  )


  let timing
  if (data.timing) {
    timing = Number(data.timing) * 1000
  } else {
    timing = 30 * 1000
  }


  let timer = setTimeout(removeNotification, timing, index)

  let result = {
    index,
    el,
    height,
    timer
  }
  notifications.push(result)
  return result
}

const formatMessageData = (data) => {
  data.message = data.message.replace(/\n/g, '<br />')
  return data
}

const onPointerDown = event =>
  removeNotification(
    (event.target.classList.contains('notification')
      ? event.target
      : event.target.closest('.notification')).dataset.index
  )

let enabled

const init = (el, enableNotifications) => {
  container = el
  enabled = enableNotifications

  // Position container top-left instead of bottom-right
  container.style.position = 'fixed'
  container.style.top = '20px'
  container.style.left = '20px'
  container.style.right = 'auto'
  container.style.bottom = 'auto'
  container.style.zIndex = 3000
  container.style.display = 'flex'
  container.style.flexDirection = 'column'
  container.style.gap = '8px'

  container.addEventListener('pointerdown', onPointerDown)
}

let notify = (data) => {
  if (enabled) {
    return addNotification(formatMessageData(data))
  }
}

module.exports = {
  init,
  notify
}
