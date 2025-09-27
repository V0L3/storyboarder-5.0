// Enhanced PDF Exporter
// Supports custom layouts, embedded GIFs, custom fields, and advanced formatting

const fs = require('fs')
const path = require('path')
const util = require('../utils/index')
const pdfDocument = require('pdfkit')
const moment = require('moment')
const app = require('electron').remote.app

class EnhancedPDFExporter {
  constructor() {
    this.fonts = {}
    this.loadFonts()
  }

  loadFonts() {
    try {
      this.fonts = {
        thin: path.join(__dirname, '..', '..', 'fonts', 'thicccboi', 'THICCCBOI-Thin.ttf'),
        regular: path.join(__dirname, '..', '..', 'fonts', 'thicccboi', 'THICCCBOI-Regular.ttf'),
        bold: path.join(__dirname, '..', '..', 'fonts', 'thicccboi', 'THICCCBOI-Bold.ttf'),
        fallback: path.join(__dirname, '..', '..', 'fonts', 'unicore.ttf')
      }
    } catch (error) {
      console.warn('Could not load custom fonts, using system defaults')
      this.fonts = {}
    }
  }

  async generateEnhancedPDF(config, boardData, projectFileAbsolutePath, outputPath) {
    // Add boards data to config for multi-shot sequence detection
    config.allBoards = boardData.boards
    const {
      layout,
      paperSize,
      paperOrientation,
      includeFields,
      showFilenames,
      filenameLocation,
      customFields,
      includeGifs,
      gifGroups,
      gifSettings,
      exportFormat,
      imageQuality,
      includeWatermark,
      watermarkText,
      watermarkOpacity,
      layoutPreset
    } = config

    // Calculate document dimensions
    const documentSize = this.getDocumentSize(paperSize)
    const docSize = paperOrientation === 'landscape' 
      ? [documentSize[1], documentSize[0]] 
      : documentSize

    // Create PDF document
    const doc = new pdfDocument({
      size: docSize,
      layout: paperOrientation,
      margin: 0
    })

    // Register fonts
    this.registerFonts(doc)

    // Create output stream
    const stream = doc.pipe(fs.createWriteStream(outputPath))

    try {
      // Generate pages
      await this.generatePages(doc, config, boardData, projectFileAbsolutePath)
      
      // Finalize document
      doc.end()
      
      // Wait for stream to finish
      await new Promise((resolve, reject) => {
        stream.on('finish', resolve)
        stream.on('error', reject)
      })

      return outputPath

    } catch (error) {
      console.error('Error generating enhanced PDF:', error)
      throw error
    }
  }

  getDocumentSize(paperSize) {
    switch (paperSize) {
      case 'LTR':
        return [8.5 * 72, 11 * 72] // Letter size in points
      case 'A4':
      default:
        return [595, 842] // A4 size in points
    }
  }

  registerFonts(doc) {
    try {
      if (this.fonts.thin) doc.registerFont('thin', this.fonts.thin)
      if (this.fonts.regular) doc.registerFont('regular', this.fonts.regular)
      if (this.fonts.bold) doc.registerFont('bold', this.fonts.bold)
      if (this.fonts.fallback) doc.registerFont('fallback', this.fonts.fallback)
    } catch (error) {
      console.warn('Could not register fonts:', error.message)
    }
  }

  // Format dialogue with quotes and speaker recognition
  formatDialogueString(text) {
    if (!text || typeof text !== 'string') return text
    let trimmed = text.trim()
    if (!trimmed) return text

    // If already wrapped in double quotes (allow whitespace around)
    const hasLeadingQuote = /^"/.test(trimmed)
    const hasTrailingQuote = /"$/.test(trimmed)

    // Detect speaker pattern: Speaker: dialogue
    const speakerMatch = trimmed.match(/^([^:]{1,60}):\s*(.+)$/)
    if (speakerMatch) {
      const speaker = speakerMatch[1].trim()
      let content = speakerMatch[2].trim()
      // Avoid double quoting content
      const contentLeadingQuote = /^"/.test(content)
      const contentTrailingQuote = /"$/.test(content)
      if (!(contentLeadingQuote && contentTrailingQuote)) {
        content = `"${content.replace(/"/g, '\\"')}"`
      }
      return `${speaker}: ${content}`
    }

    // No speaker: wrap whole line if not already quoted on both ends
    if (!(hasLeadingQuote && hasTrailingQuote)) {
      trimmed = `"${trimmed.replace(/"/g, '\\"')}"`
    }
    return trimmed
  }

