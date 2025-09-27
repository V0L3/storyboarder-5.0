// Export Integration Module
// Integrates enhanced export functionality with existing Storyboarder codebase

const EnhancedExportDialog = require('../components/EnhancedExportDialog')
const GifGroupManager = require('../components/GifGroupManager')
const EnhancedGifGroupManager = require('../components/EnhancedGifGroupManager')
const { ExportLayoutManager } = require('../models/export-layout')
const { generateEnhancedPDF } = require('../exporters/enhanced-pdf')

class ExportIntegration {
  constructor() {
    this.layoutManager = new ExportLayoutManager()
    this.gifGroupManager = null
    this.isInitialized = false
  }

  initialize(boardData, boardFilename) {
    if (this.isInitialized) return

    this.boardData = boardData
    this.boardFilename = boardFilename

    // Debug: Check if videoGroups exist in boardData
    if (boardData.videoGroups) {
      console.log(`[ExportIntegration] Initializing with videoGroups:`, boardData.videoGroups.length, 'groups')
      console.log(`[ExportIntegration] videoGroups data:`, JSON.stringify(boardData.videoGroups, null, 2))
    } else {
      console.log(`[ExportIntegration] No videoGroups found in boardData during initialization`)
    }

    // Initialize enhanced GIF group manager
    this.gifGroupManager = new EnhancedGifGroupManager(
      this.layoutManager, 
      boardData, 
      {
        projectPath: boardFilename, // Pass the project file path
        onGroupCreated: (group) => this.onGifGroupCreated(group),
        onGroupDeleted: (groupId) => this.onGifGroupDeleted(groupId),
        onExportGroups: (groups) => this.exportGifGroups(groups)
      }
    )

    // Inject enhanced export styles
    this.injectStyles()

    // Replace existing export menu items
    this.replaceExportMenuItems()

    // Load saved layout data if available
    this.loadSavedData()

    this.isInitialized = true
  }

  injectStyles() {
    // Inject CSS for enhanced export functionality
    const styles = [
      '/src/css/enhanced-export-dialog.css',
      '/src/css/gif-grouping.css'
    ]

    styles.forEach(stylePath => {
      if (!document.querySelector(`link[href="${stylePath}"]`)) {
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = stylePath
        document.head.appendChild(link)
      }
    })
  }

  replaceExportMenuItems() {
    // Override the existing PDF export functionality
    const { ipcRenderer } = require('electron')
    
    // Listen for the enhanced export command
    ipcRenderer.on('exportEnhancedPDF', () => {
      this.showEnhancedExportDialog()
    })

    // Also handle the existing exportPDF command
    ipcRenderer.on('exportPDF', () => {
      this.showEnhancedExportDialog()
    })
  }

  showEnhancedExportDialog() {
    if (!this.boardData || !this.boardFilename) {
      console.error('Export integration not properly initialized')
      return
    }

    // Open as a new window instead of overlay dialog
    const { ipcRenderer } = require('electron')
    ipcRenderer.send('open-enhanced-export-window', {
      boardData: this.boardData,
      boardFilename: this.boardFilename,
      layoutData: this.layoutManager.toJSON()
    })
  }

