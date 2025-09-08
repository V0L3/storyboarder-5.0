// Enhanced Export Layout Model
// Manages custom layouts, custom fields, and GIF grouping

const defaultLayoutPresets = {
  'standard': {
    name: 'Standard Layout',
    columns: [
      { id: 'cut', type: 'cut-number', width: 60, label: 'Cut' },
      { id: 'image', type: 'image', width: 300, label: 'Image' },
      { id: 'notes', type: 'notes', width: 150, label: 'Notes' },
      { id: 'talks', type: 'talks', width: 150, label: 'Talks' },
      { id: 'time', type: 'time', width: 60, label: 'Time' }
    ],
    spacing: 15,
    orientation: 'landscape',
    paperSize: 'A4'
  },
  'detailed': {
    name: 'Detailed Layout',
    columns: [
      { id: 'cut', type: 'cut-number', width: 50, label: 'Cut' },
      { id: 'image', type: 'image', width: 250, label: 'Image' },
      { id: 'notes', type: 'notes', width: 120, label: 'Notes' },
      { id: 'dialogue', type: 'dialogue', width: 120, label: 'Dialogue' },
      { id: 'action', type: 'action', width: 120, label: 'Action' },
      { id: 'focal-length', type: 'custom-field', width: 80, label: 'Focal Length' },
      { id: 'time', type: 'time', width: 50, label: 'Time' }
    ],
    spacing: 10,
    orientation: 'landscape',
    paperSize: 'A4'
  },
  'compact': {
    name: 'Compact Layout',
    columns: [
      { id: 'cut', type: 'cut-number', width: 40, label: 'Cut' },
      { id: 'image', type: 'image', width: 200, label: 'Image' },
      { id: 'notes', type: 'notes', width: 100, label: 'Notes' },
      { id: 'time', type: 'time', width: 40, label: 'Time' }
    ],
    spacing: 20,
    orientation: 'portrait',
    paperSize: 'A4'
  }
}

const columnTypes = {
  'cut-number': {
    name: 'Cut Number',
    description: 'Sequential board number',
    renderable: true,
    customizable: false
  },
  'image': {
    name: 'Storyboard Image',
    description: 'Main storyboard drawing',
    renderable: true,
    customizable: false
  },
  'notes': {
    name: 'Notes',
    description: 'Board notes and annotations',
    renderable: true,
    customizable: false
  },
  'dialogue': {
    name: 'Dialogue',
    description: 'Character dialogue',
    renderable: true,
    customizable: false
  },
  'action': {
    name: 'Action',
    description: 'Action description',
    renderable: true,
    customizable: false
  },
  'talks': {
    name: 'Talks',
    description: 'Dialogue/sound notes',
    renderable: true,
    customizable: false
  },
  'time': {
    name: 'Duration',
    description: 'Board timing',
    renderable: true,
    customizable: false
  },
  'filename': {
    name: 'File Name',
    description: 'Image filename',
    renderable: true,
    customizable: false
  },
  'custom-field': {
    name: 'Custom Field',
    description: 'User-defined field',
    renderable: true,
    customizable: true
  }
}

// Custom layout management
class ExportLayoutManager {
  constructor() {
    this.layouts = { ...defaultLayoutPresets }
    this.customFields = new Map()
    this.gifGroups = new Map()
  }

  // Layout management
  getLayouts() {
    return this.layouts
  }

  getLayout(id) {
    return this.layouts[id]
  }

  createLayout(name, baseLayout = 'standard') {
    const id = name.toLowerCase().replace(/\s+/g, '-')
    const base = this.layouts[baseLayout] || defaultLayoutPresets.standard
    
    this.layouts[id] = {
      ...base,
      name,
      id,
      isCustom: true
    }
    
    return this.layouts[id]
  }

  updateLayout(id, updates) {
    if (this.layouts[id]) {
      this.layouts[id] = { ...this.layouts[id], ...updates }
    }
  }

  deleteLayout(id) {
    if (this.layouts[id] && this.layouts[id].isCustom) {
      delete this.layouts[id]
      return true
    }
    return false
  }

  // Column management
  addColumnToLayout(layoutId, column, position = -1) {
    const layout = this.layouts[layoutId]
    if (!layout) return false

    const newColumn = {
      id: column.id || `custom-${Date.now()}`,
      type: column.type || 'custom-field',
      width: column.width || 100,
      label: column.label || 'New Column',
      ...column
    }

    if (position >= 0 && position < layout.columns.length) {
      layout.columns.splice(position, 0, newColumn)
    } else {
      layout.columns.push(newColumn)
    }

    return true
  }

