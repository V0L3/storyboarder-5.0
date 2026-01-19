const fs = require('fs')
const path = require('path')
const { exec } = require('child_process')
const { promisify } = require('util')
const { ensureExportsPathExists } = require('../exporters/common')

const execAsync = promisify(exec)


class VideoGroupManager {
  constructor(projectPath = null, boardData = null) {
    this.groups = new Map()
    this.groupColors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
    ]
    this.nextColorIndex = 0
    this.currentColorIndex = 0
    this.timelineUpdateTimeout = null
    this.dividerUpdateTimeout = null
    this.projectPath = projectPath
    this.boardData = boardData
    this.webglContextLost = false
    this.webglNotAvailableLogged = false
    
    // Generate project-specific storage key
    this.storageKey = this.generateProjectStorageKey()
    
    // Load existing groups from localStorage
    this.loadGroups()
    
    // Monitor WebGL context status
    this.startWebGLMonitoring()
  }

  // Generate project-specific storage key
  generateProjectStorageKey() {
    if (!this.projectPath) {
      // Fallback to global storage if no project path
      return 'storyboarder_video_groups'
    }
    
    // Create a hash of the project path for consistent storage key
    const path = require('path')
    const crypto = require('crypto')
    const projectName = path.basename(this.projectPath, path.extname(this.projectPath))
    const projectHash = crypto.createHash('md5').update(this.projectPath).digest('hex').substring(0, 8)
    return `storyboarder_video_groups_${projectName}_${projectHash}`
  }

  // Update the board data reference (needed after undo/redo or board changes)
  updateBoardDataReference(boardData) {
    this.boardData = boardData
  }

  // Start monitoring WebGL context status
  startWebGLMonitoring() {
    if (typeof window !== 'undefined') {
      // Check WebGL context status periodically
      this.webglCheckInterval = setInterval(() => {
        this.checkWebGLContext()
      }, 1000) // Check every second
    }
  }

  // Check if WebGL context is available
  checkWebGLContext() {
    if (typeof window !== 'undefined' && window.storyboarderSketchPane && 
        window.storyboarderSketchPane.sketchPane) {
      const hasWebGL = window.storyboarderSketchPane.sketchPane.gl !== null
      
      if (this.webglContextLost && hasWebGL) {
        // WebGL context was restored
        console.log('[VideoGroupManager] WebGL context restored')
        this.webglContextLost = false
      } else if (!this.webglContextLost && !hasWebGL) {
        // WebGL context was lost
        console.warn('[VideoGroupManager] WebGL context lost, disabling dividers')
        this.webglContextLost = true
        this.hideGroupDividers() // Hide any existing dividers
      }
    } else {
      // Only log this once to avoid spam
      if (!this.webglNotAvailableLogged) {
        console.log('[VideoGroupManager] WebGL monitoring: storyboarderSketchPane not available')
        this.webglNotAvailableLogged = true
      }
    }
  }

  // Stop WebGL monitoring
  stopWebGLMonitoring() {
    if (this.webglCheckInterval) {
      clearInterval(this.webglCheckInterval)
      this.webglCheckInterval = null
    }
  }

  // Test method to manually trigger dividers (for debugging)
  testDividers() {
    
    // First, let's test if we can find thumbnails
    const thumbnails = document.querySelectorAll('.thumbnail, .t-scene, [data-thumbnail]')
    
    if (thumbnails.length > 0) {
      // Test creating a simple visible divider
      const testDivider = document.createElement('div')
      testDivider.style.position = 'absolute'
      testDivider.style.top = '0'
      testDivider.style.left = '50%'
      testDivider.style.width = '4px'
      testDivider.style.height = '100%'
      testDivider.style.background = 'red'
      testDivider.style.zIndex = '9999'
      testDivider.style.transform = 'translateX(-50%)'
      testDivider.textContent = 'TEST'
      testDivider.style.color = 'white'
      testDivider.style.fontSize = '12px'
      
      const firstThumbnail = thumbnails[0]
      firstThumbnail.style.position = 'relative'
      firstThumbnail.appendChild(testDivider)
      
      
      // Remove after 3 seconds
      setTimeout(() => {
        if (testDivider.parentNode) {
          testDivider.parentNode.removeChild(testDivider)
        }
      }, 3000)
    }
    
    // Now test the normal divider system
    this.showGroupDividers(0, 1) // Test with board 0, position 1
  }

  // Cleanup method to prevent memory leaks and WebGL issues
  dispose() {
    // Stop WebGL monitoring
    this.stopWebGLMonitoring()
    
    // Clear all timeouts
    if (this.timelineUpdateTimeout) {
      clearTimeout(this.timelineUpdateTimeout)
      this.timelineUpdateTimeout = null
    }
    
    if (this.dividerUpdateTimeout) {
      clearTimeout(this.dividerUpdateTimeout)
      this.dividerUpdateTimeout = null
    }
    
    // Hide and remove all dividers
    this.hideGroupDividers()
    
    // Clear groups
    this.groups.clear()
  }

  // Show insertion dividers when dragging between boards
  showGroupDividers(draggedBoardIndex, dragPosition) {
    
    // Check if WebGL context is available (safety check)
    if (this.webglContextLost) {
      console.log('[VideoGroupManager] WebGL context lost, skipping dividers')
      return // Skip if WebGL context is lost
    }
    
    // Additional safety check - but don't fail if WebGL context is not available
    if (typeof window !== 'undefined' && window.storyboarderSketchPane && 
        window.storyboarderSketchPane.sketchPane && 
        !window.storyboarderSketchPane.sketchPane.gl) {
      console.warn('[VideoGroupManager] WebGL context not available, but continuing with dividers')
      // Don't set webglContextLost = true, just continue
    }
    
    // Throttle divider updates to prevent WebGL context issues
    if (this.dividerUpdateTimeout) {
      clearTimeout(this.dividerUpdateTimeout)
    }
    
    // Use longer throttle to reduce DOM manipulation frequency
    this.dividerUpdateTimeout = setTimeout(() => {
      this.hideGroupDividers() // Clear any existing dividers
      
      if (!this.boardData || !this.boardData.boards) {
        return
      }

      const groups = Array.from(this.groups.values())
      const timeline = document.querySelector('#timeline')
      if (!timeline) {
        return
      }

      // Check if the dragged board is currently in a group
      const draggedBoardGroups = this.getGroupsForBoard(draggedBoardIndex)
      const isDraggedBoardInGroup = draggedBoardGroups.length > 0
      console.log('[VideoGroupManager] Board groups:', { draggedBoardGroups, isDraggedBoardInGroup })

      // Find insertion points between boards
      this.showInsertionDividers(dragPosition, isDraggedBoardInGroup)
    }, 50) // Increased throttle to 50ms for better stability
  }

  // Show insertion dividers between boards
  showInsertionDividers(dragPosition, isDraggedBoardInGroup) {
    console.log('[VideoGroupManager] showInsertionDividers called', { dragPosition, isDraggedBoardInGroup })
    
    const thumbnails = document.querySelectorAll('.thumbnail, .t-scene, [data-thumbnail]')
    console.log('[VideoGroupManager] Found thumbnails:', thumbnails.length)
    
    if (thumbnails.length === 0) {
      console.log('[VideoGroupManager] No thumbnails found')
      return
    }
    
    // Find the insertion point between boards
    let insertionIndex = dragPosition
    
    // Make sure we're within bounds
    if (insertionIndex < 0) insertionIndex = 0
    if (insertionIndex > thumbnails.length) insertionIndex = thumbnails.length
    
    // Find the left and right boards for this insertion point
    const leftBoardIndex = insertionIndex - 1
    const rightBoardIndex = insertionIndex
    
    let leftThumbnail = null
    let rightThumbnail = null
    
    if (leftBoardIndex >= 0) {
      leftThumbnail = thumbnails[leftBoardIndex]
    }
    if (rightBoardIndex < thumbnails.length) {
      rightThumbnail = thumbnails[rightBoardIndex]
    }
    
    console.log('[VideoGroupManager] Thumbnail selection:', { leftBoardIndex, rightBoardIndex, leftThumbnail: !!leftThumbnail, rightThumbnail: !!rightThumbnail })
    
    // Determine group context
    const leftInGroup = leftThumbnail ? this.isBoardInGroup(leftBoardIndex) : false
    const rightInGroup = rightThumbnail ? this.isBoardInGroup(rightBoardIndex) : false
    
    console.log('[VideoGroupManager] Group context:', { leftInGroup, rightInGroup, isDraggedBoardInGroup })
    
    // Create insertion divider between boards
    this.createInsertionDividerBetweenBoards(leftThumbnail, rightThumbnail, {
      leftInGroup,
      rightInGroup,
      isDraggedBoardInGroup,
      insertionIndex
    })
  }

  // Check if a board is in any group
  isBoardInGroup(boardIndex) {
    for (const group of this.groups.values()) {
      if (group.boardIds.includes(boardIndex)) {
        return true
      }
    }
    return false
  }

  // Create insertion divider between boards (not on boards)
  createInsertionDividerBetweenBoards(leftThumbnail, rightThumbnail, context) {
    console.log('[VideoGroupManager] createInsertionDividerBetweenBoards called', { leftThumbnail, rightThumbnail, context })
    
    // Find the timeline container
    const timeline = document.querySelector('#timeline')
    if (!timeline) {
      console.log('[VideoGroupManager] No timeline container found')
      return
    }
    
    // Use DocumentFragment for better performance
    const fragment = document.createDocumentFragment()
    
    const divider = document.createElement('div')
    divider.className = 'insertion-divider'
    divider.setAttribute('data-insertion-index', context.insertionIndex)

    // Create drop zones
    const leftZone = document.createElement('div')
    leftZone.className = 'drop-zone-left'
    leftZone.setAttribute('data-action', 'join-group')

    const rightZone = document.createElement('div')
    rightZone.className = 'drop-zone-right'
    rightZone.setAttribute('data-action', 'leave-group')

    // Create hints
    const leftHint = document.createElement('div')
    leftHint.className = 'drop-zone-hint left'
    leftHint.textContent = context.isDraggedBoardInGroup ? 'Leave group' : 'Join group'

    const rightHint = document.createElement('div')
    rightHint.className = 'drop-zone-hint right'
    rightHint.textContent = context.isDraggedBoardInGroup ? 'Leave group' : 'Join group'

    const centerHint = document.createElement('div')
    centerHint.className = 'drop-zone-hint center'
    centerHint.textContent = 'Insert here'

    // Add zones and hints to divider
    divider.appendChild(leftZone)
    divider.appendChild(rightZone)
    divider.appendChild(leftHint)
    divider.appendChild(rightHint)
    divider.appendChild(centerHint)

    // Add to fragment
    fragment.appendChild(divider)

    // Position divider between boards
    let insertAfter = null
    
    if (rightThumbnail) {
      // Insert before the right thumbnail
      insertAfter = rightThumbnail.previousSibling
      rightThumbnail.parentNode.insertBefore(fragment, rightThumbnail)
    } else if (leftThumbnail) {
      // Insert after the left thumbnail
      leftThumbnail.parentNode.appendChild(fragment)
    } else {
      // Insert at the beginning
      timeline.appendChild(fragment)
    }
    
    console.log('[VideoGroupManager] Divider created and positioned between boards')

    // Show with animation (use requestAnimationFrame for better performance)
    requestAnimationFrame(() => {
      console.log('[VideoGroupManager] Adding show classes to divider')
      divider.classList.add('show')
      leftHint.classList.add('show')
      rightHint.classList.add('show')
      centerHint.classList.add('show')
    })
  }

  // Legacy method for backward compatibility
  createInsertionDivider(thumbnail, context) {
    console.log('[VideoGroupManager] createInsertionDivider called (legacy)', { thumbnail, context })
    // Redirect to the new method
    this.createInsertionDividerBetweenBoards(thumbnail, null, context)
  }

  // Show single dividers for individual groups
  showSingleDividers(dragPosition, groups) {
    groups.forEach(group => {
      const groupStart = Math.min(...group.boardIds)
      const groupEnd = Math.max(...group.boardIds)
      
      // Find the thumbnail element for positioning
      const thumbnails = document.querySelectorAll('.thumbnail, .t-scene, [data-thumbnail]')
      let targetThumbnail = null
      
      if (dragPosition < groupStart) {
        // Dragging before group - show divider on the group start
        targetThumbnail = thumbnails[groupStart]
        if (targetThumbnail) {
          this.createDivider(targetThumbnail, 'left', 'Join group')
        }
      } else if (dragPosition > groupEnd) {
        // Dragging after group - show divider on the group end
        targetThumbnail = thumbnails[groupEnd]
        if (targetThumbnail) {
          this.createDivider(targetThumbnail, 'right', 'Join group')
        }
      }
    })
  }

  // Show double divider for adjacent groups
  showDoubleDivider(dragPosition, sortedGroups) {
    // Find the two adjacent groups
    let leftGroup = null
    let rightGroup = null
    
    for (let i = 0; i < sortedGroups.length - 1; i++) {
      const group1End = Math.max(...sortedGroups[i].boardIds)
      const group2Start = Math.min(...sortedGroups[i + 1].boardIds)
      if (group2Start - group1End === 1) {
        leftGroup = sortedGroups[i]
        rightGroup = sortedGroups[i + 1]
        break
      }
    }

    if (leftGroup && rightGroup) {
      const thumbnails = document.querySelectorAll('.thumbnail, .t-scene, [data-thumbnail]')
      const leftGroupEnd = Math.max(...leftGroup.boardIds)
      const rightGroupStart = Math.min(...rightGroup.boardIds)
      
      // Show dividers on both sides
      const leftThumbnail = thumbnails[leftGroupEnd]
      const rightThumbnail = thumbnails[rightGroupStart]
      
      if (leftThumbnail) {
        this.createDivider(leftThumbnail, 'right', 'Join left group')
      }
      if (rightThumbnail) {
        this.createDivider(rightThumbnail, 'left', 'Join right group')
      }
      
      // Show center divider for "don't join either group"
      if (leftThumbnail) {
        this.createDivider(leftThumbnail, 'center', 'Don\'t join any group')
      }
    }
  }

  // Create a visual divider
  createDivider(thumbnail, position, hint, isBoundary = false) {
    console.log('[VideoGroupManager] Creating divider:', { position, hint, isBoundary, thumbnail })
    
    const divider = document.createElement('div')
    let className = `group-drag-divider ${position}`
    if (isBoundary) {
      className += ' boundary'
    }
    divider.className = className
    divider.setAttribute('data-position', position)
    divider.setAttribute('data-hint', hint)
    
    const hintElement = document.createElement('div')
    hintElement.className = 'group-drag-hint'
    hintElement.textContent = hint
    divider.appendChild(hintElement)
    
    thumbnail.style.position = 'relative'
    thumbnail.appendChild(divider)
    
    console.log('[VideoGroupManager] Divider created and added to thumbnail')
    
    // Show with animation
    setTimeout(() => {
      divider.classList.add('show')
      hintElement.classList.add('show')
      console.log('[VideoGroupManager] Divider shown with animation')
    }, 10)
  }

  // Hide all group dividers
  hideGroupDividers() {
    // Clear any pending divider updates
    if (this.dividerUpdateTimeout) {
      clearTimeout(this.dividerUpdateTimeout)
      this.dividerUpdateTimeout = null
    }
    
    // Hide old-style dividers
    const oldDividers = document.querySelectorAll('.group-drag-divider')
    oldDividers.forEach(divider => {
      divider.classList.remove('show')
      const hint = divider.querySelector('.group-drag-hint')
      if (hint) hint.classList.remove('show')
      
      // Remove immediately to prevent WebGL context issues
      if (divider.parentNode) {
        divider.parentNode.removeChild(divider)
      }
    })
    
    // Hide new insertion dividers
    const insertionDividers = document.querySelectorAll('.insertion-divider')
    insertionDividers.forEach(divider => {
      divider.classList.remove('show')
      const hints = divider.querySelectorAll('.drop-zone-hint')
      hints.forEach(hint => hint.classList.remove('show'))
      
      // Remove immediately to prevent WebGL context issues
      if (divider.parentNode) {
        divider.parentNode.removeChild(divider)
      }
    })
  }

  // Find all group boundaries (where grouped boards meet ungrouped boards)
  findGroupBoundaries(groups) {
    const boundaries = []
    const totalBoards = this.boardData.boards.length
    
    console.log('[VideoGroupManager] Finding boundaries for', totalBoards, 'boards')
    
    // Create a map of which boards are in groups
    const groupedBoards = new Set()
    groups.forEach(group => {
      console.log('[VideoGroupManager] Group boardIds:', group.boardIds)
      group.boardIds.forEach(boardId => groupedBoards.add(boardId))
    })
    
    console.log('[VideoGroupManager] Grouped boards:', Array.from(groupedBoards))
    
    // Find transitions between grouped and ungrouped boards
    for (let i = 0; i < totalBoards - 1; i++) {
      const currentInGroup = groupedBoards.has(i)
      const nextInGroup = groupedBoards.has(i + 1)
      
      if (currentInGroup !== nextInGroup) {
        const boundary = {
          position: i + 1, // Position between boards i and i+1
          leftInGroup: currentInGroup,
          rightInGroup: nextInGroup,
          leftBoard: i,
          rightBoard: i + 1
        }
        boundaries.push(boundary)
        console.log('[VideoGroupManager] Found boundary:', boundary)
      }
    }
    
    console.log('[VideoGroupManager] Total boundaries found:', boundaries.length)
    return boundaries
  }

  // Show boundary dividers for group/ungroup transitions
  showBoundaryDividers(dragPosition, boundaries, isDraggedBoardInGroup) {
    boundaries.forEach(boundary => {
      const thumbnails = document.querySelectorAll('.thumbnail, .t-scene, [data-thumbnail]')
      const leftThumbnail = thumbnails[boundary.leftBoard]
      const rightThumbnail = thumbnails[boundary.rightBoard]
      
      if (leftThumbnail && rightThumbnail) {
        if (boundary.leftInGroup && !boundary.rightInGroup) {
          // Group ends, ungrouped board begins
          this.createDivider(leftThumbnail, 'right', 
            isDraggedBoardInGroup ? 'Leave group' : 'Join group', true)
        } else if (!boundary.leftInGroup && boundary.rightInGroup) {
          // Ungrouped board ends, group begins
          this.createDivider(rightThumbnail, 'left', 
            isDraggedBoardInGroup ? 'Leave group' : 'Join group', true)
        }
      }
    })
  }

  // Show group-based dividers (original behavior)
  showGroupBasedDividers(dragPosition, groups, isDraggedBoardInGroup) {
    // Find groups that are adjacent to the drag position
    const adjacentGroups = groups.filter(group => {
      const groupStart = Math.min(...group.boardIds)
      const groupEnd = Math.max(...group.boardIds)
      return Math.abs(dragPosition - groupStart) <= 1 || Math.abs(dragPosition - groupEnd) <= 1
    })

    if (adjacentGroups.length === 0) return

    // Check if we have adjacent groups (groups that are next to each other)
    const sortedGroups = adjacentGroups.sort((a, b) => {
      const aStart = Math.min(...a.boardIds)
      const bStart = Math.min(...b.boardIds)
      return aStart - bStart
    })

    // Find if there are two groups that are adjacent to each other
    let hasAdjacentGroups = false
    for (let i = 0; i < sortedGroups.length - 1; i++) {
      const group1End = Math.max(...sortedGroups[i].boardIds)
      const group2Start = Math.min(...sortedGroups[i + 1].boardIds)
      if (group2Start - group1End === 1) {
        hasAdjacentGroups = true
        break
      }
    }

    if (hasAdjacentGroups) {
      // Show double divider for adjacent groups
      this.showDoubleDivider(dragPosition, sortedGroups)
    } else {
      // Show single dividers for individual groups
      this.showSingleDividers(dragPosition, adjacentGroups)
    }
  }

  // Check if a drag position is over a divider
  isOverDivider(dragPosition, mouseX) {
    // Check if WebGL context is available (safety check)
    if (typeof window !== 'undefined' && window.storyboarderSketchPane && 
        window.storyboarderSketchPane.sketchPane && 
        !window.storyboarderSketchPane.sketchPane.gl) {
      return null
    }
    
    // Check insertion dividers first
    const insertionDividers = document.querySelectorAll('.insertion-divider.show')
    
    for (const divider of insertionDividers) {
      const rect = divider.getBoundingClientRect()
      
      if (mouseX >= rect.left && mouseX <= rect.right) {
        const leftZone = divider.querySelector('.drop-zone-left')
        const rightZone = divider.querySelector('.drop-zone-right')
        const leftRect = leftZone.getBoundingClientRect()
        const rightRect = rightZone.getBoundingClientRect()
        
        // Check which zone the mouse is over
        if (mouseX >= leftRect.left && mouseX <= leftRect.right) {
          return { 
            position: 'left', 
            action: 'join-group',
            insertionIndex: parseInt(divider.getAttribute('data-insertion-index'))
          }
        } else if (mouseX >= rightRect.left && mouseX <= rightRect.right) {
          return { 
            position: 'right', 
            action: 'leave-group',
            insertionIndex: parseInt(divider.getAttribute('data-insertion-index'))
          }
        } else {
          // Center zone - just insert without group change
          return { 
            position: 'center', 
            action: 'insert',
            insertionIndex: parseInt(divider.getAttribute('data-insertion-index'))
          }
        }
      }
    }
    
    // Fallback to old-style dividers
    const oldDividers = document.querySelectorAll('.group-drag-divider.show')
    
    for (const divider of oldDividers) {
      const rect = divider.getBoundingClientRect()
      const position = divider.getAttribute('data-position')
      
      if (position === 'left' && mouseX >= rect.left - 10 && mouseX <= rect.right + 10) {
        return { position: 'left', hint: divider.getAttribute('data-hint') }
      } else if (position === 'right' && mouseX >= rect.left - 10 && mouseX <= rect.right + 10) {
        return { position: 'right', hint: divider.getAttribute('data-hint') }
      } else if (position === 'center' && mouseX >= rect.left - 10 && mouseX <= rect.right + 10) {
        return { position: 'center', hint: divider.getAttribute('data-hint') }
      }
    }
    
    return null
  }

  // Test function to debug the divider system
  testDividers() {
    console.log('[VideoGroupManager] Testing divider system...')
    
    // Test with a sample board
    const testBoardIndex = 0
    const testPosition = 1
    
    console.log('[VideoGroupManager] Testing with board:', testBoardIndex, 'position:', testPosition)
    this.showGroupDividers(testBoardIndex, testPosition)
    
    // Check if dividers were created
    setTimeout(() => {
      const dividers = document.querySelectorAll('.group-drag-divider')
      console.log('[VideoGroupManager] Dividers found in DOM:', dividers.length)
      dividers.forEach((divider, index) => {
        console.log(`[VideoGroupManager] Divider ${index}:`, {
          className: divider.className,
          position: divider.getAttribute('data-position'),
          hint: divider.getAttribute('data-hint'),
          visible: divider.classList.contains('show')
        })
      })
    }, 100)
  }

  createGroup(boardIds, groupName = null) {
    // Validate board data is available
    if (!this.boardData || !this.boardData.boards) {
      throw new Error('Board data not available. Please ensure the application is fully loaded.')
    }
    
    // Validate board indices are within bounds
    const maxIndex = this.boardData.boards.length - 1
    const invalidIndices = boardIds.filter(id => id < 0 || id > maxIndex)
    if (invalidIndices.length > 0) {
      throw new Error(`Invalid board indices: ${invalidIndices.join(', ')}. Valid range: 0-${maxIndex}`)
    }
    
    // Validate adjacency
    if (!this.areBoardsAdjacent(boardIds)) {
      throw new Error('Selected boards must be adjacent to form a group')
    }

    // Check for existing groups and remove boards from them
    const sortedBoardIds = [...boardIds].sort((a, b) => a - b)
    this.removeBoardsFromExistingGroups(sortedBoardIds)

    // Ensure all boards have UIDs first
    this.ensureBoardsHaveUids(sortedBoardIds)
    
    // Get board UIDs for persistent tracking
    const boardUids = this.getBoardUidsFromIndices(sortedBoardIds)

    const groupId = `group_${Date.now()}`
    const color = this.groupColors[this.nextColorIndex % this.groupColors.length]
    this.nextColorIndex++

    // Generate shot number name based on first board
    const shotNumber = this.getShotNumberForBoard(sortedBoardIds[0])
    const defaultName = groupName || shotNumber

    const group = {
      id: groupId,
      name: defaultName,
      originalName: defaultName,
      boardUids: boardUids,
      boardIds: sortedBoardIds,
      color: color,
      fps: 5,
      duration: 1.0,
      timingMode: 'fps',
      advancedMode: false,
      boardTimings: {},
      loop: true,
      createdAt: new Date(),
      isRenamed: false
    }

    this.groups.set(groupId, group)

    // Remove "newShot" flag from all but the first board
    this.handleNewShotFlags(sortedBoardIds)

    // Disable fields for non-first boards in the group
    this.disableFieldsForGroupedBoards(sortedBoardIds)

    // Convert multiple shots to one shot
    this.convertMultipleShotsToOne(sortedBoardIds)

    // Save groups to localStorage
    this.saveGroupsToStorage()

    this.updateTimelineDisplay()
    return group
  }

  areBoardsAdjacent(boardIds) {
    if (boardIds.length <= 1) return true

    const sorted = [...boardIds].sort((a, b) => a - b)
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i + 1] !== sorted[i] + 1) {
        return false
      }
    }
    return true
  }

  // Ensure all boards have UIDs using the same method as the main app
  ensureBoardsHaveUids(boardIds) {
    if (!this.boardData || !this.boardData.boards) {
      return
    }

    const util = require('../utils')
    boardIds.forEach(index => {
      if (index >= 0 && index < this.boardData.boards.length) {
        const board = this.boardData.boards[index]
        if (board && !board.uid) {
          board.uid = util.uidGen(5)
        }
      }
    })
  }

  // Helper method to get board UIDs from indices
  getBoardUidsFromIndices(boardIds) {
    if (!this.boardData || !this.boardData.boards) {
      return []
    }

    return boardIds.map(index => {
      if (index < 0 || index >= this.boardData.boards.length) {
        return null
      }
      const board = this.boardData.boards[index]
      if (!board) {
        return null
      }
      if (!board.uid) {
        // Generate a UID if one doesn't exist using the same method as the main app
        const util = require('../utils')
        board.uid = util.uidGen(5)
      }
      return board.uid
    }).filter(uid => uid !== null)
  }

  // Helper method to get board indices from UIDs (preserving order)
  getBoardIndicesFromUids(boardUids) {
    if (!this.boardData || !this.boardData.boards) {
      return []
    }

    // Create a map for faster lookup
    const uidToIndexMap = new Map()
    this.boardData.boards.forEach((board, index) => {
      if (board.uid) {
        uidToIndexMap.set(board.uid, index)
      }
    })

    // Preserve the original order of UIDs when converting to indices
    const result = boardUids.map(uid => {
      const index = uidToIndexMap.get(uid)
      return index !== undefined ? index : null
    }).filter(index => index !== null)
    
    return result
  }

  // Handle board movement - check if boards are moving in or out of groups
  handleBoardMovement(movedBoardIndices, newPosition, originalPosition = null) {
    if (!this.boardData || !this.boardData.boards) {
      return
    }

    // FIXED: Update group indices FIRST, then check for group joining/leaving
    // This ensures we're checking adjacency based on the correct board positions
    this.updateGroupIndices()
    
    // Then, check for group joining/leaving with updated indices
    this.checkGroupJoiningAndLeaving(movedBoardIndices, newPosition, originalPosition)
    
    // Sync the grouped board indices after movement
    this.syncGroupedBoardIndices()
  }

  // Check if moved boards should join or leave groups
  checkGroupJoiningAndLeaving(movedBoardIndices, newPosition, originalPosition = null) {
    // Validate that we have valid board data
    if (!this.boardData || !this.boardData.boards) {
      return
    }
    
    const maxBoardIndex = this.boardData.boards.length - 1
    
    // For each moved board, check if it should join or leave a group
    for (let i = 0; i < movedBoardIndices.length; i++) {
      const originalBoardIndex = movedBoardIndices[i]
      // FIXED: The moved board's new position is the target position + offset
      const newBoardIndex = newPosition + i
      
      // Validate board index is within bounds
      if (newBoardIndex < 0 || newBoardIndex > maxBoardIndex) {
        continue
      }
      
      // Get the UID of the moved board (from its original position)
      const boardUid = this.getBoardUidsFromIndices([originalBoardIndex])[0]
      
      if (!boardUid) {
        continue
      }
      
      // First, check if this board is currently in a group (using original position)
      const currentGroup = this.findGroupContainingBoard(originalBoardIndex)
      
      if (currentGroup) {
        // Board is in a group - check if it should stay or leave
        const groupStart = Math.min(...currentGroup.boardIds)
        const groupEnd = Math.max(...currentGroup.boardIds)
        
        // If moved outside the group boundaries, remove it
        if (newBoardIndex < groupStart || newBoardIndex > groupEnd) {
          this.removeBoardFromGroup(currentGroup.id, newBoardIndex)
        }
      } else {
        // Board is not in a group - check if it should join one at its new position
        // BUT ONLY if this is an intentional drag operation, not a shift due to other boards moving
        
        // CRITICAL FIX: Only check for group joining if this is a direct user action
        // We need to distinguish between:
        // 1. A board being directly moved by the user to an adjacent position
        // 2. A board being shifted to fill a gap left by another moved board
        
        // For now, we'll be very conservative and only allow joining if:
        // - The board is being moved to a position that's directly adjacent to a group
        // - AND the movement appears to be intentional (not just filling a gap)
        
        // Check all groups to see if any are adjacent to the new position
        for (const group of this.groups.values()) {
          if (group.boardIds.length === 0) continue
          
          const groupStart = Math.min(...group.boardIds)
          const groupEnd = Math.max(...group.boardIds)
          
          // Check if the new position is adjacent to this group
          const isAdjacentToGroup = (newBoardIndex === groupStart - 1) || (newBoardIndex === groupEnd + 1)
          
          if (isAdjacentToGroup) {
            // Determine drag direction based on original and new positions
            let dragDirection = 'right' // default
            if (originalPosition !== null) {
              if (newBoardIndex === groupStart - 1) {
                dragDirection = 'left' // Dragging to join at the start
              } else if (newBoardIndex === groupEnd + 1) {
                dragDirection = 'right' // Dragging to join at the end
              } else {
                // Fallback to original logic
                dragDirection = newPosition < originalPosition ? 'left' : 'right'
              }
            }
            
            // TEMPORARY FIX: Disable automatic group joining for now
            // This prevents the bug where boards that shift into positions
            // adjacent to groups automatically join those groups
            // 
            // TODO: Implement proper intent detection to distinguish between
            // direct user actions and side effects of other board movements
            
            // For now, we'll only allow joining if the board is being moved
            // to a position that's clearly adjacent to a group AND the movement
            // appears to be intentional (not just filling a gap)
            
            // This is a conservative approach that prevents the bug but may
            // require users to manually group boards in some cases
            const shouldJoin = false // Disabled for now to fix the bug
            
            if (shouldJoin && this.shouldJoinGroup(newBoardIndex, group, dragDirection)) {
              this.addBoardToGroup(group.id, originalBoardIndex)
              break // Only join one group
            }
          }
        }
      }
    }
  }

  // Find a group that the board is adjacent to
  findAdjacentGroup(boardIndex) {
    for (const group of this.groups.values()) {
      if (this.isBoardAdjacentToGroup(boardIndex, group)) {
        return group
      }
    }
    return null
  }

  // Check if a board is adjacent to a group at its boundaries only
  isBoardAdjacentToGroup(boardIndex, group) {
    if (group.boardIds.length === 0) return false
    
    const groupStart = Math.min(...group.boardIds)
    const groupEnd = Math.max(...group.boardIds)
    
    // Board is adjacent to group only if it's adjacent to the start or end boundary
    return (boardIndex === groupStart - 1) || (boardIndex === groupEnd + 1)
  }

  // Check if a board should join a group based on drag direction
  shouldJoinGroup(boardIndex, group, dragDirection = 'right') {
    if (!this.isBoardAdjacentToGroup(boardIndex, group)) {
      return false
    }

    const groupStart = Math.min(...group.boardIds)
    const groupEnd = Math.max(...group.boardIds)
    
    // If the board is already in this group, it should stay in the group
    // when moved within the group boundaries
    if (boardIndex >= groupStart && boardIndex <= groupEnd) {
      return true
    }
    
    // If dragging from right to left (moving board before group)
    if (dragDirection === 'left') {
      // Only join if the board is being placed right before the group start
      return boardIndex === groupStart - 1
    }
    // If dragging from left to right (moving board after group)
    else if (dragDirection === 'right') {
      // Only join if the board is being placed right after the group end
      return boardIndex === groupEnd + 1
    }
    
    return false
  }

  // Find which group contains a specific board
  findGroupContainingBoard(boardIndex) {
    console.log(`[VideoGroupManager] Finding group for board index: ${boardIndex}`)
    
    // Try both boardUids and boardIds approaches
    const boardUid = this.getBoardUidsFromIndices([boardIndex])[0]
    console.log(`[VideoGroupManager] Board UID: ${boardUid}`)
    
    for (const group of this.groups.values()) {
      console.log(`[VideoGroupManager] Checking group "${group.name}":`, {
        boardIds: group.boardIds,
        boardUids: group.boardUids
      })
      
      // Check both boardIds and boardUids
      if ((group.boardIds && group.boardIds.includes(boardIndex)) || 
          (group.boardUids && boardUid && group.boardUids.includes(boardUid))) {
        console.log(`[VideoGroupManager] Found group "${group.name}" for board ${boardIndex}`)
        return group
      }
    }
    
    console.log(`[VideoGroupManager] No group found for board ${boardIndex}`)
    return null
  }

  // Add a board to an existing group
  addBoardToGroup(groupId, boardIndex) {
    const group = this.groups.get(groupId)
    if (!group) return false

    // Ensure the board has a UID
    this.ensureBoardsHaveUids([boardIndex])
    const boardUid = this.getBoardUidsFromIndices([boardIndex])[0]
    
    if (!boardUid) return false

    // Add to group if not already there
    if (!group.boardUids.includes(boardUid)) {
      group.boardUids.push(boardUid)
      group.boardIds.push(boardIndex)
      
      // Sort the arrays to maintain order
      const sortedPairs = group.boardIds.map((id, i) => ({ id, uid: group.boardUids[i] }))
        .sort((a, b) => a.id - b.id)
      
      group.boardIds = sortedPairs.map(p => p.id)
      group.boardUids = sortedPairs.map(p => p.uid)
      
      this.saveGroupsToStorage()
      return true
    }
    
    return false
  }

  // Remove a board from a group
  removeBoardFromGroup(groupId, boardIndex) {
    const group = this.groups.get(groupId)
    if (!group) return false

    const boardUid = this.getBoardUidsFromIndices([boardIndex])[0]
    if (!boardUid) return false

    const boardUidIndex = group.boardUids.indexOf(boardUid)
    if (boardUidIndex === -1) return false

    // Remove from both arrays
    group.boardUids.splice(boardUidIndex, 1)
    group.boardIds.splice(boardUidIndex, 1)

    // If group is now empty or has only one board, delete it
    if (group.boardIds.length <= 1) {
      this.groups.delete(groupId)
    }

    // Clean up the grouped board indices set
    if (typeof window !== 'undefined' && window.groupedBoardIndices) {
      window.groupedBoardIndices.delete(boardIndex)
      console.log(`[VideoGroupManager.removeBoardFromGroup] Removed board ${boardIndex} from groupedBoardIndices`)
    }

    this.saveGroupsToStorage()
    return true
  }

  // Update group indices when boards are moved
  updateGroupIndices() {
    if (!this.boardData || !this.boardData.boards) {
      return { updated: 0, removed: 0 }
    }
    
    let updatedCount = 0
    let removedCount = 0
    let expandedCount = 0
    const groups = Array.from(this.groups.values())
    
    for (const group of groups) {
      if (group.boardUids && group.boardUids.length > 0) {
        // Update boardIds based on current UIDs
        const newBoardIds = this.getBoardIndicesFromUids(group.boardUids)
        
        if (newBoardIds.length === 0) {
          // All boards deleted, remove group
          this.groups.delete(group.id)
          removedCount++
          continue
        }
        
        // Sort the indices to ensure proper order
        const sortedBoardIds = [...newBoardIds].sort((a, b) => a - b)
        
        // Check if boards are still adjacent after the move
        if (!this.areBoardsAdjacent(sortedBoardIds)) {
          // Boards are no longer adjacent - check if new boards were inserted in between
          const minIndex = Math.min(...sortedBoardIds)
          const maxIndex = Math.max(...sortedBoardIds)
          
          // Find indices that are missing from the group (these are newly inserted boards)
          const missingIndices = []
          for (let i = minIndex; i <= maxIndex; i++) {
            if (!sortedBoardIds.includes(i)) {
              missingIndices.push(i)
            }
          }
          
          // Check if all missing indices are valid board positions (new boards inserted in between)
          const validMissingIndices = missingIndices.filter(i => 
            i >= 0 && i < this.boardData.boards.length && this.boardData.boards[i]
          )
          
          if (validMissingIndices.length > 0 && validMissingIndices.length === missingIndices.length) {
            // New boards were inserted in between - add them to the group
            const allIndices = [...sortedBoardIds, ...validMissingIndices].sort((a, b) => a - b)
            const allUids = this.getBoardUidsFromIndices(allIndices)
            
            group.boardIds = allIndices
            group.boardUids = allUids
            
            // Handle newShot flags for the newly added boards
            this.handleNewShotFlags(allIndices)
            
            console.log(`[VideoGroupManager.updateGroupIndices] Group ${group.id} expanded to include inserted boards: [${allIndices.join(', ')}]`)
            expandedCount++
            updatedCount++
          } else {
            // Boards were moved OUT of the group - keep the largest contiguous segment
            const contiguousSegments = this.findContiguousSegments(sortedBoardIds)
            
            if (contiguousSegments.length === 0) {
              // No valid segments, remove the group
              this.groups.delete(group.id)
              removedCount++
              console.log(`[VideoGroupManager.updateGroupIndices] Removed group ${group.id} - no contiguous segments`)
              continue
            }
            
            // Keep the largest contiguous segment
            const largestSegment = contiguousSegments.reduce((largest, segment) => 
              segment.length > largest.length ? segment : largest
            , contiguousSegments[0])
            
            // If the largest segment has only 1 board, remove the group
            if (largestSegment.length <= 1) {
              this.groups.delete(group.id)
              removedCount++
              console.log(`[VideoGroupManager.updateGroupIndices] Removed group ${group.id} - only 1 board remains`)
              continue
            }
            
            // Update group with the largest contiguous segment
            const segmentUids = this.getBoardUidsFromIndices(largestSegment)
            group.boardIds = largestSegment
            group.boardUids = segmentUids
            
            console.log(`[VideoGroupManager.updateGroupIndices] Group ${group.id} fragmented - kept segment [${largestSegment.join(', ')}]`)
            updatedCount++
          }
        } else {
          // Boards are still adjacent, update normally
          const currentUids = this.getBoardUidsFromIndices(sortedBoardIds)
          group.boardUids = currentUids
          group.boardIds = sortedBoardIds
          updatedCount++
        }
      } else {
        // For groups without UIDs, try to generate them
        const validIndices = (group.boardIds || []).filter(index => 
          index >= 0 && index < this.boardData.boards.length
        )
        
        if (validIndices.length === 0) {
          this.groups.delete(group.id)
          removedCount++
          continue
        }
        
        // Sort and check adjacency
        const sortedIndices = [...validIndices].sort((a, b) => a - b)
        
        if (!this.areBoardsAdjacent(sortedIndices)) {
          // Check if new boards were inserted in between
          const minIndex = Math.min(...sortedIndices)
          const maxIndex = Math.max(...sortedIndices)
          
          const missingIndices = []
          for (let i = minIndex; i <= maxIndex; i++) {
            if (!sortedIndices.includes(i)) {
              missingIndices.push(i)
            }
          }
          
          const validMissingIndices = missingIndices.filter(i => 
            i >= 0 && i < this.boardData.boards.length && this.boardData.boards[i]
          )
          
          if (validMissingIndices.length > 0 && validMissingIndices.length === missingIndices.length) {
            // New boards were inserted - add them to the group
            const allIndices = [...sortedIndices, ...validMissingIndices].sort((a, b) => a - b)
            group.boardIds = allIndices
            group.boardUids = this.getBoardUidsFromIndices(allIndices)
            this.handleNewShotFlags(allIndices)
            expandedCount++
            updatedCount++
          } else {
            // Find largest contiguous segment
            const contiguousSegments = this.findContiguousSegments(sortedIndices)
            
            if (contiguousSegments.length === 0 || contiguousSegments[0].length <= 1) {
              this.groups.delete(group.id)
              removedCount++
              continue
            }
            
            const largestSegment = contiguousSegments.reduce((largest, segment) => 
              segment.length > largest.length ? segment : largest
            , contiguousSegments[0])
            
            if (largestSegment.length <= 1) {
              this.groups.delete(group.id)
              removedCount++
              continue
            }
            
            group.boardIds = largestSegment
            group.boardUids = this.getBoardUidsFromIndices(largestSegment)
            updatedCount++
          }
        } else {
          // Generate UIDs for this group
          group.boardUids = this.getBoardUidsFromIndices(sortedIndices)
          group.boardIds = sortedIndices
          updatedCount++
        }
      }
    }
    
    this.saveGroupsToStorage()
    return { updated: updatedCount, removed: removedCount, expanded: expandedCount }
  }
  
  // Find contiguous segments in an array of sorted indices
  findContiguousSegments(sortedIndices) {
    if (!sortedIndices || sortedIndices.length === 0) {
      return []
    }
    
    const segments = []
    let currentSegment = [sortedIndices[0]]
    
    for (let i = 1; i < sortedIndices.length; i++) {
      if (sortedIndices[i] === sortedIndices[i - 1] + 1) {
        // Adjacent, add to current segment
        currentSegment.push(sortedIndices[i])
      } else {
        // Gap found, start new segment
        if (currentSegment.length > 0) {
          segments.push(currentSegment)
        }
        currentSegment = [sortedIndices[i]]
      }
    }
    
    // Add the last segment
    if (currentSegment.length > 0) {
      segments.push(currentSegment)
    }
    
    return segments
  }


  // Force update all groups to ensure they're properly synchronized
  forceUpdateAllGroups() {
    if (!this.boardData || !this.boardData.boards) {
      return false
    }
    
    let updatedCount = 0
    let removedCount = 0
    let expandedCount = 0
    const groups = Array.from(this.groups.values())
    
    for (const group of groups) {
      if (group.boardUids && group.boardUids.length > 0) {
        // Find current indices for all UIDs
        const currentIndices = this.getBoardIndicesFromUids(group.boardUids)
        
        if (currentIndices.length === 0) {
          // All boards deleted, remove group
          this.groups.delete(group.id)
          removedCount++
          continue
        }
        
        // Sort the indices
        const sortedIndices = [...currentIndices].sort((a, b) => a - b)
        
        // Check if boards are still adjacent
        if (!this.areBoardsAdjacent(sortedIndices)) {
          // Boards are no longer adjacent - check if new boards were inserted in between
          const minIndex = Math.min(...sortedIndices)
          const maxIndex = Math.max(...sortedIndices)
          
          // Find indices that are missing from the group
          const missingIndices = []
          for (let i = minIndex; i <= maxIndex; i++) {
            if (!sortedIndices.includes(i)) {
              missingIndices.push(i)
            }
          }
          
          // Check if all missing indices are valid board positions
          const validMissingIndices = missingIndices.filter(i => 
            i >= 0 && i < this.boardData.boards.length && this.boardData.boards[i]
          )
          
          if (validMissingIndices.length > 0 && validMissingIndices.length === missingIndices.length) {
            // New boards were inserted in between - add them to the group
            const allIndices = [...sortedIndices, ...validMissingIndices].sort((a, b) => a - b)
            const allUids = this.getBoardUidsFromIndices(allIndices)
            
            group.boardIds = allIndices
            group.boardUids = allUids
            
            // Handle newShot flags for the newly added boards
            this.handleNewShotFlags(allIndices)
            
            console.log(`[VideoGroupManager.forceUpdateAllGroups] Group ${group.id} expanded to include inserted boards: [${allIndices.join(', ')}]`)
            expandedCount++
            updatedCount++
          } else {
            // Boards were moved OUT of the group - keep the largest contiguous segment
            const contiguousSegments = this.findContiguousSegments(sortedIndices)
            
            if (contiguousSegments.length === 0) {
              this.groups.delete(group.id)
              removedCount++
              console.log(`[VideoGroupManager.forceUpdateAllGroups] Removed group ${group.id} - no contiguous segments`)
              continue
            }
            
            // Keep the largest contiguous segment
            const largestSegment = contiguousSegments.reduce((largest, segment) => 
              segment.length > largest.length ? segment : largest
            , contiguousSegments[0])
            
            // If the largest segment has only 1 board, remove the group
            if (largestSegment.length <= 1) {
              this.groups.delete(group.id)
              removedCount++
              console.log(`[VideoGroupManager.forceUpdateAllGroups] Removed group ${group.id} - only 1 board remains`)
              continue
            }
            
            // Update group with the largest contiguous segment
            const segmentUids = this.getBoardUidsFromIndices(largestSegment)
            group.boardIds = largestSegment
            group.boardUids = segmentUids
            
            console.log(`[VideoGroupManager.forceUpdateAllGroups] Group ${group.id} fragmented - kept segment [${largestSegment.join(', ')}]`)
            updatedCount++
          }
        } else {
          // Update the group with current indices
          group.boardIds = sortedIndices
          group.boardUids = this.getBoardUidsFromIndices(sortedIndices)
          updatedCount++
        }
      } else {
        // For groups without UIDs, validate indices
        const validIndices = (group.boardIds || []).filter(index => 
          index >= 0 && index < this.boardData.boards.length
        )
        
        if (validIndices.length === 0) {
          this.groups.delete(group.id)
          removedCount++
          continue
        }
        
        // Sort and check adjacency
        const sortedIndices = [...validIndices].sort((a, b) => a - b)
        
        if (!this.areBoardsAdjacent(sortedIndices)) {
          // Check if new boards were inserted in between
          const minIndex = Math.min(...sortedIndices)
          const maxIndex = Math.max(...sortedIndices)
          
          const missingIndices = []
          for (let i = minIndex; i <= maxIndex; i++) {
            if (!sortedIndices.includes(i)) {
              missingIndices.push(i)
            }
          }
          
          const validMissingIndices = missingIndices.filter(i => 
            i >= 0 && i < this.boardData.boards.length && this.boardData.boards[i]
          )
          
          if (validMissingIndices.length > 0 && validMissingIndices.length === missingIndices.length) {
            // New boards were inserted - add them to the group
            const allIndices = [...sortedIndices, ...validMissingIndices].sort((a, b) => a - b)
            group.boardIds = allIndices
            group.boardUids = this.getBoardUidsFromIndices(allIndices)
            this.handleNewShotFlags(allIndices)
            expandedCount++
            updatedCount++
          } else {
            // Find largest contiguous segment
            const contiguousSegments = this.findContiguousSegments(sortedIndices)
            
            if (contiguousSegments.length === 0 || contiguousSegments[0].length <= 1) {
              this.groups.delete(group.id)
              removedCount++
              continue
            }
            
            const largestSegment = contiguousSegments.reduce((largest, segment) => 
              segment.length > largest.length ? segment : largest
            , contiguousSegments[0])
            
            if (largestSegment.length <= 1) {
              this.groups.delete(group.id)
              removedCount++
              continue
            }
            
            group.boardIds = largestSegment
            group.boardUids = this.getBoardUidsFromIndices(largestSegment)
            updatedCount++
          }
        } else {
          group.boardIds = sortedIndices
          group.boardUids = this.getBoardUidsFromIndices(sortedIndices)
          updatedCount++
        }
      }
    }
    
    // Clean up any invalid groups (cross-contamination protection)
    this.cleanupInvalidGroups()
    
    // Sync the grouped board indices set with actual groups
    this.syncGroupedBoardIndices()
    
    // Update group names based on current shot numbers
    const nameUpdates = this.updateGroupNamesFromShotNumbers()
    
    this.saveGroupsToStorage()
    return { updated: updatedCount, removed: removedCount, expanded: expandedCount, nameUpdates: nameUpdates }
  }



  removeBoardsFromExistingGroups(boardIds) {
    // Get UIDs for the boards being removed
    const boardUidsToRemove = this.getBoardUidsFromIndices(boardIds)
    
    for (const group of this.groups.values()) {
      // Remove by UIDs if available, otherwise fall back to indices
      if (group.boardUids && group.boardUids.length > 0) {
        const originalLength = group.boardUids.length
        group.boardUids = group.boardUids.filter(uid => !boardUidsToRemove.includes(uid))
        
        // Update boardIds to match the remaining UIDs
        group.boardIds = this.getBoardIndicesFromUids(group.boardUids)
        
        // If group becomes empty, remove it entirely
        if (group.boardUids.length === 0) {
          this.groups.delete(group.id)
        }
      } else {
        // Fallback to old index-based method
        const originalLength = group.boardIds.length
        group.boardIds = group.boardIds.filter(id => !boardIds.includes(id))

        // If group becomes empty, remove it entirely
        if (group.boardIds.length === 0) {
          this.groups.delete(group.id)
        }
      }
      
      // If group becomes single board, it might need special handling
      if (group.boardIds && group.boardIds.length === 1) {
        // Consider removing single-board groups or keeping them
        // For now, we'll keep them but they won't have link indicators
      }
    }
  }

  getShotNumberForBoard(boardIndex) {
    console.log(`[VideoGroupManager.getShotNumberForBoard] Called with boardIndex: ${boardIndex}`)

    let rawShotNumber = null

    // Try IPC to request canonical board data from main process
    try {
      const { ipcRenderer } = require('electron')
      const board = ipcRenderer.sendSync('get-board-data-for-shot-name', boardIndex)
      if (board && board.shot) {
        rawShotNumber = board.shot
        console.log(`[VideoGroupManager.getShotNumberForBoard] IPC shot: "${rawShotNumber}"`)
      }
    } catch (e) {
      // ignore and fall back
    }

    // Fallback: use window helper if available
    if (!rawShotNumber && typeof window !== 'undefined' && typeof window.getBoardShotName === 'function') {
      rawShotNumber = window.getBoardShotName(boardIndex)
    }

    // Fallback: use local data
    if (!rawShotNumber && this.boardData && this.boardData.boards) {
      const boards = this.boardData.boards
      if (boardIndex >= 0 && boardIndex < boards.length) {
        const board = boards[boardIndex]
        const shotNumber = (boardIndex + 1).toString().padStart(2, '0')
        rawShotNumber = board && board.shot ? board.shot : shotNumber
      }
    }

    // Final fallback: try UI
    if (!rawShotNumber) {
      const thumbnails = document.querySelectorAll('.thumbnail, .t-scene, [data-thumbnail]')
      const thumbnail = thumbnails[boardIndex]
      if (thumbnail) {
        const shotText = thumbnail.querySelector('.shot-number, .board-number, .shot')
        if (shotText && shotText.textContent) {
          rawShotNumber = shotText.textContent.trim()
        }
      }
    }
    
    if (!rawShotNumber) {
      rawShotNumber = `Board ${boardIndex + 1}`
    }
    
    const baseShotNumber = this.extractBaseShotNumber(rawShotNumber)
    return baseShotNumber
  }

  extractBaseShotNumber(shotValue) {
    // Extract base shot number from values like "4a", "4b", "4c" -> "4"
    // Always return just the numeric part (e.g., "6A" -> "6", "9E" -> "9")
    if (typeof shotValue === 'string') {
      // Extract just the numeric part
      const match = shotValue.match(/(\d+)/)
      return match ? match[1] : shotValue
    }
    return shotValue.toString()
  }

  handleNewShotFlags(boardIds) {
    if (boardIds.length <= 1) return

    console.log('[VideoGroupManager.handleNewShotFlags] Processing boardIds:', boardIds)

    // Access the main board data to modify newShot flags
    if (this.boardData && this.boardData.boards) {
      const boards = this.boardData.boards

      // Keep newShot flag only on the first board in the group
      for (let i = 0; i < boardIds.length; i++) {
        const boardIndex = boardIds[i]
        if (boardIndex >= 0 && boardIndex < boards.length) {
          if (i === 0) {
            // Keep newShot flag on first board
            boards[boardIndex].newShot = true
            console.log(`[VideoGroupManager.handleNewShotFlags] Board ${boardIndex} (first): newShot = true`)
          } else {
            // Remove newShot flag from subsequent boards
            boards[boardIndex].newShot = false
            console.log(`[VideoGroupManager.handleNewShotFlags] Board ${boardIndex} (subsequent): newShot = false`)
          }
        }
      }
      
      // Force UI update to reflect the changes
      if (typeof window !== 'undefined' && window.renderMetaData) {
        console.log('[VideoGroupManager.handleNewShotFlags] Triggering UI update')
        window.renderMetaData()
      }
    }
  }

  disableFieldsForGroupedBoards(boardIds) {
    if (boardIds.length <= 1) return

    console.log('[VideoGroupManager.disableFieldsForGroupedBoards] Processing boardIds:', boardIds)

    // Get the group that contains these boards
    const group = Array.from(this.groups.values()).find(g => {
      if (g.boardUids && g.boardUids.length > 0) {
        const groupUids = this.getBoardUidsFromIndices(boardIds)
        return groupUids.every(uid => g.boardUids.includes(uid))
      }
      return boardIds.every(id => g.boardIds.includes(id))
    })
    
    if (!group) {
      console.warn('[VideoGroupManager.disableFieldsForGroupedBoards] No group found for boards:', boardIds)
      return
    }
    
    // Determine which boards are first in the group
    let firstBoardIndex
    if (group.boardUids && group.boardUids.length > 0) {
      const firstBoardUid = group.boardUids[0]
      firstBoardIndex = this.boardData.boards.findIndex(board => board.uid === firstBoardUid)
    } else {
      firstBoardIndex = Math.min(...group.boardIds)
    }
    
    // Process each board in the group
    for (let i = 0; i < boardIds.length; i++) {
      const boardIndex = boardIds[i]
      
      // Only disable fields for non-first boards
      if (boardIndex !== firstBoardIndex) {
        this.disableFieldsForBoard(boardIndex)
      }
    }
  }

  disableFieldsForBoard(boardIndex) {
    console.log(`[VideoGroupManager.disableFieldsForBoard] Disabling fields for board ${boardIndex}`)
    
    // Store the board index for when the UI is rendered
    if (typeof window !== 'undefined') {
      if (!window.groupedBoardIndices) {
        window.groupedBoardIndices = new Set()
      }
      window.groupedBoardIndices.add(boardIndex)
    }
    
    // Use a longer timeout to ensure the UI is ready
    setTimeout(() => {
      // Check if this board is currently being viewed
      const currentBoard = window.currentBoard || 0
      if (currentBoard === boardIndex) {
        this.disableFieldsForCurrentBoard()
      }
    }, 200) // Increased delay to ensure UI is ready
  }

  disableFieldsForCurrentBoard() {
    console.log('[VideoGroupManager.disableFieldsForCurrentBoard] Disabling fields for current board')
    
    // First, disable and uncheck newShot checkbox
    const newShotCheckbox = document.querySelector('input[name="newShot"]')
    if (newShotCheckbox) {
      newShotCheckbox.disabled = true
      newShotCheckbox.checked = false
      const label = document.querySelector(`label[for="newShot"]`)
      if (label) {
        label.classList.add('disabled')
      }
    }
    
    // Then, after a 5ms delay, disable the other fields
    setTimeout(() => {
      const fieldsToDisable = ['action', 'notes', 'focal-length']
      fieldsToDisable.forEach(fieldName => {
        const field = document.querySelector(`[name="${fieldName}"]`)
        if (field) {
          field.disabled = true
          const label = document.querySelector(`label[for="${fieldName}"]`)
          if (label) {
            label.classList.add('disabled')
          }
        }
      })
      
      // Force UI update
      if (typeof window !== 'undefined' && window.renderMetaData) {
        setTimeout(() => {
          window.renderMetaData()
        }, 100)
      }
    }, 5)
  }

  async generateVideoForGroup(groupId) {
    const group = this.groups.get(groupId)
    if (!group || group.boardIds.length === 0) {
      throw new Error('Group not found or empty')
    }

    // Create temp directory for video generation
    const tempDir = path.join(process.cwd(), 'temp_videos')
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }

    const videoPath = path.join(tempDir, `${groupId}.mp4`)
    
    try {
      // For now, create a placeholder video file
      // In a real implementation, you'd use FFmpeg to create the actual video
      await this.createPlaceholderVideo(videoPath, group)
      
      // Store video path in group
      group.videoPath = videoPath
      this.groups.set(groupId, group)
      
      return videoPath
    } catch (error) {
      console.error('Error generating video:', error)
      throw error
    }
  }

  async createPlaceholderVideo(videoPath, group) {
    // Create a simple placeholder video file
    // In a real implementation, this would use FFmpeg to combine images
    const placeholderContent = `# Video placeholder for group: ${group.name}
# Board IDs: ${group.boardIds.join(', ')}
# FPS: ${group.fps}
# Duration: ${group.duration}s
# Loop: ${group.loop}
# Generated: ${new Date().toISOString()}
`
    
    fs.writeFileSync(videoPath.replace('.mp4', '.txt'), placeholderContent)
    
    // Create a minimal MP4 file (this is just a placeholder)
    // In reality, you'd use FFmpeg to create actual video from images
    const minimalMp4 = Buffer.from([
      0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6F, 0x6D,
      0x00, 0x00, 0x02, 0x00, 0x69, 0x73, 0x6F, 0x6D, 0x69, 0x73, 0x6F, 0x32,
      0x61, 0x76, 0x63, 0x31, 0x6D, 0x70, 0x34, 0x31
    ])
    
    fs.writeFileSync(videoPath, minimalMp4)
  }

  getGroup(groupId) {
    return this.groups.get(groupId)
  }

  getAllGroups() {
    return Array.from(this.groups.values())
  }

  updateGroup(groupId, updates) {
    const group = this.groups.get(groupId)
    if (group) {
      Object.assign(group, updates)
      
      // If name is being updated, mark as renamed
      if (updates.name && updates.name !== group.originalName) {
        group.isRenamed = true
      }
      
      this.groups.set(groupId, group)
      
      // Save groups to localStorage
      this.saveGroupsToStorage()
      
      this.updateTimelineDisplay()
    }
  }

  renameGroup(groupId, newName) {
    const group = this.groups.get(groupId)
    if (group) {
      group.name = newName
      group.isRenamed = true
      this.groups.set(groupId, group)
      
      // Save groups to localStorage
      this.saveGroupsToStorage()
      
      this.updateTimelineDisplay()
      return true
    }
    return false
  }

  deleteGroup(groupId) {
    const group = this.groups.get(groupId)
    if (!group) return false

    // Restore original shot numbers before deleting group
    this.restoreOriginalShotNumbers(group.boardIds)

    if (group.videoPath && fs.existsSync(group.videoPath)) {
      try {
        fs.unlinkSync(group.videoPath)
      } catch (error) {
        console.warn('Could not delete video file:', error.message)
      }
    }
    this.groups.delete(groupId)
    
    // Save groups to localStorage
    this.saveGroupsToStorage()
    
    this.updateTimelineDisplay()
    return true
  }

  getGroupsForBoard(boardId) {
    const groups = []
    for (const group of this.groups.values()) {
      if (group.boardIds.includes(boardId)) {
        groups.push(group)
      }
    }
    return groups
  }

  updateTimelineDisplay(immediate = false) {
    // Performance optimization: Use requestAnimationFrame for smooth updates
    if (this.timelineUpdateTimeout) {
      clearTimeout(this.timelineUpdateTimeout)
    }
    
    if (this.timelineUpdateRAF) {
      cancelAnimationFrame(this.timelineUpdateRAF)
    }

    if (immediate) {
      // Immediate update - use requestAnimationFrame for smooth rendering
      this.timelineUpdateRAF = requestAnimationFrame(() => {
        this.renderGroupIndicators()
      })
    } else {
      // Debounced update for rapid changes (like scrolling)
      this.timelineUpdateTimeout = setTimeout(() => {
        this.timelineUpdateRAF = requestAnimationFrame(() => {
          this.renderGroupIndicators()
        })
      }, 16) // ~1 frame at 60fps for smooth updates
    }
  }
  
  // Force immediate update without any debouncing
  forceImmediateUpdate() {
    if (this.timelineUpdateTimeout) {
      clearTimeout(this.timelineUpdateTimeout)
    }
    if (this.timelineUpdateRAF) {
      cancelAnimationFrame(this.timelineUpdateRAF)
    }
    this.renderGroupIndicators()
  }

  renderGroupIndicators() {
    // Update timeline to show group indicators using CSS classes and data attributes
    // This approach survives DOM re-renders because it only sets attributes
    const timeline = document.querySelector('#timeline')
    if (!timeline) return

    // Skip if already rendering (prevents nested calls)
    if (this._isRenderingIndicators) return
    this._isRenderingIndicators = true

    try {
      // Inject CSS for group indicators if not already present
      this._ensureIndicatorStyles()
      
      // Get current groups
      const currentGroups = Array.from(this.groups.values())
      
      // Build a map of boardId -> group info
      const boardGroupMap = new Map()
      for (const group of currentGroups) {
        group.boardIds.forEach((boardId) => {
          boardGroupMap.set(boardId, { color: group.color, name: group.name, size: group.boardIds.length })
        })
      }
      
      // Get all thumbnails
      const thumbnails = document.querySelectorAll('.thumbnail, .t-scene, [data-thumbnail]')
      
      // Update thumbnails using data attributes and CSS variables
      thumbnails.forEach((thumbnail, index) => {
        const groupInfo = boardGroupMap.get(index)
        
        if (groupInfo) {
          // This board is in a group - set data attributes and CSS variable for color
          thumbnail.setAttribute('data-in-group', 'true')
          thumbnail.style.setProperty('--group-color', groupInfo.color)
          if (groupInfo.size > 1) {
            thumbnail.setAttribute('data-group-linked', 'true')
          } else {
            thumbnail.removeAttribute('data-group-linked')
          }
        } else {
          // This board is not in any group - remove attributes
          thumbnail.removeAttribute('data-in-group')
          thumbnail.removeAttribute('data-group-linked')
          thumbnail.style.removeProperty('--group-color')
        }
      })

    } catch (error) {
      console.error('[VideoGroupManager] Error in renderGroupIndicators:', error)
    } finally {
      this._isRenderingIndicators = false
    }
  }

  // Inject CSS styles for group indicators (uses pseudo-elements, no DOM creation needed)
  _ensureIndicatorStyles() {
    if (this._stylesInjected) return
    
    const styleId = 'video-group-indicator-styles'
    if (document.getElementById(styleId)) {
      this._stylesInjected = true
      return
    }
    
    const style = document.createElement('style')
    style.id = styleId
    style.textContent = `
      /* Group indicator bar at bottom */
      .thumbnail[data-in-group="true"],
      .t-scene[data-in-group="true"],
      [data-thumbnail][data-in-group="true"] {
        position: relative !important;
      }
      
      .thumbnail[data-in-group="true"]::after,
      .t-scene[data-in-group="true"]::after,
      [data-thumbnail][data-in-group="true"]::after {
        content: '';
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 4px;
        background: var(--group-color, #3b82f6);
        border-radius: 0 0 4px 4px;
        z-index: 10;
        pointer-events: none;
      }
      
      /* Link symbol for multi-board groups */
      .thumbnail[data-group-linked="true"]::before,
      .t-scene[data-group-linked="true"]::before,
      [data-thumbnail][data-group-linked="true"]::before {
        content: '🔗';
        position: absolute;
        top: 4px;
        right: 4px;
        width: 16px;
        height: 16px;
        background: var(--group-color, #3b82f6);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 8px;
        color: white;
        z-index: 11;
        border: 2px solid white;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        pointer-events: none;
      }
    `
    document.head.appendChild(style)
    this._stylesInjected = true
  }

  async exportGroupToPDF(groupId, pdfDoc, x, y, width, height) {
    const group = this.groups.get(groupId)
    if (!group) return

    try {
      // Generate video if not exists
      if (!group.videoPath || !fs.existsSync(group.videoPath)) {
        await this.generateVideoForGroup(groupId)
      }

      // Add video placeholder to PDF
      pdfDoc.rect(x, y, width, height)
        .stroke('#CCCCCC')
      
      pdfDoc.fontSize(12)
        .fillColor('#666666')
        .text(`Video: ${group.name}`, x + 10, y + 10)
        .text(`FPS: ${group.fps} | Duration: ${group.duration}s`, x + 10, y + 30)
        .text(`Boards: ${group.boardIds.join(', ')}`, x + 10, y + 50)

      // In a real implementation, you'd embed the actual video file
      // For now, we'll add a note about the video
      pdfDoc.text(`[Video file: ${group.videoPath}]`, x + 10, y + 70)

    } catch (error) {
      console.error('Error exporting group to PDF:', error)
      // Fallback: show error message
      pdfDoc.text(`Error: Could not generate video for ${group.name}`, x + 10, y + 10)
    }
  }

  // Clean up empty groups
  cleanupEmptyGroups() {
    const groupsToDelete = []
    for (const [groupId, group] of this.groups) {
      if (group.boardIds.length === 0) {
        groupsToDelete.push(groupId)
      }
    }
    groupsToDelete.forEach(groupId => this.groups.delete(groupId))
  }

  // Get all groups containing any of the specified board IDs
  getGroupsContainingBoards(boardIds) {
    const groups = []
    for (const group of this.groups.values()) {
      if (group.boardIds.some(boardId => boardIds.includes(boardId))) {
        groups.push(group)
      }
    }
    return groups
  }

  // Get project-specific storage key
  getStorageKey() {
    return this.storageKey
  }

  // Save groups to localStorage with project-specific key
  saveGroupsToStorage() {
    try {
      const groupsArray = Array.from(this.groups.values())
      const groupsData = groupsArray.map(group => ({
        id: group.id,
        name: group.name,
        originalName: group.originalName,
        boardIds: group.boardIds,
        boardUids: group.boardUids,
        color: group.color,
        fps: group.fps,
        duration: group.duration,
        timingMode: group.timingMode,
        advancedMode: group.advancedMode,
        boardTimings: group.boardTimings,
        loop: group.loop,
        createdAt: group.createdAt,
        isRenamed: group.isRenamed
      }))
      
      // Save to main project file (primary storage)
      if (this.boardData) {
        // Create a deep copy to avoid reference issues
        const groupsDataCopy = JSON.parse(JSON.stringify(groupsData))
        
        // Debug: Log board indices for each group
        console.log(`[VideoGroupManager] Saving groups with board indices:`)
        groupsDataCopy.forEach(group => {
          console.log(`[VideoGroupManager] Group "${group.name}": boardIds = [${group.boardIds.join(', ')}]`)
          console.log(`[VideoGroupManager] Group "${group.name}": boardUids = [${(group.boardUids || []).join(', ')}]`)
        })
        
        this.boardData.videoGroups = groupsDataCopy
        console.log(`[VideoGroupManager] Saved groups to main project file: ${groupsDataCopy.length} groups`)
        
        // Mark the project file as dirty so it gets saved
        if (typeof window !== 'undefined' && window.markBoardFileDirty) {
          window.markBoardFileDirty()
        }
      } else {
        console.warn('[VideoGroupManager] boardData is not available, cannot save groups to project file')
      }
      
      // Also save to localStorage as backup (but don't rely on it for loading)
      try {
        const storageKey = this.getStorageKey()
        localStorage.setItem(storageKey, JSON.stringify(groupsData))
        console.log(`[VideoGroupManager] Saved groups to localStorage backup: ${storageKey}`)
      } catch (localStorageError) {
        console.warn('Could not save groups to localStorage backup:', localStorageError.message)
      }
    } catch (error) {
      console.warn('Could not save groups to storage:', error.message)
    }
  }

  // Load groups from localStorage (public method)
  loadGroups() {
    this.loadGroupsFromStorage()
  }

  // Load groups from main project file first, then fall back to localStorage
  loadGroupsFromStorage() {
    // First, try to load from the main project file (boardData.videoGroups)
    if (this.boardData && this.boardData.videoGroups && Array.isArray(this.boardData.videoGroups)) {
      console.log(`[VideoGroupManager] Loading groups from main project file: ${this.boardData.videoGroups.length} groups`)
      
      // Debug: Log board indices for each group being loaded
      console.log(`[VideoGroupManager] Loading groups with board indices:`)
      this.boardData.videoGroups.forEach(group => {
        console.log(`[VideoGroupManager] Group "${group.name}": boardIds = [${group.boardIds.join(', ')}]`)
        console.log(`[VideoGroupManager] Group "${group.name}": boardUids = [${(group.boardUids || []).join(', ')}]`)
      })
      
      try {
        this.groups.clear()
        
        this.boardData.videoGroups.forEach(groupData => {
          console.log(`[VideoGroupManager] Loading group "${groupData.name}" with boardIds: [${groupData.boardIds.join(', ')}]`)
          
          // Load groups exactly as they were saved - don't recalculate indices
          // This prevents group boundary corruption during loading
          const loadedGroup = {
            ...groupData,
            // Defaults for older saved data
            fps: typeof groupData.fps === 'number' ? groupData.fps : 5,
            duration: typeof groupData.duration === 'number' ? groupData.duration : 1.0,
            timingMode: groupData.timingMode || 'fps',
            advancedMode: !!groupData.advancedMode,
            boardTimings: groupData.boardTimings || {},
            createdAt: groupData.createdAt ? new Date(groupData.createdAt) : new Date()
          }
          
          this.groups.set(groupData.id, loadedGroup)
          console.log(`[VideoGroupManager] Loaded group "${loadedGroup.name}" with final boardIds: [${loadedGroup.boardIds.join(', ')}]`)
        })
        
        this.updateTimelineDisplay()
        
        // Debug: Log what groups were actually loaded into the manager
        console.log(`[VideoGroupManager] Groups loaded into manager:`)
        this.groups.forEach((group, id) => {
          console.log(`[VideoGroupManager] Manager Group "${group.name}" (${id}): boardIds = [${group.boardIds.join(', ')}]`)
          console.log(`[VideoGroupManager] Manager Group "${group.name}" (${id}): boardUids = [${(group.boardUids || []).join(', ')}]`)
          
          // Debug: Show the actual board data for each group
          if (this.boardData && this.boardData.boards) {
            console.log(`[VideoGroupManager] Group "${group.name}" boards:`)
            group.boardIds.forEach(boardId => {
              if (boardId >= 0 && boardId < this.boardData.boards.length) {
                const board = this.boardData.boards[boardId]
                console.log(`[VideoGroupManager]   Board ${boardId}: uid=${board.uid}, url=${board.url}`)
              } else {
                console.log(`[VideoGroupManager]   Board ${boardId}: INVALID INDEX`)
              }
            })
          }
        })
        
        return true
      } catch (error) {
        console.warn('Could not load groups from main project file:', error.message)
      }
    }
    
    // Only fall back to localStorage if main project file doesn't have groups
    console.log(`[VideoGroupManager] No groups in main project file, checking localStorage...`)
    try {
      const storageKey = this.getStorageKey()
      const stored = localStorage.getItem(storageKey)
      console.log(`[VideoGroupManager] Loading groups from localStorage key: ${storageKey}`)
      
      if (stored) {
        const groupsData = JSON.parse(stored)
        console.log(`[VideoGroupManager] Loading groups from localStorage: ${groupsData.length} groups`)
        this.groups.clear()
        
        groupsData.forEach(groupData => {
          // Ensure groups have UIDs for proper tracking
          if (!groupData.boardUids || groupData.boardUids.length === 0) {
            // Ensure boards have UIDs first
            this.ensureBoardsHaveUids(groupData.boardIds || [])
            groupData.boardUids = this.getBoardUidsFromIndices(groupData.boardIds || [])
          }
          
          this.groups.set(groupData.id, {
            ...groupData,
            // Defaults for older saved data
            fps: typeof groupData.fps === 'number' ? groupData.fps : 5,
            duration: typeof groupData.duration === 'number' ? groupData.duration : 1.0,
            timingMode: groupData.timingMode || 'fps',
            advancedMode: !!groupData.advancedMode,
            boardTimings: groupData.boardTimings || {},
            createdAt: groupData.createdAt ? new Date(groupData.createdAt) : new Date()
          })
        })
        
        this.updateTimelineDisplay()
        return true
      }
    } catch (error) {
      console.warn('Could not load groups from localStorage:', error.message)
    }
    
    console.log(`[VideoGroupManager] No groups found in any storage location`)
    return false
  }

  // Initialize groups on startup
  initializeGroups() {
    this.loadGroupsFromStorage()
    // Sync the grouped board indices set after loading
    this.syncGroupedBoardIndices()
  }

  // Sync the window.groupedBoardIndices set with actual groups
  syncGroupedBoardIndices() {
    if (typeof window !== 'undefined') {
      if (!window.groupedBoardIndices) {
        window.groupedBoardIndices = new Set()
      }
      
      // Clear the set first
      window.groupedBoardIndices.clear()
      
      // Add all boards that are actually in groups
      for (const group of this.groups.values()) {
        group.boardIds.forEach(boardId => {
          window.groupedBoardIndices.add(boardId)
        })
      }
      
      console.log(`[VideoGroupManager.syncGroupedBoardIndices] Synced groupedBoardIndices with ${window.groupedBoardIndices.size} boards`)
    }
  }

  // Clean up invalid groups that might have been created due to cross-contamination
  cleanupInvalidGroups() {
    if (!this.boardData || !this.boardData.boards) {
      return
    }
    
    const maxBoardIndex = this.boardData.boards.length - 1
    const groupsToRemove = []
    const groupsToFix = []
    
    for (const [groupId, group] of this.groups) {
      // Check if group has any invalid board indices
      const invalidIndices = group.boardIds.filter(index => 
        index < 0 || index > maxBoardIndex
      )
      
      if (invalidIndices.length > 0) {
        console.log(`[VideoGroupManager.cleanupInvalidGroups] Removing group ${groupId} with invalid indices: ${invalidIndices.join(', ')}`)
        groupsToRemove.push(groupId)
        continue
      }
      
      // Check if group has any boards that no longer exist
      const missingBoards = group.boardIds.filter(index => 
        !this.boardData.boards[index]
      )
      
      if (missingBoards.length > 0) {
        console.log(`[VideoGroupManager.cleanupInvalidGroups] Removing group ${groupId} with missing boards: ${missingBoards.join(', ')}`)
        groupsToRemove.push(groupId)
        continue
      }
      
      // Check if group has duplicate board indices
      const uniqueIndices = [...new Set(group.boardIds)]
      if (uniqueIndices.length !== group.boardIds.length) {
        console.log(`[VideoGroupManager.cleanupInvalidGroups] Fixing group ${groupId} with duplicate indices`)
        group.boardIds = uniqueIndices.sort((a, b) => a - b)
      }
      
      // Check if group boards are still adjacent (safety net for fragmentation)
      const sortedIndices = [...group.boardIds].sort((a, b) => a - b)
      if (!this.areBoardsAdjacent(sortedIndices)) {
        console.log(`[VideoGroupManager.cleanupInvalidGroups] Group ${groupId} has non-adjacent boards: [${sortedIndices.join(', ')}]`)
        groupsToFix.push({ groupId, group, sortedIndices })
      }
    }
    
    // Fix fragmented groups - either by including inserted boards or keeping the largest segment
    for (const { groupId, group, sortedIndices } of groupsToFix) {
      // First, check if new boards were inserted in between
      const minIndex = Math.min(...sortedIndices)
      const maxIndex = Math.max(...sortedIndices)
      
      const missingIndices = []
      for (let i = minIndex; i <= maxIndex; i++) {
        if (!sortedIndices.includes(i)) {
          missingIndices.push(i)
        }
      }
      
      // Check if all missing indices are valid board positions
      const validMissingIndices = missingIndices.filter(i => 
        i >= 0 && i < this.boardData.boards.length && this.boardData.boards[i]
      )
      
      if (validMissingIndices.length > 0 && validMissingIndices.length === missingIndices.length) {
        // New boards were inserted in between - add them to the group
        const allIndices = [...sortedIndices, ...validMissingIndices].sort((a, b) => a - b)
        group.boardIds = allIndices
        group.boardUids = this.getBoardUidsFromIndices(allIndices)
        this.handleNewShotFlags(allIndices)
        console.log(`[VideoGroupManager.cleanupInvalidGroups] Expanded group ${groupId} to include inserted boards: [${allIndices.join(', ')}]`)
        continue
      }
      
      // Boards were moved out - keep the largest contiguous segment
      const contiguousSegments = this.findContiguousSegments(sortedIndices)
      
      if (contiguousSegments.length === 0) {
        groupsToRemove.push(groupId)
        console.log(`[VideoGroupManager.cleanupInvalidGroups] Removing fragmented group ${groupId} - no contiguous segments`)
        continue
      }
      
      const largestSegment = contiguousSegments.reduce((largest, segment) => 
        segment.length > largest.length ? segment : largest
      , contiguousSegments[0])
      
      if (largestSegment.length <= 1) {
        groupsToRemove.push(groupId)
        console.log(`[VideoGroupManager.cleanupInvalidGroups] Removing fragmented group ${groupId} - only 1 board remains`)
        continue
      }
      
      // Update group with the largest contiguous segment
      group.boardIds = largestSegment
      group.boardUids = this.getBoardUidsFromIndices(largestSegment)
      console.log(`[VideoGroupManager.cleanupInvalidGroups] Fixed fragmented group ${groupId} - kept segment [${largestSegment.join(', ')}]`)
    }
    
    // Remove invalid groups
    groupsToRemove.forEach(groupId => {
      this.groups.delete(groupId)
    })
    
    if (groupsToRemove.length > 0) {
      console.log(`[VideoGroupManager.cleanupInvalidGroups] Removed ${groupsToRemove.length} invalid groups`)
    }
  }

  // Update group names based on current shot numbers (unless manually renamed)
  updateGroupNamesFromShotNumbers() {
    let updated = false
    
    for (const [groupId, group] of this.groups) {
      if (!group.isRenamed) {
        // Only update if not manually renamed
        const firstBoardShotNumber = this.getShotNumberForBoard(group.boardIds[0])
        if (firstBoardShotNumber !== group.name) {
          console.log(`[VideoGroupManager.updateGroupNamesFromShotNumbers] Updating group ${groupId} name from "${group.name}" to "${firstBoardShotNumber}"`)
          group.name = firstBoardShotNumber
          group.originalName = firstBoardShotNumber
          this.groups.set(groupId, group)
          updated = true
        }
      }
    }
    
    // Save updated names if any changes were made
    if (updated) {
      this.saveGroupsToStorage()
      console.log('[VideoGroupManager.updateGroupNamesFromShotNumbers] Group names updated and saved')
    }
    
    return updated
  }

  // Auto-group boards by shot number - convert multiple shots to one shot
  autoGroupByShotNumber() {
    if (!this.boardData || !this.boardData.boards) {
      return
    }

    const boards = this.boardData.boards
    const shotGroups = new Map()

    // Group boards by their base shot number
    for (let i = 0; i < boards.length; i++) {
      const shotNumber = this.getShotNumberForBoard(i)
      
      if (!shotGroups.has(shotNumber)) {
        shotGroups.set(shotNumber, [])
      }
      shotGroups.get(shotNumber).push(i)
    }

    // Create groups for shots with multiple boards and convert them to single shot
    for (const [shotNumber, boardIds] of shotGroups) {
      if (boardIds.length > 1) {
        // Check if this shot is already grouped
        const existingGroup = Array.from(this.groups.values()).find(group => 
          group.name === shotNumber && group.boardIds.length === boardIds.length &&
          group.boardIds.every(id => boardIds.includes(id))
        )

        if (!existingGroup) {
          // Create new group for this shot
          const group = this.createGroup(boardIds, shotNumber)
          
          // Convert multiple shots to one shot by setting newShot flags
          this.convertMultipleShotsToOne(group.boardIds)
        }
      }
    }
  }

  // Convert multiple shots to one shot by managing newShot flags
  convertMultipleShotsToOne(boardIds) {
    if (boardIds.length <= 1) return

    // Access the main board data to modify newShot flags
    if (this.boardData && this.boardData.boards) {
      const boards = this.boardData.boards
      
      // Set newShot = true for the first board only
      if (boardIds[0] >= 0 && boardIds[0] < boards.length) {
        boards[boardIds[0]].newShot = true
      }
      
      // Set newShot = false for all subsequent boards
      for (let i = 1; i < boardIds.length; i++) {
        if (boardIds[i] >= 0 && boardIds[i] < boards.length) {
          boards[boardIds[i]].newShot = false
        }
      }
      
      // Also update the UI elements directly
      this.updateTimelineShotNumbers(boardIds)
      
      // Update the UI to reflect the changes
      this.updateTimelineDisplay()
    }
  }

  // Update timeline shot numbers to reflect grouping
  updateTimelineShotNumbers(boardIds) {
    if (boardIds.length <= 1) return

    const baseShotNumber = this.getShotNumberForBoard(boardIds[0])
    
    // Update the first board to show the base shot number
    // Find thumbnail by position, not by data-thumbnail attribute
    const thumbnails = document.querySelectorAll('.thumbnail, .t-scene, [data-thumbnail]')
    const firstThumbnail = thumbnails[boardIds[0]]
    if (firstThumbnail) {
      const shotElement = firstThumbnail.querySelector('.shot-number, .board-number, .shot')
      if (shotElement) {
        shotElement.textContent = baseShotNumber
      }
    }
    
    // Update subsequent boards to show the same base shot number with letters
    for (let i = 1; i < boardIds.length; i++) {
      // Find thumbnail by position, not by data-thumbnail attribute
      const thumbnails = document.querySelectorAll('.thumbnail, .t-scene, [data-thumbnail]')
      const thumbnail = thumbnails[boardIds[i]]
      if (thumbnail) {
        const shotElement = thumbnail.querySelector('.shot-number, .board-number, .shot')
        if (shotElement) {
          const letter = String.fromCharCode(96 + i) // a, b, c, etc.
          shotElement.textContent = `${baseShotNumber}${letter}`
        }
      }
    }
  }

  // Restore original shot numbers when ungrouping
  restoreOriginalShotNumbers(boardIds) {
    if (boardIds.length <= 1) return

    console.log('[VideoGroupManager.restoreOriginalShotNumbers] Restoring boardIds:', boardIds)

    // Access the main board data to restore newShot flags
    if (this.boardData && this.boardData.boards) {
      const boards = this.boardData.boards
      
      // Restore newShot flags - each board becomes its own shot
      for (let i = 0; i < boardIds.length; i++) {
        if (boardIds[i] >= 0 && boardIds[i] < boards.length) {
          boards[boardIds[i]].newShot = true
          console.log(`[VideoGroupManager.restoreOriginalShotNumbers] Board ${boardIds[i]}: newShot = true`)
        }
      }
    }

    // Enable fields for all boards in the group
    this.enableFieldsForUngroupedBoards(boardIds)

    // Restore original shot numbers in UI
    for (let i = 0; i < boardIds.length; i++) {
      // Find thumbnail by position, not by data-thumbnail attribute
      const thumbnails = document.querySelectorAll('.thumbnail, .t-scene, [data-thumbnail]')
      const thumbnail = thumbnails[boardIds[i]]
      if (thumbnail) {
        const shotElement = thumbnail.querySelector('.shot-number, .board-number, .shot')
        if (shotElement) {
          // Restore to original shot number (board index + 1 or actual shot number)
          const originalShotNumber = this.getShotNumberForBoard(boardIds[i])
          shotElement.textContent = originalShotNumber
        }
      }
    }
    
    // Force UI update to reflect the changes
    if (typeof window !== 'undefined' && window.renderMetaData) {
      console.log('[VideoGroupManager.restoreOriginalShotNumbers] Triggering UI update')
      window.renderMetaData()
    }
  }

  enableFieldsForUngroupedBoards(boardIds) {
    console.log('[VideoGroupManager.enableFieldsForUngroupedBoards] Enabling fields for boardIds:', boardIds)
    
    // Remove these boards from the grouped board indices
    if (typeof window !== 'undefined' && window.groupedBoardIndices) {
      boardIds.forEach(boardId => {
        window.groupedBoardIndices.delete(boardId)
      })
    }
    
    // Use a timeout to ensure the UI is ready
    setTimeout(() => {
      // Enable all fields
      const fieldsToEnable = ['action', 'notes', 'focal-length']
      fieldsToEnable.forEach(fieldName => {
        const field = document.querySelector(`[name="${fieldName}"]`)
        if (field) {
          field.disabled = false
          const label = document.querySelector(`label[for="${fieldName}"]`)
          if (label) {
            label.classList.remove('disabled')
          }
        }
      })
      
      // Enable newShot checkbox
      const newShotCheckbox = document.querySelector('input[name="newShot"]')
      if (newShotCheckbox) {
        newShotCheckbox.disabled = false
        const label = document.querySelector(`label[for="newShot"]`)
        if (label) {
          label.classList.remove('disabled')
        }
      }
      
      // Force UI update
      if (typeof window !== 'undefined' && window.renderMetaData) {
        setTimeout(() => {
          window.renderMetaData()
        }, 100)
      }
    }, 50)
  }


  // Clean up temp files
  cleanup() {
    const tempDir = path.join(process.cwd(), 'temp_videos')
    if (fs.existsSync(tempDir)) {
      try {
        const files = fs.readdirSync(tempDir)
        files.forEach(file => {
          const filePath = path.join(tempDir, file)
          fs.unlinkSync(filePath)
        })
        fs.rmdirSync(tempDir)
      } catch (error) {
        console.warn('Could not clean up temp video files:', error.message)
      }
    }
  }

  // Serialize the current state for undo/redo
  serializeState() {
    return {
      groups: Array.from(this.groups.entries()),
      currentColorIndex: this.currentColorIndex || 0
    }
  }

  // Restore state from undo/redo
  restoreFromState(state) {
    if (state && state.groups) {
      this.groups.clear()
      for (const [id, group] of state.groups) {
        this.groups.set(id, group)
      }
      if (state.currentColorIndex !== undefined) {
        this.currentColorIndex = state.currentColorIndex
      }
      
      // CRITICAL: After restoring state, validate and fix group indices
      // The restored boardIds might not match the actual board positions
      // if the board data was restored from a different undo state
      console.log('[VideoGroupManager.restoreFromState] Validating groups after restore')
      this.forceUpdateAllGroups()
      
      // Sync the grouped board indices
      this.syncGroupedBoardIndices()
    }
  }
}