  async handleEnhancedExport(config) {
    try {
      const path = require('path')
      
      // Update group order before export to ensure consistency
      if (this.gifGroupManager && this.gifGroupManager.videoGroupManager) {
        console.log('[ExportIntegration.handleEnhancedExport] Updating group order before export...')
        this.gifGroupManager.videoGroupManager.forceUpdateAllGroups()
      }
      
      // Get groups for GIF export
      const videoGroups = this.gifGroupManager ? this.gifGroupManager.videoGroupManager.getAllGroups() : []
      
      console.log('[ExportIntegration.handleEnhancedExport] Received config:', {
        exportGifWithPdf: config.exportGifWithPdf,
        respectGroupsInPdf: config.respectGroupsInPdf,
        videoGroupsLength: videoGroups.length,
        videoGroups: videoGroups.map(g => ({ name: g.name, boardIds: g.boardIds, firstBoard: g.boardIds[0] }))
      })
      
      // Generate enhanced PDF
      const outputPath = await this.generateEnhancedExport(config)
      
      // Export GIFs if requested
      if (config.exportGifWithPdf && videoGroups.length > 0) {
        console.log('[ExportIntegration.handleEnhancedExport] Exporting GIFs alongside PDF...')
        this.showNotification('Exporting GIFs alongside PDF...', 'info')
        
        try {
          // Create GIF config with same settings as PDF
          const gifConfig = {
            gifSettings: {
              maxWidth: config.gifSettings?.maxWidth || 400,
              resolution: config.gifSettings?.resolution || '1440',
              includeDialogue: config.gifSettings?.includeDialogue || false
            },
            openFolder: false // Don't open folder for GIFs since we'll open it for PDF
          }
          
          // Export all video groups as GIFs
          let gifExportedCount = 0
          for (const group of videoGroups) {
            await this.generateSingleGifGroupFromVideoGroup(group, gifConfig)
            gifExportedCount++
          }
          
          console.log(`[ExportIntegration.handleEnhancedExport] Successfully exported ${gifExportedCount} GIFs`)
        } catch (gifError) {
          console.error('[ExportIntegration.handleEnhancedExport] Error exporting GIFs:', gifError)
          this.showNotification(`PDF exported successfully, but GIF export failed: ${gifError.message}`, 'warning')
        }
      }
      
      // Show success notification
      const successMessage = config.exportGifWithPdf && videoGroups.length > 0 
        ? `PDF and GIFs exported successfully: ${path.basename(outputPath)}`
        : `Enhanced export completed: ${path.basename(outputPath)}`
      this.showNotification(successMessage, 'success')

      // Open the export folder
      const { shell } = require('electron')
      shell.showItemInFolder(outputPath)

    } catch (error) {
      console.error('Enhanced export failed:', error)
      
      // Show error notification
      this.showNotification(`Export failed: ${error.message}`, 'error')
    }
  }