  async generatePages(doc, config, boardData, projectFileAbsolutePath) {
    const { layout } = config
    const boards = boardData.boards

    // Get groups and create lookup for grouped boards
    const groupedBoardIds = new Set()
    const boardToGroupMap = new Map()

    // Get groups directly from VideoGroupManager
    let groupsToProcess = []
    
    if (typeof window !== 'undefined' && window.exportIntegration && window.exportIntegration.gifGroupManager) {
      groupsToProcess = window.exportIntegration.gifGroupManager.videoGroupManager.getAllGroups()
    }
    
    // Store debug info
    if (typeof window !== 'undefined' && window.exportIntegration) {
      window.exportIntegration.lastPdfDebugInfo = {
        groupsFound: groupsToProcess.length,
        groupsData: groupsToProcess.map(g => ({ name: g.name, boardIds: g.boardIds }))
      }
    }
    
    if (groupsToProcess.length > 0) {
      console.log('[EnhancedPDF] Processing groups:', groupsToProcess.length)
      groupsToProcess.forEach((group, index) => {
        console.log(`[EnhancedPDF] Group ${index}:`, {
          id: group.id,
          name: group.name,
          boardIds: group.boardIds,
          firstBoardId: group.boardIds[0]
        })
        group.boardIds.forEach(boardId => {
          groupedBoardIds.add(boardId)
          boardToGroupMap.set(boardId, group)
        })
      })
      console.log('[EnhancedPDF] Grouped board IDs:', Array.from(groupedBoardIds))
      console.log('[EnhancedPDF] Board to group map:', Array.from(boardToGroupMap.entries()))
    } else {
      console.log('[EnhancedPDF] No groups found to process')
    }
    
    // Pass the group data to config for use in drawBoardImage
    config.boardToGroupMap = boardToGroupMap
    config.groupedBoardIds = groupedBoardIds

    // Calculate layout dimensions
    const pageSize = [doc.page.width, doc.page.height]
    const margins = [20, 20, 20, 20] // top, right, bottom, left
    const headerHeight = 50

    // Calculate available space
    const availableWidth = pageSize[0] - margins[1] - margins[3]
    const availableHeight = pageSize[1] - margins[0] - margins[2] - headerHeight

    // Calculate how many rows fit per page
    const rowHeight = this.calculateRowHeight(config, availableHeight, boardData)
    const rowsPerPage = Math.floor(availableHeight / (rowHeight + layout.spacing))

    // Generate pages
    let currentPage = 0
    let currentRow = 0

    // Export logic based on respectGroupsInPdf setting
    const skippedBoards = []
    const renderedBoards = []
    const respectGroups = config.respectGroupsInPdf !== false // Default to true
    
    console.log(`[EnhancedPDF] Respect groups setting: ${respectGroups}`)
    
    for (let boardIndex = 0; boardIndex < boards.length; boardIndex++) {
      // If respecting groups and board is in a group, only render if it's the first one
      if (respectGroups && groupedBoardIds.has(boardIndex)) {
        const group = boardToGroupMap.get(boardIndex)
        if (group && group.boardIds[0] !== boardIndex) {
          skippedBoards.push(boardIndex)
          console.log(`[EnhancedPDF] Skipping board ${boardIndex} (not first in group ${group.name})`)
          continue // Skip - not first in group
        }
      }
      
      renderedBoards.push(boardIndex)
      const board = boards[boardIndex]

      // Start new page if needed
      if (currentRow >= rowsPerPage) {
        doc.addPage()
        currentPage++
        currentRow = 0
      }

      // Draw page header on first row of each page
      if (currentRow === 0) {
        this.drawPageHeader(doc, config, boardData, currentPage + 1, margins, headerHeight)
        // Draw column headers and store positioning info for dotted lines
        const columnHeaderInfo = this.drawColumnHeaders(doc, config, margins[3], margins[0] + headerHeight, availableWidth, rowHeight)
        // Store header positioning for dotted lines alignment
        config.headerPositioning = columnHeaderInfo
        // Adjust row position to account for column headers
        var adjustedRowY = columnHeaderInfo.y + (currentRow * (rowHeight + layout.spacing))
      } else {
        // Calculate row position
        var adjustedRowY = margins[0] + headerHeight + 25 + (currentRow * (rowHeight + layout.spacing))
      }

      // Draw board row
      await this.drawBoardRow(
        doc,
        board,
        boardIndex,
        { ...config, boardData, groupedBoardIds, boardToGroupMap },
        margins[3],
        adjustedRowY,
        availableWidth,
        rowHeight,
        projectFileAbsolutePath
      )

      // Draw dotted lines if enabled
      if (config.enableDottedLines) {
        this.drawDottedLines(doc, config, margins[3], adjustedRowY, availableWidth, rowHeight)
      }

      // Draw note lines if enabled
      if (config.enableNoteLines) {
        this.drawNoteLines(doc, config, margins[3], adjustedRowY, availableWidth, rowHeight)
      }

      currentRow++
    }

    // Store debug info for export integration to show
    if (typeof window !== 'undefined' && window.exportIntegration) {
      window.exportIntegration.lastPdfDebugInfo = {
        ...window.exportIntegration.lastPdfDebugInfo,
        totalBoards: boards.length,
        renderedBoards: renderedBoards,
        skippedBoards: skippedBoards,
        groupedBoardIds: Array.from(groupedBoardIds)
      }
    }

    // Add watermark if requested
    if (config.includeWatermark) {
      this.addWatermark(doc, config)
    }
  }

  calculateRowHeight(config, availableHeight, boardData) {
    const { layout, imageSize = 80, dialogueBelowImage = false } = config
    
    // Find image column width to calculate aspect ratio
    const imageColumn = layout.columns.find(col => col.type === 'image')
    let imageWidth = imageColumn ? imageColumn.width : 200
    
    // Note: imageWidth is already scaled by the layout generation, so we don't need to apply imageSize again
    
    // Use actual aspect ratio from board data
    const aspectRatio = boardData.aspectRatio || 16 / 9
    const imageHeight = imageWidth / aspectRatio
    
    // Add minimal padding for text and spacing - much reduced
    let textPadding = 25 // Much reduced space for text below image
    
    // If dialogue is below image, add extra space
    if (dialogueBelowImage) {
      textPadding += 15 // Extra space for dialogue below image
    }
    
    const minRowHeight = imageHeight + textPadding
    
    // Ensure row height doesn't exceed available space - allow more rows per page
    const maxRowHeight = availableHeight / 3 // At least 3 rows per page
    
    return Math.min(minRowHeight, maxRowHeight)
  }

  drawPageHeader(doc, config, boardData, pageNumber, margins, headerHeight) {
    const { layout, layoutPreset, authorName } = config
    const filename = path.basename(boardData.filename || 'Storyboard', path.extname(boardData.filename || ''))
    
    // Special handling for Japanese storyboard preset
    if (layoutPreset === 'japanese-storyboard') {
      // Main title in green
      doc.font('bold')
        .fontSize(18)
        .fillColor('#22c55e') // Green color
        .text('STORYBOARD', margins[3], margins[0] + 5, { align: 'left' })
      
      // Japanese subtitle
      doc.font('regular')
        .fontSize(14)
        .fillColor('#333333')
        .text('絵コンテ', margins[3], margins[0] + 25, { align: 'left' })
      
      // Project info and Author on the same line
      doc.font('thin')
      doc.fontSize(8)
      const lastBoard = boardData.boards[boardData.boards.length - 1]
      const totalDuration = lastBoard ? lastBoard.time + (lastBoard.duration || 2000) : 0
      const infoText = `Boards: ${boardData.boards.length} | Duration: ${util.msToTime(totalDuration)} | Page: ${pageNumber}`
      const authorText = authorName && authorName.trim() ? `© ${authorName.trim()}` : ''
      
      // Draw project info on the left
      doc.text(infoText, margins[3], margins[0] + 40, { align: 'left' })
      
      // Draw author on the right (same line) - properly aligned from right edge
      if (authorText) {
        const textWidth = doc.widthOfString(authorText);
        const textX = doc.page.width - margins[1] - textWidth;
        doc.text(authorText, textX, margins[0] + 40)
      }
    } else {
      // Standard header
      doc.font('bold')
      doc.fontSize(16)
      doc.text(filename.toUpperCase(), margins[3], margins[0] + 5, { align: 'left' })
      
      // Project info
      doc.font('thin')
      doc.fontSize(8)
      const lastBoard = boardData.boards[boardData.boards.length - 1]
      const totalDuration = lastBoard ? lastBoard.time + (lastBoard.duration || 2000) : 0
      const infoText = `Boards: ${boardData.boards.length} | Duration: ${util.msToTime(totalDuration)} | Page: ${pageNumber}`
      doc.text(infoText, margins[3], margins[0] + 25, { align: 'left' })
      
      // Date and Author on the same line
      const dateText = `Generated: ${moment().format('MMMM Do YYYY, h:mm a')}`
      const authorText = authorName && authorName.trim() ? `© ${authorName.trim()}` : ''
      
      // Draw date on the left
      doc.text(dateText, margins[3], margins[0] + 35, { align: 'left' })
      
      // Draw author on the right (same line) - properly aligned from right edge
      if (authorText) {
        const textWidth = doc.widthOfString(authorText);
        const textX = doc.page.width - margins[1] - textWidth;
        doc.text(authorText, textX, margins[0] + 35)
      }
    }
    
    // Draw separator line
    doc.strokeColor('#cccccc')
    doc.lineWidth(0.5)
    doc.moveTo(margins[3], margins[0] + headerHeight - 5)
    doc.lineTo(doc.page.width - margins[1], margins[0] + headerHeight - 5)
    doc.stroke()
  }