// Global function to test export functionality
if (typeof window !== 'undefined') {
  window.testExportFunctionality = () => {
    console.log('🧪 Testing export functionality...')
    
    // Check if export integration is available
    if (!window.exportIntegration) {
      console.error('❌ Export integration not available')
      return false
    }
    
    // Check if gifGroupManager is available
    if (!window.exportIntegration.gifGroupManager) {
      console.error('❌ GIF group manager not available')
      return false
    }
    
    // Check if videoGroupManager is available
    if (!window.exportIntegration.gifGroupManager.videoGroupManager) {
      console.error('❌ Video group manager not available')
      return false
    }
    
    // Get groups
    const groups = window.exportIntegration.gifGroupManager.videoGroupManager.getAllGroups()
    console.log(`✅ Found ${groups.length} groups`)
    
    if (groups.length === 0) {
      console.log('⚠️ No groups found to test export with')
      return true
    }
    
    // Test export configuration
    const testConfig = {
      includeGifs: true,
      gifGroups: groups.map(group => group.id),
      videoGroups: groups.map(group => group.id),
      groupData: groups,
      gifSettings: {
        maxWidth: 1440, // Higher default resolution
        resolution: '1440', // 2K default
        includeDialogue: false
      },
      openFolder: false // Don't open folder during test
    }
    
    console.log('✅ Export configuration created:', testConfig)
    console.log('✅ Export functionality is ready!')
    
    return true
  }
  
  // Function to test actual GIF export
  window.testGifExport = async () => {
    console.log('🧪 Testing actual GIF export...')
    
    if (!window.exportIntegration) {
      console.error('❌ Export integration not available')
      return false
    }
    
    const groups = window.exportIntegration.gifGroupManager.videoGroupManager.getAllGroups()
    if (groups.length === 0) {
      console.log('⚠️ No groups found to export')
      return false
    }
    
    console.log(`📤 Starting export of ${groups.length} groups...`)
    
    try {
      const config = {
        includeGifs: true,
        gifGroups: groups.map(group => group.id),
        videoGroups: groups.map(group => group.id),
        groupData: groups,
        gifSettings: {
          maxWidth: 1440, // Higher default resolution
          resolution: '1440', // 2K default
          includeDialogue: false
        },
        openFolder: true
      }
      
      await window.exportIntegration.exportVideoGroups(config)
      console.log('✅ GIF export test completed!')
      return true
    } catch (error) {
      console.error('❌ GIF export test failed:', error)
      return false
    }
  }
  
  // Function to debug groups
  window.debugGroups = () => {
    console.log('🔍 Debugging groups...')
    
    if (!window.exportIntegration) {
      console.error('❌ Export integration not available')
      return false
    }
    
    if (!window.exportIntegration.gifGroupManager) {
      console.error('❌ GIF group manager not available')
      return false
    }
    
    if (!window.exportIntegration.gifGroupManager.videoGroupManager) {
      console.error('❌ Video group manager not available')
      return false
    }
    
    const groups = window.exportIntegration.gifGroupManager.videoGroupManager.getAllGroups()
    console.log(`📊 Found ${groups.length} groups`)
    
    if (groups.length === 0) {
      console.log('⚠️ No groups found')
      return false
    }
    
    console.log('📋 All groups:')
    groups.forEach((group, index) => {
      console.log(`  Group ${index + 1}:`, {
        id: group.id,
        name: group.name,
        boardIds: group.boardIds,
        firstBoard: group.boardIds[0],
        totalBoards: group.boardIds.length
      })
    })
    
    // Check what boards should be in PDF
    const boardsToInclude = []
    groups.forEach(group => {
      if (group.boardIds.length > 0) {
        boardsToInclude.push(group.boardIds[0])
      }
    })
    
    console.log('📄 Boards that should be in PDF (first of each group):', boardsToInclude)
    
    return true
  }
  
  // Function to check raw group data
  window.checkRawGroups = () => {
    console.log('🔍 Checking raw group data...')
    
    if (!window.exportIntegration) {
      console.error('❌ Export integration not available')
      return false
    }
    
    if (!window.exportIntegration.gifGroupManager) {
      console.error('❌ GIF group manager not available')
      return false
    }
    
    if (!window.exportIntegration.gifGroupManager.videoGroupManager) {
      console.error('❌ Video group manager not available')
      return false
    }
    
    const videoGroupManager = window.exportIntegration.gifGroupManager.videoGroupManager
    
    console.log('📊 VideoGroupManager groups Map:', videoGroupManager.groups)
    console.log('📊 Groups Map size:', videoGroupManager.groups.size)
    console.log('📊 Groups Map entries:', Array.from(videoGroupManager.groups.entries()))
    console.log('📊 Project path:', videoGroupManager.projectPath)
    console.log('📊 Storage key:', videoGroupManager.storageKey)
    
    // Check if groups are stored in localStorage with project-specific key
    try {
      const storedGroups = localStorage.getItem(videoGroupManager.storageKey)
      console.log('📊 Stored groups in localStorage (project-specific):', storedGroups)
      
      // Also check old global key for comparison
      const oldStoredGroups = localStorage.getItem('storyboarder_video_groups')
      console.log('📊 Old global groups in localStorage:', oldStoredGroups)
    } catch (e) {
      console.log('📊 Could not read from localStorage:', e.message)
    }
    
    return true
  }
  
  // Function to test project-specific storage
  window.testProjectSpecificStorage = () => {
    console.log('🧪 Testing project-specific storage...')
    
    if (!window.exportIntegration) {
      console.error('❌ Export integration not available')
      return false
    }
    
    if (!window.exportIntegration.gifGroupManager) {
      console.error('❌ GIF group manager not available')
      return false
    }
    
    if (!window.exportIntegration.gifGroupManager.videoGroupManager) {
      console.error('❌ Video group manager not available')
      return false
    }
    
    const videoGroupManager = window.exportIntegration.gifGroupManager.videoGroupManager
    
    console.log('📊 Current project path:', videoGroupManager.projectPath)
    console.log('📊 Current storage key:', videoGroupManager.storageKey)
    
    // Check all localStorage keys related to video groups
    const allKeys = Object.keys(localStorage)
    const videoGroupKeys = allKeys.filter(key => key.includes('storyboarder_video_groups'))
    
    console.log('📊 All video group keys in localStorage:', videoGroupKeys)
    
    videoGroupKeys.forEach(key => {
      const data = localStorage.getItem(key)
      console.log(`📊 Key "${key}":`, data ? JSON.parse(data).length + ' groups' : 'empty')
    })
    
    return true
  }
  
  // Function to test PDF export with groups
  window.testPdfExport = async () => {
    console.log('🧪 Testing PDF export with groups...')
    
    if (!window.exportIntegration) {
      console.error('❌ Export integration not available')
      return false
    }
    
    const groups = window.exportIntegration.gifGroupManager.videoGroupManager.getAllGroups()
    if (groups.length === 0) {
      console.log('⚠️ No groups found to export')
      return false
    }
    
    console.log(`📄 Starting PDF export with ${groups.length} groups...`)
    console.log('Groups:', groups.map(g => ({ name: g.name, boardIds: g.boardIds, firstBoard: g.boardIds[0] })))
    
    // Show which boards should be included in PDF
    const allBoardIds = new Set()
    groups.forEach(group => {
      group.boardIds.forEach(id => allBoardIds.add(id))
    })
    
    const boardsToInclude = []
    groups.forEach(group => {
      if (group.boardIds.length > 0) {
        boardsToInclude.push(group.boardIds[0]) // First board of each group
      }
    })
    
    console.log('📋 Boards that should be included in PDF (first of each group):', boardsToInclude)
    console.log('📋 All grouped board IDs:', Array.from(allBoardIds))
    console.log('📋 Total boards in project:', window.boardData ? window.boardData.boards.length : 'unknown')
    
    try {
      const config = {
        layout: { spacing: 10 },
        paperSize: 'A4',
        paperOrientation: 'landscape',
        includeFields: ['shot', 'action', 'dialogue'],
        showFilenames: false,
        filenameLocation: 'bottom',
        customFields: [],
        includeGifs: false,
        gifGroups: groups.map(group => group.id),
        videoGroups: groups.map(group => group.id),
        groupData: groups,
        exportFormat: 'pdf',
        imageQuality: 0.8,
        includeWatermark: false,
        watermarkText: '',
        watermarkOpacity: 0.5,
        layoutPreset: 'standard'
      }
      
      await window.exportIntegration.handleAdvancedPDFExport(config)
      console.log('✅ PDF export test completed!')
      return true
    } catch (error) {
      console.error('❌ PDF export test failed:', error)
      return false
    }
  }
  
  // Function to test GIF export pipeline
  window.testGifExportPipeline = async () => {
    console.log('🧪 Testing GIF export pipeline...')
    
    if (!window.exportIntegration) {
      console.error('❌ Export integration not available')
      return false
    }
    
    const groups = window.exportIntegration.gifGroupManager.videoGroupManager.getAllGroups()
    if (groups.length === 0) {
      console.log('⚠️ No groups found for GIF export test')
      return false
    }
    
    console.log(`📊 Found ${groups.length} groups for GIF export test`)
    
    // Test the first group
    const testGroup = groups[0]
    console.log(`🎬 Testing GIF export for group: "${testGroup.name}"`)
    console.log(`🎬 Group board IDs: [${testGroup.boardIds.join(', ')}]`)
    
    try {
      // Test the generateSingleGifGroupFromVideoGroup method directly
      const outputPath = await window.exportIntegration.generateSingleGifGroupFromVideoGroup(testGroup, {
        gifSettings: {
          maxWidth: 400,
          fps: 5
        }
      })
      
      console.log(`✅ GIF export test successful! Output: ${outputPath}`)
      return true
    } catch (error) {
      console.error(`❌ GIF export test failed:`, error)
      return false
    }
  }
  
  // Function to test first-board-only logic
  window.testFirstBoardLogic = () => {
    console.log('🧪 Testing SIMPLE first-board-only logic...')
    
    if (!window.exportIntegration) {
      console.error('❌ Export integration not available')
      return false
    }
    
    const groups = window.exportIntegration.gifGroupManager.videoGroupManager.getAllGroups()
    if (groups.length === 0) {
      console.log('⚠️ No groups found')
      return false
    }
    
    console.log('📊 All groups:')
    groups.forEach((group, index) => {
      console.log(`  Group ${index + 1}: "${group.name}"`)
      console.log(`    - Board IDs: [${group.boardIds.join(', ')}]`)
      console.log(`    - First board: ${group.boardIds[0]}`)
      console.log(`    - Total boards: ${group.boardIds.length}`)
    })
    
    // SIMPLE LOGIC: Create the same maps as the PDF exporter
    const allBoardIds = new Set()
    const boardToGroupMap = new Map()
    
    groups.forEach(group => {
      group.boardIds.forEach(id => {
        allBoardIds.add(id)
        boardToGroupMap.set(id, group)
      })
    })
    
    console.log('📋 SIMPLE LOGIC TEST:')
    console.log('📋 All grouped board IDs:', Array.from(allBoardIds))
    
    // Test the simple logic: for each board, check if it should be rendered
    const totalBoards = window.boardData ? window.boardData.boards.length : 0
    const renderedBoards = []
    const skippedBoards = []
    
    for (let boardIndex = 0; boardIndex < totalBoards; boardIndex++) {
      if (allBoardIds.has(boardIndex)) {
        const group = boardToGroupMap.get(boardIndex)
        if (group && group.boardIds[0] !== boardIndex) {
          skippedBoards.push(boardIndex)
          console.log(`  ❌ SKIP board ${boardIndex} (not first in group "${group.name}")`)
        } else {
          renderedBoards.push(boardIndex)
          console.log(`  ✅ RENDER board ${boardIndex} (first in group "${group ? group.name : 'unknown'}")`)
        }
      } else {
        renderedBoards.push(boardIndex)
        console.log(`  ✅ RENDER board ${boardIndex} (not in any group)`)
      }
    }
    
    console.log(`📋 RESULT: ${renderedBoards.length} boards will be rendered, ${skippedBoards.length} will be skipped`)
    console.log('📋 Rendered boards:', renderedBoards)
    console.log('📋 Skipped boards:', skippedBoards)
    
    return true
  }
}

module.exports = VideoGroupManager
