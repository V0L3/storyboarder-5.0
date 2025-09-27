// Enhanced GIF Group Manager Component
// Provides a modern, user-friendly interface for grouping boards into video files

const VideoGroupManager = require('./VideoGroupManager')

class EnhancedGifGroupManager {
  constructor(layoutManager, boardData, options = {}) {
    this.layoutManager = layoutManager
    this.boardData = boardData
    this.options = options
    this.isGroupingMode = false
    this.selectedBoards = new Set()
    this.videoGroupManager = new VideoGroupManager(options.projectPath, boardData)
    this.groupColors = [
      '#3b82f6', '#ef4444', '#10b981', '#f59e0b', 
      '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'
    ]
    this.currentColorIndex = 0
    
      // Global settings
      this.globalFps = 5
      this.globalDuration = 2.0
      this.autoLoop = true
    this.connectGroups = true

    // Preview system
    this.currentPreviewAnimation = null
    this.previewFrames = null
    this.currentPreviewFrameIndex = 0
    this.isPreviewRunning = false
    this.previewGenerationInProgress = false
    this.tempGifPath = null

    // UI update tracking to prevent blinking
    this.isUpdatingUI = false
    this.pendingUIUpdates = []
    this.batchUpdateTimeout = null

    // Performance optimization variables
    this.selectionSyncTimeout = null
    this.timelineUpdateTimeout = null
    this.autoCreateTimeout = null
    this.groupOperationTimeout = null
    this.lastSelectionUpdate = 0
    this.lastDisplayedCount = -1
    this.pendingTimelineUpdate = false
    this.lastGroupUpdate = 0
    this.lastBoardOperation = 0
    this.groupUpdateThrottle = 1000 // 1 second throttle for group operations

    this.init()
    
    // Make it globally accessible for debugging
    if (typeof window !== 'undefined') {
      window.enhancedGifGroupManager = this
      console.log(`[EnhancedGifGroupManager] Available globally as window.enhancedGifGroupManager`)
      
      // Add a simple test function to the window for debugging
      window.testGifPreview = () => {
        console.log(`[EnhancedGifGroupManager] Testing GIF preview...`)
        this.previewGroups()
      }
      
      // Add a function to show the UI for testing
      window.showGifUI = () => {
        console.log(`[EnhancedGifGroupManager] Showing GIF UI for testing...`)
        const toolbar = document.getElementById('gif-grouping-toolbar')
        if (toolbar) {
          toolbar.style.display = 'flex'
          console.log(`[EnhancedGifGroupManager] UI shown`)
        } else {
          console.error(`[EnhancedGifGroupManager] UI not found`)
        }
      }
      
      console.log(`[EnhancedGifGroupManager] Test functions available:`)
      console.log(`  - window.testGifPreview()`)
      console.log(`  - window.showGifUI()`)
    }
  }

  // Helper method to get current scene ID for undo operations
  getCurrentSceneId() {
    if (typeof window !== 'undefined' && window.getSceneObjectByIndex && typeof window.currentScene !== 'undefined') {
      const scene = window.getSceneObjectByIndex(window.currentScene)
      return scene && scene.scene_id
    }
    return null
  }

  // Store undo state using the main undo system
  storeUndoState() {
    // Use the main undo system to store the current board data with GIF groups
    if (typeof window !== 'undefined' && window.storeUndoStateForScene) {
      // Store the current state before the operation
      window.storeUndoStateForScene(true)
      console.log('[EnhancedGifGroupManager] Stored undo state via main system')
    } else {
      console.warn('[EnhancedGifGroupManager] Main undo system not available')
    }
  }

  // Method to restore GIF group state from undo/redo
  restoreGroupState(state) {
    console.log('[EnhancedGifGroupManager] Restoring group state:', state)
    if (state && state.gifGroupsState) {
      console.log('[EnhancedGifGroupManager] Found gifGroupsState, restoring...')
      this.videoGroupManager.restoreFromState(state.gifGroupsState)
      this.updateGroupsList()
      this.updateTimelineDisplay()
      
      // Trigger main UI refresh
      if (typeof window !== 'undefined' && window.renderThumbnailDrawer) {
        window.renderThumbnailDrawer()
      }
    } else {
      console.log('[EnhancedGifGroupManager] No gifGroupsState found in restore data')
    }
  }

  // Undo is now handled by the main undo system

  // Remove board from all groups and clean up empty groups
  removeBoardFromGroups(boardIndex) {
    try {
      console.log(`[EnhancedGifGroupManager] Removing board ${boardIndex} from all groups`)
      
      // Safety check
      if (!this.videoGroupManager || !this.videoGroupManager.getAllGroups) {
        console.warn('[EnhancedGifGroupManager] VideoGroupManager not available')
        return
      }
      
      // Get the board UID before deletion
      const boardUid = this.videoGroupManager.getBoardUidsFromIndices([boardIndex])[0]
      
      // Get current groups
      const groups = this.videoGroupManager.getAllGroups()
      
      // Remove board from all groups using UID-based removal
      groups.forEach(group => {
        if (group.boardUids && group.boardUids.includes(boardUid)) {
          // Remove the UID from the group
          group.boardUids = group.boardUids.filter(uid => uid !== boardUid)
          
          // Remove the corresponding boardId
          const boardIdIndex = group.boardIds.indexOf(boardIndex)
          if (boardIdIndex !== -1) {
            group.boardIds.splice(boardIdIndex, 1)
          }
          
          // Adjust indices for boards that come after the deleted board
          group.boardIds = group.boardIds.map(idx => 
            idx > boardIndex ? idx - 1 : idx
          )
        }
      })
      
      // Remove empty groups
      const nonEmptyGroups = groups.filter(group => 
        group.boardIds && group.boardIds.length > 0 && 
        group.boardUids && group.boardUids.length > 0
      )
      
      // Update the groups by clearing and re-adding non-empty groups
      if (this.videoGroupManager.groups && this.videoGroupManager.groups.clear) {
        this.videoGroupManager.groups.clear()
        nonEmptyGroups.forEach(group => {
          this.videoGroupManager.groups.set(group.id, group)
        })
      }
      
      // Save to storage
      if (this.videoGroupManager.saveGroupsToStorage) {
        this.videoGroupManager.saveGroupsToStorage()
      }
      
      // Update UI
      this.updateGroupsList()
      this.updateTimelineDisplay()
      
      console.log(`[EnhancedGifGroupManager] Cleaned up groups after board deletion`)
    } catch (error) {
      console.error('[EnhancedGifGroupManager] Error removing board from groups:', error)
    }
  }

  init() {
    this.createGroupingUI()
    this.attachEventListeners()
    
    // Initialize groups from storage
    this.videoGroupManager.initializeGroups()
    
    // Set up undo/redo listeners
    this.setupUndoRedoListeners()
    
    // Auto-group boards by shot number only if no groups are loaded from project file
    setTimeout(() => {
      // Only auto-group if no groups exist (i.e., new project)
      if (this.videoGroupManager.groups.size === 0) {
        console.log('[EnhancedGifGroupManager] No groups loaded, auto-grouping by shot number')
        this.videoGroupManager.autoGroupByShotNumber()
        this.videoGroupManager.updateGroupNamesFromShotNumbers()
      } else {
        console.log('[EnhancedGifGroupManager] Groups already loaded from project file, skipping auto-grouping')
        // Still update group names in case shot numbers changed
        this.videoGroupManager.updateGroupNamesFromShotNumbers()
      }
      this.updateGroupsList()
      this.updateTimelineDisplay()
    }, 1000) // Delay to ensure board data is loaded
  }

  // Set up undo/redo event listeners
  setupUndoRedoListeners() {
    const undoStack = require('../undo-stack')
    
    // Listen for undo/redo events
    undoStack.on('undo', (state) => {
      if (state && state.type === 'scene' && state.sceneData) {
        this.restoreGroupState(state.sceneData)
      }
    })
    
    undoStack.on('redo', (state) => {
      if (state && state.type === 'scene' && state.sceneData) {
        this.restoreGroupState(state.sceneData)
      }
    })
  }

  addSliderStyles() {
    // Check if styles already added
    if (document.getElementById('timing-slider-styles')) return
    
    const style = document.createElement('style')
    style.id = 'timing-slider-styles'
    style.textContent = `
      .timing-slider {
        -webkit-appearance: none;
        appearance: none;
        height: 12px; /* click area */
        background: transparent;
        outline: none;
        cursor: pointer;
        padding: 0;
        margin: 0;
        vertical-align: middle;
      }
      .timing-slider::-webkit-slider-runnable-track {
        height: 3px;
        background: #e5e7eb;
        border-radius: 2px;
      }
      .timing-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 12px;
        height: 12px;
        background: #3b82f6;
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        border: none;
        margin-top: -4.5px; /* center on 3px track */
      }
      /* Firefox */
      .timing-slider::-moz-range-track {
        height: 3px;
        background: #e5e7eb;
        border-radius: 2px;
      }
      .timing-slider::-moz-range-thumb {
        width: 12px;
        height: 12px;
        background: #3b82f6;
        border-radius: 50%;
        cursor: pointer;
        border: none;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      }
      .timing-slider:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .timing-slider:disabled::-webkit-slider-thumb {
        cursor: not-allowed;
      }
      .timing-slider:disabled::-moz-range-thumb {
        cursor: not-allowed;
      }
    `
    document.head.appendChild(style)
  }

  createGroupingUI() {
    // Add CSS for slider styling
    this.addSliderStyles()
    
    // Create grouping toolbar
    const toolbar = document.createElement('div')
    toolbar.id = 'gif-grouping-toolbar'
    toolbar.style.cssText = `
      position: fixed;
        top: 60px;
        bottom: 16px;
        right: 20px;
        z-index: 1000;
        background: #2c2c2e;
        border: 1px solid #3a3a3c;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        padding: 20px;
      width: 320px;
      display: none;
      flex-direction: column;
    `

    // Prevent dev tools from opening
    toolbar.addEventListener('keydown', (e) => {
      // Prevent F12, Ctrl+Shift+I, Ctrl+U, etc.
      if (e.key === 'F12' || 
          (e.ctrlKey && e.shiftKey && e.key === 'I') ||
          (e.ctrlKey && e.key === 'u') ||
          (e.ctrlKey && e.key === 'U')) {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        return false
      }
    })
    
      toolbar.innerHTML = `
       <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid #3a3a3c;">
         <div style="display: flex; align-items: center; gap: 12px;">
           <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: #ffffff; letter-spacing: -0.01em;">GIF Groups</h3>
           <div id="grouping-status" style="
             font-size: 10px; color: #8e8e93; background: #3a3a3c;
             padding: 3px 8px; border-radius: 4px; font-weight: 500;
           ">Ready</div>
         </div>
         <button id="close-grouping" style="
           background: transparent; border: none; 
           font-size: 16px; color: #8e8e93; cursor: pointer; padding: 4px; 
           border-radius: 4px; transition: all 0.2s ease;
           width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;
         " title="Close (Esc)" onmouseover="this.style.background='#3a3a3c'; this.style.color='#ffffff'" onmouseout="this.style.background='transparent'; this.style.color='#8e8e93'">×</button>
       </div>
      
       <div style="margin-bottom: 12px;">
         <div style="font-size: 11px; color: #8e8e93; text-align: center;">
           <span id="selection-count">0 boards selected</span>
         </div>
       </div>
       
       <div id="groups-section" style="margin-bottom: 0; display: flex; flex-direction: column; min-height: 0; flex: 1 1 0;">
         <div id="groups-list" style="
           flex: 1 1 0; min-height: 0;
           background: #1c1c1e; 
           border-radius: 8px; 
           padding: 8px;
           border: 1px solid #3a3a3c;
           display: flex; flex-direction: column; overflow: hidden;
         ">
          <div id="groups-scroll" style="
            flex: 1 1 0; min-height: 0; overflow-y: auto; overscroll-behavior: contain;
            display: flex; flex-direction: column; padding-right: 2px;
          "></div>
          <div style="display:flex; justify-content:center; padding: 10px 4px 4px;">
            <button id="add-group-btn" title="Create Group from Selection" style="
              min-width: 44px; height: 28px; padding: 0 12px; border-radius: 6px; border: 1px solid #48484a; cursor: pointer;
              background: #3a3a3c; color: #ffffff; font-size: 16px; line-height: 0; 
              font-weight: 500; transition: all 0.2s ease;
            " onmouseover="this.style.background='#48484a'" onmouseout="this.style.background='#3a3a3c'">+</button>
          </div>
        </div>
      </div>
      
       <div id="grouping-actions" style="margin-top: auto; padding-top: 16px; border-top: 1px solid #3a3a3c;">
         <div style="display: flex; gap: 8px;">
           <button id="preview-groups" class="group-btn secondary" style="
             background: #3a3a3c; color: #ffffff; border: 1px solid #48484a; 
             padding: 10px 16px; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer;
             flex: 1; transition: all 0.2s ease;
           " onmouseover="this.style.background='#48484a'" onmouseout="this.style.background='#3a3a3c'">Preview</button>
           <button id="export-groups" class="group-btn primary" style="
             background: #007aff; color: white; border: none; 
             padding: 10px 16px; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer;
             flex: 1; transition: all 0.2s ease;
           " onmouseover="this.style.background='#0056b3'" onmouseout="this.style.background='#007aff'">Export All</button>
         </div>
       </div>
    `
    
    document.body.appendChild(toolbar)
  }