  drawColumnHeaders(doc, config, x, y, availableWidth, rowHeight) {
    const { layout } = config

    // Create a copy of columns with dynamic width calculation for custom-layers
    const processedColumns = layout.columns.map(column => {
      if (column.type === 'custom-layers') {
        // Skip custom layers entirely if not enabled
        if (!config.includeCustomLayers) {
          return null // Will be filtered out
        }
        // For headers, use a more reasonable fixed width for the custom layers column
        // This prevents overlap while still being visible
        return { ...column, width: 120 }
      }
      return column
    }).filter(column => column !== null) // Remove null columns

    // Calculate total content width including spacing
    const totalContentWidth = processedColumns.reduce((sum, col) => sum + col.width, 0) +
                              (processedColumns.length - 1) * layout.spacing

    // Ensure content never exceeds available width (same logic as drawBoardRow)
    let scaleFactor = 1
    if (totalContentWidth > availableWidth) {
      scaleFactor = availableWidth / totalContentWidth
    }

    // Center content if it's smaller than available width
    const scaledContentWidth = totalContentWidth * scaleFactor
    const contentX = scaledContentWidth <= availableWidth ? x + (availableWidth - scaledContentWidth) / 2 : x

    // Draw column headers background (matches the actual content area)
    doc.fillColor('#f8fafc')
    doc.rect(contentX, y, scaledContentWidth, 25)
    doc.fill()

    // Draw continuous border around the entire header area
    doc.strokeColor('#e5e7eb')
    doc.lineWidth(0.5)
    doc.rect(contentX, y, scaledContentWidth, 25)
    doc.stroke()

    // Draw column headers
    let currentX = contentX
    processedColumns.forEach(column => {
      const columnWidth = column.width * scaleFactor

      // Draw header text
      doc.font('bold')
      doc.fontSize(10)
      doc.fillColor('#374151')
      doc.text(column.label, currentX + 5, y + 8, {
        width: columnWidth - 10,
        align: 'center'
      })

      // Draw vertical separator lines between columns (but not outer borders)
      if (processedColumns.indexOf(column) > 0) {
        doc.strokeColor('#e5e7eb')
        doc.lineWidth(0.3)
        doc.moveTo(currentX, y)
        doc.lineTo(currentX, y + 25)
        doc.stroke()
      }

      currentX += columnWidth + (layout.spacing * scaleFactor)
    })

    return {
      y: y + 25,
      contentX: contentX,
      scaledContentWidth: scaledContentWidth,
      processedColumns: processedColumns,
      scaleFactor: scaleFactor
    }
  }

  async drawBoardRow(doc, board, boardIndex, config, x, y, availableWidth, rowHeight, projectFileAbsolutePath) {
    const { layout, showFilenames, filenameLocation, includeFields, dialogueBelowImage = false } = config

    // Create a copy of columns with dynamic width calculation for custom-layers
    const processedColumns = layout.columns.map(column => {
      if (column.type === 'custom-layers') {
        // Skip custom layers entirely if not enabled
        if (!config.includeCustomLayers) {
          return null // Will be filtered out
        }

        const customLayers = board.customLayers || []
        const filledLayers = customLayers.filter(layer => layer.value && layer.value.trim())
        if (filledLayers.length > 0) {
          // Calculate width based on content - estimate 60px per layer, max 120px
          return { ...column, width: Math.min(120, filledLayers.length * 60) }
        } else {
          return null // No custom layers content, skip entirely
        }
      }
      return column
    }).filter(column => column !== null) // Remove null columns

    // Calculate total content width including spacing
    const totalContentWidth = processedColumns.reduce((sum, col) => sum + col.width, 0) +
                              (processedColumns.length - 1) * layout.spacing

    // Ensure content never exceeds available width
    let scaleFactor = 1
    if (totalContentWidth > availableWidth) {
      scaleFactor = availableWidth / totalContentWidth
      console.log(`[EnhancedPDF] Content width ${totalContentWidth} exceeds available width ${availableWidth}, scaling by ${scaleFactor}`)
    }

    // Center content if it's smaller than available width
    const scaledContentWidth = totalContentWidth * scaleFactor
    const currentX = scaledContentWidth <= availableWidth ? x + (availableWidth - scaledContentWidth) / 2 : x

    // Draw each column
    let columnX = currentX
    for (const column of processedColumns) {
      const columnWidth = column.width * scaleFactor

      // Skip dialogue column if dialogue is below image
      if (dialogueBelowImage && (column.type === 'dialogue' || column.type === 'talks')) {
        columnX += columnWidth + (layout.spacing * scaleFactor)
        continue
      }

      // Skip custom-layers column if it has zero width
      if (column.type === 'custom-layers' && columnWidth === 0) {
        columnX += layout.spacing * scaleFactor // Still add spacing for layout consistency
        continue
      }

      await this.drawColumn(
        doc,
        column,
        board,
        boardIndex,
        config,
        columnX,
        y,
        columnWidth,
        rowHeight,
        projectFileAbsolutePath
      )

      columnX += columnWidth + (layout.spacing * scaleFactor)
    }
    
    // Draw dialogue below image if enabled
    if (dialogueBelowImage) {
      const dialogueText = board.dialogue || board.action || ''
      if (dialogueText.trim()) {
        // Find the image column to position dialogue below it
        const imageColumn = layout.columns.find(col => col.type === 'image')
        if (imageColumn) {
          const imageColumnIndex = layout.columns.findIndex(col => col.type === 'image')
          let imageX = x
          for (let i = 0; i < imageColumnIndex; i++) {
            imageX += layout.columns[i].width + layout.spacing
          }

          // Increased horizontal offset for dialogue below image
          const dialogueX = imageX + 15  // 15px offset from column start for better visual separation

          // Draw dialogue below the image (with horizontal offset)
          const dialogueY = y + rowHeight - 20 // Position near bottom of row

          // Apply selected dialogue font
          const dialogueFont = config.dialogueFont === 'courier-final-draft' ? 'courier' : 'regular'
          doc.font(dialogueFont)
          doc.fontSize(8)
          doc.fillColor('#333333')
          doc.text(dialogueText, dialogueX, dialogueY, {
            width: imageColumn.width - 40,  // Account for 15px left padding + 25px right padding
            align: 'left'
          })
        }
      }
    }
    
    // Draw filename overlay if requested
    if (showFilenames && filenameLocation === 'overlay') {
      this.drawFilenameOverlay(doc, board, boardIndex, config, x, y, availableWidth, rowHeight)
    }
  }