  async generateEnhancedExport(config) {
    const path = require('path')
    const moment = require('moment')
    const fs = require('fs')

    // Ensure exports directory exists
    const exportsDir = path.join(path.dirname(this.boardFilename), 'exports')
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir, { recursive: true })
    }
    
    // Generate filename
    const basename = path.basename(this.boardFilename, path.extname(this.boardFilename))
    const timestamp = moment().format('YYYY-MM-DD HH.mm.ss')
    const filename = config.filenameTemplate
      .replace('{project}', basename)
      .replace('{date}', moment().format('YYYY-MM-DD'))
      .replace('{time}', moment().format('HH.mm.ss'))
    
    const outputPath = path.join(exportsDir, `${filename}.pdf`)

    // Generate GIFs first if needed
    if (config.includeGifs && config.gifGroups && config.gifGroups.length > 0) {
      await this.generateGifGroups(config.gifGroups, config.gifSettings)
    }

    // Generate enhanced PDF
    await generateEnhancedPDF(config, this.boardData, this.boardFilename, outputPath)

    return outputPath
  }

  async generateGifGroups(groupIds, settings) {
    const exporter = require('../window/exporter')
    const boardModel = require('../models/board')

    for (const groupId of groupIds) {
      const group = this.layoutManager.getGifGroup(groupId)
      if (!group) continue

      // Get boards for this group
      const groupBoards = group.boardIndices.map(index => this.boardData.boards[index])
      
      // Generate GIF
      const boardSize = boardModel.boardFileImageSize(this.boardData)
      
      await exporter.exportAnimatedGif(
        groupBoards,
        boardSize,
        settings.maxWidth || 400,
        this.boardFilename,
        false, // mark (watermark)
        {
          ...this.boardData,
          defaultBoardTiming: settings.frameDuration || 500
        }
      )
    }
  }

  onGifGroupCreated(group) {
    // Handle new GIF group creation
    console.log('GIF group created:', group.name)
    
    // Save the updated layout data
    this.saveLayoutData()
  }

  onGifGroupDeleted(groupId) {
    // Handle GIF group deletion
    console.log('GIF group deleted:', groupId)
    
    // Save the updated layout data
    this.saveLayoutData()
  }

  async exportGifGroups(config) {
    try {
      // Show progress notification
      this.showNotification('Starting GIF export...', 'info')
      
      // Map UI config to internal format for high-resolution support
      const gifConfig = {
        gifSettings: {
          maxWidth: config.gifWidth || 400,
          resolution: config.gifResolution || '1440',
          includeDialogue: config.includeDialogueInGifs || false
        },
        openFolder: config.openFolder || false
      }
      
      console.log('[ExportIntegration.exportGifGroups] Original config:', config)
      console.log('[ExportIntegration.exportGifGroups] Mapped gifConfig:', gifConfig)
      
      // Update group order before export to ensure consistency
      if (this.gifGroupManager && this.gifGroupManager.videoGroupManager) {
        console.log('[ExportIntegration.exportGifGroups] Updating group order before export...')
        this.gifGroupManager.videoGroupManager.forceUpdateAllGroups()
      }
      
      // Get groups from VideoGroupManager only (same source as PDF export)
      const videoGroups = this.gifGroupManager ? this.gifGroupManager.videoGroupManager.getAllGroups() : []
      
      if (videoGroups.length === 0) {
        this.showNotification('No video groups found to export', 'warning')
        return
      }
      
      // Generate GIFs for all video groups
      let exportedCount = 0
      
      for (const group of videoGroups) {
        await this.generateSingleGifGroupFromVideoGroup(group, gifConfig)
        exportedCount++
      }
      
      // Show success notification
      this.showNotification(`Successfully exported ${exportedCount} GIF group${exportedCount !== 1 ? 's' : ''}`, 'success')
      
      // Open folder if requested
      if (gifConfig.openFolder) {
        const { shell } = require('electron')
        const path = require('path')
        const { ensureExportsPathExists } = require('../exporters/common')
        const exportsPath = ensureExportsPathExists(this.boardFilename)
        console.log(`[ExportIntegration] Opening exports folder: ${exportsPath}`)
        if (require('fs').existsSync(exportsPath)) {
          shell.showItemInFolder(exportsPath)
        } else {
          console.warn(`[ExportIntegration] Exports folder does not exist: ${exportsPath}`)
        }
      }
      
    } catch (error) {
      console.error('Error exporting GIF groups:', error)
      this.showNotification(`Error exporting GIFs: ${error.message}`, 'error')
      throw error
    }
  }

  // New method specifically for VideoGroupManager groups
  async exportVideoGroups(config) {
    try {
      console.log('[ExportIntegration.exportVideoGroups] Starting video group export...')
      console.log('[ExportIntegration.exportVideoGroups] Config:', config)
      
      // Show progress notification
      this.showNotification('Starting video group export...', 'info')
      
      // Get video groups from the VideoGroupManager
      const videoGroups = this.gifGroupManager ? this.gifGroupManager.videoGroupManager.getAllGroups() : []
      
      console.log('[ExportIntegration.exportVideoGroups] Found video groups:', videoGroups.length)
      console.log('[ExportIntegration.exportVideoGroups] Video groups:', videoGroups.map(g => ({ id: g.id, name: g.name, boardIds: g.boardIds })))
      
      if (videoGroups.length === 0) {
        this.showNotification('No video groups found to export', 'warning')
        return
      }
      
      // Generate GIFs for all video groups
      let exportedCount = 0
      const exportedPaths = []
      
      for (const group of videoGroups) {
        console.log(`[ExportIntegration.exportVideoGroups] Exporting group: ${group.name} (${group.boardIds.length} boards)`)
        try {
          const outputPath = await this.generateSingleGifGroupFromVideoGroup(group, config)
          if (outputPath) {
            exportedPaths.push(outputPath)
            exportedCount++
          }
        } catch (error) {
          console.error(`[ExportIntegration.exportVideoGroups] Failed to export group ${group.name}:`, error)
          this.showNotification(`Failed to export group "${group.name}": ${error.message}`, 'error')
        }
      }
      
      // Show success notification
      this.showNotification(`Successfully exported ${exportedCount} video group${exportedCount !== 1 ? 's' : ''}`, 'success')
      console.log('[ExportIntegration.exportVideoGroups] Exported paths:', exportedPaths)
      
      // Open folder if requested
      if (config.openFolder) {
        const { shell } = require('electron')
        const path = require('path')
        const { ensureExportsPathExists } = require('../exporters/common')
        const exportsPath = ensureExportsPathExists(this.boardFilename)
        console.log(`[ExportIntegration] Opening exports folder: ${exportsPath}`)
        if (require('fs').existsSync(exportsPath)) {
          shell.showItemInFolder(exportsPath)
        } else {
          console.warn(`[ExportIntegration] Exports folder does not exist: ${exportsPath}`)
        }
      }
      
    } catch (error) {
      console.error('Error exporting video groups:', error)
      this.showNotification(`Error exporting video groups: ${error.message}`, 'error')
      throw error
    }
  }

  async generateSingleGifGroup(group, config = {}) {
    const exporter = require('../window/exporter')
    const boardModel = require('../models/board')
    const path = require('path')

    // Get boards for this group
    const groupBoards = group.boardIndices.map(index => this.boardData.boards[index])
    
    // Generate GIF
    const boardSize = boardModel.boardFileImageSize(this.boardData)
    
    console.log(`[ExportIntegration] Exporting GIF group "${group.name}" with ${groupBoards.length} boards`)
    
    await exporter.exportAnimatedGif(
      groupBoards,
      boardSize,
      group.maxWidth || 400,
      this.boardFilename,
      false, // mark (watermark)
      {
        ...this.boardData,
        defaultBoardTiming: 1000 / (group.fps || 12) // Convert FPS to milliseconds
      }
    )
  }

  async generateSingleGifGroupFromVideoGroup(group, config = {}) {
    console.log(`[ExportIntegration.generateSingleGifGroupFromVideoGroup] Starting export for group: ${group.name}`)
    
    const exporter = require('../window/exporter')
    const boardModel = require('../models/board')
    const path = require('path')

    // Validate group data
    if (!group || !group.boardIds || !Array.isArray(group.boardIds)) {
      throw new Error(`Invalid group data for group: ${group?.name || 'unknown'}`)
    }

    // Get boards for this group using boardIds
    const groupBoards = group.boardIds.map(index => {
      if (index < 0 || index >= this.boardData.boards.length) {
        console.warn(`[ExportIntegration] Invalid board index ${index} for group ${group.name}`)
        return null
      }
      const board = { ...this.boardData.boards[index] } // Create a copy to avoid modifying original
      
      // Apply custom frame timing if available
      if (group.boardTimings && group.boardTimings[index] !== undefined) {
        board.duration = group.boardTimings[index] * 1000 // Convert seconds to milliseconds
        console.log(`[ExportIntegration] Applied custom timing for board ${index}: ${group.boardTimings[index]}s`)
      }
      
      return board
    }).filter(Boolean)
    
    console.log(`[ExportIntegration] Group board IDs: ${group.boardIds}`)
    console.log(`[ExportIntegration] Found ${groupBoards.length} valid boards out of ${group.boardIds.length} board IDs`)
    
    if (groupBoards.length === 0) {
      throw new Error(`No valid boards found for video group: ${group.name}`)
    }
    
    // Generate GIF - use a more robust board size calculation
    console.log(`[ExportIntegration] BoardData structure:`, {
      hasAspectRatio: !!this.boardData?.aspectRatio,
      aspectRatio: this.boardData?.aspectRatio,
      hasBoards: !!this.boardData?.boards,
      boardCount: this.boardData?.boards?.length
    })
    
    let boardSize
    if (this.boardData && this.boardData.aspectRatio) {
      const sizeArray = boardModel.boardFileImageSize(this.boardData)
      boardSize = { width: sizeArray[0], height: sizeArray[1] }
      console.log(`[ExportIntegration] Calculated board size from aspectRatio ${this.boardData.aspectRatio}:`, boardSize)
    } else {
      // Fallback to a reasonable default size
      boardSize = { width: 1920, height: 1080 }
      console.log(`[ExportIntegration] Using fallback board size (no aspectRatio in boardData):`, boardSize)
    }
    console.log(`[ExportIntegration] Final board size:`, boardSize)
    
    // Use group settings first, then config settings, then defaults
    let maxWidth = group.maxWidth || config.gifSettings?.maxWidth || config.maxWidth || 400
    
    // Apply resolution setting if provided (overrides maxWidth)
    if (config.gifSettings?.resolution) {
      const resolution = parseInt(config.gifSettings.resolution)
      if (!isNaN(resolution) && resolution > 0) {
        // Calculate proper dimensions based on resolution and aspect ratio
        const aspectRatio = boardSize.width / boardSize.height
        
        if (aspectRatio >= 1) {
          // Landscape or square - use resolution as width
          maxWidth = resolution
        } else {
          // Portrait - use resolution as height, calculate width
          maxWidth = Math.floor(resolution * aspectRatio)
        }
        
        console.log(`[ExportIntegration] Resolution setting: ${resolution}px`)
        console.log(`[ExportIntegration] Aspect ratio: ${aspectRatio.toFixed(3)}`)
        console.log(`[ExportIntegration] Calculated maxWidth: ${maxWidth}px`)
        
        // Ensure minimum quality
        if (maxWidth < 200) {
          console.warn(`[ExportIntegration] Calculated width ${maxWidth}px is too small, using minimum 200px`)
          maxWidth = 200
        }
      } else {
        console.warn(`[ExportIntegration] Invalid resolution setting: ${config.gifSettings.resolution}`)
      }
    }
    
    const fps = group.fps || config.gifSettings?.fps || 5
    const frameDuration = 1000 / fps // Convert FPS to milliseconds
    
    console.log(`[ExportIntegration] Group settings: fps=${group.fps}, maxWidth=${group.maxWidth}`)
    console.log(`[ExportIntegration] Config settings: fps=${config.gifSettings?.fps}, maxWidth=${config.gifSettings?.maxWidth}, resolution=${config.gifSettings?.resolution}`)
    console.log(`[ExportIntegration] Final settings: maxWidth=${maxWidth}, fps=${fps}, frameDuration=${frameDuration}ms`)
    
    console.log(`[ExportIntegration] Exporting GIF group "${group.name}" with ${groupBoards.length} boards`)
    console.log(`[ExportIntegration] Settings: maxWidth=${maxWidth}, fps=${fps}, frameDuration=${frameDuration}ms`)
    console.log(`[ExportIntegration] Project file: ${this.boardFilename}`)
    
    try {
      // Create boardData with custom timings
      const boardDataWithTimings = {
        ...this.boardData,
        defaultBoardTiming: frameDuration,
        boards: groupBoards // Use the boards with custom timings applied
      }
      
      const outputPath = await exporter.exportAnimatedGif(
        groupBoards,
        boardSize,
        maxWidth,
        this.boardFilename,
        false, // mark (watermark)
        boardDataWithTimings,
        './img/watermark.png', // watermarkSrc
        group.name // customFilename - just the group name
      )
      
      console.log(`[ExportIntegration] Successfully exported GIF: ${outputPath}`)
      return outputPath
    } catch (error) {
      console.error(`[ExportIntegration] Error exporting GIF for group ${group.name}:`, error)
      console.error(`[ExportIntegration] Error details:`, error.message, error.stack)
      throw error
    }
  }

  showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div')
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
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

  loadSavedData() {
    try {
      // Try to load saved layout data from user preferences or project file
      const prefsModule = require('electron').remote.require('./prefs')
      const savedData = prefsModule.getPrefs('enhancedExport')
      
      if (savedData) {
        this.layoutManager.fromJSON(savedData)
      }
      
    } catch (error) {
      console.warn('Could not load saved export layout data:', error.message)
    }
  }

  saveLayoutData() {
    try {
      // Save layout data to user preferences
      const prefsModule = require('electron').remote.require('./prefs')
      const dataToSave = this.layoutManager.toJSON()
      
      prefsModule.set('enhancedExport', dataToSave)
      prefsModule.savePrefs()
      
    } catch (error) {
      console.warn('Could not save export layout data:', error.message)
    }
  }

  // Method to add custom fields to board data
  addCustomFieldToBoard(boardIndex, fieldId, value) {
    if (!this.boardData.boards[boardIndex].customFields) {
      this.boardData.boards[boardIndex].customFields = {}
    }
    
    this.boardData.boards[boardIndex].customFields[fieldId] = value
    
    // Mark board file as dirty to trigger save
    if (window.markBoardFileDirty) {
      window.markBoardFileDirty()
    }
  }

  // Method to get custom field value from board
  getCustomFieldFromBoard(boardIndex, fieldId) {
    const board = this.boardData.boards[boardIndex]
    return board.customFields && board.customFields[fieldId] || ''
  }

  // Cleanup method
  destroy() {
    if (this.gifGroupManager) {
      this.gifGroupManager.destroy()
    }
    
    this.isInitialized = false
  }

  async handleAdvancedPDFExport(config) {
    try {
      console.log('[ExportIntegration] handleAdvancedPDFExport called with config:', config)
      
      const exportFormat = config.exportFormat || 'pdf'
      const formatName = exportFormat.toUpperCase()
      
      console.log(`[ExportIntegration] Export format: ${exportFormat} (${formatName})`)
      
      // Show progress notification
      this.showNotification(`Starting advanced ${formatName} export...`, 'info')
      
      // Update group order before export to ensure consistency
      console.log(`[ExportIntegration] gifGroupManager exists:`, !!this.gifGroupManager)
      if (this.gifGroupManager && this.gifGroupManager.videoGroupManager) {
        console.log(`[ExportIntegration.handleAdvanced${formatName}Export] Updating group order before export...`)
        this.gifGroupManager.videoGroupManager.forceUpdateAllGroups()
      } else {
        console.log(`[ExportIntegration] gifGroupManager or videoGroupManager not available`)
      }
      
      // Get groups from the new VideoGroupManager (replacing old layoutManager groups)
      const videoGroups = this.gifGroupManager ? this.gifGroupManager.videoGroupManager.getAllGroups() : []
      console.log(`[ExportIntegration] Found ${videoGroups.length} video groups`)
      
      // Merge configuration with group data
      const exportConfig = {
        ...config,
        gifGroups: [], // No longer using old layoutManager groups
        videoGroups: videoGroups,
        groupData: videoGroups,
        exportFormat: exportFormat,
        respectGroupsInPdf: config.respectGroupsInPdf !== false // Default to true if not specified
      }
      
      console.log('[ExportIntegration.handleAdvancedPDFExport] Export config:', {
        gifGroups: exportConfig.gifGroups.length,
        videoGroups: exportConfig.videoGroups.length,
        groupData: exportConfig.groupData.length,
        groupDataDetails: exportConfig.groupData.map(g => ({ name: g.name, boardIds: g.boardIds, firstBoard: g.boardIds[0] }))
      })
      
      // Generate the enhanced export
      const path = require('path')
      const moment = require('moment')
      const { ensureExportsPathExists } = require('../exporters/common')
      
      // Ensure exports directory exists
      const exportsDir = ensureExportsPathExists(this.boardFilename)
      
      // Generate filename
      const basename = path.basename(this.boardFilename, path.extname(this.boardFilename))
      const timestamp = moment().format('YYYY-MM-DD HH.mm.ss')
      const extension = exportFormat === 'html' ? 'html' : 'pdf'
      const filename = `${basename} ${timestamp}.${extension}`
      const outputPath = path.join(exportsDir, filename)
      
      // Import the appropriate exporter
      if (exportFormat === 'html') {
        const { generateEnhancedHTML } = require('../exporters/enhanced-html')
        exportConfig.outputPath = outputPath // Pass output path for relative image paths
        await generateEnhancedHTML(exportConfig, this.boardData, this.boardFilename, outputPath)
      } else {
        const { generateEnhancedPDF } = require('../exporters/enhanced-pdf')
        await generateEnhancedPDF(exportConfig, this.boardData, this.boardFilename, outputPath)
      }
      
      // Export GIFs if requested
      console.log('[ExportIntegration.handleAdvancedPDFExport] GIF export check:', {
        exportGifWithPdf: config.exportGifWithPdf,
        videoGroupsLength: videoGroups.length,
        videoGroups: videoGroups.map(g => ({ name: g.name, boardIds: g.boardIds }))
      })
      
      if (config.exportGifWithPdf && videoGroups.length > 0) {
        console.log('[ExportIntegration.handleAdvancedPDFExport] Exporting GIFs alongside PDF...')
        this.showNotification('Exporting GIFs alongside PDF...', 'info')
        
        try {
          // Create GIF config with same settings as PDF
          const gifConfig = {
            gifSettings: {
              maxWidth: config.gifSettings?.maxWidth || 400,
              resolution: config.gifSettings?.resolution || '1440',
              includeDialogue: config.gifSettings?.includeDialogue || false
            },
            openFolder: false // Don't open folder for GIFs since we'll open it for PDF
          }
          
          // Export all video groups as GIFs
          let gifExportedCount = 0
          for (const group of videoGroups) {
            await this.generateSingleGifGroupFromVideoGroup(group, gifConfig)
            gifExportedCount++
          }
          
          console.log(`[ExportIntegration.handleAdvancedPDFExport] Successfully exported ${gifExportedCount} GIFs`)
        } catch (gifError) {
          console.error('[ExportIntegration.handleAdvancedPDFExport] Error exporting GIFs:', gifError)
          this.showNotification(`PDF exported successfully, but GIF export failed: ${gifError.message}`, 'warning')
        }
      }
      
      // Show debug info if available
      if (this.lastPdfDebugInfo) {
        const { groupsFound, groupsData, renderedBoards, skippedBoards } = this.lastPdfDebugInfo
        this.showNotification(`${formatName} Export: ${renderedBoards ? renderedBoards.length : 0} boards rendered, ${skippedBoards ? skippedBoards.length : 0} skipped. Found ${groupsFound} groups.`, 'info')
      }
      
      // Show success notification
      const successMessage = config.exportGifWithPdf && videoGroups.length > 0 
        ? `${formatName} and GIFs exported successfully: ${path.basename(outputPath)}`
        : `Advanced ${formatName} exported successfully: ${path.basename(outputPath)}`
      this.showNotification(successMessage, 'success')
      
      // Open folder if requested
      if (config.openFolder && outputPath) {
        const { shell } = require('electron')
        const path = require('path')
        if (exportFormat === 'html') {
          // For HTML, open in default browser
          shell.openExternal(`file://${outputPath}`)
        } else {
          // For PDF, show in folder
          shell.showItemInFolder(outputPath)
        }
      }
      
    } catch (error) {
      console.error('Error in advanced PDF export:', error)
      this.showNotification(`Error exporting advanced PDF: ${error.message}`, 'error')
      throw error
    }
  }
}

// Singleton instance
let exportIntegrationInstance = null

// Factory function to get/create instance
const getExportIntegration = () => {
  if (!exportIntegrationInstance) {
    exportIntegrationInstance = new ExportIntegration()
  }
  return exportIntegrationInstance
}

// Initialize integration (called from main-window.js)
const initializeExportIntegration = (boardData, boardFilename) => {
  const integration = getExportIntegration()
  integration.initialize(boardData, boardFilename)
  return integration
}

module.exports = {
  ExportIntegration,
  getExportIntegration,
  initializeExportIntegration
}