  removeColumnFromLayout(layoutId, columnId) {
    const layout = this.layouts[layoutId]
    if (!layout) return false

    const index = layout.columns.findIndex(col => col.id === columnId)
    if (index >= 0) {
      layout.columns.splice(index, 1)
      return true
    }
    return false
  }

  reorderColumns(layoutId, fromIndex, toIndex) {
    const layout = this.layouts[layoutId]
    if (!layout || fromIndex < 0 || toIndex < 0) return false

    const columns = layout.columns
    if (fromIndex >= columns.length || toIndex >= columns.length) return false

    const [movedColumn] = columns.splice(fromIndex, 1)
    columns.splice(toIndex, 0, movedColumn)
    return true
  }

  // Custom field management
  addCustomField(name, defaultValue = '', type = 'text') {
    const id = `custom-${name.toLowerCase().replace(/\s+/g, '-')}`
    this.customFields.set(id, {
      id,
      name,
      defaultValue,
      type, // text, number, select, etc.
      options: type === 'select' ? [] : null
    })
    return id
  }

  getCustomFields() {
    return Array.from(this.customFields.values())
  }

  removeCustomField(id) {
    return this.customFields.delete(id)
  }

  // GIF Group management
  createGifGroup(name, boardIndices = []) {
    const id = `gif-group-${Date.now()}`
    const color = this.generateGroupColor()
    
    this.gifGroups.set(id, {
      id,
      name,
      boardIndices: [...boardIndices],
      color,
      createdAt: Date.now()
    })
    
    return id
  }

  addBoardToGifGroup(groupId, boardIndex) {
    const group = this.gifGroups.get(groupId)
    if (group && !group.boardIndices.includes(boardIndex)) {
      group.boardIndices.push(boardIndex)
      return true
    }
    return false
  }

  removeBoardFromGifGroup(groupId, boardIndex) {
    const group = this.gifGroups.get(groupId)
    if (group) {
      const index = group.boardIndices.indexOf(boardIndex)
      if (index >= 0) {
        group.boardIndices.splice(index, 1)
        return true
      }
    }
    return false
  }

  getGifGroups() {
    return Array.from(this.gifGroups.values())
  }

  getGifGroup(id) {
    return this.gifGroups.get(id)
  }

  deleteGifGroup(id) {
    return this.gifGroups.delete(id)
  }

  getBoardGifGroup(boardIndex) {
    for (const group of this.gifGroups.values()) {
      if (group.boardIndices.includes(boardIndex)) {
        return group
      }
    }
    return null
  }

  generateGroupColor() {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57',
      '#FF9FF3', '#54A0FF', '#5F27CD', '#00D2D3', '#FF9F43',
      '#C44569', '#F8B500', '#6C5CE7', '#A29BFE', '#FD79A8'
    ]
    
    const usedColors = new Set(Array.from(this.gifGroups.values()).map(g => g.color))
    const availableColors = colors.filter(c => !usedColors.has(c))
    
    return availableColors.length > 0 
      ? availableColors[Math.floor(Math.random() * availableColors.length)]
      : colors[Math.floor(Math.random() * colors.length)]
  }

  // Export configuration
  getExportConfig(layoutId, options = {}) {
    const layout = this.layouts[layoutId]
    if (!layout) return null

    return {
      layout: { ...layout },
      customFields: this.getCustomFields(),
      gifGroups: this.getGifGroups(),
      options: {
        showFilenames: options.showFilenames || false,
        filenameLocation: options.filenameLocation || 'overlay', // 'overlay' or 'column'
        includeGifs: options.includeGifs !== false,
        watermark: options.watermark || false,
        ...options
      }
    }
  }

  // Serialization
  toJSON() {
    return {
      layouts: this.layouts,
      customFields: Object.fromEntries(this.customFields),
      gifGroups: Object.fromEntries(this.gifGroups)
    }
  }

  fromJSON(data) {
    if (data.layouts) {
      this.layouts = { ...defaultLayoutPresets, ...data.layouts }
    }
    if (data.customFields) {
      this.customFields = new Map(Object.entries(data.customFields))
    }
    if (data.gifGroups) {
      this.gifGroups = new Map(Object.entries(data.gifGroups))
    }
  }
}

module.exports = {
  ExportLayoutManager,
  defaultLayoutPresets,
  columnTypes
}