  async drawColumn(doc, column, board, boardIndex, config, x, y, width, height, projectFileAbsolutePath) {
    // Handle dynamic width calculation for custom-layers
    if (column.type === 'custom-layers') {
      const customLayers = board.customLayers || []
      const filledLayers = customLayers.filter(layer => layer.value && layer.value.trim())
      if (filledLayers.length > 0) {
        // Calculate width based on content - estimate 80px per layer
        width = Math.min(200, filledLayers.length * 80)
      } else {
        width = 0 // No custom layers, skip rendering
        return
      }
    }
    // Calculate image position for vertical text alignment only
    let imageTopY = null
    if (column.type !== 'image') {
      // Find the image column to align text with image position
      const imageColumn = config.layout.columns.find(col => col.type === 'image')
      if (imageColumn) {
        const imageColumnIndex = config.layout.columns.findIndex(col => col.type === 'image')
        let imgX = x
        for (let i = 0; i < imageColumnIndex; i++) {
          imgX += config.layout.columns[i].width + config.layout.spacing
        }

        // Calculate image position (same as in drawBoardImage)
        const maxImageHeight = height - 10
        const maxImageWidth = imageColumn.width - 4
        const aspectRatio = config.boardData?.aspectRatio || 16 / 9

        let imageWidth = maxImageWidth
        let imageHeight = maxImageWidth / aspectRatio

        if (imageHeight > maxImageHeight) {
          imageHeight = maxImageHeight
          imageWidth = maxImageHeight * aspectRatio
        }

        // Image position (centered) - only get vertical position
        imageTopY = y + 2 + (maxImageHeight - imageHeight) / 2
      }
    }
    
    // Draw column border for debugging (remove in production)
    if (false) { // Set to true for debugging
      doc.strokeColor('#eeeeee')
      doc.lineWidth(0.5)
      doc.rect(x, y, width, height)
      doc.stroke()
    }
    
    switch (column.type) {
      case 'shot-number':
        // Pass all boards data for multi-shot sequence detection
        const allBoards = config.allBoards || []
        this.drawShotNumber(doc, boardIndex + 1, board, x, y, width, height, allBoards, config)
        break
        
      case 'image':
        await this.drawBoardImage(doc, board, boardIndex, x, y, width, height, projectFileAbsolutePath, config)
        break
        
      case 'notes':
        const notesText = board.notes || (config.layoutPreset === 'japanese-storyboard' ? 'Write action notes here\nRemove to leave blank' : '')
        this.drawTextColumn(doc, notesText, x, y, width, height, 'regular', 9, 'left', imageTopY)
        break

      case 'dialogue':
        const dialogueFont = config.dialogueFont === 'courier-final-draft' ? 'courier' : 'bold'
        const rawDialogue = board.dialogue || ''
        const formattedDialogue = config.putDialogueInQuotes ? this.formatDialogueString(rawDialogue) : rawDialogue
        this.drawTextColumn(doc, formattedDialogue, x, y, width, height, dialogueFont, 9, 'left', imageTopY)
        break

      case 'action':
        this.drawTextColumn(doc, board.action || '', x, y, width, height, 'regular', 9, 'left', imageTopY)
        break

      case 'talks':
        // Combine dialogue and action for "talks" column
        let talksText = [
          config.putDialogueInQuotes ? this.formatDialogueString(board.dialogue || '') : (board.dialogue || ''),
          board.action
        ].filter(Boolean).join('\n\n')
        if (!talksText && config.layoutPreset === 'japanese-storyboard') {
          talksText = 'Dialogue / sound notes'
        }
        const talksFont = config.dialogueFont === 'courier-final-draft' ? 'courier' : 'regular'
        this.drawTextColumn(doc, talksText, x, y, width, height, talksFont, 9, 'left', imageTopY)
        break

      case 'time':
        if (config.layoutPreset === 'japanese-storyboard') {
          // Show placeholder time format for Japanese storyboard
          this.drawTextColumn(doc, '00\'', x, y, width, height, 'thin', 8, 'center', imageTopY)
        } else {
          const duration = board.duration || config.boardData?.defaultBoardTiming || 2000
          this.drawTextColumn(doc, util.msToTime(duration), x, y, width, height, 'thin', 8, 'center', imageTopY)
        }
        break

      case 'filename':
        if (config.showFilenames) {
          const filename = this.getBoardFilename(board, boardIndex)
          this.drawTextColumn(doc, filename, x, y, width, height, 'thin', 8, 'left', imageTopY)
        }
        break

      case 'custom-field':
        await this.drawCustomField(doc, column, board, x, y, width, height, config, imageTopY)
        break

      case 'custom-layers':
        await this.drawCustomLayers(doc, column, board, x, y, width, height, config, imageTopY)
        break

      default:
        // Unknown column type - draw placeholder
        this.drawTextColumn(doc, column.label || column.type, x, y, width, height, 'thin', 8, 'center', imageTopY)
        break
    }
  }

