// Enhanced Export Dialog Component
// Replaces the basic print window with advanced export options

const LayoutEditor = require('./LayoutEditor')
const { ExportLayoutManager } = require('../models/export-layout')

class EnhancedExportDialog {
  constructor(boardData, boardFilename, options = {}) {
    this.boardData = boardData
    this.boardFilename = boardFilename
    this.options = options
    
    this.layoutManager = new ExportLayoutManager()
    this.layoutEditor = null
    this.currentLayout = 'standard'
    this.exportConfig = {}
    
    this.init()
  }

  init() {
    this.createDialog()
    this.attachEventListeners()
    this.loadDefaultLayout()
  }

  showInputDialog(message, title, callback) {
    // Remove existing input dialog if present
    const existing = document.querySelector('#input-dialog')
    if (existing) existing.remove()

    const dialog = document.createElement('div')
    dialog.id = 'input-dialog'
    dialog.className = 'input-dialog-overlay'
    dialog.innerHTML = `
      <div class="input-dialog-container">
        <div class="input-dialog-header">
          <h3>${title}</h3>
          <button class="input-dialog-close">&times;</button>
        </div>
        <div class="input-dialog-content">
          <p>${message}</p>
          <input type="text" id="input-dialog-field" placeholder="Enter value..." autofocus>
        </div>
        <div class="input-dialog-actions">
          <button id="input-dialog-cancel" class="btn btn-secondary">Cancel</button>
          <button id="input-dialog-ok" class="btn btn-primary">OK</button>
        </div>
      </div>
    `

    document.body.appendChild(dialog)

    const input = dialog.querySelector('#input-dialog-field')
    const okBtn = dialog.querySelector('#input-dialog-ok')
    const cancelBtn = dialog.querySelector('#input-dialog-cancel')
    const closeBtn = dialog.querySelector('.input-dialog-close')

    const cleanup = () => {
      document.body.removeChild(dialog)
    }

    const handleOk = () => {
      const value = input.value.trim()
      cleanup()
      if (callback) callback(value)
    }

    const handleCancel = () => {
      cleanup()
      if (callback) callback(null)
    }

    okBtn.addEventListener('click', handleOk)
    cancelBtn.addEventListener('click', handleCancel)
    closeBtn.addEventListener('click', handleCancel)

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleOk()
      if (e.key === 'Escape') handleCancel()
    })

    // Focus the input field
    setTimeout(() => input.focus(), 100)
  }

  createDialog() {
    // Remove existing dialog if present
    const existing = document.querySelector('#enhanced-export-dialog')
    if (existing) existing.remove()

    const dialog = document.createElement('div')
    dialog.id = 'enhanced-export-dialog'
    dialog.className = 'enhanced-export-dialog'
    dialog.innerHTML = this.getDialogHTML()

    document.body.appendChild(dialog)
    this.dialog = dialog
  }

  getDialogHTML() {
    return `
      <div class="dialog-overlay">
        <div class="dialog-container">
          <div class="dialog-header">
            <h2>Enhanced Export</h2>
            <button class="dialog-close" id="close-export-dialog">&times;</button>
          </div>
          
          <div class="dialog-content">
            <div class="export-tabs">
              <button class="tab-button active" data-tab="layout">Layout</button>
              <button class="tab-button" data-tab="content">Content</button>
              <button class="tab-button" data-tab="gifs">GIFs</button>
              <button class="tab-button" data-tab="settings">Settings</button>
            </div>
            
            <div class="tab-content">
              <!-- Layout Tab -->
              <div class="tab-panel active" data-panel="layout">
                <div class="layout-section">
                  <div class="layout-controls">
                    <div class="form-group">
                      <label>Layout Template:</label>
                      <select id="layout-template">
                        ${Object.entries(this.layoutManager.getLayouts()).map(([id, layout]) => 
                          `<option value="${id}">${layout.name}</option>`
                        ).join('')}
                      </select>
                    </div>
                    <button id="customize-layout-btn" class="btn btn-primary">Customize Layout</button>
                    <button id="new-layout-btn" class="btn btn-secondary">New Layout</button>
                  </div>
                  
                  <div class="layout-preview">
                    <div class="preview-header">
                      <h4>Preview</h4>
                      <div class="preview-controls">
                        <select id="paper-size">
                          <option value="A4">A4</option>
                          <option value="LTR">Letter</option>
                        </select>
                        <select id="paper-orientation">
                          <option value="landscape">Landscape</option>
                          <option value="portrait">Portrait</option>
                        </select>
                      </div>
                    </div>
                    <div id="layout-preview-container" class="layout-preview-container">
                      <!-- Preview will be rendered here -->
                    </div>
                  </div>
                </div>
                
                <!-- Layout Editor Container (initially hidden) -->
                <div id="layout-editor-container" class="layout-editor-container" style="display: none;">
                  <!-- LayoutEditor component will be mounted here -->
                </div>
              </div>
              
              <!-- Content Tab -->
              <div class="tab-panel" data-panel="content">
                <div class="content-options">
                  <h4>Content Options</h4>
                  
                  <div class="option-group">
                    <h5>Standard Fields</h5>
                    <label class="checkbox-option">
                      <input type="checkbox" id="include-shot-numbers" checked>
                      Include shot numbers
                    </label>
                    <label class="checkbox-option">
                      <input type="checkbox" id="include-images" checked>
                      Include storyboard images
                    </label>
                    <label class="checkbox-option">
                      <input type="checkbox" id="include-notes" checked>
                      Include notes
                    </label>
                    <label class="checkbox-option">
                      <input type="checkbox" id="include-dialogue" checked>
                      Include dialogue
                    </label>
                    <label class="checkbox-option">
                      <input type="checkbox" id="include-action" checked>
                      Include action
                    </label>
                    <label class="checkbox-option">
                      <input type="checkbox" id="include-timing" checked>
                      Include timing information
                    </label>
                  </div>
                  
                  <div class="option-group">
                    <h5>File Names</h5>
                    <label class="checkbox-option">
                      <input type="checkbox" id="show-filenames">
                      Show file names
                    </label>
                    <div class="sub-options" id="filename-options" style="display: none;">
                      <label class="radio-option">
                        <input type="radio" name="filename-location" value="overlay" checked>
                        Overlay on image (bottom left)
                      </label>
                      <label class="radio-option">
                        <input type="radio" name="filename-location" value="column">
                        Separate column
                      </label>
                    </div>
                  </div>
                  
                  <div class="option-group">
                    <h5>Custom Fields</h5>
                    <div id="custom-fields-list" class="custom-fields-list">
                      <!-- Custom fields will be rendered here -->
                    </div>
                    <button id="add-custom-field-btn" class="btn btn-small">+ Add Custom Field</button>
                  </div>
                </div>
              </div>
              
              <!-- GIFs Tab -->
              <div class="tab-panel" data-panel="gifs">
                <div class="gif-options">
                  <h4>GIF Groups</h4>
                  
                  <label class="checkbox-option">
                    <input type="checkbox" id="include-gifs" checked>
                    Include GIF groups in export
                  </label>
                  
                  <div id="gif-groups-list" class="gif-export-list">
                    <!-- GIF groups will be rendered here -->
                  </div>
                  
                  <div class="gif-settings">
                    <h5>GIF Settings</h5>
                    <div class="form-group">
                      <label>Frame Duration:</label>
                      <input type="range" id="gif-frame-duration" min="100" max="2000" value="500">
                      <span id="gif-duration-value">500ms</span>
                    </div>
                    <div class="form-group">
                      <label>Quality:</label>
                      <select id="gif-quality">
                        <option value="10">High</option>
                        <option value="15" selected>Medium</option>
                        <option value="20">Low</option>
                      </select>
                    </div>
                    <div class="form-group">
                      <label>Max Width:</label>
                      <input type="number" id="gif-max-width" value="400" min="200" max="800">
                      <span>px</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <!-- Settings Tab -->
              <div class="tab-panel" data-panel="settings">
                <div class="export-settings">
                  <h4>Export Settings</h4>
                  
                  <div class="option-group">
                    <h5>Output Options</h5>
                    <div class="form-group">
                      <label>Export Format:</label>
                      <select id="export-format">
                        <option value="pdf">PDF Document</option>
                        <option value="html">HTML Document</option>
                        <option value="images">Individual Images</option>
                        <option value="both">Both PDF and Images</option>
                      </select>
                    </div>
                    <div class="form-group">
                      <label>Filename Template:</label>
                      <input type="text" id="filename-template" value="{project} - Export {date}" placeholder="Use {project}, {date}, {time}">
                    </div>
                  </div>
                  
                  <div class="option-group">
                    <h5>Quality & Performance</h5>
                    <div class="form-group">
                      <label>Image Quality:</label>
                      <select id="image-quality">
                        <option value="high">High (300 DPI)</option>
                        <option value="medium" selected>Medium (150 DPI)</option>
                        <option value="low">Low (72 DPI)</option>
                      </select>
                    </div>
                    <label class="checkbox-option">
                      <input type="checkbox" id="optimize-for-print">
                      Optimize for printing
                    </label>
                    <label class="checkbox-option">
                      <input type="checkbox" id="embed-fonts">
                      Embed fonts in PDF
                    </label>
                  </div>
                  
                  <div class="option-group">
                    <h5>Watermark</h5>
                    <label class="checkbox-option">
                      <input type="checkbox" id="include-watermark">
                      Include watermark
                    </label>
                    <div class="sub-options" id="watermark-options" style="display: none;">
                      <div class="form-group">
                        <label>Watermark Text:</label>
                        <input type="text" id="watermark-text" placeholder="Custom watermark text">
                      </div>
                      <div class="form-group">
                        <label>Opacity:</label>
                        <input type="range" id="watermark-opacity" min="10" max="80" value="30">
                        <span id="watermark-opacity-value">30%</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div class="form-group">
                  <label>Author Name:</label>
                  <input type="text" id="author-name" placeholder="Enter author name for copyright">
                </div>
              </div>
            </div>
          </div>
          
          <div class="dialog-footer">
            <div class="export-progress" id="export-progress" style="display: none;">
              <div class="progress-bar">
                <div class="progress-fill" id="progress-fill"></div>
              </div>
              <div class="progress-text" id="progress-text">Preparing export...</div>
            </div>
            
            <div class="dialog-actions">
              <button id="preview-export-btn" class="btn btn-secondary">Preview</button>
              <button id="export-btn" class="btn btn-primary">Export</button>
              <button id="cancel-export-btn" class="btn btn-tertiary">Cancel</button>
            </div>
          </div>
        </div>
      </div>
    `
  }

  attachEventListeners() {
    // Prevent F12 and other dev tools shortcuts from bubbling up
    this.dialog.addEventListener('keydown', (e) => {
      // Prevent F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U, etc.
      if (e.key === 'F12' || 
          (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) ||
          (e.ctrlKey && e.key === 'u')) {
        e.preventDefault()
        e.stopPropagation()
        return false
      }
    })

    // Prevent right-click context menu
    this.dialog.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      e.stopPropagation()
      return false
    })

    // Tab switching
    this.dialog.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab-button')) {
        this.switchTab(e.target.dataset.tab)
      }
    })

    // Close dialog
    this.dialog.querySelector('#close-export-dialog').addEventListener('click', () => {
      this.close()
    })

    this.dialog.querySelector('#cancel-export-btn').addEventListener('click', () => {
      this.close()
    })

    // Layout controls
    this.dialog.querySelector('#layout-template').addEventListener('change', (e) => {
      this.currentLayout = e.target.value
      this.updateLayoutPreview()
    })

    this.dialog.querySelector('#customize-layout-btn').addEventListener('click', () => {
      this.showLayoutEditor()
    })

    this.dialog.querySelector('#new-layout-btn').addEventListener('click', () => {
      this.createNewLayout()
    })

    // Paper settings
    this.dialog.querySelector('#paper-size').addEventListener('change', () => {
      this.updateLayoutPreview()
    })

    this.dialog.querySelector('#paper-orientation').addEventListener('change', () => {
      this.updateLayoutPreview()
    })

    // Content options
    this.dialog.querySelector('#show-filenames').addEventListener('change', (e) => {
      const options = this.dialog.querySelector('#filename-options')
      options.style.display = e.target.checked ? 'block' : 'none'
    })

    // Custom fields
    this.dialog.querySelector('#add-custom-field-btn').addEventListener('click', () => {
      this.addCustomField()
    })

    // GIF settings
    const gifDurationSlider = this.dialog.querySelector('#gif-frame-duration')
    const gifDurationValue = this.dialog.querySelector('#gif-duration-value')
    
    gifDurationSlider.addEventListener('input', (e) => {
      gifDurationValue.textContent = `${e.target.value}ms`
    })

    // Watermark options
    this.dialog.querySelector('#include-watermark').addEventListener('change', (e) => {
      const options = this.dialog.querySelector('#watermark-options')
      options.style.display = e.target.checked ? 'block' : 'none'
    })

    const watermarkOpacitySlider = this.dialog.querySelector('#watermark-opacity')
    const watermarkOpacityValue = this.dialog.querySelector('#watermark-opacity-value')
    
    watermarkOpacitySlider.addEventListener('input', (e) => {
      watermarkOpacityValue.textContent = `${e.target.value}%`
    })

    // Export actions
    this.dialog.querySelector('#preview-export-btn').addEventListener('click', () => {
      this.previewExport()
    })

    this.dialog.querySelector('#export-btn').addEventListener('click', () => {
      this.startExport()
    })

    // Close on backdrop click
    this.dialog.querySelector('.dialog-overlay').addEventListener('click', (e) => {
      if (e.target.classList.contains('dialog-overlay')) {
        this.close()
      }
    })
  }

  switchTab(tabName) {
    // Update tab buttons
    this.dialog.querySelectorAll('.tab-button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName)
    })

    // Update tab panels
    this.dialog.querySelectorAll('.tab-panel').forEach(panel => {
      panel.classList.toggle('active', panel.dataset.panel === tabName)
    })

    // Handle tab-specific initialization
    if (tabName === 'gifs') {
      this.updateGifGroupsList()
    } else if (tabName === 'content') {
      this.updateCustomFieldsList()
    }
  }

  loadDefaultLayout() {
    this.currentLayout = 'standard'
    this.updateLayoutPreview()
  }

  updateLayoutPreview() {
    const layout = this.layoutManager.getLayout(this.currentLayout)
    if (!layout) return

    const container = this.dialog.querySelector('#layout-preview-container')
    const paperSize = this.dialog.querySelector('#paper-size').value
    const orientation = this.dialog.querySelector('#paper-orientation').value
    
    // Create a simplified preview
    container.innerHTML = `
      <div class="layout-preview-canvas" style="
        display: flex;
        flex-direction: row;
        gap: ${layout.spacing}px;
        padding: 20px;
        background: white;
        border: 1px solid #ddd;
        border-radius: 4px;
        max-width: 100%;
        overflow-x: auto;
      ">
        ${layout.columns.map(column => `
          <div class="preview-column" style="
            width: ${column.width * 0.5}px;
            min-height: 60px;
            background: ${this.getColumnPreviewColor(column.type)};
            border: 1px solid #ccc;
            border-radius: 3px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            text-align: center;
            padding: 4px;
          ">
            <div>
              <strong>${column.label}</strong><br>
              <small>${column.width}px</small>
            </div>
          </div>
        `).join('')}
      </div>
    `
  }

  getColumnPreviewColor(type) {
    const colors = {
      'shot-number': '#e3f2fd',
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

  showLayoutEditor() {
    const container = this.dialog.querySelector('#layout-editor-container')
    const preview = this.dialog.querySelector('.layout-preview')
    
    // Hide preview, show editor
    preview.style.display = 'none'
    container.style.display = 'block'
    
    // Initialize layout editor if not already done
    if (!this.layoutEditor) {
      this.layoutEditor = new LayoutEditor(container, this.layoutManager, {
        onSave: (layout) => {
          this.currentLayout = layout.id
          this.hideLayoutEditor()
          this.updateLayoutTemplateSelect()
          this.updateLayoutPreview()
        },
        onCancel: () => {
          this.hideLayoutEditor()
        }
      })
    }
    
    // Load current layout in editor
    this.layoutEditor.loadLayout(this.currentLayout)
  }

  hideLayoutEditor() {
    const container = this.dialog.querySelector('#layout-editor-container')
    const preview = this.dialog.querySelector('.layout-preview')
    
    container.style.display = 'none'
    preview.style.display = 'block'
  }

  createNewLayout() {
    this.showInputDialog('Enter layout name:', 'Create New Layout', (name) => {
      if (name) {
        const layout = this.layoutManager.createLayout(name)
        this.currentLayout = layout.id
        this.updateLayoutTemplateSelect()
        this.updateLayoutPreview()
      }
    })
  }

  updateLayoutTemplateSelect() {
    const select = this.dialog.querySelector('#layout-template')
    select.innerHTML = Object.entries(this.layoutManager.getLayouts())
      .map(([id, layout]) => `<option value="${id}" ${id === this.currentLayout ? 'selected' : ''}>${layout.name}</option>`)
      .join('')
  }

  updateCustomFieldsList() {
    const container = this.dialog.querySelector('#custom-fields-list')
    const customFields = this.layoutManager.getCustomFields()
    
    container.innerHTML = customFields.map(field => `
      <div class="custom-field-item">
        <div class="field-info">
          <span class="field-name">${field.name}</span>
          <span class="field-type">(${field.type})</span>
        </div>
        <div class="field-controls">
          <label class="checkbox-option">
            <input type="checkbox" class="include-custom-field" data-field-id="${field.id}" checked>
            Include
          </label>
          <button class="btn-remove-field" data-field-id="${field.id}">Remove</button>
        </div>
      </div>
    `).join('')

    // Attach event listeners
    container.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-remove-field')) {
        const fieldId = e.target.dataset.fieldId
        if (confirm('Remove this custom field?')) {
          this.layoutManager.removeCustomField(fieldId)
          this.updateCustomFieldsList()
        }
      }
    })
  }

  addCustomField() {
    this.showInputDialog('Enter field name:', 'Add Custom Field', (name) => {
      if (name) {
        this.showInputDialog('Enter default value (optional):', 'Default Value', (defaultValue) => {
          this.layoutManager.addCustomField(name, defaultValue || '')
          this.updateCustomFieldsList()
        })
      }
    })
  }

  updateGifGroupsList() {
    const container = this.dialog.querySelector('#gif-groups-list')
    const groups = this.layoutManager.getGifGroups()
    
    if (groups.length === 0) {
      container.innerHTML = '<p class="no-groups">No GIF groups created yet.</p>'
      return
    }
    
    container.innerHTML = groups.map(group => `
      <div class="gif-export-item">
        <div class="gif-group-info">
          <div class="group-name" style="border-left: 3px solid ${group.color};">
            ${group.name}
          </div>
          <div class="group-details">
            ${group.boardIndices.length} boards
          </div>
        </div>
        <label class="checkbox-option">
          <input type="checkbox" class="include-gif-group" data-group-id="${group.id}" checked>
          Include
        </label>
      </div>
    `).join('')
  }

  getExportConfiguration() {
    const config = {
      layout: this.layoutManager.getLayout(this.currentLayout),
      paperSize: this.dialog.querySelector('#paper-size').value,
      paperOrientation: this.dialog.querySelector('#paper-orientation').value,
      
      // Content options
      includeFields: {
        shotNumbers: this.dialog.querySelector('#include-shot-numbers').checked,
        images: this.dialog.querySelector('#include-images').checked,
        notes: this.dialog.querySelector('#include-notes').checked,
        dialogue: this.dialog.querySelector('#include-dialogue').checked,
        action: this.dialog.querySelector('#include-action').checked,
        timing: this.dialog.querySelector('#include-timing').checked
      },
      
      // Filename options
      showFilenames: this.dialog.querySelector('#show-filenames').checked,
      filenameLocation: this.dialog.querySelector('input[name="filename-location"]:checked').value,
      
      // Custom fields
      customFields: Array.from(this.dialog.querySelectorAll('.include-custom-field:checked'))
        .map(input => input.dataset.fieldId),
      
      // GIF options
      includeGifs: this.dialog.querySelector('#include-gifs').checked,
      gifGroups: Array.from(this.dialog.querySelectorAll('.include-gif-group:checked'))
        .map(input => input.dataset.groupId),
      gifSettings: {
        frameDuration: parseInt(this.dialog.querySelector('#gif-frame-duration').value),
        quality: parseInt(this.dialog.querySelector('#gif-quality').value),
        maxWidth: parseInt(this.dialog.querySelector('#gif-max-width').value)
      },

      // Video group options
      includeVideos: true, // Always include video groups in export
      videoGroups: this.gifGroupManager ? this.gifGroupManager.videoGroupManager.getAllGroups().map(group => group.id) : [],
      groupData: this.gifGroupManager ? this.gifGroupManager.videoGroupManager.getAllGroups() : [],
      
      // Export settings
      exportFormat: this.dialog.querySelector('#export-format').value,
      filenameTemplate: this.dialog.querySelector('#filename-template').value,
      imageQuality: this.dialog.querySelector('#image-quality').value,
      optimizeForPrint: this.dialog.querySelector('#optimize-for-print').checked,
      embedFonts: this.dialog.querySelector('#embed-fonts').checked,
      
      // Watermark
      includeWatermark: this.dialog.querySelector('#include-watermark').checked,
      watermarkText: this.dialog.querySelector('#watermark-text').value,
      watermarkOpacity: parseInt(this.dialog.querySelector('#watermark-opacity').value),
      
      // Author
      authorName: this.dialog.querySelector('#author-name').value
    }
    
    return config
  }

  async previewExport() {
    const config = this.getExportConfiguration()
    
    // Show a preview dialog with the first page/board
    const previewDialog = document.createElement('div')
    previewDialog.className = 'modal-overlay'
    previewDialog.innerHTML = `
      <div class="modal export-preview-modal">
        <div class="modal-header">
          <h3>Export Preview</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-content">
          <div class="preview-info">
            <p><strong>Layout:</strong> ${config.layout.name}</p>
            <p><strong>Paper:</strong> ${config.paperSize} ${config.paperOrientation}</p>
            <p><strong>Boards:</strong> ${this.boardData.boards.length}</p>
            <p><strong>GIF Groups:</strong> ${config.gifGroups.length}</p>
          </div>
          <div class="preview-canvas">
            <!-- Preview rendering would go here -->
            <p>Preview rendering is not implemented in this demo, but would show the first page of the export.</p>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" id="proceed-export">Looks Good - Export</button>
          <button class="btn btn-secondary modal-cancel">Back to Settings</button>
        </div>
      </div>
    `
    
    document.body.appendChild(previewDialog)
    
    // Event listeners
    previewDialog.querySelector('.modal-close').addEventListener('click', () => {
      document.body.removeChild(previewDialog)
    })
    
    previewDialog.querySelector('.modal-cancel').addEventListener('click', () => {
      document.body.removeChild(previewDialog)
    })
    
    previewDialog.querySelector('#proceed-export').addEventListener('click', () => {
      document.body.removeChild(previewDialog)
      this.startExport()
    })
  }

  async startExport() {
    const config = this.getExportConfiguration()
    const progressContainer = this.dialog.querySelector('#export-progress')
    const progressFill = this.dialog.querySelector('#progress-fill')
    const progressText = this.dialog.querySelector('#progress-text')
    
    // Show progress
    progressContainer.style.display = 'block'
    this.dialog.querySelector('.dialog-actions').style.display = 'none'
    
    try {
      // Step 1: Prepare export
      this.updateProgress(10, 'Preparing export...')
      
      // Step 2: Generate GIFs if needed
      if (config.includeGifs && config.gifGroups.length > 0) {
        this.updateProgress(30, 'Generating GIF groups...')
        await this.generateGifGroups(config.gifGroups, config.gifSettings)
      }
      
      // Step 3: Generate PDF
      this.updateProgress(60, 'Generating PDF...')
      const pdfPath = await this.generateEnhancedPDF(config)
      
      // Step 4: Export images if needed
      if (config.exportFormat === 'images' || config.exportFormat === 'both') {
        this.updateProgress(80, 'Exporting images...')
        await this.generateImages(config)
      }
      
      this.updateProgress(100, 'Export complete!')
      
      // Show success
      setTimeout(() => {
        this.showExportSuccess(pdfPath)
      }, 1000)
      
    } catch (error) {
      console.error('Export error:', error)
      this.showExportError(error.message)
    }
  }

  updateProgress(percent, text) {
    const progressFill = this.dialog.querySelector('#progress-fill')
    const progressText = this.dialog.querySelector('#progress-text')
    
    progressFill.style.width = `${percent}%`
    progressText.textContent = text
  }

  async generateGifGroups(groupIds, settings) {
    // Implementation would use the existing GIF export functionality
    // but enhanced with the new settings
    console.log('Generating GIF groups:', groupIds, settings)
    
    for (const groupId of groupIds) {
      const group = this.layoutManager.getGifGroup(groupId)
      if (group) {
        // Only use the FIRST board in the group for GIF generation
        const firstBoardIndex = group.boardIndices[0]
        const firstBoard = this.boardData.boards[firstBoardIndex]
        
        if (firstBoard) {
          // Generate GIF for this group using only the first board
          // This would integrate with the existing exporter
          console.log('Generating GIF for group using first board:', firstBoardIndex)
        }
      }
    }
  }

  async generateEnhancedPDF(config) {
    // This would be implemented in a separate enhanced PDF exporter
    // that uses the new layout system
    console.log('Generating enhanced PDF with config:', config)
    
    // For now, return a mock path
    return '/path/to/exported.pdf'
  }

  async generateImages(config) {
    // Implementation for individual image export
    console.log('Generating individual images with config:', config)
  }

  showExportSuccess(filePath) {
    const progressContainer = this.dialog.querySelector('#export-progress')
    progressContainer.innerHTML = `
      <div class="export-success">
        <div class="success-icon">✓</div>
        <div class="success-message">
          <h4>Export Complete!</h4>
          <p>Your storyboard has been exported successfully.</p>
          <div class="success-actions">
            <button id="open-export-folder" class="btn btn-primary">Open Folder</button>
            <button id="export-another" class="btn btn-secondary">Export Another</button>
          </div>
        </div>
      </div>
    `
    
    // Event listeners for success actions
    progressContainer.querySelector('#open-export-folder').addEventListener('click', () => {
      // Open the export folder
      const { shell } = require('electron')
      shell.showItemInFolder(filePath)
    })
    
    progressContainer.querySelector('#export-another').addEventListener('click', () => {
      this.resetDialog()
    })
  }

  showExportError(message) {
    const progressContainer = this.dialog.querySelector('#export-progress')
    progressContainer.innerHTML = `
      <div class="export-error">
        <div class="error-icon">✕</div>
        <div class="error-message">
          <h4>Export Failed</h4>
          <p>${message}</p>
          <button id="try-again" class="btn btn-primary">Try Again</button>
        </div>
      </div>
    `
    
    progressContainer.querySelector('#try-again').addEventListener('click', () => {
      this.resetDialog()
    })
  }

  resetDialog() {
    const progressContainer = this.dialog.querySelector('#export-progress')
    const actions = this.dialog.querySelector('.dialog-actions')
    
    progressContainer.style.display = 'none'
    actions.style.display = 'flex'
    
    this.updateProgress(0, 'Preparing export...')
  }

  close() {
    if (this.layoutEditor) {
      this.layoutEditor.destroy()
    }
    
    this.dialog.remove()
    
    // Emit close event if needed
    if (this.options.onClose) {
      this.options.onClose()
    }
  }

  // Static method to show the dialog
  static show(boardData, boardFilename, options = {}) {
    return new EnhancedExportDialog(boardData, boardFilename, options)
  }
}

module.exports = EnhancedExportDialog