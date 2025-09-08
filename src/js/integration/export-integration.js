// Export Integration Module
// Integrates enhanced export functionality with existing Storyboarder codebase

const EnhancedExportDialog = require('../components/EnhancedExportDialog')
const GifGroupManager = require('../components/GifGroupManager')
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

    // Initialize GIF group manager
    this.gifGroupManager = new GifGroupManager(
      this.layoutManager, 
      boardData, 
      {
        onGroupCreated: (group) => this.onGifGroupCreated(group),
        onGroupDeleted: (groupId) => this.onGifGroupDeleted(groupId)
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

    const dialog = new EnhancedExportDialog(this.boardData, this.boardFilename, {
      layoutManager: this.layoutManager,
      onClose: () => {
        // Save any changes to layout data
        this.saveLayoutData()
      },
      onExport: (config) => {
        this.handleEnhancedExport(config)
      }
    })

    // Pass the layout manager to the dialog
    dialog.layoutManager = this.layoutManager
  }

  async handleEnhancedExport(config) {
    try {
      // Generate enhanced PDF
      const outputPath = await this.generateEnhancedExport(config)
      
      // Show success notification
      if (window.notifications) {
        window.notifications.notify({
          message: `Enhanced export completed: ${path.basename(outputPath)}`,
          timing: 5
        })
      }

      // Open the export folder
      const { shell } = require('electron')
      shell.showItemInFolder(outputPath)

    } catch (error) {
      console.error('Enhanced export failed:', error)
      
      // Show error notification
      if (window.notifications) {
        window.notifications.notify({
          message: `Export failed: ${error.message}`,
          timing: 10
        })
      }
    }
  }

  async generateEnhancedExport(config) {
    const path = require('path')
    const moment = require('moment')
    const exporterCommon = require('../exporters/common')

    // Ensure exports directory exists
    const exportsPath = exporterCommon.ensureExportsPathExists(this.boardFilename)
    
    // Generate filename
    const basename = path.basename(this.boardFilename, path.extname(this.boardFilename))
    const timestamp = moment().format('YYYY-MM-DD HH.mm.ss')
    const filename = config.filenameTemplate
      .replace('{project}', basename)
      .replace('{date}', moment().format('YYYY-MM-DD'))
      .replace('{time}', moment().format('HH.mm.ss'))
    
    const outputPath = path.join(exportsPath, `${filename}.pdf`)

    // Generate GIFs first if needed
    if (config.includeGifs && config.gifGroups.length > 0) {
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