  drawShotNumber(doc, shotNumber, board, x, y, width, height, allBoards = null, config = {}) {
    doc.font('bold')
    doc.fontSize(14)
    doc.fillColor('#333333')

    // Check if this board is part of a group and should show range
    let shotText = board.shot || shotNumber.toString().padStart(2, '0')
    let isGrouped = false

    if (config.boardToGroupMap && config.groupedBoardIds && config.groupedBoardIds.has(shotNumber - 1)) {
      const group = config.boardToGroupMap.get(shotNumber - 1)
      if (group) {
        // Get shot names for all boards in the group
        const groupShotNames = group.boardIds.map(boardId => {
          const board = allBoards[boardId]
          return board ? (board.shot || (boardId + 1).toString().padStart(2, '0')) : (boardId + 1).toString().padStart(2, '0')
        })

        // Find the first and last shot names
        const firstShot = groupShotNames[0]
        const lastShot = groupShotNames[groupShotNames.length - 1]

        if (firstShot !== lastShot) {
          shotText = `${firstShot}\n-\n${lastShot}`
        } else {
          shotText = firstShot
        }

        isGrouped = true
      }
    }

    // Show colored stripe for grouped items
    if (isGrouped) {
      const group = config.boardToGroupMap.get(shotNumber - 1)
      if (group && group.color) {
        // Convert hex color to RGB for PDFKit
        const hex = group.color.replace('#', '')
        const r = parseInt(hex.substr(0, 2), 16)
        const g = parseInt(hex.substr(2, 2), 16)
        const b = parseInt(hex.substr(4, 2), 16)
        doc.fillColor([r, g, b])
        doc.rect(x, y, 3, height)
        doc.fill()
        doc.fillColor('#333333')
      }
    } else {
      // Check if this is part of a true multi-shot sequence (like 4A, 4B, 4C)
      const shotName = board.shot || shotNumber.toString().padStart(2, '0')
      let isMultiShot = false

      if (allBoards && /[A-Z]/.test(shotName)) {
        // Extract the base number (e.g., "4A" -> "4", "10B" -> "10")
        const baseNumber = shotName.replace(/[A-Z]/g, '')

        // Count how many other shots have the same base number
        const relatedShots = allBoards.filter(otherBoard => {
          const otherShotName = otherBoard.shot || (allBoards.indexOf(otherBoard) + 1).toString().padStart(2, '0')
          return otherShotName.replace(/[A-Z]/g, '') === baseNumber && otherShotName !== shotName
        })

        // Only show red stripe if there are other shots with the same base number
        isMultiShot = relatedShots.length > 0
      }

      // Only show red stripe for true multi-shot sequences
      if (isMultiShot) {
        doc.fillColor('#ff4444')
        doc.rect(x, y, 3, height)
        doc.fill()
        doc.fillColor('#333333')
      }
    }

    // Handle multi-line text for grouped shots
    if (shotText.includes('\n')) {
      const lines = shotText.split('\n')
      const lineHeight = 12
      const startY = y + 5
      
      lines.forEach((line, index) => {
        doc.text(line, x, startY + (index * lineHeight), { width, align: 'center' })
      })
    } else {
      doc.text(shotText, x, y + 10, { width, align: 'center' })
    }
  }

  async drawBoardImage(doc, board, boardIndex, x, y, width, height, projectFileAbsolutePath, config = {}) {
    try {
      // Get the poster frame image path
      const boardModel = require('../models/board')
      const imageFilename = boardModel.boardFilenameForPosterFrame(board)
      const imagePath = path.join(path.dirname(projectFileAbsolutePath), 'images', imageFilename)
      
      // Use actual aspect ratio from board data
      const aspectRatio = config.boardData?.aspectRatio || 16 / 9
      
      // Calculate image dimensions to fit in column while maintaining aspect ratio
      const maxImageHeight = height - 10 // Much reduced padding for better fit
      let maxImageWidth = width - 4 // Much reduced padding
      
      // Note: imageSize scaling is already applied in the layout generation
      
      // Calculate proper dimensions based on aspect ratio
      let imageWidth, imageHeight, imageX, imageY
      
      // Try to fit by width first
      imageWidth = maxImageWidth
      imageHeight = maxImageWidth / aspectRatio
      
      // If too tall, fit by height instead
      if (imageHeight > maxImageHeight) {
        imageHeight = maxImageHeight
        imageWidth = maxImageHeight * aspectRatio
      }
      
      // Center the image with minimal padding
      imageX = x + 2 + ((width - 4) - imageWidth) / 2
      imageY = y + 2 + (maxImageHeight - imageHeight) / 2
      
      if (fs.existsSync(imagePath)) {
        // Draw the image
        doc.image(imagePath, imageX, imageY, {
          fit: [imageWidth, imageHeight],
          align: 'center',
          valign: 'center'
        })
        
        // Draw border around image
        doc.strokeColor('#cccccc')
        doc.lineWidth(0.5)
        doc.rect(imageX, imageY, imageWidth, imageHeight)
        doc.stroke()
        
        // Add clickable link to GIF if this board is part of a group
        if (config.boardToGroupMap && config.groupedBoardIds && config.groupedBoardIds.has(boardIndex)) {
          const boardGroup = config.boardToGroupMap.get(boardIndex)
          console.log(`[EnhancedPDF] Board ${boardIndex} is in group:`, boardGroup)
          
          if (boardGroup) {
            // Generate the expected GIF filename
            const gifFilename = `${boardGroup.name}.gif`
            const gifPath = path.join(path.dirname(projectFileAbsolutePath), 'exports', gifFilename)
            
            // Check if GIF file exists
            if (fs.existsSync(gifPath)) {
              // Add clickable link annotation over the image
              // Use absolute path for better compatibility with Acrobat Reader
              const absoluteGifPath = path.resolve(gifPath)
              // Try different URL formats for better compatibility
              const linkUrl = process.platform === 'win32' 
                ? `file:///${absoluteGifPath.replace(/\\/g, '/')}`
                : `file://${absoluteGifPath}`
              
              // Create a clickable rectangle over the image
              doc.link(imageX, imageY, imageWidth, imageHeight, linkUrl)
              
              // Add a subtle visual indicator that this image is clickable
              doc.strokeColor('#007acc')
              doc.lineWidth(1)
              doc.rect(imageX, imageY, imageWidth, imageHeight)
              doc.stroke()
              
              // Add a small "GIF" indicator in the corner
              doc.font('thin')
              doc.fontSize(8)
              doc.fillColor('#007acc')
              doc.text('GIF', imageX + imageWidth - 25, imageY + 5)
              
              console.log(`[EnhancedPDF] Added GIF link for board ${boardIndex} to ${gifPath}`)
              console.log(`[EnhancedPDF] Link URL: ${linkUrl}`)
            } else {
              console.log(`[EnhancedPDF] GIF file not found: ${gifPath}`)
            }
          }
        }
        
      } else {
        // Draw placeholder if image doesn't exist
        doc.strokeColor('#cccccc')
        doc.lineWidth(1)
        doc.rect(imageX, imageY, imageWidth, imageHeight)
        doc.stroke()
        
        // Special handling for Japanese storyboard preset
        if (config.layoutPreset === 'japanese-storyboard') {
          // Draw grid pattern background
          this.drawGridPattern(doc, imageX, imageY, imageWidth, imageHeight)
          
          // Draw aspect ratio in top left
          doc.font('thin')
          doc.fontSize(7)
          doc.fillColor('#666666')
          doc.text(`${aspectRatio.toFixed(1)}:1`, imageX + 3, imageY + 3)
          
          // Draw placeholder text in top right
          doc.text('placeholder image', imageX + 3, imageY + 3, { align: 'right', width: imageWidth - 6 })
          
          // Draw landscape icon in bottom right
          this.drawLandscapeIcon(doc, imageX + imageWidth - 20, imageY + imageHeight - 20, 15, 15)
        } else {
          // Standard placeholder
          doc.font('thin')
          doc.fontSize(8)
          doc.fillColor('#999999')
          doc.text('No image', imageX + imageWidth/2, imageY + imageHeight/2, { align: 'center' })
        }
      }
      
    } catch (error) {
      console.warn('Error drawing board image:', error.message)
      // Draw error placeholder
      this.drawTextColumn(doc, 'Image error', x, y, width, height, 'thin', 8, 'center')
    }
  }

