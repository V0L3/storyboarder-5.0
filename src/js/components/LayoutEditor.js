// Visual Layout Editor Component
// Drag-and-drop interface for customizing export layouts

const { columnTypes } = require('../models/export-layout')

class LayoutEditor {
  constructor(container, layoutManager, options = {}) {
    this.container = container
    this.layoutManager = layoutManager
    this.options = options
    
    this.currentLayout = null
    this.draggedColumn = null
    this.isDragging = false
    
    this.init()
  }

  init() {
    this.container.innerHTML = this.getHTML()
    this.attachEventListeners()
  }

  getHTML() {
    return `
      <div class="layout-editor">
        <div class="layout-editor-header">
          <h3>Custom Layout Editor</h3>
          <div class="layout-controls">
            <select id="layout-preset" class="layout-select">
              <option value="">Choose a preset...</option>
              ${Object.entries(this.layoutManager.getLayouts()).map(([id, layout]) => 
                `<option value="${id}">${layout.name}</option>`
              ).join('')}
            </select>
            <button id="new-layout-btn" class="btn btn-primary">New Layout</button>
            <button id="save-layout-btn" class="btn btn-secondary">Save</button>
          </div>
        </div>
        
        <div class="layout-editor-content">
          <div class="layout-preview">
            <div class="preview-header">
              <h4>Layout Preview</h4>
              <div class="preview-controls">
                <select id="paper-orientation">
                  <option value="landscape">Landscape</option>
                  <option value="portrait">Portrait</option>
                </select>
                <select id="paper-size">
                  <option value="A4">A4</option>
                  <option value="LTR">Letter</option>
                </select>
              </div>
            </div>
            <div class="preview-container">
              <div id="layout-preview-canvas" class="layout-canvas">
                <!-- Layout preview will be rendered here -->
              </div>
            </div>
          </div>
          
          <div class="column-editor">
            <div class="column-editor-header">
              <h4>Columns</h4>
              <button id="add-column-btn" class="btn btn-add">+ Add Column</button>
            </div>
            <div id="column-list" class="column-list">
              <!-- Column configuration will be rendered here -->
            </div>
          </div>
        </div>
        
        <div class="layout-editor-footer">
          <div class="layout-settings">
            <label>
              Spacing:
              <input type="range" id="layout-spacing" min="5" max="50" value="15">
              <span id="spacing-value">15px</span>
            </label>
          </div>
        </div>
      </div>
    `
  }

  attachEventListeners() {
    // Layout preset selection
    const presetSelect = this.container.querySelector('#layout-preset')
    presetSelect.addEventListener('change', (e) => {
      if (e.target.value) {
        this.loadLayout(e.target.value)
      }
    })

    // New layout button
    this.container.querySelector('#new-layout-btn').addEventListener('click', () => {
      const name = prompt('Enter layout name:')
      if (name) {
        const layout = this.layoutManager.createLayout(name)
        this.loadLayout(layout.id)
        this.updatePresetSelect()
      }
    })

    // Save layout button
    this.container.querySelector('#save-layout-btn').addEventListener('click', () => {
      this.saveCurrentLayout()
    })

    // Add column button
    this.container.querySelector('#add-column-btn').addEventListener('click', () => {
      this.showAddColumnDialog()
    })

    // Paper settings
    this.container.querySelector('#paper-orientation').addEventListener('change', (e) => {
      if (this.currentLayout) {
        this.currentLayout.orientation = e.target.value
        this.renderPreview()
      }
    })

    this.container.querySelector('#paper-size').addEventListener('change', (e) => {
      if (this.currentLayout) {
        this.currentLayout.paperSize = e.target.value
        this.renderPreview()
      }
    })

    // Spacing control
    const spacingSlider = this.container.querySelector('#layout-spacing')
    const spacingValue = this.container.querySelector('#spacing-value')
    
    spacingSlider.addEventListener('input', (e) => {
      const value = e.target.value
      spacingValue.textContent = `${value}px`
      if (this.currentLayout) {
        this.currentLayout.spacing = parseInt(value)
        this.renderPreview()
      }
    })
  }

  loadLayout(layoutId) {
    const layout = this.layoutManager.getLayout(layoutId)
    if (!layout) return

    // Create a working copy
    this.currentLayout = JSON.parse(JSON.stringify(layout))
    
    // Update UI
    this.container.querySelector('#paper-orientation').value = this.currentLayout.orientation
    this.container.querySelector('#paper-size').value = this.currentLayout.paperSize
    this.container.querySelector('#layout-spacing').value = this.currentLayout.spacing
    this.container.querySelector('#spacing-value').textContent = `${this.currentLayout.spacing}px`
    
    this.renderColumns()
    this.renderPreview()
  }