  attachEventListeners() {
    // Close grouping toolbar
    document.getElementById('close-grouping').addEventListener('click', () => {
      this.hideGroupingUI()
    })

    // Add group button
    const addGroupBtn = document.getElementById('add-group-btn')
    if (addGroupBtn) {
      addGroupBtn.addEventListener('click', () => {
        this.createGroupFromSelection()
      })
    }
    
    // Preview groups
    document.getElementById('preview-groups').addEventListener('click', () => {
      this.previewGroups()
    })
    
    // Export all groups
    document.getElementById('export-groups').addEventListener('click', () => {
      this.exportAllGroups()
    })

    // Add advanced settings toggle
    const advancedToggle = document.getElementById('toggle-advanced')
    if (advancedToggle) {
      advancedToggle.addEventListener('click', () => {
        const panel = document.getElementById('advanced-settings-panel')
        if (panel) {
          const isVisible = panel.style.display !== 'none'
          panel.style.display = isVisible ? 'none' : 'block'
          advancedToggle.textContent = isVisible ? '⚙️ Settings' : '⚙️ Hide'
        }
      })
    }

    // Add global settings handlers
    const globalFps = document.getElementById('global-fps')
    const globalDuration = document.getElementById('global-duration')
    const autoLoop = document.getElementById('auto-loop')
    const connectGroups = document.getElementById('connect-groups')

        if (globalFps) {
          globalFps.addEventListener('change', (e) => {
            this.globalFps = parseInt(e.target.value) || 5
            this.showNotification(`Global FPS set to ${this.globalFps}`, 'info')
          })
        }

    if (globalDuration) {
      globalDuration.addEventListener('change', (e) => {
        this.globalDuration = parseFloat(e.target.value) || 2.0
        this.showNotification(`Global duration set to ${this.globalDuration}s`, 'info')
      })
    }

    if (autoLoop) {
      autoLoop.addEventListener('change', (e) => {
        this.autoLoop = e.target.checked
        this.showNotification(`Auto loop ${this.autoLoop ? 'enabled' : 'disabled'}`, 'info')
      })
    }

    if (connectGroups) {
      connectGroups.addEventListener('change', (e) => {
        this.connectGroups = e.target.checked
        this.showNotification(`Group connection ${this.connectGroups ? 'enabled' : 'disabled'}`, 'info')
      })
    }
    
    
    // Escape key to exit grouping mode (handled here since it's grouping-specific)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isGroupingMode) {
        e.preventDefault()
        this.toggleGroupingMode()
      }
    })
  }

  toggleGroupingMode() {
    this.isGroupingMode = !this.isGroupingMode
    
    if (this.isGroupingMode) {
      // Mark that user has manually opened the grouping menu
      localStorage.setItem('storyboarder_has_manually_opened_grouping_menu', 'true')
      // Sync with current selections when entering grouping mode
      this.syncWithMainSelections()
      this.startGroupingMode()
    } else {
      this.stopGroupingMode()
    }
  }

  startGroupingMode() {
    const toolbar = document.getElementById('gif-grouping-toolbar')
    const statusElement = document.getElementById('grouping-status')

    toolbar.style.display = 'flex'
    // Removed stop grouping button; status only

      if (statusElement) {
        statusElement.textContent = 'Active'
        statusElement.style.background = '#3a3a3c'
        statusElement.style.color = '#ffffff'
      }

    // Add grouping mode class to timeline
    const timeline = document.querySelector('#timeline')
    if (timeline) {
      timeline.classList.add('gif-grouping-mode')
    }

    // Sync with current selections instead of clearing
    this.syncWithMainSelections()

    // Set up periodic sync with main selections (optimized frequency)
    this.selectionSyncInterval = setInterval(() => {
      this.syncWithMainSelections()
    }, 1500) // Sync every 1.5 seconds for even better performance

    // Listen for board selection changes to fix glitches
    document.addEventListener('boardSelectionChanged', () => {
      this.onBoardSelectionChanged()
    })

    // Show notification
    this.showNotification('GIF Grouping Mode Active - Select 2+ boards to create groups', 'info')
  }

  stopGroupingMode() {
    const toolbar = document.getElementById('gif-grouping-toolbar')
    const statusElement = document.getElementById('grouping-status')

    toolbar.style.display = 'none'
    // No start button to reset

      if (statusElement) {
        statusElement.textContent = 'Ready'
        statusElement.style.background = '#3a3a3c'
        statusElement.style.color = '#8e8e93'
      }

    // Remove grouping mode class from timeline
    const timeline = document.querySelector('#timeline')
    if (timeline) {
      timeline.classList.remove('gif-grouping-mode')
    }

    // Clear selection sync interval
    if (this.selectionSyncInterval) {
      clearInterval(this.selectionSyncInterval)
      this.selectionSyncInterval = null
    }

    // Clear selection
    this.selectedBoards.clear()
    this.updateTimelineDisplay()
  }

  hideGroupingUI() {
    this.stopGroupingMode()
  }

  async createGroupFromSelection() {
    // Debug: Check application state
    console.log('[EnhancedGifGroupManager.createGroupFromSelection] Application state check:')
    console.log('- window available:', typeof window !== 'undefined')
    console.log('- boardData available:', typeof window !== 'undefined' && window.boardData)
    console.log('- boards available:', typeof window !== 'undefined' && window.boardData && window.boardData.boards)
    console.log('- board count:', window.boardData?.boards?.length)
    console.log('- currentBoard:', window.currentBoard)
    console.log('- selections:', window.selections)
    
    // Use robust selection validation
    const validation = this.validateSelections()
    
    if (validation.count < 2) {
      this.showNotification(`Please select at least 2 adjacent boards to create a group (${validation.count} selected)`, 'warning')
      return
    }
    
    // Use the most reliable selection source
    let selectedArray
    if (validation.sources.main >= validation.sources.internal && window.selections) {
      selectedArray = Array.from(window.selections).sort((a, b) => a - b)
    } else {
      selectedArray = Array.from(this.selectedBoards).sort((a, b) => a - b)
    }

    // Check if any selected boards are already in groups
    const existingGroups = this.getExistingGroupsForSelection(selectedArray)
    if (existingGroups.length > 0) {
      const groupNames = existingGroups.map(g => g.name).join(', ')
      const confirmed = confirm(`Some selected boards are already in groups: ${groupNames}. Creating a new group will remove them from existing groups. Continue?`)
      if (!confirmed) return
    }

    // Validate adjacency
    if (!this.videoGroupManager.areBoardsAdjacent(selectedArray)) {
      this.showNotification('Selected boards must be adjacent (consecutive) to form a group', 'error')
      return
    }

    try {
      // Store undo state before operation
      this.storeUndoState()

      // Debug: Log the selected array and board data
      console.log('[EnhancedGifGroupManager.createGroupFromSelection] Selected array:', selectedArray)
      console.log('[EnhancedGifGroupManager.createGroupFromSelection] Board data available:', typeof window !== 'undefined' && window.boardData && window.boardData.boards)
      console.log('[EnhancedGifGroupManager.createGroupFromSelection] Board count:', window.boardData?.boards?.length)
      console.log('[EnhancedGifGroupManager.createGroupFromSelection] Board data:', window.boardData?.boards?.map((b, i) => ({ index: i, uid: b.uid })))

      // Create group with automatic shot-based naming (no dialog)
      const group = this.videoGroupManager.createGroup(selectedArray)

      // Apply global settings to the new group
      if (group) {
        group.fps = this.globalFps
        group.duration = this.globalDuration
        group.loop = this.autoLoop
        this.videoGroupManager.updateGroup(group.id, group)
      }

      // Clean up any empty groups that may have been created
      this.videoGroupManager.cleanupEmptyGroups()

      // Batch the UI updates for better performance
      this.batchUIUpdates(() => {
        this.currentColorIndex++
        this.selectedBoards.clear()
        this.updateSelectionDisplay()
        this.updateGroupsList()
        this.updateTimelineDisplay()

        // Show success message
        const action = existingGroups.length > 0 ? 'updated' : 'created'
        this.showNotification(`Video group "${group.name}" ${action} successfully!`, 'success')
      })
    } catch (error) {
      this.showNotification(error.message, 'error')
    }
  }

  getExistingGroupsForSelection(selectedArray = null) {
    const existingGroups = []
    const allGroups = this.videoGroupManager.getAllGroups()
    const selections = selectedArray || Array.from(this.selectedBoards)

    for (const group of allGroups) {
      const overlappingBoards = group.boardIds.filter(boardId =>
        selections.includes(boardId)
      )
      if (overlappingBoards.length > 0) {
        existingGroups.push(group)
      }
    }

    return existingGroups
  }

  // Handle case where user tries to modify existing groups
  handleExistingGroupSelection(existingGroups) {
    if (existingGroups.length === 1) {
      // Single existing group - offer to modify it
      const group = existingGroups[0]
      const confirmed = confirm(`Selected boards are part of existing group "${group.name}". Would you like to modify this group instead of creating a new one?`)
      if (confirmed) {
        // Pre-select the group name and allow modification
        return group.name
      }
    } else if (existingGroups.length > 1) {
      // Multiple existing groups - show warning
      const groupNames = existingGroups.map(g => g.name).join(', ')
      return confirm(`Selected boards belong to multiple groups: ${groupNames}. Creating a new group will remove boards from existing groups. Continue?`)
    }
    return false
  }

  // Batch multiple group operations to prevent excessive updates
  batchGroupOperations(callback) {
    const now = Date.now()
    if (now - this.lastGroupUpdate < this.groupUpdateThrottle) {
      // Schedule the operation for later if we're throttling
      if (this.groupOperationTimeout) {
        clearTimeout(this.groupOperationTimeout)
      }
      this.groupOperationTimeout = setTimeout(() => {
        this.lastGroupUpdate = Date.now()
        callback()
      }, this.groupUpdateThrottle - (now - this.lastGroupUpdate))
    } else {
      this.lastGroupUpdate = now
      callback()
    }
  }

  // Prevent excessive board operations
  shouldSkipBoardOperation() {
    const now = Date.now()
    const timeSinceLastOperation = now - (this.lastBoardOperation || 0)
    this.lastBoardOperation = now

    // Skip if operations are happening too frequently (less than 100ms apart)
    return timeSinceLastOperation < 100
  }

  // Force refresh timeline display to fix glitches
  forceRefreshTimeline() {
    // Clear any pending timeline updates
    if (this.timelineUpdateTimeout) {
      clearTimeout(this.timelineUpdateTimeout)
    }

    // Force immediate update
    this.updateTimelineDisplay()
  }

  // Show group dividers during drag
  showGroupDividers(draggedBoardIndex, dragPosition) {
    if (this.videoGroupManager) {
      this.videoGroupManager.showGroupDividers(draggedBoardIndex, dragPosition)
    }
  }

  // Hide group dividers
  hideGroupDividers() {
    if (this.videoGroupManager) {
      this.videoGroupManager.hideGroupDividers()
    }
  }

  // Check if mouse is over a divider
  isOverDivider(dragPosition, mouseX) {
    if (this.videoGroupManager) {
      return this.videoGroupManager.isOverDivider(dragPosition, mouseX)
    }
    return null
  }

  // Test method for debugging dividers
  testDividers() {
    if (this.videoGroupManager) {
      this.videoGroupManager.testDividers()
    }
  }

  // Move a board to a specific position in the timeline
  moveBoardToPosition(boardId, targetPosition) {
    if (typeof window !== 'undefined' && window.moveSelectedBoards) {
      // Temporarily select only this board
      const originalSelections = new Set(window.selections)
      window.selections.clear()
      window.selections.add(boardId)
      
      // Move the board
      const didChange = window.moveSelectedBoards(targetPosition)
      
      // Update group manager after the move
      if (didChange && this.videoGroupManager) {
        this.videoGroupManager.updateBoardDataReference(window.boardData)
        this.videoGroupManager.forceUpdateAllGroups()
      }
      
      // Restore original selections
      window.selections.clear()
      originalSelections.forEach(id => window.selections.add(id))
      
      return didChange
    }
    return false
  }

  // Force refresh all UI elements
  forceRefreshUI() {
    this.batchUIUpdates(() => {
      this.updateGroupsList()
      this.updateTimelineDisplay()
      this.forceRefreshTimeline()
    })
  }

  // Batch UI updates to prevent flickering and improve performance
  batchUIUpdates(updateFunction) {
    // Clear any pending updates
    if (this.batchUpdateTimeout) {
      clearTimeout(this.batchUpdateTimeout)
    }

    // Add to batch queue
    if (!this.pendingUIUpdates) {
      this.pendingUIUpdates = []
    }
    this.pendingUIUpdates.push(updateFunction)

    // Process batch after a much longer delay to prevent blinking during rapid operations
    this.batchUpdateTimeout = setTimeout(() => {
      if (this.pendingUIUpdates && this.pendingUIUpdates.length > 0) {
        // Use requestAnimationFrame for smooth rendering
        requestAnimationFrame(() => {
          // Execute all pending updates
          this.pendingUIUpdates.forEach(update => {
            try {
              update()
            } catch (error) {
              console.error('[EnhancedGifGroupManager] Error in batched UI update:', error)
            }
          })
          
          // Clear the batch
          this.pendingUIUpdates = []
        })
      }
    }, 300) // Much longer delay to prevent blinking during rapid operations
  }

  // Ensure UI updates happen in the correct order
  ensureUIUpdateOrder() {
    // Clear any pending timeline updates
    if (this.timelineUpdateTimeout) {
      clearTimeout(this.timelineUpdateTimeout)
    }

    // Clear any pending batch updates
    if (this.batchUpdateTimeout) {
      clearTimeout(this.batchUpdateTimeout)
    }

    // Force immediate update with proper ordering
    requestAnimationFrame(() => {
      // First update the data
      this.videoGroupManager.forceUpdateAllGroups()
      
      // Then update the UI
      this.updateGroupsList()
      this.renderTimelineDisplay()
    })
  }

  // Robust selection validation
  validateSelections() {
    // Sync with main window first
    this.syncWithMainSelections()
    
    // Check multiple sources for selections
    const internalCount = this.selectedBoards.size
    const mainCount = window.selections ? window.selections.size : 0
    const visualCount = document.querySelectorAll('.thumbnail.selected, .t-scene.selected').length
    
    console.log('Selection validation:', {
      internal: internalCount,
      main: mainCount,
      visual: visualCount,
      internalSelections: Array.from(this.selectedBoards),
      mainSelections: Array.from(window.selections || [])
    })
    
    return {
      count: Math.max(internalCount, mainCount, visualCount),
      sources: { internal: internalCount, main: mainCount, visual: visualCount }
    }
  }

  // Handle board movement/selection changes
  onBoardSelectionChanged() {
    // Force refresh to prevent glitches
    this.forceRefreshTimeline()
  }

  async showGroupNameDialog() {
    return new Promise((resolve) => {
      const dialog = document.createElement('div')
      dialog.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2000;
      `
      
      dialog.innerHTML = `
        <div style="
          background: white;
          border-radius: 12px;
          padding: 24px;
          min-width: 300px;
          box-shadow: 0 20px 25px rgba(0, 0, 0, 0.15);
        ">
          <h3 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: #1f2937;">
            Create GIF Group
          </h3>
          <p style="margin: 0 0 16px 0; color: #6b7280; font-size: 14px;">
            Enter a name for this group of ${this.selectedBoards.size} boards:
          </p>
          <input type="text" id="group-name-input" placeholder="e.g., Opening Sequence" style="
            width: 100%;
            padding: 12px;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            font-size: 14px;
            margin-bottom: 16px;
          " autofocus>
          <div style="display: flex; gap: 8px; justify-content: flex-end;">
            <button id="cancel-group" style="
              background: #f3f4f6; color: #374151; border: 1px solid #d1d5db;
              padding: 8px 16px; border-radius: 6px; cursor: pointer;
            ">Cancel</button>
            <button id="confirm-group" style="
              background: #3b82f6; color: white; border: none;
              padding: 8px 16px; border-radius: 6px; cursor: pointer;
            ">Create</button>
          </div>
        </div>
      `
      
      document.body.appendChild(dialog)
      
      const input = dialog.querySelector('#group-name-input')
      const cancelBtn = dialog.querySelector('#cancel-group')
      const confirmBtn = dialog.querySelector('#confirm-group')
      
      const cleanup = () => {
        document.body.removeChild(dialog)
      }
      
      cancelBtn.addEventListener('click', () => {
        cleanup()
        resolve(null)
      })
      
      confirmBtn.addEventListener('click', () => {
        const name = input.value.trim()
        if (name) {
          cleanup()
          resolve(name)
        }
      })
      
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          confirmBtn.click()
        } else if (e.key === 'Escape') {
          cancelBtn.click()
        }
      })
    })
  }

  updateSelectionDisplay() {
    const count = this.selectedBoards.size
    const countElement = document.getElementById('selection-count')
    const createBtn = document.getElementById('create-group')

    // Performance optimization: Only update DOM if values actually changed
    if (countElement && this.lastDisplayedCount !== count) {
      countElement.textContent = `${count} board${count !== 1 ? 's' : ''} selected`
      this.lastDisplayedCount = count
    }

    if (createBtn && createBtn.disabled !== (count < 2)) {
      createBtn.disabled = count < 2
    }

    // Auto-create group if we have exactly 2 boards selected (immediate grouping)
    if (count === 2 && this.isGroupingMode) {
      // Small delay to allow user to add more boards if they want
      setTimeout(() => {
        if (this.selectedBoards.size === 2) {
          this.autoCreateGroupFromSelection()
        }
      }, 1000) // 1 second delay
    }
  }

  async autoCreateGroupFromSelection() {
    // Generate automatic group name based on board indices
    const boardIndices = Array.from(this.selectedBoards).sort((a, b) => a - b)
    const groupName = `Group ${boardIndices[0] + 1}-${boardIndices[1] + 1}`

    const groupId = this.layoutManager.createGifGroup({
      name: groupName,
      boardIndices: boardIndices,
      color: this.groupColors[this.currentColorIndex % this.groupColors.length],
      fps: 5,
      maxWidth: 1440 // Higher default resolution
    })

      this.batchUIUpdates(() => {
        this.currentColorIndex++
        this.selectedBoards.clear()
        this.updateSelectionDisplay()
        this.updateGroupsList()
        this.updateTimelineDisplay()

        // Show success message
        this.showNotification(`Auto-created group "${groupName}"`, 'success')
      })
  }

  updateGroupsList() {
    const container = document.getElementById('groups-list')
    const groups = this.videoGroupManager.getAllGroups()
    
     if (groups.length === 0) {
       container.innerHTML = '<div style="text-align: center; color: #8e8e93; font-size: 11px; padding: 24px; border-radius: 6px; background: #1c1c1e;">No groups created yet</div>'
       return
     }
    
    const addButtonHtml = `
      <div style="display:flex; justify-content:center; padding: 8px 4px;">
        <button id="add-group-btn" title="Create Group from Selection" style="
          min-width: 44px; height: 28px; padding: 0 12px; border-radius: 6px; border: 1px solid #48484a; cursor: pointer;
          background: #3a3a3c; color: #ffffff; font-size: 16px; line-height: 0; 
          font-weight: 500; transition: all 0.2s ease;
        " onmouseover="this.style.background='#48484a'" onmouseout="this.style.background='#3a3a3c'">+</button>
      </div>
    `

    const groupsHtml = groups.map(group => `
      <div class="group-item" data-group-id="${group.id}" style="
        padding: 12px; margin-bottom: 8px; 
        background: #1c1c1e;
        border-radius: 8px; border: 1px solid #3a3a3c;
        transition: all 0.2s ease;
      " onmouseover="this.style.background='#2c2c2e'; this.style.borderColor='#48484a'" onmouseout="this.style.background='#1c1c1e'; this.style.borderColor='#3a3a3c'">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <div class="group-action-btn" data-action="color" style="
              width: 16px; height: 16px; border-radius: 50%;
              background: ${group.color}; cursor: pointer; border: 2px solid transparent;
              transition: all 0.2s; display: flex; align-items: center; justify-content: center;
              box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            " title="Change Color" onmouseover="this.style.transform='scale(1.2)'; this.style.boxShadow='0 4px 8px rgba(0, 0, 0, 0.2)'" onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 2px 4px rgba(0, 0, 0, 0.1)'"></div>
             <div>
               <div style="font-weight: 500; font-size: 13px; color: #ffffff;">${group.name}</div>
               <div style="font-size: 11px; color: #8e8e93;">
                 ${group.boardIds.length} boards
               </div>
             </div>
          </div>
          <div style="display: flex; gap: 4px;">
            <button class="group-action-btn advanced-timing-btn" data-action="advanced-timing" style="
              background: none; border: none; color: #8e8e93; cursor: pointer;
              padding: 4px; border-radius: 4px; font-size: 12px;
            " title="Advanced Timing" onmouseover="this.style.color='#ffffff'" onmouseout="this.style.color='#8e8e93'">⚙️</button>
            <button class="group-action-btn" data-action="edit" style="
              background: none; border: none; color: #8e8e93; cursor: pointer;
              padding: 4px; border-radius: 4px; font-size: 12px;
            " title="Edit" onmouseover="this.style.color='#ffffff'" onmouseout="this.style.color='#8e8e93'">✏️</button>
            <button class="group-action-btn" data-action="delete" style="
              background: none; border: none; color: #8e8e93; cursor: pointer;
              padding: 4px; border-radius: 4px; font-size: 12px;
            " title="Delete" onmouseover="this.style.color='#ff453a'" onmouseout="this.style.color='#8e8e93'">🗑️</button>
          </div>
        </div>
        
        <!-- FPS/Duration Controls -->
        <div class="group-timing-controls" style="
          display: flex; align-items: center; gap: 8px; padding: 2px 0;
          ${group.advancedMode ? 'opacity: 0.5;' : ''}
        ">
           <div style="display: flex; align-items: center; gap: 4px;">
             <button class="timing-mode-btn" data-action="toggle-mode" style="
               background: #3a3a3c; border: 1px solid #48484a; color: #ffffff; 
               cursor: pointer; padding: 2px 6px; border-radius: 4px; font-size: 10px;
             " title="Toggle FPS/Duration" onmouseover="this.style.background='#48484a'" onmouseout="this.style.background='#3a3a3c'">${group.timingMode || 'fps'}</button>
             <span class="timing-label" style="font-size: 11px; color: #8e8e93; min-width: 30px;">
               ${group.timingMode === 'duration' ? 'Duration:' : 'FPS:'}
             </span>
           </div>
          <div style="display: flex; align-items: center; gap: 6px; flex: 1;">
            <input type="range" class="timing-slider" 
              min="${group.timingMode === 'duration' ? '0.5' : '1'}" 
              max="${group.timingMode === 'duration' ? '10' : '30'}" 
              step="${group.timingMode === 'duration' ? '0.1' : '1'}"
              value="${group.timingMode === 'duration' ? (group.duration || 1) : (group.fps || 5)}"
              style="
                flex: 1; 
                height: 12px; 
                background: transparent;
                outline: none; 
                cursor: pointer;
                border-radius: 2px;
              "
              
            />
             <span class="timing-value" style="font-size: 11px; color: #ffffff; min-width: 30px; text-align: right;">
               ${group.timingMode === 'duration' ? (group.duration || 1) + 's' : (group.fps || 5)}
             </span>
          </div>
        </div>
      </div>
    `).join('')

    // Render groups into the scrollable area and keep the + button pinned at bottom inside the frame
    const scrollArea = container.querySelector('#groups-scroll')
    if (scrollArea) {
      scrollArea.innerHTML = groupsHtml
    } else {
      container.innerHTML = `
        <div id="groups-scroll" style="flex:1 1 0; min-height:0; overflow-y:auto; display:flex; flex-direction:column;">${groupsHtml}</div>
        ${addButtonHtml}
      `
    }
    
    // Add event listeners for group actions
    container.querySelectorAll('.group-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const groupId = btn.closest('.group-item').dataset.groupId
        const action = btn.dataset.action
        
        if (action === 'color') {
          this.changeGroupColor(groupId)
        } else if (action === 'advanced-timing') {
          e.preventDefault()
          e.stopPropagation()
          this.toggleAdvancedMode(groupId)
        } else if (action === 'edit') {
          this.editGroup(groupId)
        } else if (action === 'delete') {
          this.deleteGroup(groupId)
        }
      })
    })

    const addGroupBtn = container.querySelector('#add-group-btn') || container.parentElement?.querySelector('#add-group-btn')
    if (addGroupBtn) {
      addGroupBtn.addEventListener('click', () => this.createGroupFromSelection())
    }
    
    // Add event listeners for timing controls
    container.querySelectorAll('.timing-mode-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const groupId = btn.closest('.group-item').dataset.groupId
        this.toggleTimingMode(groupId)
      })
    })
    
    container.querySelectorAll('.timing-slider').forEach(slider => {
      // Remove any existing listeners first
      if (slider._inputHandler) {
        slider.removeEventListener('input', slider._inputHandler)
        slider.removeEventListener('change', slider._changeHandler)
        slider.removeEventListener('dblclick', slider._dblclickHandler)
      }
      
      // Create new handlers
      slider._inputHandler = (e) => {
        const groupId = e.target.closest('.group-item').dataset.groupId
        const group = this.videoGroupManager.groups.get(groupId)
        
        // If in advanced mode, don't respond to slider changes
        if (group && group.advancedMode) {
          return
        }
        
        const value = parseFloat(e.target.value)
        // Update the display value immediately
        const valueDisplay = e.target.parentElement.querySelector('.timing-value')
        if (valueDisplay) {
          if (group && group.timingMode === 'duration') {
            valueDisplay.textContent = value + 's'
          } else {
            valueDisplay.textContent = value
          }
        }
        // Preview only; do not save or re-render to keep dragging smooth
        this.previewGroupTiming(groupId, value)
      }
      
      slider._changeHandler = (e) => {
        const groupId = e.target.closest('.group-item').dataset.groupId
        const group = this.videoGroupManager.groups.get(groupId)
        
        // If in advanced mode, don't respond to slider changes
        if (group && group.advancedMode) {
          return
        }
        
        console.log('[Slider] Change event triggered, value:', e.target.value)
        const value = parseFloat(e.target.value)
        this.updateGroupTiming(groupId, value)
      }
      
      slider._dblclickHandler = (e) => {
        const groupId = e.target.closest('.group-item').dataset.groupId
        const value = parseFloat(e.target.value)
        const group = this.videoGroupManager.groups.get(groupId)
        if (group) {
          if (group.advancedMode) {
            // If in advanced mode, exit advanced mode and keep current slider value
            if (group.timingMode === 'duration') {
              group.duration = value
            } else {
              group.fps = value
            }
            group.advancedMode = false
          } else {
            // If already using slider, reset to 5 FPS
            if (group.timingMode === 'duration') {
              group.duration = 1.0
            } else {
              group.fps = 5
            }
          }
          this.videoGroupManager.saveGroupsToStorage()
          this.updateGroupsList()
        }
      }
      
      // Add the new listeners
      slider.addEventListener('input', slider._inputHandler)
      slider.addEventListener('change', slider._changeHandler)
      slider.addEventListener('dblclick', slider._dblclickHandler)
      // Synthetic double-click for browsers that don't emit dblclick on range
      slider._clickHandler = (e) => {
        const now = Date.now()
        if (slider._lastClickTime && (now - slider._lastClickTime) < 300) {
          slider._dblclickHandler(e)
        }
        slider._lastClickTime = now
      }
      slider.addEventListener('click', slider._clickHandler)
      const commit = (e) => {
        const groupId = e.target.closest('.group-item').dataset.groupId
        const group = this.videoGroupManager.groups.get(groupId)
        
        // If in advanced mode, don't respond to slider changes
        if (group && group.advancedMode) {
          return
        }
        
        const value = parseFloat(e.target.value)
        this.updateGroupTiming(groupId, value)
      }
      slider.addEventListener('pointerup', commit)
      slider.addEventListener('mouseup', commit)
      slider.addEventListener('touchend', commit)
      
      console.log('[Slider] Event listeners added to slider')
    })
  }

  updateTimelineDisplay() {
    // Performance optimization: Throttle timeline updates to prevent performance issues
    if (this.timelineUpdateTimeout) {
      clearTimeout(this.timelineUpdateTimeout)
    }

    // Use a much longer debounce to prevent blinking during rapid operations
    this.timelineUpdateTimeout = setTimeout(() => {
      this.renderTimelineDisplay()
    }, 200) // Much longer timeout to prevent blinking
  }

  renderTimelineDisplay() {
    // Prevent multiple simultaneous updates
    if (this.isUpdatingUI) {
      return
    }

    this.isUpdatingUI = true

    // Use requestAnimationFrame for smooth rendering
    requestAnimationFrame(() => {
      try {
        // Use the video group manager's timeline display
        this.videoGroupManager.renderGroupIndicators()

        // Get both thumbnail types - the timeline uses different selectors
        const thumbnails = document.querySelectorAll('.thumbnail, .t-scene, [data-thumbnail]')

        // Create maps for existing indicators to avoid blinking
        const existingIndicators = new Map()
        thumbnails.forEach((thumbnail, index) => {
          const indicator = thumbnail.querySelector('.gif-group-indicator')
          if (indicator) {
            existingIndicators.set(index, indicator)
          }
        })

        // Get current video groups
        const videoGroups = this.videoGroupManager.getAllGroups()
        const currentGroupedBoards = new Set()
        
        // Update or create group indicators for video groups
        videoGroups.forEach(group => {
          group.boardIds.forEach(boardIndex => {
            currentGroupedBoards.add(boardIndex)
            const thumbnail = this.getThumbnailByIndex(boardIndex)
            if (thumbnail) {
              thumbnail.classList.add('gif-grouped')
              
              // Update or create group indicator
              let indicator = existingIndicators.get(boardIndex)
              if (indicator) {
                // Update existing indicator smoothly
                indicator.style.background = group.color
                indicator.style.transition = 'background-color 0.1s ease'
                indicator.title = `Part of group: ${group.name}`
              } else {
                // Create new indicator
                indicator = document.createElement('div')
                indicator.className = 'gif-group-indicator'
                indicator.style.cssText = `
                  position: absolute;
                  top: 5px;
                  right: 5px;
                  width: 20px;
                  height: 20px;
                  border-radius: 50%;
                  background: ${group.color};
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  font-size: 10px;
                  color: white;
                  z-index: 10;
                  border: 2px solid white;
                  box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                  cursor: pointer;
                  transition: background-color 0.1s ease;
                `
                indicator.innerHTML = '🔗'
                indicator.title = `Part of group: ${group.name}`
                
                // Add click handler to select group
                indicator.addEventListener('click', (e) => {
                  e.stopPropagation()
                  this.selectGroup(group.id)
                })
                
                thumbnail.appendChild(indicator)
              }
            }
          })
        })

        // Fade out and remove indicators for boards no longer in groups
        existingIndicators.forEach((indicator, boardIndex) => {
          if (!currentGroupedBoards.has(boardIndex)) {
            const thumbnail = this.getThumbnailByIndex(boardIndex)
            if (thumbnail) {
              thumbnail.classList.remove('gif-grouped')
            }
            indicator.style.transition = 'opacity 0.1s ease'
            indicator.style.opacity = '0'
            setTimeout(() => {
              if (indicator.parentNode) {
                indicator.parentNode.removeChild(indicator)
              }
            }, 100)
          }
        })

        // Sync with main window selections (for group indicators only)
        this.syncWithMainSelections()

        // Add click handlers for board selection in grouping mode
        // Note: We don't need to manage selection classes since main window handles them
        if (this.isGroupingMode) {
          thumbnails.forEach((thumbnail, index) => {
            this.handleThumbnailClick = (e) => {
              e.preventDefault()
              e.stopPropagation()
              this.toggleBoardSelection(index)
            }
            thumbnail.addEventListener('click', this.handleThumbnailClick)
          })
        }
      } catch (error) {
        console.error('[EnhancedGifGroupManager] Error in renderTimelineDisplay:', error)
      } finally {
        // Always reset the flag
        this.isUpdatingUI = false
      }
    })
  }

  syncWithMainSelections() {
    // Performance optimization: Throttle selection sync to prevent performance issues
    const now = Date.now()
    if (now - this.lastSelectionUpdate < 750) { // Increased throttle to 750ms
      return
    }
    this.lastSelectionUpdate = now

    // Sync with main window selections for grouping operations
    if (typeof window !== 'undefined') {
      // Access the main window's selections variable
      const mainSelections = window.selections || new Set()

      // Only update if selections actually changed
      const mainSelectionArray = Array.from(mainSelections).sort()
      const currentSelectionArray = Array.from(this.selectedBoards).sort()

      const selectionsChanged = mainSelectionArray.length !== currentSelectionArray.length ||
                               !mainSelectionArray.every((val, idx) => val === currentSelectionArray[idx])

      if (!selectionsChanged) {
        return // No changes, skip update
      }

      // Clear current selections
      this.selectedBoards.clear()

      // Add main window selections
      mainSelections.forEach(index => {
        this.selectedBoards.add(index)
      })

      // Update display only when selections actually change
      this.updateSelectionDisplay()
      
      // Force timeline refresh to prevent glitches
      this.forceRefreshTimeline()
    }
  }

  updateTimelineSelections() {
    // Sync with main window selections - no need to manage our own selection classes
    // The main window handles the 'selected' class, we just read from window.selections
  }

  getThumbnailByIndex(index) {
    // Try different selectors to find the thumbnail
    const selectors = [
      `[data-thumbnail="${index}"]`,
      `.thumbnail:nth-child(${index + 1})`,
      `.t-scene:nth-child(${index + 1})`
    ]
    
    for (const selector of selectors) {
      const element = document.querySelector(selector)
      if (element) return element
    }
    
    // Fallback: try to get by position in timeline
    const thumbnails = document.querySelectorAll('.thumbnail, .t-scene, [data-thumbnail]')
    return thumbnails[index] || null
  }

  toggleBoardSelection(boardIndex) {
    const wasSelected = this.selectedBoards.has(boardIndex)

    if (wasSelected) {
      this.selectedBoards.delete(boardIndex)
    } else {
      this.selectedBoards.add(boardIndex)
    }

    // Performance optimization: Only update displays if selection actually changed
    if (wasSelected !== this.selectedBoards.has(boardIndex)) {
      this.updateSelectionDisplay()
      this.updateTimelineDisplay()
    }
  }

  selectGroup(groupId) {
    const group = this.videoGroupManager.getGroup(groupId)
    if (group) {
      const oldSize = this.selectedBoards.size
      const oldSelections = new Set(this.selectedBoards)

      this.selectedBoards.clear()
      group.boardIds.forEach(index => this.selectedBoards.add(index))

      // Performance optimization: Only update displays if selections actually changed
      const selectionsChanged = oldSize !== this.selectedBoards.size ||
                               ![...oldSelections].every(id => this.selectedBoards.has(id))

      if (selectionsChanged) {
        this.updateSelectionDisplay()
        this.updateTimelineDisplay()
      }
    }
  }

  editGroup(groupId) {
    const group = this.videoGroupManager.getGroup(groupId)
    if (group) {
      // Show rename dialog
      this.showRenameGroupDialog(group)
    }
  }

  async showRenameGroupDialog(group) {
    return new Promise((resolve) => {
      const dialog = document.createElement('div')
      dialog.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
      `

      const modal = document.createElement('div')
      modal.style.cssText = `
        background: white;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        min-width: 300px;
      `

      modal.innerHTML = `
        <h3 style="margin: 0 0 15px 0; color: #333;">Rename Group</h3>
        <input type="text" id="group-name-input" value="${group.name}" 
               style="width: 100%; padding: 8px; margin: 10px 0; border: 1px solid #ccc; border-radius: 4px;">
        <div style="text-align: right; margin-top: 15px;">
          <button id="cancel-rename" style="margin-right: 10px; padding: 8px 16px; border: 1px solid #ccc; background: white; border-radius: 4px; cursor: pointer;">Cancel</button>
          <button id="confirm-rename" style="padding: 8px 16px; background: #007acc; color: white; border: none; border-radius: 4px; cursor: pointer;">Rename</button>
        </div>
      `

      dialog.appendChild(modal)
      document.body.appendChild(dialog)

      const input = modal.querySelector('#group-name-input')
      input.focus()
      input.select()

      const cleanup = () => {
        document.body.removeChild(dialog)
      }

      modal.querySelector('#cancel-rename').onclick = () => {
        cleanup()
        resolve(null)
      }

      modal.querySelector('#confirm-rename').onclick = () => {
        const newName = input.value.trim()
        if (newName && newName !== group.name) {
          this.videoGroupManager.renameGroup(group.id, newName)
          this.updateGroupsList()
          this.showNotification(`Group renamed to "${newName}"`, 'success')
        }
        cleanup()
        resolve(newName)
      }

      input.onkeydown = (e) => {
        if (e.key === 'Enter') {
          const newName = input.value.trim()
          if (newName && newName !== group.name) {
            this.videoGroupManager.renameGroup(group.id, newName)
            this.updateGroupsList()
            this.showNotification(`Group renamed to "${newName}"`, 'success')
          }
          cleanup()
          resolve(newName)
        } else if (e.key === 'Escape') {
          cleanup()
          resolve(null)
        }
      }

      dialog.onclick = (e) => {
        if (e.target === dialog) {
          cleanup()
          resolve(null)
        }
      }
    })
  }

  deleteGroup(groupId) {
    if (confirm('Are you sure you want to delete this video group?')) {
      // Store undo state before operation
      this.storeUndoState()
      
      this.videoGroupManager.deleteGroup(groupId)
      
      this.updateGroupsList()
      this.updateTimelineDisplay()
      
      // Trigger main UI refresh (this is what makes moving work)
      if (typeof window !== 'undefined' && window.renderThumbnailDrawer) {
        window.renderThumbnailDrawer()
      }
      
      this.showNotification('Video group deleted successfully!', 'success')
    }
  }

  ungroupSelectedBoards() {
    if (!window.selections || window.selections.size === 0) {
      this.showNotification('No boards selected to ungroup', 'warning')
      return
    }

    console.log('[EnhancedGifGroupManager.ungroupSelectedBoards] Starting ungrouping process')
    console.log('[EnhancedGifGroupManager.ungroupSelectedBoards] Selected boards:', Array.from(window.selections))
    console.log('[EnhancedGifGroupManager.ungroupSelectedBoards] Current groupedBoardIndices:', window.groupedBoardIndices ? Array.from(window.groupedBoardIndices) : 'undefined')

    // Store undo state before operation
    this.storeUndoState()

    let ungroupedCount = 0
    const selectedArray = Array.from(window.selections)

    // Remove selected boards from their groups and collect info for repositioning
    const boardsToMove = []
    selectedArray.forEach(boardId => {
      const groups = this.videoGroupManager.getGroupsForBoard(boardId)
      groups.forEach(group => {
        // Store group info before removing
        const groupEnd = Math.max(...group.boardIds)
        const removed = this.videoGroupManager.removeBoardFromGroup(group.id, boardId)
        if (removed) {
          ungroupedCount++
          // Store info for repositioning - move to end of original group
          boardsToMove.push({
            boardId: boardId,
            targetPosition: groupEnd
          })
        }
      })
    })

    if (ungroupedCount > 0) {
      // Move ungrouped boards to the end of their original groups
      // Sort by target position to handle multiple groups correctly
      boardsToMove.sort((a, b) => a.targetPosition - b.targetPosition)
      
      // Move boards to their new positions
      boardsToMove.forEach(({ boardId, targetPosition }) => {
        this.moveBoardToPosition(boardId, targetPosition)
      })

      // Update group manager's board data reference after moves
      if (typeof window !== 'undefined' && window.boardData) {
        this.videoGroupManager.updateBoardDataReference(window.boardData)
        this.videoGroupManager.forceUpdateAllGroups()
      }

      // Force refresh all displays
      this.updateGroupsList()
      this.updateTimelineDisplay()
      this.forceRefreshTimeline()
      
      // Trigger main UI refresh (this is what makes moving work)
      if (typeof window !== 'undefined' && window.renderThumbnailDrawer) {
        window.renderThumbnailDrawer()
      }
      
      // Debug: Check state after ungrouping
      console.log('[EnhancedGifGroupManager.ungroupSelectedBoards] After ungrouping:')
      console.log('[EnhancedGifGroupManager.ungroupSelectedBoards] Current groupedBoardIndices:', window.groupedBoardIndices ? Array.from(window.groupedBoardIndices) : 'undefined')
      console.log('[EnhancedGifGroupManager.ungroupSelectedBoards] Current groups:', this.videoGroupManager.getAllGroups().map(g => ({ name: g.name, boardIds: g.boardIds })))
      
      // Force renderMetaData to update the UI state with a small delay to ensure sync completes
      if (typeof window !== 'undefined' && window.renderMetaData) {
        console.log('[EnhancedGifGroupManager.ungroupSelectedBoards] Calling renderMetaData to update UI state')
        setTimeout(() => {
          window.renderMetaData()
        }, 100) // Small delay to ensure group sync completes
      }
      
      this.showNotification(`Removed ${ungroupedCount} board${ungroupedCount !== 1 ? 's' : ''} from groups`, 'success')
    } else {
      this.showNotification('Selected boards were not part of any group', 'info')
    }
  }

  previewGroups() {
    console.log(`[EnhancedGifGroupManager] previewGroups called`)
    
    const groups = this.videoGroupManager ? this.videoGroupManager.getAllGroups() : []
    console.log(`[EnhancedGifGroupManager] Found ${groups.length} groups:`, groups.map(g => g.name))
    
    if (groups.length === 0) {
      this.showNotification('No groups to preview', 'warning')
      return
    }
    
    // Show preview dialog
    this.showNotification(`Previewing selected group from timeline`, 'info')
    
    // Start preview for the currently selected group in timeline
      setTimeout(() => {
      console.log(`[EnhancedGifGroupManager] Starting previewSingleGroup`)
      this.previewSingleGroup()
    }, 100)
  }

  previewSingleGroup(group = null) {
    console.log(`[EnhancedGifGroupManager] previewSingleGroup called with group:`, group ? group.name : 'null')
    
    // If no group provided, get the group for the currently selected board in timeline
    if (!group) {
      console.log(`[EnhancedGifGroupManager] No group provided, getting from timeline`)
      group = this.getCurrentTimelineGroup()
      if (!group) {
        console.warn('[EnhancedGifGroupManager] No group selected in timeline for preview')
        this.showPreviewError('No group selected in timeline. Please select a board that belongs to a group.')
        return
      }
      console.log(`[EnhancedGifGroupManager] Using group from timeline: ${group.name}`)
    }

    if (!group || !group.boardIds || group.boardIds.length === 0) {
      console.warn('[EnhancedGifGroupManager] Invalid group for preview:', group)
      return
    }

    // Use window.boardData instead of this.boardData to get current data
    const currentBoardData = window.boardData || this.boardData
    console.log(`[EnhancedGifGroupManager] Current board data:`, currentBoardData)
    console.log(`[EnhancedGifGroupManager] Board count:`, currentBoardData?.boards?.length)
    console.log(`[EnhancedGifGroupManager] First board:`, currentBoardData?.boards?.[0])
    
    if (!currentBoardData || !currentBoardData.boards) {
      this.showNotification('Board data not available for preview', 'error')
      return
    }

    console.log(`[EnhancedGifGroupManager] Previewing group: ${group.name}`, {
      boardIds: group.boardIds,
      fps: group.fps,
      duration: group.duration,
      timingMode: group.timingMode
    })

    // Calculate frame duration based on timing mode
    let frameDuration
    if (group.timingMode === 'duration') {
      // Duration mode: total duration divided by number of boards
      frameDuration = (group.duration || 1.0) * 1000 / group.boardIds.length
    } else {
      // FPS mode: 1000ms divided by FPS
      frameDuration = 1000 / (group.fps || 5)
    }

    console.log(`[EnhancedGifGroupManager] Frame duration: ${frameDuration}ms`)

    // Create preview container if it doesn't exist
    let previewContainer = document.getElementById('gif-preview-container')
    if (!previewContainer) {
      previewContainer = document.createElement('div')
      previewContainer.id = 'gif-preview-container'
      previewContainer.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #1c1c1e;
        border: 2px solid #007aff;
        border-radius: 12px;
        padding: 20px;
        z-index: 10000;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
        max-width: 80vw;
        max-height: 80vh;
        overflow: hidden;
      `
      document.body.appendChild(previewContainer)
    }

    // Create preview content
    previewContainer.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; gap: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
          <h3 style="margin: 0; color: #ffffff; font-size: 18px;">Preview: ${group.name}</h3>
          <button id="close-preview" style="
            background: #3a3a3c; border: none; color: #ffffff; 
            padding: 8px 12px; border-radius: 6px; cursor: pointer;
            font-size: 12px;
          ">Close</button>
        </div>
        <div id="preview-image-container" style="
          width: 400px; height: 225px; 
          background: #2c2c2e; border-radius: 8px; 
          display: flex; align-items: center; justify-content: center;
          overflow: hidden;
          position: relative;
        ">
          <div id="preview-image" style="
            max-width: 100%; max-height: 100%; 
            object-fit: contain;
          "></div>
        </div>
        <div style="display: flex; gap: 16px; align-items: center;">
          <div style="color: #8e8e93; font-size: 14px;">
            Frame: <span id="current-frame">1</span> / ${group.boardIds.length}
          </div>
          <div style="color: #8e8e93; font-size: 14px;">
            ${group.timingMode === 'duration' ? 'Duration' : 'FPS'}: ${group.timingMode === 'duration' ? group.duration + 's' : group.fps}
          </div>
        </div>
        <div style="width: 100%; height: 4px; background: #3a3a3c; border-radius: 2px; overflow: hidden;">
          <div id="progress-bar" style="
            height: 100%; background: #007aff; 
            width: 0%; transition: width 0.1s ease;
          "></div>
        </div>
      </div>
    `

    // Add close button functionality
    const closeBtn = previewContainer.querySelector('#close-preview')
    closeBtn.addEventListener('click', () => {
      this.stopPreview()
    })

    // Show loading state
    const imageContainer = document.getElementById('preview-image')
    if (imageContainer) {
      imageContainer.innerHTML = `
        <div style="color: #8e8e93; text-align: center; font-size: 14px;">
          Rendering preview frames...
        </div>
      `
    }

    // Try to generate a temporary GIF for preview first, fallback to frame-by-frame
    this.generateTemporaryGifForPreview(null, currentBoardData, frameDuration)
  }

  startPreviewAnimation(group, frameDuration) {
    let currentFrameIndex = 0
    let animationId
    let startTime = Date.now()
    const totalDuration = group.boardIds.length * frameDuration

    console.log(`[EnhancedGifGroupManager] Starting preview animation for group: ${group.name}`)
    console.log(`[EnhancedGifGroupManager] Frame duration: ${frameDuration}ms, Total duration: ${totalDuration}ms`)

    const updateFrame = () => {
      try {
        const elapsed = Date.now() - startTime
        const progress = Math.min(elapsed / totalDuration, 1)
        
        // Calculate current frame based on progress
        currentFrameIndex = Math.floor(progress * group.boardIds.length)
        if (currentFrameIndex >= group.boardIds.length) {
          currentFrameIndex = group.boardIds.length - 1
        }

        // Update display
        this.updatePreviewFrame(group, currentFrameIndex, progress)

        // Continue animation if not complete
        if (progress < 1) {
          animationId = requestAnimationFrame(updateFrame)
        } else {
          // Animation complete
          console.log(`[EnhancedGifGroupManager] Preview complete for group: ${group.name}`)
          setTimeout(() => {
            this.stopPreview()
          }, 1000) // Show final frame for 1 second
        }
      } catch (error) {
        console.error(`[EnhancedGifGroupManager] Error in preview animation:`, error)
        this.stopPreview()
      }
    }

    // Store animation ID for cleanup
    this.currentPreviewAnimation = animationId
    updateFrame()
  }

  updatePreviewFrame(group, frameIndex, progress) {
    try {
      const boardId = group.boardIds[frameIndex]
      const currentBoardData = window.boardData || this.boardData
      const board = currentBoardData.boards[boardId]
      
      console.log(`[EnhancedGifGroupManager] ===== PREVIEW FRAME DEBUG =====`)
      console.log(`[EnhancedGifGroupManager] Frame index: ${frameIndex}`)
      console.log(`[EnhancedGifGroupManager] Board ID: ${boardId}`)
      console.log(`[EnhancedGifGroupManager] Board object:`, board)
      console.log(`[EnhancedGifGroupManager] Board keys:`, board ? Object.keys(board) : 'null')
      
      if (!board) {
        console.warn(`[EnhancedGifGroupManager] Board not found for index: ${boardId}`)
        return
      }

      // Update frame counter
      const frameCounter = document.getElementById('current-frame')
      if (frameCounter) {
        frameCounter.textContent = frameIndex + 1
      }

      // Update progress bar
      const progressBar = document.getElementById('progress-bar')
      if (progressBar) {
        progressBar.style.width = `${progress * 100}%`
      }

      // Load and display the board image
      this.loadBoardImageForPreview(board, frameIndex)
    } catch (error) {
      console.error(`[EnhancedGifGroupManager] Error updating preview frame ${frameIndex}:`, error)
    }
  }

  loadBoardImageForPreview(board, frameIndex) {
    const imageContainer = document.getElementById('preview-image')
    if (!imageContainer) return

    try {
      // Get the board's poster frame image using the same method as the main app
      let imagePath = null
      
      // Try to get the image from the board's thumbnail or poster frame
      if (board && board.url) {
        // Convert the board URL to a proper image path
        const path = require('path')
        const projectPath = this.options.projectPath || window.boardFilename
        const projectDir = path.dirname(projectPath)
        const imagesDir = path.join(projectDir, 'images')
        
        // Try to get the poster frame filename
      try {
        const boardModel = require('../models/board')
          const posterFrameFilename = boardModel.boardFilenameForPosterFrame(board)
          imagePath = path.join(imagesDir, posterFrameFilename)
      } catch (requireError) {
        console.warn(`[EnhancedGifGroupManager] Could not require board model:`, requireError)
          // Fallback: construct path from board URL
          const urlParts = board.url.split('/')
          const filename = urlParts[urlParts.length - 1]
          const baseName = filename.replace(/\.[^/.]+$/, '')
          imagePath = path.join(imagesDir, `${baseName}-posterframe.jpg`)
        }
      }
      
      console.log(`[EnhancedGifGroupManager] Loading image for board ${frameIndex}: ${imagePath}`)
      console.log(`[EnhancedGifGroupManager] Board object:`, {
        hasUrl: !!board.url,
        url: board.url,
        hasFilename: !!board.filename,
        filename: board.filename,
        hasImage: !!board.image,
        image: board.image
      })
      
      if (imagePath && imagePath !== '') {
        // Convert to file:// URL for display
        const fileUrl = `file://${imagePath.replace(/\\/g, '/')}`
        console.log(`[EnhancedGifGroupManager] File URL: ${fileUrl}`)
        
        // Create new image element
        const img = new Image()
        img.onload = () => {
          imageContainer.innerHTML = ''
          imageContainer.appendChild(img)
          img.style.cssText = 'max-width: 100%; max-height: 100%; object-fit: contain;'
          console.log(`[EnhancedGifGroupManager] Successfully loaded image for board ${frameIndex}`)
        }
        img.onerror = (error) => {
          console.warn(`[EnhancedGifGroupManager] Failed to load poster frame for board ${frameIndex}:`, error)
          // Try fallback to board.image or board.url
          this.tryFallbackImage(board, frameIndex, imageContainer)
        }
        img.src = fileUrl
      } else {
        console.warn(`[EnhancedGifGroupManager] No image path for board ${frameIndex}`)
        // Try fallback to board.image or board.url
        this.tryFallbackImage(board, frameIndex, imageContainer)
      }
    } catch (error) {
      console.error(`[EnhancedGifGroupManager] Error loading image for board ${frameIndex}:`, error)
      // Show error placeholder
      imageContainer.innerHTML = `
        <div style="color: #ef4444; text-align: center; font-size: 14px;">
          Error loading image
        </div>
      `
    }
  }

  tryFallbackImage(board, frameIndex, imageContainer) {
    console.log(`[EnhancedGifGroupManager] Trying fallback image for board ${frameIndex}`)
    
    // Try board.image first
    if (board.image) {
      console.log(`[EnhancedGifGroupManager] Trying board.image: ${board.image}`)
      const img = new Image()
      img.onload = () => {
        imageContainer.innerHTML = ''
        imageContainer.appendChild(img)
        img.style.cssText = 'max-width: 100%; max-height: 100%; object-fit: contain;'
        console.log(`[EnhancedGifGroupManager] Successfully loaded fallback image for board ${frameIndex}`)
      }
      img.onerror = () => {
        console.warn(`[EnhancedGifGroupManager] board.image failed, trying board.url`)
        this.tryBoardUrl(board, frameIndex, imageContainer)
      }
      img.src = board.image
      return
    }
    
    // Try board.url
    this.tryBoardUrl(board, frameIndex, imageContainer)
  }

  tryBoardUrl(board, frameIndex, imageContainer) {
    if (board.url) {
      console.log(`[EnhancedGifGroupManager] Trying board.url: ${board.url}`)
      const img = new Image()
      img.onload = () => {
        imageContainer.innerHTML = ''
        imageContainer.appendChild(img)
        img.style.cssText = 'max-width: 100%; max-height: 100%; object-fit: contain;'
        console.log(`[EnhancedGifGroupManager] Successfully loaded board.url for board ${frameIndex}`)
      }
      img.onerror = () => {
        console.warn(`[EnhancedGifGroupManager] All image sources failed for board ${frameIndex}`)
        imageContainer.innerHTML = `
          <div style="color: #8e8e93; text-align: center; font-size: 14px;">
            No image available
          </div>
        `
      }
      img.src = board.url
    } else {
      console.warn(`[EnhancedGifGroupManager] No image sources available for board ${frameIndex}`)
      imageContainer.innerHTML = `
        <div style="color: #8e8e93; text-align: center; font-size: 14px;">
          No image available
        </div>
      `
    }
  }

  async renderGifFramesForPreview(group, currentBoardData, frameDuration) {
    try {
      console.log(`[EnhancedGifGroupManager] Rendering GIF frames for preview: ${group.name}`)
      
      // Get the boards for this group
      const groupBoards = group.boardIds.map(index => {
        if (index < 0 || index >= currentBoardData.boards.length) {
          console.warn(`[EnhancedGifGroupManager] Invalid board index ${index} for group ${group.name}`)
          return null
        }
        return { ...currentBoardData.boards[index] }
      }).filter(Boolean)

      if (groupBoards.length === 0) {
        console.warn(`[EnhancedGifGroupManager] No valid boards found for group ${group.name}`)
        this.showNotification('No valid boards found for preview', 'error')
        return
      }

      console.log(`[EnhancedGifGroupManager] Found ${groupBoards.length} boards for preview`)

      // Apply custom frame timings if available
      groupBoards.forEach((board, index) => {
        const boardId = group.boardIds[index]
        if (group.boardTimings && group.boardTimings[boardId] !== undefined) {
          board.duration = group.boardTimings[boardId] * 1000 // Convert seconds to milliseconds
          console.log(`[EnhancedGifGroupManager] Applied custom timing for board ${index}: ${group.boardTimings[boardId]}s`)
        } else {
          board.duration = frameDuration
        }
      })

      // Create a temporary canvas for rendering frames
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      
      // Set canvas size (preview size)
      const previewWidth = 400
      const previewHeight = 225
      canvas.width = previewWidth
      canvas.height = previewHeight

      // Store rendered frames
      this.previewFrames = []
      this.currentPreviewFrameIndex = 0

      // Render each frame
      for (let i = 0; i < groupBoards.length; i++) {
        const board = groupBoards[i]
        console.log(`[EnhancedGifGroupManager] Rendering frame ${i + 1}/${groupBoards.length}`)
        
        try {
          // Load the board image
          const imageData = await this.loadBoardImageForRendering(board)
          if (imageData) {
            // Clear canvas
            ctx.clearRect(0, 0, previewWidth, previewHeight)
            
            // Draw the image scaled to fit the preview size
            const scale = Math.min(previewWidth / imageData.width, previewHeight / imageData.height)
            const scaledWidth = imageData.width * scale
            const scaledHeight = imageData.height * scale
            const x = (previewWidth - scaledWidth) / 2
            const y = (previewHeight - scaledHeight) / 2
            
            ctx.drawImage(imageData, x, y, scaledWidth, scaledHeight)
            
            // Convert canvas to data URL for storage
            const frameDataUrl = canvas.toDataURL('image/png')
            this.previewFrames.push({
              dataUrl: frameDataUrl,
              duration: board.duration
            })
          } else {
            console.warn(`[EnhancedGifGroupManager] Could not load image for board ${i}`)
            // Create a placeholder frame
            ctx.clearRect(0, 0, previewWidth, previewHeight)
            ctx.fillStyle = '#2c2c2e'
            ctx.fillRect(0, 0, previewWidth, previewHeight)
            ctx.fillStyle = '#8e8e93'
            ctx.font = '16px Arial'
            ctx.textAlign = 'center'
            ctx.fillText('No Image', previewWidth / 2, previewHeight / 2)
            
            const frameDataUrl = canvas.toDataURL('image/png')
            this.previewFrames.push({
              dataUrl: frameDataUrl,
              duration: board.duration
            })
          }
        } catch (error) {
          console.error(`[EnhancedGifGroupManager] Error rendering frame ${i}:`, error)
          // Create error placeholder
          ctx.clearRect(0, 0, previewWidth, previewHeight)
          ctx.fillStyle = '#2c2c2e'
          ctx.fillRect(0, 0, previewWidth, previewHeight)
          ctx.fillStyle = '#ef4444'
          ctx.font = '16px Arial'
          ctx.textAlign = 'center'
          ctx.fillText('Error', previewWidth / 2, previewHeight / 2)
          
          const frameDataUrl = canvas.toDataURL('image/png')
          this.previewFrames.push({
            dataUrl: frameDataUrl,
            duration: frameDuration
          })
        }
      }

      console.log(`[EnhancedGifGroupManager] Rendered ${this.previewFrames.length} frames for preview`)
      
      // Start the preview animation with rendered frames
      this.startPreviewAnimationWithFrames(group, frameDuration)

    } catch (error) {
      console.error(`[EnhancedGifGroupManager] Error rendering GIF frames:`, error)
      this.showNotification('Error rendering preview frames: ' + error.message, 'error')
    }
  }

  async loadBoardImageForRendering(board) {
    return new Promise((resolve) => {
      try {
        // Try to get the poster frame path
        let imagePath = null
        try {
          const boardModel = require('../models/board')
          imagePath = boardModel.boardFilenameForPosterFrame(board)
        } catch (requireError) {
          console.warn(`[EnhancedGifGroupManager] Could not require board model:`, requireError)
          if (board && board.url) {
            imagePath = board.url.replace('.png', '-posterframe.jpg')
          }
        }

        if (!imagePath && board.url) {
          imagePath = board.url
        }

        if (!imagePath) {
          console.warn(`[EnhancedGifGroupManager] No image path found for board`)
          resolve(null)
          return
        }

        const img = new Image()
        img.onload = () => {
          console.log(`[EnhancedGifGroupManager] Successfully loaded image: ${imagePath}`)
          resolve(img)
        }
        img.onerror = (error) => {
          console.warn(`[EnhancedGifGroupManager] Failed to load image: ${imagePath}`, error)
          resolve(null)
        }
        img.src = imagePath
      } catch (error) {
        console.error(`[EnhancedGifGroupManager] Error loading board image:`, error)
        resolve(null)
      }
    })
  }

  startPreviewAnimationWithFrames(group, frameDuration) {
    if (!this.previewFrames || this.previewFrames.length === 0) {
      console.warn(`[EnhancedGifGroupManager] No preview frames available`)
      return
    }

    let currentFrameIndex = 0
    let animationId
    let startTime = Date.now()
    const totalDuration = this.previewFrames.reduce((sum, frame) => sum + frame.duration, 0)

    console.log(`[EnhancedGifGroupManager] Starting preview animation with ${this.previewFrames.length} rendered frames`)
    console.log(`[EnhancedGifGroupManager] Total duration: ${totalDuration}ms`)

    const updateFrame = () => {
      try {
        const elapsed = Date.now() - startTime
        const progress = Math.min(elapsed / totalDuration, 1)
        
        // Calculate current frame based on cumulative duration
        let cumulativeTime = 0
        let newFrameIndex = 0
        for (let i = 0; i < this.previewFrames.length; i++) {
          cumulativeTime += this.previewFrames[i].duration
          if (elapsed <= cumulativeTime) {
            newFrameIndex = i
            break
          }
          newFrameIndex = i
        }

        if (newFrameIndex !== currentFrameIndex) {
          currentFrameIndex = newFrameIndex
          this.updatePreviewFrameWithRenderedFrame(group, currentFrameIndex, progress)
        }

        // Continue animation if not complete
        if (progress < 1) {
          animationId = requestAnimationFrame(updateFrame)
        } else {
          // Animation complete
          console.log(`[EnhancedGifGroupManager] Preview complete for group: ${group.name}`)
          setTimeout(() => {
            this.stopPreview()
          }, 1000) // Show final frame for 1 second
        }
      } catch (error) {
        console.error(`[EnhancedGifGroupManager] Error in preview animation:`, error)
        this.stopPreview()
      }
    }

    // Store animation ID for cleanup
    this.currentPreviewAnimation = animationId
    updateFrame()
  }

  updatePreviewFrameWithRenderedFrame(group, frameIndex, progress) {
    try {
      const imageContainer = document.getElementById('preview-image')
      if (!imageContainer) return

      if (this.previewFrames && this.previewFrames[frameIndex]) {
        const frame = this.previewFrames[frameIndex]
        imageContainer.innerHTML = `<img src="${frame.dataUrl}" style="max-width: 100%; max-height: 100%; object-fit: contain;" />`
      }

      // Update frame counter
      const frameCounter = document.getElementById('current-frame')
      if (frameCounter) {
        frameCounter.textContent = frameIndex + 1
      }

      // Update progress bar
      const progressBar = document.getElementById('progress-bar')
      if (progressBar) {
        progressBar.style.width = `${progress * 100}%`
      }

    } catch (error) {
      console.error(`[EnhancedGifGroupManager] Error updating preview frame:`, error)
    }
  }

  stopPreview() {
    console.log(`[EnhancedGifGroupManager] Stopping preview and cleaning up...`)
    
    // Reset state flags
    this.isPreviewRunning = false
    this.previewGenerationInProgress = false
    
    // Cancel any running animation
    if (this.currentPreviewAnimation) {
      cancelAnimationFrame(this.currentPreviewAnimation)
      this.currentPreviewAnimation = null
    }

    // Clear preview frames
    this.previewFrames = null
    this.currentPreviewFrameIndex = 0

    // Clean up temporary GIF if it exists
    if (this.tempGifPath) {
      try {
        const fs = require('fs')
        if (fs.existsSync(this.tempGifPath)) {
          fs.unlinkSync(this.tempGifPath)
          console.log(`[EnhancedGifGroupManager] Cleaned up temporary GIF: ${this.tempGifPath}`)
        }
      } catch (error) {
        console.warn(`[EnhancedGifGroupManager] Could not clean up temporary GIF:`, error)
      }
      this.tempGifPath = null
    }

    // Clean up any other temp GIF files in the gifs directory
    this.cleanupTempGifFiles()

    // Remove preview container
    const previewContainer = document.getElementById('gif-preview-container')
    if (previewContainer) {
      previewContainer.remove()
    }

    console.log(`[EnhancedGifGroupManager] Preview stopped and cleaned up`)
  }

  cleanupTempGifFiles() {
    try {
      const fs = require('fs')
      const path = require('path')
      
      // Get the gifs directory
      const projectPath = this.options.projectPath || window.boardFilename
      if (!projectPath) return
      
      const gifsDir = path.join(path.dirname(projectPath), 'gifs')
      
      if (fs.existsSync(gifsDir)) {
        const files = fs.readdirSync(gifsDir)
        const tempFiles = files.filter(file => file.startsWith('preview_') && file.endsWith('.gif'))
        
        console.log(`[EnhancedGifGroupManager] Found ${tempFiles.length} temp GIF files to clean up`)
        
        tempFiles.forEach(file => {
          try {
            const filePath = path.join(gifsDir, file)
            fs.unlinkSync(filePath)
            console.log(`[EnhancedGifGroupManager] Cleaned up temp file: ${file}`)
          } catch (error) {
            console.warn(`[EnhancedGifGroupManager] Error cleaning up temp file ${file}:`, error)
          }
        })
      }
    } catch (error) {
      console.warn(`[EnhancedGifGroupManager] Error during temp file cleanup:`, error)
    }
  }

  async generateTemporaryGifForPreview(group, currentBoardData, frameDuration) {
    try {
      // If no group provided, get the group for the currently selected board in timeline
      if (!group) {
        group = this.getCurrentTimelineGroup()
        if (!group) {
          console.warn(`[EnhancedGifGroupManager] No group selected in timeline`)
          this.showPreviewError('No group selected in timeline. Please select a board that belongs to a group.')
          return
        }
        console.log(`[EnhancedGifGroupManager] Using group from timeline: ${group.name}`)
      }
      
      console.log(`[EnhancedGifGroupManager] Generating temporary GIF for preview: ${group.name}`)
      
      // Check if preview is already running
      if (this.isPreviewRunning || this.previewGenerationInProgress) {
        console.log(`[EnhancedGifGroupManager] Preview already running, stopping current preview first`)
        this.stopPreview()
        
        // Wait for cleanup to complete
        await new Promise(resolve => setTimeout(resolve, 200))
      }
      
      // Set state flags
      this.previewGenerationInProgress = true
      this.isPreviewRunning = true
      
      // Get the boards for this group
      const groupBoards = group.boardIds.map(index => currentBoardData.boards[index]).filter(Boolean)
      
      if (groupBoards.length === 0) {
        console.warn(`[EnhancedGifGroupManager] No valid boards found for group: ${group.name}`)
        this.showPreviewError('No valid boards found for preview')
        this.previewGenerationInProgress = false
        this.isPreviewRunning = false
        return
      }
      
      console.log(`[EnhancedGifGroupManager] Found ${groupBoards.length} boards for preview`)
      
      // Create a temporary GIF using the same method as the main export
      const tempGifPath = await this.createTemporaryGif(group, groupBoards, frameDuration)
      
      if (tempGifPath) {
        console.log(`[EnhancedGifGroupManager] Successfully generated preview GIF: ${tempGifPath}`)
        // Display the temporary GIF in the preview
        this.displayTemporaryGif(tempGifPath, group)
      } else {
        console.warn(`[EnhancedGifGroupManager] Failed to generate preview GIF, falling back to frame preview`)
        // Fallback to frame-by-frame preview
        this.startPreviewAnimation(group, frameDuration)
      }
      
      this.previewGenerationInProgress = false
      
    } catch (error) {
      console.error(`[EnhancedGifGroupManager] Error generating temporary GIF:`, error)
      console.error(`[EnhancedGifGroupManager] Error details:`, error.message, error.stack)
      
      this.previewGenerationInProgress = false
      this.isPreviewRunning = false
      
      // Fallback to frame-by-frame preview
      this.startPreviewAnimation(group, frameDuration)
    }
  }

  getCurrentTimelineGroup() {
    try {
      // Get the currently selected board from the timeline
      const currentBoard = window.currentBoard || 0
      console.log(`[EnhancedGifGroupManager] Current board in timeline: ${currentBoard}`)
      
      // Debug: Show all available groups first
      const allGroups = this.videoGroupManager.getAllGroups()
      console.log(`[EnhancedGifGroupManager] All available groups:`, allGroups.map(g => ({
        name: g.name,
        boardIds: g.boardIds,
        boardUids: g.boardUids,
        range: g.boardIds && g.boardIds.length > 0 ? `${Math.min(...g.boardIds)}-${Math.max(...g.boardIds)}` : 'no boards'
      })))
      
      // Find the group that contains this board
      const group = this.videoGroupManager.findGroupContainingBoard(currentBoard)
      
      if (group) {
        console.log(`[EnhancedGifGroupManager] Found group for current board: ${group.name} (${group.boardIds.length} boards)`)
        return group
      } else {
        console.log(`[EnhancedGifGroupManager] No group found for current board ${currentBoard}`)
        
        // Don't fallback to first group - return null so user gets proper error message
        return null
      }
    } catch (error) {
      console.error(`[EnhancedGifGroupManager] Error getting current timeline group:`, error)
      return null
    }
  }

  isExportIntegrationAvailable() {
    // Check if export integration is available and properly initialized
    if (typeof window === 'undefined') {
      console.warn(`[EnhancedGifGroupManager] Window object not available`)
      return false
    }
    
    if (!window.exportIntegration) {
      console.warn(`[EnhancedGifGroupManager] Export integration not found on window object`)
      return false
    }
    
    if (typeof window.exportIntegration.generateSingleGifGroupFromVideoGroup !== 'function') {
      console.warn(`[EnhancedGifGroupManager] generateSingleGifGroupFromVideoGroup method not available`)
      return false
    }
    
    if (!this.boardData && !window.boardData) {
      console.warn(`[EnhancedGifGroupManager] Board data not available`)
      return false
    }
    
    if (!this.options.projectPath && !window.boardFilename) {
      console.warn(`[EnhancedGifGroupManager] Project path not available`)
      return false
    }
    
    console.log(`[EnhancedGifGroupManager] Export integration is available and properly initialized`)
    return true
  }

  async createTemporaryGif(group, groupBoards, frameDuration) {
    try {
      console.log(`[EnhancedGifGroupManager] Creating temporary GIF for group: ${group.name}`)
      console.log(`[EnhancedGifGroupManager] Group data:`, {
        id: group.id,
        name: group.name,
        boardIds: group.boardIds,
        fps: group.fps,
        duration: group.duration
      })
      
      // Use the direct exporter method (same as actual export) - this is more reliable
      console.log(`[EnhancedGifGroupManager] Using direct exporter method for preview`)
      return await this.createTemporaryGifFallback(group, groupBoards, null)
      
    } catch (error) {
      console.error(`[EnhancedGifGroupManager] Error creating temporary GIF:`, error)
      console.error(`[EnhancedGifGroupManager] Error details:`, error.message, error.stack)
      return null
    }
  }

  async createTemporaryGifFallback(group, groupBoards, tempGifPath) {
    try {
      console.log(`[EnhancedGifGroupManager] Using direct exporter method (same as export)`)
      
      // Use the exact same method as the actual export
      const exporter = require('../window/exporter')
      const boardModel = require('../models/board')
      const path = require('path')
      const fs = require('fs')
      
      // Get board size using the same method as export
      const boardSize = boardModel.boardFileImageSize(this.boardData || window.boardData)
      
      // Create boardData with custom timings - use the same structure as export
      const boardDataWithTimings = {
        ...(this.boardData || window.boardData),
        defaultBoardTiming: 1000 / (group.fps || 5), // Convert FPS to milliseconds
        boards: groupBoards
      }
      
      console.log(`[EnhancedGifGroupManager] Using same export method with settings:`, {
        boardSize,
        maxWidth: 720,
        fps: group.fps || 5,
        boardCount: groupBoards.length,
        projectPath: this.options.projectPath || window.boardFilename
      })
      
      // Use the exact same exportAnimatedGif call as the actual export
      const outputPath = await exporter.exportAnimatedGif(
        groupBoards,
        boardSize,
        720, // maxWidth - 720p width
        this.options.projectPath || window.boardFilename, // projectFileAbsolutePath
        false, // mark (watermark)
        boardDataWithTimings, // boardData
        './img/watermark.png', // watermarkSrc
        `preview_${group.id}_${Date.now()}` // customFilename - unique for preview
      )
      
      console.log(`[EnhancedGifGroupManager] Direct export method generated GIF: ${outputPath}`)
      
      // Verify the file was created and has content
      if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath)
        console.log(`[EnhancedGifGroupManager] Generated GIF file stats:`, {
          path: outputPath,
          size: stats.size,
          exists: true
        })
        
        if (stats.size > 0) {
          return outputPath
        } else {
          console.error(`[EnhancedGifGroupManager] Generated GIF file is empty`)
          return null
        }
      } else {
        console.error(`[EnhancedGifGroupManager] Generated GIF file does not exist: ${outputPath}`)
        return null
      }
      
    } catch (fallbackError) {
      console.error(`[EnhancedGifGroupManager] Direct export method failed:`, fallbackError)
      console.error(`[EnhancedGifGroupManager] Error details:`, fallbackError.message, fallbackError.stack)
      return null
    }
  }

  displayTemporaryGif(gifPath, group) {
    const imageContainer = document.getElementById('preview-image')
    if (!imageContainer) return
    
    // Check if the file actually exists
    const fs = require('fs')
    if (!fs.existsSync(gifPath)) {
      console.error(`[EnhancedGifGroupManager] GIF file does not exist: ${gifPath}`)
      this.showPreviewError(`GIF file not found: ${gifPath}`)
      this.isPreviewRunning = false
      return
    }
    
    // Get file size for debugging
    const stats = fs.statSync(gifPath)
    console.log(`[EnhancedGifGroupManager] GIF file stats:`, {
      path: gifPath,
      size: stats.size,
      exists: true
    })
    
    if (stats.size === 0) {
      console.error(`[EnhancedGifGroupManager] GIF file is empty: ${gifPath}`)
      this.showPreviewError('Generated GIF file is empty')
      this.isPreviewRunning = false
      return
    }
    
    // Convert to file:// URL for display
    const fileUrl = `file://${gifPath.replace(/\\/g, '/')}`
    console.log(`[EnhancedGifGroupManager] Displaying temporary GIF: ${fileUrl}`)
    
    // Create image element for the GIF
    const img = new Image()
    img.onload = () => {
      imageContainer.innerHTML = ''
      imageContainer.appendChild(img)
      img.style.cssText = 'max-width: 100%; max-height: 100%; object-fit: contain;'
      console.log(`[EnhancedGifGroupManager] Successfully displayed temporary GIF`)
      // Preview is now running successfully
      this.isPreviewRunning = true
    }
    img.onerror = (error) => {
      console.error(`[EnhancedGifGroupManager] Failed to load temporary GIF:`, error)
      console.error(`[EnhancedGifGroupManager] File URL: ${fileUrl}`)
      console.error(`[EnhancedGifGroupManager] File path: ${gifPath}`)
      console.error(`[EnhancedGifGroupManager] File exists: ${fs.existsSync(gifPath)}`)
      this.showPreviewError(`Failed to load preview GIF: ${error.message || 'Unknown error'}`)
      this.isPreviewRunning = false
    }
    img.src = fileUrl
    
    // Store the temp GIF path for cleanup
    this.tempGifPath = gifPath
  }

  showPreviewError(message) {
    const imageContainer = document.getElementById('preview-image')
    if (imageContainer) {
      imageContainer.innerHTML = `
        <div style="color: #ef4444; text-align: center; font-size: 14px;">
          ${message}
        </div>
      `
    }
  }

  exportAllGroups() {
    console.log('[EnhancedGifGroupManager.exportAllGroups] Starting export process...')
    
    // Get groups from the videoGroupManager instead of layoutManager
    let groups = []
    if (this.videoGroupManager) {
      groups = this.videoGroupManager.getAllGroups()
      console.log('[EnhancedGifGroupManager] Found groups from videoGroupManager:', groups.length)
      console.log('[EnhancedGifGroupManager] VideoGroupManager groups:', groups.map(g => ({ id: g.id, name: g.name, boardIds: g.boardIds })))
    } else {
      console.log('[EnhancedGifGroupManager] videoGroupManager not available')
    }
    
    // No longer using old layoutManager groups - only VideoGroupManager
    if (groups.length === 0) {
      console.log('[EnhancedGifGroupManager] No groups found in VideoGroupManager')
    }
    
    if (groups.length === 0) {
      this.showNotification('No groups to export', 'warning')
      return
    }
    
    // Trigger GIF export only
    this.showNotification(`Exporting ${groups.length} GIF${groups.length !== 1 ? 's' : ''}...`, 'info')
    
    // Create a GIF-only export configuration using actual group settings
    const gifConfig = {
      includeGifs: true,
      gifGroups: groups.map(group => group.id),
      videoGroups: groups.map(group => group.id),
      groupData: groups,
      gifSettings: {
        maxWidth: 400, // Default fallback
        resolution: '1440', // 2K default (can be overridden by export dialog)
        includeDialogue: false
      },
      openFolder: true // Open the exports folder when done
    }
    
    // Try to get resolution from export dialog if available
    if (typeof document !== 'undefined') {
      const resolutionSelect = document.getElementById('gif-resolution')
      if (resolutionSelect) {
        gifConfig.gifSettings.resolution = resolutionSelect.value
        console.log(`[EnhancedGifGroupManager] Using resolution from dialog: ${gifConfig.gifSettings.resolution}`)
      }
    }
    
    console.log('[EnhancedGifGroupManager] Group settings for export:', groups.map(g => ({
      name: g.name,
      fps: g.fps,
      maxWidth: g.maxWidth,
      duration: g.duration
    })))
    
    console.log('[EnhancedGifGroupManager] Export config:', gifConfig)
    
    // Trigger GIF generation using the new exportVideoGroups method
    if (typeof window !== 'undefined' && window.exportIntegration) {
      console.log('[EnhancedGifGroupManager] Export integration available, checking group source...')
      
        // Always use exportVideoGroups for VideoGroupManager groups
        if (this.videoGroupManager && this.videoGroupManager.getAllGroups().length > 0) {
          console.log('[EnhancedGifGroupManager] Using exportVideoGroups method')
          window.exportIntegration.exportVideoGroups(gifConfig)
        } else {
          console.log('[EnhancedGifGroupManager] No groups available for export')
          this.showNotification('No groups available for export', 'warning')
        }
    } else {
      console.error('[EnhancedGifGroupManager] Export integration not available!')
      this.showNotification('Export system not available', 'error')
    }
  }

  toggleAdvancedMode() {
    const groups = this.layoutManager.getGifGroups()
    if (groups.length === 0) {
      this.showNotification('No groups to configure', 'warning')
      return
    }
    
    this.showAdvancedModeDialog(groups)
  }

  showAdvancedModeDialog(groups) {
    const dialog = document.createElement('div')
    dialog.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
    `
    
    dialog.innerHTML = `
      <div style="
        background: white;
        border-radius: 12px;
        padding: 24px;
        min-width: 500px;
        max-width: 80vw;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 20px 25px rgba(0, 0, 0, 0.15);
      ">
        <h3 style="margin: 0 0 20px 0; font-size: 18px; font-weight: 600; color: #1f2937;">
          Advanced Group Settings
        </h3>
        <div id="advanced-groups-list">
          ${groups.map(group => `
            <div class="advanced-group-item" data-group-id="${group.id}" style="
              padding: 16px; margin-bottom: 16px; background: #f8fafc;
              border-radius: 8px; border: 1px solid #e5e7eb;
            ">
              <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                <div style="
                  width: 16px; height: 16px; border-radius: 50%;
                  background: ${group.color};
                "></div>
                <div>
                  <div style="font-weight: 600; font-size: 14px; color: #1f2937;">${group.name}</div>
                  <div style="font-size: 12px; color: #6b7280;">${group.boardIndices.length} boards</div>
                </div>
              </div>
              <div style="display: flex; gap: 16px; align-items: center;">
                <div style="flex: 1;">
                  <label style="display: block; font-size: 12px; font-weight: 500; color: #374151; margin-bottom: 4px;">
                    FPS
                  </label>
                    <input type="number" class="fps-input" value="${group.fps || 5}" min="1" max="60" style="
                    width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px;
                    font-size: 14px;
                  ">
                </div>
                <div style="flex: 1;">
                  <label style="display: block; font-size: 12px; font-weight: 500; color: #374151; margin-bottom: 4px;">
                    Max Width (px)
                  </label>
                  <input type="number" class="width-input" value="${group.maxWidth || 400}" min="100" max="1200" style="
                    width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px;
                    font-size: 14px;
                  ">
                </div>
                <div style="flex: 1;">
                  <label style="display: block; font-size: 12px; font-weight: 500; color: #374151; margin-bottom: 4px;">
                    <input type="checkbox" class="link-notes-checkbox" ${group.linkedNotes ? 'checked' : ''} style="margin-right: 6px;">
                    Link Notes
                  </label>
                  <div style="font-size: 11px; color: #6b7280;">
                    Combine notes from all boards
                  </div>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
        <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 20px;">
          <button id="cancel-advanced" style="
            background: #f3f4f6; color: #374151; border: 1px solid #d1d5db;
            padding: 8px 16px; border-radius: 6px; cursor: pointer;
          ">Cancel</button>
          <button id="save-advanced" style="
            background: #3b82f6; color: white; border: none;
            padding: 8px 16px; border-radius: 6px; cursor: pointer;
          ">Save Settings</button>
        </div>
      </div>
    `
    
    document.body.appendChild(dialog)
    
    const cancelBtn = dialog.querySelector('#cancel-advanced')
    const saveBtn = dialog.querySelector('#save-advanced')
    
    const cleanup = () => {
      document.body.removeChild(dialog)
    }
    
    cancelBtn.addEventListener('click', cleanup)
    
    saveBtn.addEventListener('click', () => {
      // Save all group settings
      dialog.querySelectorAll('.advanced-group-item').forEach(item => {
        const groupId = item.dataset.groupId
        const group = this.layoutManager.getGifGroup(groupId)
        if (group) {
          group.fps = parseInt(item.querySelector('.fps-input').value)
          group.maxWidth = parseInt(item.querySelector('.width-input').value)
          group.linkedNotes = item.querySelector('.link-notes-checkbox').checked
        }
      })
      
      this.updateGroupsList()
      this.showNotification('Advanced settings saved!', 'success')
      cleanup()
    })
  }

  changeGroupColor(groupId) {
    const group = this.videoGroupManager.groups.get(groupId)
    if (!group) return

    // Create color picker modal
    const modal = document.createElement('div')
    modal.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0, 0, 0, 0.5); display: flex; align-items: center;
      justify-content: center; z-index: 10000;
    `

    const colorPalette = [
      '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e',
      '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
      '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#64748b'
    ]

    const content = document.createElement('div')
    content.style.cssText = `
      background: white; border-radius: 12px; padding: 24px; max-width: 400px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    `

    content.innerHTML = `
      <h3 style="margin: 0 0 16px 0; color: #1f2937; font-size: 18px;">Change Group Color</h3>
      <p style="margin: 0 0 20px 0; color: #6b7280; font-size: 14px;">
        Select a new color for group "${group.name}":
      </p>
      <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-bottom: 20px;">
        ${colorPalette.map(color => `
          <button class="color-option" data-color="${color}" style="
            width: 40px; height: 40px; border-radius: 8px; border: 2px solid transparent;
            background: ${color}; cursor: pointer; transition: all 0.2s;
            ${group.color === color ? 'border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);' : ''}
          " title="${color}"></button>
        `).join('')}
      </div>
      <div style="display: flex; gap: 12px; justify-content: flex-end;">
        <button id="cancel-color" style="
          background: #f3f4f6; color: #374151; border: 1px solid #d1d5db;
          padding: 8px 16px; border-radius: 6px; cursor: pointer;
        ">Cancel</button>
        <button id="apply-color" style="
          background: #3b82f6; color: white; border: none;
          padding: 8px 16px; border-radius: 6px; cursor: pointer;
        ">Apply</button>
      </div>
    `

    modal.appendChild(content)
    document.body.appendChild(modal)

    let selectedColor = group.color

    // Add event listeners
    content.querySelectorAll('.color-option').forEach(btn => {
      btn.addEventListener('click', () => {
        // Remove previous selection
        content.querySelectorAll('.color-option').forEach(b => {
          b.style.borderColor = 'transparent'
          b.style.boxShadow = 'none'
        })
        
        // Select new color
        btn.style.borderColor = '#3b82f6'
        btn.style.boxShadow = '0 0 0 2px rgba(59, 130, 246, 0.2)'
        selectedColor = btn.dataset.color
      })
    })

    const cleanup = () => {
      document.body.removeChild(modal)
    }

    content.querySelector('#cancel-color').addEventListener('click', cleanup)
    content.querySelector('#apply-color').addEventListener('click', () => {
      if (selectedColor !== group.color) {
        this.videoGroupManager.updateGroup(groupId, { color: selectedColor })
        this.updateGroupsList()
        this.updateTimelineDisplay()
        this.showNotification(`Group color changed to ${selectedColor}`, 'success')
      }
      cleanup()
    })

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) cleanup()
    })
  }

  toggleTimingMode(groupId) {
    const group = this.videoGroupManager.groups.get(groupId)
    if (!group) return

    // Store undo state before operation
    this.storeUndoState()

    // Toggle between FPS and duration mode
    const newMode = group.timingMode === 'fps' ? 'duration' : 'fps'
    group.timingMode = newMode
    this.videoGroupManager.saveGroupsToStorage()
    
    this.updateGroupsList()
  }

  // Preview timing updates without saving or re-rendering
  previewGroupTiming(groupId, value) {
    const group = this.videoGroupManager.groups.get(groupId)
    if (!group) return

    if (group.timingMode === 'duration') {
      group.duration = value
    } else {
      group.fps = value
    }
    // No storage save or UI refresh here – keeps drag smooth
  }

  updateGroupTiming(groupId, value) {
    const group = this.videoGroupManager.groups.get(groupId)
    if (!group) return

    // Store undo state before operation
    this.storeUndoState()

    if (group.timingMode === 'duration') {
      group.duration = value
    } else {
      group.fps = value
    }
    this.videoGroupManager.saveGroupsToStorage()
    
    this.updateGroupsList()
  }

  toggleAdvancedMode(groupId) {
    const group = this.videoGroupManager.groups.get(groupId)
    if (!group) return

    // Store undo state before operation
    this.storeUndoState()

    // Toggle advanced mode
    group.advancedMode = !group.advancedMode
    this.videoGroupManager.saveGroupsToStorage()
    
    if (group.advancedMode) {
      this.showAdvancedTimingDialog(groupId)
    } else {
      this.updateGroupsList()
    }
  }

  resetToMainSlider(groupId) {
    const group = this.videoGroupManager.groups.get(groupId)
    if (!group) return

    // Reset to main slider mode
    group.advancedMode = false
    this.videoGroupManager.saveGroupsToStorage()
    this.updateGroupsList()
  }

  showAdvancedTimingDialog(groupId) {
    const group = this.videoGroupManager.groups.get(groupId)
    if (!group) return

    // Create advanced timing dialog
    const dialog = document.createElement('div')
    dialog.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center;
      z-index: 10000;
    `
    
    const content = document.createElement('div')
    content.style.cssText = `
      background: white; padding: 20px; border-radius: 8px; max-width: 500px; width: 90%;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2); max-height: 80vh; overflow-y: auto;
    `
    
    content.innerHTML = `
      <h3 style="margin: 0 0 16px 0; color: #1f2937;">Advanced Timing - ${group.name}</h3>
      <p style="margin: 0 0 16px 0; color: #6b7280; font-size: 14px;">
        Set individual duration for each board in the group.
      </p>
      <div id="advanced-timing-list" style="margin-bottom: 16px;"></div>
      <div style="display: flex; gap: 8px; justify-content: flex-end;">
        <button id="advanced-cancel" style="
          background: #f3f4f6; border: 1px solid #d1d5db; color: #374151;
          padding: 8px 16px; border-radius: 6px; cursor: pointer;
        ">Cancel</button>
        <button id="advanced-save" style="
          background: #3b82f6; border: 1px solid #3b82f6; color: white;
          padding: 8px 16px; border-radius: 6px; cursor: pointer;
        ">Save</button>
      </div>
    `
    
    // Populate board timing controls
    const timingList = content.querySelector('#advanced-timing-list')
    group.boardIds.forEach((boardId, index) => {
      const board = (this.boardData && this.boardData.boards) ? this.boardData.boards[boardId] : null
      const boardTiming = group.boardTimings?.[boardId] || 1.0
      
      const boardItem = document.createElement('div')
      boardItem.style.cssText = `
        display: flex; align-items: center; justify-content: space-between;
        padding: 8px; margin-bottom: 8px; background: #f8fafc;
        border-radius: 6px; border: 1px solid #e5e7eb;
      `
      
      boardItem.innerHTML = `
        <div>
          <div style="font-weight: 500; font-size: 13px; color: #1f2937;">
            Board ${boardId + 1} ${board && board.shot ? `(${board.shot})` : ''}
          </div>
          <div style="font-size: 11px; color: #6b7280;">
            ${typeof group.boardTimings?.[boardId] === 'number' ? `Current: ${group.boardTimings[boardId]}s` : 'No duration set'}
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 11px; color: #6b7280;">Duration:</span>
          <input type="number" class="board-duration-input" 
            value="${boardTiming}" min="0.1" max="10" step="0.1"
            style="width: 60px; padding: 4px; border: 1px solid #d1d5db; border-radius: 4px;"
            data-board-id="${boardId}"
          />
          <span style="font-size: 11px; color: #6b7280;">s</span>
        </div>
      `
      
      timingList.appendChild(boardItem)
    })
    
    dialog.appendChild(content)
    document.body.appendChild(dialog)
    
    // Event listeners
    content.querySelector('#advanced-cancel').onclick = () => {
      document.body.removeChild(dialog)
      this.updateGroupsList()
    }
    
    content.querySelector('#advanced-save').onclick = () => {
      // Save individual board timings
      const boardTimings = {}
      content.querySelectorAll('.board-duration-input').forEach(input => {
        const boardId = parseInt(input.dataset.boardId)
        const duration = parseFloat(input.value)
        boardTimings[boardId] = duration
      })
      
      group.boardTimings = boardTimings
      group.advancedMode = true
      this.videoGroupManager.saveGroupsToStorage()
      document.body.removeChild(dialog)
      this.updateGroupsList()
    }
    
    // Close on background click
    dialog.onclick = (e) => {
      if (e.target === dialog) {
        document.body.removeChild(dialog)
        this.updateGroupsList()
      }
    }
  }

  async setGroupFPS(groupId) {
    const group = this.layoutManager.getGifGroup(groupId)
    if (!group) return
    
    // Use custom modal instead of prompt()
    const fps = await this.showFpsInputDialog(group.name, group.fps || 5)
    if (fps && !isNaN(fps) && fps >= 1 && fps <= 60) {
      group.fps = parseInt(fps)
      this.updateGroupsList()
      this.showNotification(`FPS set to ${fps} for "${group.name}"`, 'success')
    }
  }

  linkGroupNotes() {
    const groups = this.layoutManager.getGifGroups()
    if (groups.length === 0) {
      this.showNotification('No groups to link notes', 'warning')
      return
    }
    
    let linkedCount = 0
    groups.forEach(group => {
      if (group.boardIndices.length > 1) {
        // Combine notes from all boards in the group
        const combinedNotes = group.boardIndices.map(index => {
          const board = this.boardData.boards[index]
          return board.notes || ''
        }).filter(note => note.trim()).join('\n\n---\n\n')
        
        // Set the combined notes to the first board
        const firstBoardIndex = group.boardIndices[0]
        this.boardData.boards[firstBoardIndex].notes = combinedNotes
        
        group.linkedNotes = true
        linkedCount++
      }
    })
    
    this.updateGroupsList()
    this.showNotification(`Linked notes for ${linkedCount} group${linkedCount !== 1 ? 's' : ''}`, 'success')
  }

  showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div')
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      left: 20px;
      z-index: 3000;
      background: ${type === 'success' ? '#10b981' : type === 'warning' ? '#f59e0b' : type === 'error' ? '#ef4444' : '#3b82f6'};
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      font-size: 14px;
      font-weight: 500;
      max-width: 300px;
    `
    notification.textContent = message
    
    document.body.appendChild(notification)
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification)
      }
    }, 3000)
  }

  showFpsInputDialog(groupName, currentFps) {
    return new Promise((resolve) => {
      // Create modal overlay
      const overlay = document.createElement('div')
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
      `

      // Create modal content
      const modal = document.createElement('div')
      modal.style.cssText = `
        background: white;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        min-width: 300px;
      `

      modal.innerHTML = `
        <h3 style="margin: 0 0 15px 0; color: #333;">Set FPS for "${groupName}"</h3>
        <input type="number" id="fps-input" value="${currentFps}" min="1" max="60" 
               style="width: 100%; padding: 8px; margin: 10px 0; border: 1px solid #ccc; border-radius: 4px;">
        <div style="text-align: right; margin-top: 15px;">
          <button id="cancel-fps" style="margin-right: 10px; padding: 8px 16px; border: 1px solid #ccc; background: white; border-radius: 4px; cursor: pointer;">Cancel</button>
          <button id="confirm-fps" style="padding: 8px 16px; background: #007acc; color: white; border: none; border-radius: 4px; cursor: pointer;">Set FPS</button>
        </div>
      `

      overlay.appendChild(modal)
      document.body.appendChild(overlay)

      // Focus input
      const input = modal.querySelector('#fps-input')
      input.focus()
      input.select()

      // Event handlers
      const cleanup = () => {
        document.body.removeChild(overlay)
      }

      modal.querySelector('#cancel-fps').onclick = () => {
        cleanup()
        resolve(null)
      }

      modal.querySelector('#confirm-fps').onclick = () => {
        const fps = parseInt(input.value)
        cleanup()
        resolve(fps)
      }

      // Enter key to confirm
      input.onkeydown = (e) => {
        if (e.key === 'Enter') {
          const fps = parseInt(input.value)
          cleanup()
          resolve(fps)
        } else if (e.key === 'Escape') {
          cleanup()
          resolve(null)
        }
      }

      // Click outside to cancel
      overlay.onclick = (e) => {
        if (e.target === overlay) {
          cleanup()
          resolve(null)
        }
      }
    })
  }

  destroy() {
    // Clean up intervals and timeouts
    if (this.selectionSyncInterval) {
      clearInterval(this.selectionSyncInterval)
      this.selectionSyncInterval = null
    }

    if (this.selectionSyncTimeout) {
      clearTimeout(this.selectionSyncTimeout)
      this.selectionSyncTimeout = null
    }

    if (this.timelineUpdateTimeout) {
      clearTimeout(this.timelineUpdateTimeout)
      this.timelineUpdateTimeout = null
    }

    if (this.autoCreateTimeout) {
      clearTimeout(this.autoCreateTimeout)
      this.autoCreateTimeout = null
    }

    if (this.groupOperationTimeout) {
      clearTimeout(this.groupOperationTimeout)
      this.groupOperationTimeout = null
    }

    // Clean up video group manager
    if (this.videoGroupManager) {
      this.videoGroupManager.cleanup()
    }

    const toolbar = document.getElementById('gif-grouping-toolbar')
    if (toolbar) {
      document.body.removeChild(toolbar)
    }

    // Remove grouping mode class
    const timeline = document.querySelector('#timeline')
    if (timeline) {
      timeline.classList.remove('gif-grouping-mode')
    }
  }
}

module.exports = EnhancedGifGroupManager