  drawGridPattern(doc, x, y, width, height) {
    // Draw a subtle grid pattern
    doc.strokeColor('#f0f0f0')
    doc.lineWidth(0.5)
    
    // Vertical lines
    for (let i = 0; i <= width; i += 20) {
      doc.moveTo(x + i, y)
      doc.lineTo(x + i, y + height)
    }
    
    // Horizontal lines
    for (let i = 0; i <= height; i += 20) {
      doc.moveTo(x, y + i)
      doc.lineTo(x + width, y + i)
    }
    
    doc.stroke()
  }

  drawLandscapeIcon(doc, x, y, width, height) {
    // Draw a simple landscape icon (mountain and sun)
    doc.strokeColor('#cccccc')
    doc.fillColor('#f0f0f0')
    doc.lineWidth(1)
    
    // Mountain silhouette
    doc.moveTo(x, y + height)
    doc.lineTo(x + width * 0.3, y + height * 0.3)
    doc.lineTo(x + width * 0.6, y + height * 0.5)
    doc.lineTo(x + width, y + height)
    doc.closePath()
    doc.fill()
    doc.stroke()
    
    // Sun
    doc.circle(x + width * 0.8, y + height * 0.2, width * 0.1)
    doc.fillColor('#ffeb3b')
    doc.fill()
    doc.stroke()
  }

  drawTextColumn(doc, text, x, y, width, height, font = 'regular', fontSize = 9, align = 'left', imageTopY = null) {
    if (!text) return

    try {
      doc.font(font)
      doc.fontSize(fontSize)

      // Check if this is placeholder text that should be grayed out
      const isPlaceholder = text.includes('Write action notes here') ||
                           text.includes('Remove to leave blank') ||
                           text.includes('placeholder') ||
                           text.includes('No image')

      if (isPlaceholder) {
        doc.fillColor('#cccccc') // Grayed out color for placeholders
      } else {
        doc.fillColor('#333333') // Normal text color
      }

      // Handle text that might contain foreign characters
      const useFallback = this.stringContainsForeign(text)
      if (useFallback && this.fonts.fallback) {
        doc.font('fallback')
      }

      // Calculate text area - only align vertically with image if provided
      let textX, textY, textWidth, textHeight

      if (imageTopY !== null) {
        // Align text vertically with image, but use column horizontal position
        textX = x + 5
        textY = imageTopY   // Align with image top edge
        textWidth = width - 10
        textHeight = height - 10
      } else {
        // Use standard column position
        textX = x + 5
        textY = y + 5
        textWidth = width - 10
        textHeight = height - 10
      }
      
      // Draw text with word wrapping
      doc.text(text, textX, textY, {
        width: textWidth,
        height: textHeight,
        align: align,
        ellipsis: true
      })
      
    } catch (error) {
      console.warn('Error drawing text column:', error.message)
    }
  }

  async drawCustomField(doc, column, board, x, y, width, height, config, imageTopY = null) {
    // Get custom field value from board data
    let value = ''

    // Special handling for focal length field
    if (column.id === 'focal-length') {
      if (board.focalLength) {
        value = `${board.focalLength}mm`
      }
    } else if (column.customFieldId && board.customFields) {
      value = board.customFields[column.customFieldId] || ''
    }

    // If no value, use default
    if (!value && column.defaultValue) {
      value = column.defaultValue
    }

    this.drawTextColumn(doc, value, x, y, width, height, 'regular', 9, 'left', imageTopY)
  }

  async drawCustomLayers(doc, column, board, x, y, width, height, config, imageTopY = null) {
    // Draw custom layers for this board only if enabled in config
    if (!config.includeCustomLayers || !board.customLayers || board.customLayers.length === 0) {
      return
    }

    let currentY = y + 5
    const layerHeight = Math.min(12, (height - 10) / board.customLayers.length)

    board.customLayers.forEach((layer, index) => {
      if (layer.value && layer.value.trim()) {
        // Draw layer label
        doc.font('bold')
        doc.fontSize(8)
        doc.fillColor('#666666')
        doc.text(`${layer.label}:`, x + 5, currentY, {
          width: width - 10,
          align: 'left'
        })

        // Draw layer value
        doc.font('regular')
        doc.fontSize(8)
        doc.fillColor('#333333')
        doc.text(layer.value, x + 5, currentY + 10, {
          width: width - 10,
          align: 'left'
        })

        currentY += layerHeight + 5
      }
    })
  }

  drawFilenameOverlay(doc, board, boardIndex, config, x, y, width, height) {
    const filename = this.getBoardFilename(board, boardIndex)
    
    if (filename) {
      // Find image column position
      const imageColumn = config.layout.columns.find(col => col.type === 'image')
      if (imageColumn) {
        let imageX = x
        
        // Calculate image column X position
        for (const col of config.layout.columns) {
          if (col === imageColumn) break
          imageX += col.width + config.layout.spacing
        }
        
        // Measure image area to anchor filename at bottom-left within image bounds
        const maxImageHeight = height - 10
        const maxImageWidth = imageColumn.width - 4
        const aspectRatio = config.boardData?.aspectRatio || 16 / 9
        let imageWidth = maxImageWidth
        let imageHeight = maxImageWidth / aspectRatio
        if (imageHeight > maxImageHeight) {
          imageHeight = maxImageHeight
          imageWidth = maxImageHeight * aspectRatio
        }
        const imageDrawX = imageX + 2 + ((imageColumn.width - 4) - imageWidth) / 2
        const imageDrawY = y + 2 + (maxImageHeight - imageHeight) / 2

        // Filename style: small white text with black stroke (outline) for readability
        doc.font('thin')
        doc.fontSize(7)

        const padding = 2
        const tx = imageDrawX + padding
        const ty = imageDrawY + imageHeight - 9 - padding // bottom-left inside image

        // Draw outlined text: stroke (black) then fill (white)
        doc.save()
        doc.fillColor('#ffffff')
        doc.strokeColor('#000000')
        doc.lineWidth(0.8)
        // PDFKit doesn't support stroking text directly; simulate outline by drawing text multiple times
        const offsets = [
          [-0.3, 0], [0.3, 0], [0, -0.3], [0, 0.3], // four directions
          [-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]
        ]
        offsets.forEach(([ox, oy]) => {
          doc.fillColor('#000000')
          doc.text(filename, tx + ox, ty + oy, { width: imageWidth - 4, height: 10, align: 'left' })
        })
        // Foreground white text
        doc.fillColor('#ffffff')
        doc.text(filename, tx, ty, { width: imageWidth - 4, height: 10, align: 'left' })
        doc.restore()
      }
    }
  }