  renderColumns() {
    if (!this.currentLayout) return

    const columnList = this.container.querySelector('#column-list')
    columnList.innerHTML = this.currentLayout.columns.map((column, index) => `
      <div class="column-item" data-index="${index}" draggable="true">
        <div class="column-handle">≡</div>
        <div class="column-info">
          <div class="column-type">${columnTypes[column.type]?.name || column.type}</div>
          <div class="column-label">${column.label}</div>
        </div>
        <div class="column-controls">
          <input type="number" class="column-width" value="${column.width}" min="50" max="500">
          <button class="btn-edit" data-index="${index}">✎</button>
          <button class="btn-remove" data-index="${index}">✕</button>
        </div>
      </div>
    `).join('')

    this.attachColumnEventListeners()
  }

  attachColumnEventListeners() {
    const columnList = this.container.querySelector('#column-list')

    // Drag and drop
    columnList.addEventListener('dragstart', (e) => {
      if (e.target.classList.contains('column-item')) {
        this.draggedColumn = parseInt(e.target.dataset.index)
        e.target.classList.add('dragging')
        this.isDragging = true
      }
    })

    columnList.addEventListener('dragend', (e) => {
      if (e.target.classList.contains('column-item')) {
        e.target.classList.remove('dragging')
        this.isDragging = false
        this.draggedColumn = null
      }
    })

    columnList.addEventListener('dragover', (e) => {
      e.preventDefault()
      if (!this.isDragging) return

      const afterElement = this.getDragAfterElement(columnList, e.clientY)
      const draggingElement = columnList.querySelector('.dragging')
      
      if (afterElement == null) {
        columnList.appendChild(draggingElement)
      } else {
        columnList.insertBefore(draggingElement, afterElement)
      }
    })

    columnList.addEventListener('drop', (e) => {
      e.preventDefault()
      if (this.draggedColumn === null) return

      const newIndex = Array.from(columnList.children).findIndex(child => 
        child.classList.contains('dragging')
      )

      if (newIndex !== -1 && newIndex !== this.draggedColumn) {
        this.layoutManager.reorderColumns(this.currentLayout.id, this.draggedColumn, newIndex)
        // Update the current layout working copy
        const [movedColumn] = this.currentLayout.columns.splice(this.draggedColumn, 1)
        this.currentLayout.columns.splice(newIndex, 0, movedColumn)
        this.renderColumns()
        this.renderPreview()
      }
    })

    // Width changes
    columnList.addEventListener('change', (e) => {
      if (e.target.classList.contains('column-width')) {
        const index = parseInt(e.target.closest('.column-item').dataset.index)
        this.currentLayout.columns[index].width = parseInt(e.target.value)
        this.renderPreview()
      }
    })

    // Edit button
    columnList.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-edit')) {
        const index = parseInt(e.target.dataset.index)
        this.editColumn(index)
      }
    })

    // Remove button
    columnList.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-remove')) {
        const index = parseInt(e.target.dataset.index)
        this.removeColumn(index)
      }
    })
  }

  getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.column-item:not(.dragging)')]
    
    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect()
      const offset = y - box.top - box.height / 2
      
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child }
      } else {
        return closest
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element
  }

  renderPreview() {
    if (!this.currentLayout) return

    const canvas = this.container.querySelector('#layout-preview-canvas')
    const isLandscape = this.currentLayout.orientation === 'landscape'
    
    // Calculate dimensions
    const totalWidth = this.currentLayout.columns.reduce((sum, col) => sum + col.width, 0)
    const spacing = this.currentLayout.spacing
    const totalSpacing = (this.currentLayout.columns.length - 1) * spacing
    const canvasWidth = totalWidth + totalSpacing + 40 // margins
    
    canvas.style.width = `${Math.min(canvasWidth, 800)}px`
    canvas.style.height = `${isLandscape ? 300 : 400}px`
    canvas.style.flexDirection = 'row'
    
    // Render columns
    canvas.innerHTML = this.currentLayout.columns.map((column, index) => `
      <div class="preview-column" style="
        width: ${column.width}px;
        margin-right: ${index < this.currentLayout.columns.length - 1 ? spacing : 0}px;
        background: ${this.getColumnPreviewColor(column.type)};
        border: 1px solid #ddd;
        border-radius: 4px;
        padding: 8px;
        min-height: 100px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        text-align: center;
        font-size: 12px;
        color: #666;
      ">
        <strong>${column.label}</strong>
        <div style="font-size: 10px; margin-top: 4px;">
          ${columnTypes[column.type]?.name || column.type}
        </div>
        <div style="font-size: 9px; margin-top: 2px; opacity: 0.7;">
          ${column.width}px
        </div>
      </div>
    `).join('')
  }

  getColumnPreviewColor(type) {
    const colors = {
      'cut-number': '#e3f2fd',
      'image': '#f3e5f5',
      'notes': '#fff3e0',
      'dialogue': '#e8f5e8',
      'action': '#fff8e1',
      'talks': '#fce4ec',
      'time': '#e0f2f1',
      'filename': '#f1f8e9',
      'custom-field': '#fafafa'
    }
    return colors[type] || '#f5f5f5'
  }

  showAddColumnDialog() {
    const dialog = document.createElement('div')
    dialog.className = 'modal-overlay'
    dialog.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>Add Column</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-content">
          <div class="form-group">
            <label>Column Type:</label>
            <select id="column-type">
              ${Object.entries(columnTypes).map(([type, info]) => 
                `<option value="${type}">${info.name} - ${info.description}</option>`
              ).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Label:</label>
            <input type="text" id="column-label" placeholder="Column label">
          </div>
          <div class="form-group">
            <label>Width (px):</label>
            <input type="number" id="column-width" value="120" min="50" max="500">
          </div>
          <div id="custom-field-options" style="display: none;">
            <div class="form-group">
              <label>Field Name:</label>
              <input type="text" id="custom-field-name" placeholder="e.g., Focal Length">
            </div>
            <div class="form-group">
              <label>Default Value:</label>
              <input type="text" id="custom-field-default" placeholder="Default value">
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button id="add-column-confirm" class="btn btn-primary">Add Column</button>
          <button class="modal-cancel btn btn-secondary">Cancel</button>
        </div>
      </div>
    `

    document.body.appendChild(dialog)

    // Show/hide custom field options
    const typeSelect = dialog.querySelector('#column-type')
    const customOptions = dialog.querySelector('#custom-field-options')
    
    typeSelect.addEventListener('change', (e) => {
      customOptions.style.display = e.target.value === 'custom-field' ? 'block' : 'none'
    })

    // Handle dialog actions
    dialog.querySelector('.modal-close').addEventListener('click', () => {
      document.body.removeChild(dialog)
    })

    dialog.querySelector('.modal-cancel').addEventListener('click', () => {
      document.body.removeChild(dialog)
    })

    dialog.querySelector('#add-column-confirm').addEventListener('click', () => {
      const type = dialog.querySelector('#column-type').value
      const label = dialog.querySelector('#column-label').value || columnTypes[type].name
      const width = parseInt(dialog.querySelector('#column-width').value)

      const column = {
        type,
        label,
        width
      }

      // Handle custom fields
      if (type === 'custom-field') {
        const fieldName = dialog.querySelector('#custom-field-name').value
        const defaultValue = dialog.querySelector('#custom-field-default').value
        
        if (fieldName) {
          const fieldId = this.layoutManager.addCustomField(fieldName, defaultValue)
          column.customFieldId = fieldId
          column.label = fieldName
        }
      }

      this.layoutManager.addColumnToLayout(this.currentLayout.id, column)
      this.currentLayout.columns.push(column)
      
      this.renderColumns()
      this.renderPreview()
      
      document.body.removeChild(dialog)
    })

    // Close on backdrop click
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        document.body.removeChild(dialog)
      }
    })
  }

  editColumn(index) {
    const column = this.currentLayout.columns[index]
    if (!column) return

    const newLabel = prompt('Enter new label:', column.label)
    if (newLabel && newLabel !== column.label) {
      column.label = newLabel
      this.renderColumns()
      this.renderPreview()
    }
  }

  removeColumn(index) {
    if (confirm('Remove this column?')) {
      this.currentLayout.columns.splice(index, 1)
      this.renderColumns()
      this.renderPreview()
    }
  }

  saveCurrentLayout() {
    if (!this.currentLayout) return

    this.layoutManager.updateLayout(this.currentLayout.id, this.currentLayout)
    alert('Layout saved successfully!')
  }

  updatePresetSelect() {
    const select = this.container.querySelector('#layout-preset')
    select.innerHTML = `
      <option value="">Choose a preset...</option>
      ${Object.entries(this.layoutManager.getLayouts()).map(([id, layout]) => 
        `<option value="${id}">${layout.name}</option>`
      ).join('')}
    `
  }

  destroy() {
    // Cleanup event listeners and remove from DOM
    this.container.innerHTML = ''
  }
}

module.exports = LayoutEditor