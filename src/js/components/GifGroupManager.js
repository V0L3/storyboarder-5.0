// GIF Group Manager Component
// Handles grouping of boards for animated GIF creation

class GifGroupManager {
  constructor(layoutManager, boardData, options = {}) {
    this.layoutManager = layoutManager
    this.boardData = boardData
    this.options = options
    
    this.selectedBoards = new Set()
    this.isGroupingMode = false
    
    this.init()
  }

  init() {
    this.setupKeyboardShortcuts()
    this.injectGroupingUI()
    this.updateTimelineDisplay()
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl+G or Cmd+G to create GIF group
      if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
        e.preventDefault()
        this.createGroupFromSelection()
      }
      
      // Escape to cancel grouping mode
      if (e.key === 'Escape' && this.isGroupingMode) {
        this.cancelGroupingMode()
      }
    })
  }

  injectGroupingUI() {
    // Add group button to toolbar if it doesn't exist
    const toolbar = document.querySelector('#toolbar')
    if (toolbar && !document.querySelector('#gif-group-btn')) {
      const groupButton = document.createElement('div')
      groupButton.id = 'gif-group-btn'
      groupButton.className = 'toolbar-button'
      groupButton.innerHTML = `
        <div class="toolbar-button-icon" title="Create GIF Group (Ctrl+G)">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
            <path d="M14 14l2-2"/>
          </svg>
        </div>
      `
      
      groupButton.addEventListener('click', () => {
        this.toggleGroupingMode()
      })
      
      toolbar.appendChild(groupButton)
    }

    // Add group management panel
    this.createGroupManagementPanel()
  }

  createGroupManagementPanel() {
    const panel = document.createElement('div')
    panel.id = 'gif-group-panel'
    panel.className = 'gif-group-panel'
    panel.innerHTML = `
      <div class="gif-group-header">
        <h3>GIF Groups</h3>
        <button id="toggle-group-panel" class="btn-toggle">▼</button>
      </div>
      <div class="gif-group-content">
        <div class="group-controls">
          <button id="new-group-btn" class="btn btn-small">+ New Group</button>
          <button id="export-all-gifs-btn" class="btn btn-small">Export All GIFs</button>
        </div>
        <div id="gif-groups-list" class="gif-groups-list">
          <!-- Groups will be rendered here -->
        </div>
      </div>
    `

    // Insert panel into the UI (adjust selector based on your layout)
    const sidebar = document.querySelector('#board-metadata') || document.body
    sidebar.appendChild(panel)

    this.attachPanelEventListeners()
  }

  attachPanelEventListeners() {
    const panel = document.querySelector('#gif-group-panel')
    
    // Toggle panel visibility
    panel.querySelector('#toggle-group-panel').addEventListener('click', (e) => {
      const content = panel.querySelector('.gif-group-content')
      const isVisible = content.style.display !== 'none'
      
      content.style.display = isVisible ? 'none' : 'block'
      e.target.textContent = isVisible ? '▶' : '▼'
    })

    // New group button
    panel.querySelector('#new-group-btn').addEventListener('click', () => {
      this.showNewGroupDialog()
    })

    // Export all GIFs button
    panel.querySelector('#export-all-gifs-btn').addEventListener('click', () => {
      this.exportAllGifs()
    })
  }

  toggleGroupingMode() {
    this.isGroupingMode = !this.isGroupingMode
    
    const button = document.querySelector('#gif-group-btn')
    if (button) {
      button.classList.toggle('active', this.isGroupingMode)
    }

    if (this.isGroupingMode) {
      this.enterGroupingMode()
    } else {
      this.exitGroupingMode()
    }
  }

  enterGroupingMode() {
    // Add visual indicators for grouping mode
    document.body.classList.add('gif-grouping-mode')
    
    // Show instructions
    this.showGroupingInstructions()
    
    // Enable board selection
    this.enableBoardSelection()
  }

  exitGroupingMode() {
    document.body.classList.remove('gif-grouping-mode')
    this.selectedBoards.clear()
    this.updateBoardSelectionDisplay()
    this.hideGroupingInstructions()
  }

  cancelGroupingMode() {
    this.isGroupingMode = false
    this.exitGroupingMode()
    
    const button = document.querySelector('#gif-group-btn')
    if (button) {
      button.classList.remove('active')
    }
  }

  enableBoardSelection() {
    const thumbnails = document.querySelectorAll('.thumbnail')
    
    thumbnails.forEach((thumbnail, index) => {
      const clickHandler = (e) => {
        e.preventDefault()
        e.stopPropagation()
        
        if (this.selectedBoards.has(index)) {
          this.selectedBoards.delete(index)
        } else {
          this.selectedBoards.add(index)
        }
        
        this.updateBoardSelectionDisplay()
      }
      
      thumbnail.addEventListener('click', clickHandler)
      thumbnail.dataset.gifGroupClickHandler = 'true'
    })
  }

  updateBoardSelectionDisplay() {
    const thumbnails = document.querySelectorAll('.thumbnail')
    
    thumbnails.forEach((thumbnail, index) => {
      const isSelected = this.selectedBoards.has(index)
      thumbnail.classList.toggle('gif-selected', isSelected)
      
      // Add selection indicator
      let indicator = thumbnail.querySelector('.gif-selection-indicator')
      if (isSelected && !indicator) {
        indicator = document.createElement('div')
        indicator.className = 'gif-selection-indicator'
        indicator.innerHTML = '✓'
        thumbnail.appendChild(indicator)
      } else if (!isSelected && indicator) {
        indicator.remove()
      }
    })
  }

  showGroupingInstructions() {
    const instructions = document.createElement('div')
    instructions.id = 'gif-grouping-instructions'
    instructions.className = 'gif-grouping-instructions'
    instructions.innerHTML = `
      <div class="instructions-content">
        <span>Select boards to group into GIF</span>
        <button id="create-group-btn" class="btn btn-primary">Create Group</button>
        <button id="cancel-grouping-btn" class="btn btn-secondary">Cancel</button>
      </div>
    `

    document.body.appendChild(instructions)

    // Event listeners
    instructions.querySelector('#create-group-btn').addEventListener('click', () => {
      this.createGroupFromSelection()
    })

    instructions.querySelector('#cancel-grouping-btn').addEventListener('click', () => {
      this.cancelGroupingMode()
    })
  }

  hideGroupingInstructions() {
    const instructions = document.querySelector('#gif-grouping-instructions')
    if (instructions) {
      instructions.remove()
    }
  }

  createGroupFromSelection() {
    if (this.selectedBoards.size < 2) {
      alert('Please select at least 2 boards to create a group.')
      return
    }

    const boardIndices = Array.from(this.selectedBoards).sort((a, b) => a - b)
    const name = prompt('Enter group name:', `Group ${this.layoutManager.getGifGroups().length + 1}`)
    
    if (name) {
      const groupId = this.layoutManager.createGifGroup(name, boardIndices)
      this.updateTimelineDisplay()
      this.updateGroupsList()
      this.exitGroupingMode()
      
      // Show success message
      this.showNotification(`Created GIF group "${name}" with ${boardIndices.length} boards`)
    }
  }

  showNewGroupDialog() {
    const dialog = document.createElement('div')
    dialog.className = 'modal-overlay'
    dialog.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>Create GIF Group</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-content">
          <div class="form-group">
            <label>Group Name:</label>
            <input type="text" id="group-name" placeholder="Enter group name">
          </div>
          <div class="form-group">
            <label>Select Boards:</label>
            <div class="board-selector">
              ${this.boardData.boards.map((board, index) => `
                <label class="board-option">
                  <input type="checkbox" value="${index}">
                  <span>Board ${index + 1}</span>
                  ${board.dialogue ? `<small>"${board.dialogue.substring(0, 30)}..."</small>` : ''}
                </label>
              `).join('')}
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button id="create-group-confirm" class="btn btn-primary">Create Group</button>
          <button class="modal-cancel btn btn-secondary">Cancel</button>
        </div>
      </div>
    `

    document.body.appendChild(dialog)

    // Handle dialog actions
    dialog.querySelector('.modal-close').addEventListener('click', () => {
      document.body.removeChild(dialog)
    })

    dialog.querySelector('.modal-cancel').addEventListener('click', () => {
      document.body.removeChild(dialog)
    })

    dialog.querySelector('#create-group-confirm').addEventListener('click', () => {
      const name = dialog.querySelector('#group-name').value
      const selectedBoards = Array.from(dialog.querySelectorAll('.board-option input:checked'))
        .map(input => parseInt(input.value))

      if (!name || selectedBoards.length < 2) {
        alert('Please enter a name and select at least 2 boards.')
        return
      }

      const groupId = this.layoutManager.createGifGroup(name, selectedBoards)
      this.updateTimelineDisplay()
      this.updateGroupsList()
      document.body.removeChild(dialog)
      
      this.showNotification(`Created GIF group "${name}" with ${selectedBoards.length} boards`)
    })

    // Close on backdrop click
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        document.body.removeChild(dialog)
      }
    })
  }

  updateTimelineDisplay() {
    const thumbnails = document.querySelectorAll('.thumbnail')
    
    // Clear existing group indicators
    thumbnails.forEach(thumbnail => {
      const indicator = thumbnail.querySelector('.gif-group-indicator')
      if (indicator) indicator.remove()
      thumbnail.classList.remove('gif-grouped')
    })

    // Add group indicators
    this.layoutManager.getGifGroups().forEach(group => {
      group.boardIndices.forEach(boardIndex => {
        const thumbnail = thumbnails[boardIndex]
        if (thumbnail) {
          thumbnail.classList.add('gif-grouped')
          
          // Add group indicator
          const indicator = document.createElement('div')
          indicator.className = 'gif-group-indicator'
          indicator.style.backgroundColor = group.color
          indicator.innerHTML = '🔗'
          indicator.title = `Part of GIF group: ${group.name}`
          
          thumbnail.appendChild(indicator)
        }
      })
    })
  }

  updateGroupsList() {
    const container = document.querySelector('#gif-groups-list')
    if (!container) return

    const groups = this.layoutManager.getGifGroups()
    
    container.innerHTML = groups.map(group => `
      <div class="gif-group-item" data-group-id="${group.id}">
        <div class="group-info">
          <div class="group-name" style="border-left: 3px solid ${group.color};">
            ${group.name}
          </div>
          <div class="group-stats">
            ${group.boardIndices.length} boards
          </div>
        </div>
        <div class="group-actions">
          <button class="btn-preview" data-group-id="${group.id}" title="Preview GIF">👁</button>
          <button class="btn-export" data-group-id="${group.id}" title="Export GIF">💾</button>
          <button class="btn-edit" data-group-id="${group.id}" title="Edit Group">✎</button>
          <button class="btn-delete" data-group-id="${group.id}" title="Delete Group">🗑</button>
        </div>
      </div>
    `).join('')

    // Attach event listeners
    container.addEventListener('click', (e) => {
      const groupId = e.target.dataset.groupId
      if (!groupId) return

      if (e.target.classList.contains('btn-preview')) {
        this.previewGifGroup(groupId)
      } else if (e.target.classList.contains('btn-export')) {
        this.exportGifGroup(groupId)
      } else if (e.target.classList.contains('btn-edit')) {
        this.editGifGroup(groupId)
      } else if (e.target.classList.contains('btn-delete')) {
        this.deleteGifGroup(groupId)
      }
    })
  }

  async exportGifGroup(groupId) {
    const group = this.layoutManager.getGifGroup(groupId)
    if (!group) return

    try {
      // Show progress indicator
      this.showNotification(`Exporting GIF: ${group.name}...`)
      
      // Get the boards for this group
      const groupBoards = group.boardIndices.map(index => this.boardData.boards[index])
      
      // Use the existing exporter system
      const exporter = require('../window/exporter')
      const boardModel = require('../models/board')
      
      const boardSize = boardModel.boardFileImageSize(this.boardData)
      const outputPath = await exporter.exportAnimatedGif(
        groupBoards,
        boardSize,
        400, // destWidth
        this.boardFilename, // projectFileAbsolutePath
        false, // mark (watermark)
        this.boardData
      )
      
      this.showNotification(`GIF exported: ${outputPath}`)
      
    } catch (error) {
      console.error('Error exporting GIF:', error)
      this.showNotification(`Error exporting GIF: ${error.message}`)
    }
  }

  async exportAllGifs() {
    const groups = this.layoutManager.getGifGroups()
    if (groups.length === 0) {
      alert('No GIF groups to export.')
      return
    }

    for (const group of groups) {
      await this.exportGifGroup(group.id)
      // Small delay between exports
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  previewGifGroup(groupId) {
    const group = this.layoutManager.getGifGroup(groupId)
    if (!group) return

    // Create preview dialog
    const dialog = document.createElement('div')
    dialog.className = 'modal-overlay'
    dialog.innerHTML = `
      <div class="modal gif-preview-modal">
        <div class="modal-header">
          <h3>GIF Preview: ${group.name}</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-content">
          <div class="gif-preview-container">
            <div class="preview-boards">
              ${group.boardIndices.map(index => `
                <div class="preview-board">
                  <img src="path/to/board-${index}-thumbnail.jpg" alt="Board ${index + 1}">
                  <div class="board-number">Board ${index + 1}</div>
                </div>
              `).join('')}
            </div>
            <div class="preview-settings">
              <label>
                Frame Duration:
                <input type="range" id="frame-duration" min="100" max="2000" value="500">
                <span id="duration-value">500ms</span>
              </label>
              <label>
                Quality:
                <select id="gif-quality">
                  <option value="10">High</option>
                  <option value="15" selected>Medium</option>
                  <option value="20">Low</option>
                </select>
              </label>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button id="export-gif-btn" class="btn btn-primary">Export GIF</button>
          <button class="modal-cancel btn btn-secondary">Close</button>
        </div>
      </div>
    `

    document.body.appendChild(dialog)

    // Event listeners
    dialog.querySelector('.modal-close').addEventListener('click', () => {
      document.body.removeChild(dialog)
    })

    dialog.querySelector('.modal-cancel').addEventListener('click', () => {
      document.body.removeChild(dialog)
    })

    dialog.querySelector('#export-gif-btn').addEventListener('click', () => {
      this.exportGifGroup(groupId)
      document.body.removeChild(dialog)
    })

    // Update duration display
    const durationSlider = dialog.querySelector('#frame-duration')
    const durationValue = dialog.querySelector('#duration-value')
    
    durationSlider.addEventListener('input', (e) => {
      durationValue.textContent = `${e.target.value}ms`
    })
  }

  editGifGroup(groupId) {
    // Similar to showNewGroupDialog but with existing data
    const group = this.layoutManager.getGifGroup(groupId)
    if (!group) return

    const dialog = document.createElement('div')
    dialog.className = 'modal-overlay'
    dialog.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>Edit GIF Group</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-content">
          <div class="form-group">
            <label>Group Name:</label>
            <input type="text" id="group-name" value="${group.name}">
          </div>
          <div class="form-group">
            <label>Group Color:</label>
            <input type="color" id="group-color" value="${group.color}">
          </div>
          <div class="form-group">
            <label>Select Boards:</label>
            <div class="board-selector">
              ${this.boardData.boards.map((board, index) => `
                <label class="board-option">
                  <input type="checkbox" value="${index}" ${group.boardIndices.includes(index) ? 'checked' : ''}>
                  <span>Board ${index + 1}</span>
                  ${board.dialogue ? `<small>"${board.dialogue.substring(0, 30)}..."</small>` : ''}
                </label>
              `).join('')}
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button id="save-group-btn" class="btn btn-primary">Save Changes</button>
          <button class="modal-cancel btn btn-secondary">Cancel</button>
        </div>
      </div>
    `

    document.body.appendChild(dialog)

    // Handle save
    dialog.querySelector('#save-group-btn').addEventListener('click', () => {
      const name = dialog.querySelector('#group-name').value
      const color = dialog.querySelector('#group-color').value
      const selectedBoards = Array.from(dialog.querySelectorAll('.board-option input:checked'))
        .map(input => parseInt(input.value))

      if (!name || selectedBoards.length < 2) {
        alert('Please enter a name and select at least 2 boards.')
        return
      }

      // Update group
      group.name = name
      group.color = color
      group.boardIndices = selectedBoards

      this.updateTimelineDisplay()
      this.updateGroupsList()
      document.body.removeChild(dialog)
      
      this.showNotification(`Updated GIF group "${name}"`)
    })

    // Handle close
    dialog.querySelector('.modal-close').addEventListener('click', () => {
      document.body.removeChild(dialog)
    })

    dialog.querySelector('.modal-cancel').addEventListener('click', () => {
      document.body.removeChild(dialog)
    })
  }

  deleteGifGroup(groupId) {
    const group = this.layoutManager.getGifGroup(groupId)
    if (!group) return

    if (confirm(`Delete GIF group "${group.name}"?`)) {
      this.layoutManager.deleteGifGroup(groupId)
      this.updateTimelineDisplay()
      this.updateGroupsList()
      this.showNotification(`Deleted GIF group "${group.name}"`)
    }
  }

  showNotification(message) {
    // Use existing notification system if available
    if (window.notifications && window.notifications.notify) {
      window.notifications.notify({ message, timing: 5 })
    } else {
      // Fallback to alert
      console.log('GIF Group Manager:', message)
    }
  }

  destroy() {
    // Cleanup
    document.removeEventListener('keydown', this.handleKeydown)
    
    const panel = document.querySelector('#gif-group-panel')
    if (panel) panel.remove()
    
    const button = document.querySelector('#gif-group-btn')
    if (button) button.remove()
    
    const instructions = document.querySelector('#gif-grouping-instructions')
    if (instructions) instructions.remove()
  }
}

module.exports = GifGroupManager