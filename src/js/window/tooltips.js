const { remote } = require('electron')
let { acceleratorAsHtml } = require('../utils/index')
const prefsModule = require('electron').remote.require('./prefs')
// Robust require for tooltip dependency (handles packaging issues)
let Tooltip
try {
  Tooltip = require('tether-tooltip')
} catch (e1) {
  try {
    // Fallback to bundled vendor build
    Tooltip = require('../vendor/tether-tooltip')
  } catch (e2) {
    // Final no-op fallback to avoid runtime crashes
    class NoopTooltip {
      constructor () {
        this.drop = {
          on: () => {},
          close: () => {},
          remove: () => {},
          destroy: () => {},
          open: () => {},
          toggle: () => {},
          position: () => {}
        }
      }
      close () {}
      open () {}
      toggle () {}
      remove () {}
      destroy () {}
      position () {}
    }
    NoopTooltip.autoinit = false
    Tooltip = NoopTooltip
  }
}
const sfx = require('../wonderunit-sound')

let enableTooltips

const getPrefs = () => {
  enableTooltips = prefsModule.getPrefs('tooltips')['enableTooltips']
}

Tooltip.autoinit = false

let tooltips = []

const content = (title, description, keys) =>
  `<div class="title">${title}</div>` +
   `<div class="description">${description}</div>` +
   (keys 
     ? `<div class="key-command">${acceleratorAsHtml(keys)}</div>`
     : '')

const housekeeping = () => {
  // remove any tooltips for elements that no longer exist
  let valid = []
  for (let tooltip of tooltips) {
    if (!tooltip.options.target.parentNode) {
      tooltip.close()
      tooltip.remove()
      tooltip.destroy()
    } else {
      valid.push(tooltip)
    }
  }
  tooltips = valid
}

const setupTooltipForElement = (el) => {
  if (!enableTooltips) return false
  let title = el.dataset.tooltipTitle
  let description = el.dataset.tooltipDescription || ''
  let keys = el.dataset.tooltipKeys
  let position = el.dataset.tooltipPosition || 'top left'
  let tooltip = new Tooltip({
    target: el,
    content: content(title, description, keys),
    position,
    constrainToWindow: true,

    // Set to true if you'd like the drop element
    // to be removed from the DOM when the drop is closed
    // and recreated when it's opened.
    // via http://github.hubspot.com/drop/
    remove: false,

    // tether options
    // via http://tether.io/
    tetherOptions: {
      constraints: [
        {
          to: 'window',
          attachment: 'both'
        }
      ]
    },

    optimizations: {
      gpu: false
    },
    hoverOpenDelay: 1500

  })
  // HACK! force close immediately unless we allow tooltips in preferences
  tooltip.drop.on('open', () => {
    sfx.playEffect('metal')
    if (!enableTooltips || el.dataset.tooltipIgnore) {
      tooltip.close()
    }
  })
  tooltips.push(tooltip)
  housekeeping()
  return tooltip
}

const closeAll = () => tooltips.forEach(t => t.close())

const setIgnore = (el, value) => {
  if (value) {
    el.dataset.tooltipIgnore = true
  } else {
    delete el.dataset.tooltipIgnore
  }
}

const init = () => {
  getPrefs('pref editor')
  if (!enableTooltips) return false

  const tooltipElements = document.querySelectorAll('[data-tooltip]')
  for (let el of tooltipElements) {
    setupTooltipForElement(el)
  }
}

const update = () => {
  for(let i = 0; i < tooltips.length; i++) {
    let tooltip = tooltips[i]
    tooltip.destroy()
  }
  tooltips = [];
  init()
}

module.exports = {
  init,
  update,
  setupTooltipForElement,
  housekeeping,
  getPrefs,
  setIgnore,
  closeAll
}