  getBoardFilename(board, boardIndex) {
    // Try to get original filename if available
    if (board.originalFilename) {
      return board.originalFilename
    }
    
    // Fall back to generated filename
    if (board.url) {
      return path.basename(board.url, path.extname(board.url))
    }
    
    // Final fallback
    return `board-${(boardIndex + 1).toString().padStart(3, '0')}`
  }

  addWatermark(doc, config) {
    if (!config.includeWatermark) return
    
    const { watermarkText, watermarkOpacity } = config
    const text = watermarkText || 'DRAFT'
    
    // Save current state
    doc.save()
    
    // Set watermark properties
    doc.fontSize(72)
    doc.font('bold')
    doc.fillColor('#cccccc')
    doc.opacity(watermarkOpacity / 100)
    
    // Calculate center position
    const centerX = doc.page.width / 2
    const centerY = doc.page.height / 2
    
    // Rotate and draw watermark
    doc.rotate(45, { origin: [centerX, centerY] })
    doc.text(text, centerX - 100, centerY - 36, {
      width: 200,
      align: 'center'
    })
    
    // Restore state
    doc.restore()
  }

  stringContainsForeign(testString) {
    if (!testString) return false
    
    const regexForeign = /[^AÁĂÂÄÀĀĄÅÃÆBCĆČÇĊDÐĎĐEÉĚÊËĖÈĒĘFGĞĢĠHĦIÍÎÏİÌĪĮJKĶLĹĽĻŁMNŃŇŅŊÑOÓÔÖÒŐŌØÕŒPÞQRŔŘŖSŚŠŞȘTŦŤŢȚUÚÛÜÙŰŪŲŮVWẂŴẄẀXYÝŶŸỲZŹŽŻaáăâäàāąåãæbcćčçċdðďđeéěêëėèēęfgğģġhħiıíîïìīįjkķlĺľļłmnńňņŋñoóôöòőōøõœpþqrŕřŗsśšşșßtŧťţțuúûüùűūųůvwẃŵẅẁxyýŷÿỳzźžż0123456789.,\/#!$%\^&\*;:{}=\-_`~()\s\?¿—–-€₪¢₡¤$ƒ₣₤₧₨£¥⋅+−×÷=≠><≥≤±≈~¬∞∫Ω∆∏∑√µ∂%‰⊳⊲↑→↓←●◊■▲▼★☐♦✓@&¶§©®℗™°|¦†ℓ‡№℮^⌘\'\"„""'‛'´˘ˇ¸ˆ¨˙`˝¯˛˚˜]/
    return regexForeign.test(testString)
  }

  // Method to embed video groups in PDF
  async embedVideoGroups(doc, config, boardData, projectFileAbsolutePath) {
    if (!config.includeVideos || !config.videoGroups || config.videoGroups.length === 0) {
      return
    }
    
    // Add a separate page for video groups
    doc.addPage()
    
    doc.font('bold')
    doc.fontSize(18)
    doc.text('Video Sequences', 50, 50)
    
    let currentY = 80
    
    for (const groupId of config.videoGroups) {
      const group = config.videoGroupManager?.getGroup(groupId)
      if (!group) continue
      
      // Draw group information
      doc.font('bold')
      doc.fontSize(14)
      doc.text(group.name, 50, currentY)
      
      doc.font('regular')
      doc.fontSize(10)
      doc.text(`Boards: ${group.boardIds.join(', ')}`, 50, currentY + 20)
      doc.text(`FPS: ${group.fps} | Duration: ${group.duration}s`, 50, currentY + 35)
      
      // Add video file reference
      if (group.videoPath) {
        doc.text(`Video file: ${group.videoPath}`, 50, currentY + 50)
      }
      
      // Note: Actual video embedding would require additional libraries
      // For now, we'll just indicate where the GIF would be
      doc.strokeColor('#cccccc')
      doc.rect(50, currentY + 40, 200, 150)
      doc.stroke()
      
      doc.font('thin')
      doc.fontSize(8)
      doc.text('Animated GIF would be embedded here', 50, currentY + 110, {
        width: 200,
        align: 'center'
      })
      
      currentY += 220
    }
  }

  calculateTotalLayoutWidth(layout) {
    let totalWidth = 0
    layout.columns.forEach((column, index) => {
      totalWidth += column.width
      if (index < layout.columns.length - 1) {
        totalWidth += layout.spacing
      }
    })
    return totalWidth
  }

  scaleLayout(layout, scaleFactor) {
    const scaledLayout = { ...layout }
    scaledLayout.columns = layout.columns.map(column => ({
      ...column,
      width: Math.floor(column.width * scaleFactor)
    }))
    scaledLayout.spacing = Math.floor(layout.spacing * scaleFactor)
    return scaledLayout
  }

  // Draw dotted lines for column and row boundaries
  drawDottedLines(doc, config, x, y, width, height) {
    // Save current graphics state
    doc.save()
    
    // Set dotted line style
    doc.lineWidth(0.5)
    doc.strokeColor('#cccccc')
    doc.dash(2, { space: 2 })
    
    // Use stored header positioning for perfect alignment
    if (config.headerPositioning) {
      const { contentX, scaledContentWidth, processedColumns, scaleFactor } = config.headerPositioning
      
      // Draw vertical lines between columns (aligned with headers)
      let currentX = contentX
      for (let i = 0; i < processedColumns.length; i++) {
        const columnWidth = processedColumns[i].width * scaleFactor
        
        // Draw separator line at the start of each column (except the first one)
        if (i > 0) {
          doc.moveTo(currentX, y)
          doc.lineTo(currentX, y + height)
        }
        
        currentX += columnWidth + (config.layout.spacing * scaleFactor)
      }
      
      // Draw horizontal line at bottom of row
      doc.moveTo(contentX, y + height)
      doc.lineTo(contentX + scaledContentWidth, y + height)
    } else {
      // Fallback to original logic if no header positioning available
      const { layout } = config
      
      // Use the EXACT same column processing logic as drawColumnHeaders for perfect alignment
      const processedColumns = layout.columns.map(column => {
        if (column.type === 'custom-layers') {
          // Skip custom layers entirely if not enabled
          if (!config.includeCustomLayers) {
            return null // Will be filtered out
          }
          // For headers, use a more reasonable fixed width for the custom layers column
          // This prevents overlap while still being visible
          return { ...column, width: 120 }
        }
        return column
      }).filter(column => column !== null) // Remove null columns

      // Calculate total content width including spacing
      const totalContentWidth = processedColumns.reduce((sum, col) => sum + col.width, 0) +
                                (processedColumns.length - 1) * layout.spacing

      // Ensure content never exceeds available width (same logic as drawColumnHeaders)
      let scaleFactor = 1
      if (totalContentWidth > width) {
        scaleFactor = width / totalContentWidth
      }

      // Center content if it's smaller than available width (EXACT same logic as drawColumnHeaders)
      const scaledContentWidth = totalContentWidth * scaleFactor
      const contentX = scaledContentWidth <= width ? x + (width - scaledContentWidth) / 2 : x
      
      // Draw vertical lines between columns (aligned with headers)
      let currentX = contentX
      for (let i = 0; i < processedColumns.length; i++) {
        const columnWidth = processedColumns[i].width * scaleFactor
        
        // Draw separator line at the start of each column (except the first one)
        if (i > 0) {
          doc.moveTo(currentX, y)
          doc.lineTo(currentX, y + height)
        }
        
        currentX += columnWidth + (layout.spacing * scaleFactor)
      }
      
      // Draw horizontal line at bottom of row
      doc.moveTo(contentX, y + height)
      doc.lineTo(contentX + scaledContentWidth, y + height)
    }
    
    // Draw the lines
    doc.stroke()
    
    // Restore graphics state
    doc.restore()
  }

  // Draw note lines where text appears for easier writing
  drawNoteLines(doc, config, x, y, width, height) {
    const { layout } = config
    
    // Save current graphics state
    doc.save()
    
    // Set note line style (lighter than dotted lines)
    doc.lineWidth(0.3)
    doc.strokeColor('#e0e0e0')
    
    // Use the same column processing logic as drawBoardRow for alignment
    const processedColumns = layout.columns.map(column => {
      if (column.type === 'custom-layers') {
        // Skip custom layers entirely if not enabled
        if (!config.includeCustomLayers) {
          return null // Will be filtered out
        }
        return { ...column, width: 120 }
      }
      return column
    }).filter(column => column !== null) // Remove null columns

    // Calculate total content width including spacing
    const totalContentWidth = processedColumns.reduce((sum, col) => sum + col.width, 0) +
                              (processedColumns.length - 1) * layout.spacing

    // Ensure content never exceeds available width (same logic as drawBoardRow)
    let scaleFactor = 1
    if (totalContentWidth > width) {
      scaleFactor = width / totalContentWidth
    }

    // Center content if it's smaller than available width
    const scaledContentWidth = totalContentWidth * scaleFactor
    const contentX = scaledContentWidth <= width ? x + (width - scaledContentWidth) / 2 : x
    
    // Find text columns (notes, dialogue, action, talks, mm, filename) - exclude time
    const textColumns = processedColumns.filter(col => 
      ['notes', 'dialogue', 'action', 'talks', 'mm', 'filename'].includes(col.type)
    )
    
    let currentX = contentX
    for (const column of processedColumns) {
      if (textColumns.includes(column)) {
        const columnWidth = (column.width * scaleFactor) - 4 // Leave some margin
        
        // Calculate image position for text alignment (same logic as drawColumn)
        let imageTopY = null
        const imageColumn = layout.columns.find(col => col.type === 'image')
        if (imageColumn) {
          const imageColumnIndex = layout.columns.findIndex(col => col.type === 'image')
          let imgX = contentX
          for (let i = 0; i < imageColumnIndex; i++) {
            imgX += processedColumns[i].width + layout.spacing
          }

          // Calculate image position (same as in drawBoardImage)
          const maxImageHeight = height - 10
          const maxImageWidth = imageColumn.width - 4
          const aspectRatio = config.boardData?.aspectRatio || 16 / 9

          let imageWidth = maxImageWidth
          let imageHeight = imageWidth / aspectRatio

          if (imageHeight > maxImageHeight) {
            imageHeight = maxImageHeight
            imageWidth = imageHeight * aspectRatio
          }

          // Center image horizontally in its column
          const imageX = imgX + (imageColumn.width - imageWidth) / 2
          imageTopY = y + (height - imageHeight) / 2
        }
        
        // Calculate text position (same logic as drawTextColumn)
        let textY
        if (imageTopY !== null) {
          // Align text with image top edge
          textY = imageTopY
        } else {
          // Use standard column position
          textY = y + 5
        }
        
        // Calculate line spacing using PDFKit's actual text measurement
        const textWidth = columnWidth - 10 // Account for padding
        const textAreaHeight = height - 10
        
        // Use the same font settings as drawTextColumn
        const fontSize = 9 // Same as drawTextColumn
        const font = 'regular' // Default font for most text columns
        
        // Set font to measure line height accurately
        doc.font(font)
        doc.fontSize(fontSize)
        
        // Calculate actual line spacing by measuring a multi-line text sample
        // This gives us the exact spacing PDFKit uses internally
        const sampleText = 'Sample text\nSecond line\nThird line'
        const totalHeight = doc.heightOfString(sampleText, { width: textWidth })
        const actualLineSpacing = totalHeight / 3 // Divide by number of lines to get line spacing
        
        // Draw lines that correspond to text baseline positions
        // Add a small offset to account for text baseline positioning
        const baselineOffset = 0.6333333333333333333333 // Small adjustment to align with actual text baseline
        const startY = textY + actualLineSpacing + baselineOffset // Skip the first line and adjust baseline
        const endY = textY + textAreaHeight
        
        // Draw horizontal lines where text would be written
        // Use the actual measured line spacing from PDFKit
        for (let lineY = startY; lineY < endY; lineY += actualLineSpacing) {
          doc.moveTo(currentX + 2, lineY)
          doc.lineTo(currentX + columnWidth, lineY)
        }
      }
      currentX += (column.width * scaleFactor) + (layout.spacing * scaleFactor)
    }
    
    // Draw the lines
    doc.stroke()
    
    // Restore graphics state
    doc.restore()
  }
}

// Export function that matches the existing API
const generateEnhancedPDF = async (config, boardData, projectFileAbsolutePath, outputPath) => {
  const exporter = new EnhancedPDFExporter()
  return await exporter.generateEnhancedPDF(config, boardData, projectFileAbsolutePath, outputPath)
}

module.exports = {
  EnhancedPDFExporter,
  generateEnhancedPDF
}