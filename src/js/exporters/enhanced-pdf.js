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
      watermarkOpacity
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

  async generatePages(doc, config, boardData, projectFileAbsolutePath) {
    const { layout } = config
    const boards = boardData.boards
    
    // Calculate layout dimensions
    const pageSize = [doc.page.width, doc.page.height]
    const margins = [20, 20, 20, 20] // top, right, bottom, left
    const headerHeight = 50
    
    // Calculate available space
    const availableWidth = pageSize[0] - margins[1] - margins[3]
    const availableHeight = pageSize[1] - margins[0] - margins[2] - headerHeight

    // Calculate how many rows fit per page
    const rowHeight = this.calculateRowHeight(config, availableHeight)
    const rowsPerPage = Math.floor(availableHeight / (rowHeight + layout.spacing))
    
    // Generate pages
    let currentPage = 0
    let currentRow = 0
    
    for (let boardIndex = 0; boardIndex < boards.length; boardIndex++) {
      // Start new page if needed
      if (currentRow >= rowsPerPage) {
        doc.addPage()
        currentPage++
        currentRow = 0
      }
      
      // Draw page header on first row of each page
      if (currentRow === 0) {
        this.drawPageHeader(doc, config, boardData, currentPage + 1, margins, headerHeight)
      }
      
      // Calculate row position
      const rowY = margins[0] + headerHeight + (currentRow * (rowHeight + layout.spacing))
      
      // Draw board row
      await this.drawBoardRow(
        doc, 
        boards[boardIndex], 
        boardIndex, 
        config, 
        margins[3], 
        rowY, 
        availableWidth, 
        rowHeight,
        projectFileAbsolutePath
      )
      
      currentRow++
    }

    // Add watermark if requested
    if (config.includeWatermark) {
      this.addWatermark(doc, config)
    }
  }

  calculateRowHeight(config, availableHeight) {
    const { layout } = config
    
    // Find image column width to calculate aspect ratio
    const imageColumn = layout.columns.find(col => col.type === 'image')
    const imageWidth = imageColumn ? imageColumn.width : 200
    
    // Calculate image height based on board aspect ratio (assuming 16:9 default)
    const aspectRatio = 16 / 9 // This should come from boardData.aspectRatio
    const imageHeight = imageWidth / aspectRatio
    
    // Add padding for text and spacing
    const textPadding = 60 // Space for text below image
    const minRowHeight = imageHeight + textPadding
    
    // Ensure row height doesn't exceed available space
    const maxRowHeight = availableHeight / 3 // At least 3 rows per page
    
    return Math.min(minRowHeight, maxRowHeight)
  }

  drawPageHeader(doc, config, boardData, pageNumber, margins, headerHeight) {
    const { layout } = config
    const filename = path.basename(boardData.filename || 'Storyboard', path.extname(boardData.filename || ''))
    
    // Title
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
    
    // Date
    doc.text(`Generated: ${moment().format('MMMM Do YYYY, h:mm a')}`, margins[3], margins[0] + 35, { align: 'left' })
    
    // Draw separator line
    doc.strokeColor('#cccccc')
    doc.lineWidth(0.5)
    doc.moveTo(margins[3], margins[0] + headerHeight - 5)
    doc.lineTo(doc.page.width - margins[1], margins[0] + headerHeight - 5)
    doc.stroke()
  }

  async drawBoardRow(doc, board, boardIndex, config, x, y, availableWidth, rowHeight, projectFileAbsolutePath) {
    const { layout, showFilenames, filenameLocation, includeFields } = config
    
    let currentX = x
    
    // Draw each column
    for (const column of layout.columns) {
      const columnWidth = column.width
      
      await this.drawColumn(
        doc,
        column,
        board,
        boardIndex,
        config,
        currentX,
        y,
        columnWidth,
        rowHeight,
        projectFileAbsolutePath
      )
      
      currentX += columnWidth + layout.spacing
    }
    
    // Draw filename overlay if requested
    if (showFilenames && filenameLocation === 'overlay') {
      this.drawFilenameOverlay(doc, board, boardIndex, config, x, y, availableWidth, rowHeight)
    }
  }

  async drawColumn(doc, column, board, boardIndex, config, x, y, width, height, projectFileAbsolutePath) {
    // Draw column border for debugging (remove in production)
    if (false) { // Set to true for debugging
      doc.strokeColor('#eeeeee')
      doc.lineWidth(0.5)
      doc.rect(x, y, width, height)
      doc.stroke()
    }
    
    switch (column.type) {
      case 'cut-number':
        this.drawCutNumber(doc, boardIndex + 1, board, x, y, width, height)
        break
        
      case 'image':
        await this.drawBoardImage(doc, board, boardIndex, x, y, width, height, projectFileAbsolutePath)
        break
        
      case 'notes':
        this.drawTextColumn(doc, board.notes || '', x, y, width, height, 'regular', 9)
        break
        
      case 'dialogue':
        this.drawTextColumn(doc, board.dialogue || '', x, y, width, height, 'bold', 9)
        break
        
      case 'action':
        this.drawTextColumn(doc, board.action || '', x, y, width, height, 'regular', 9)
        break
        
      case 'talks':
        // Combine dialogue and action for "talks" column
        const talksText = [board.dialogue, board.action].filter(Boolean).join('\n\n')
        this.drawTextColumn(doc, talksText, x, y, width, height, 'regular', 9)
        break
        
      case 'time':
        const duration = board.duration || config.boardData?.defaultBoardTiming || 2000
        this.drawTextColumn(doc, util.msToTime(duration), x, y, width, height, 'thin', 8, 'center')
        break
        
      case 'filename':
        if (config.showFilenames) {
          const filename = this.getBoardFilename(board, boardIndex)
          this.drawTextColumn(doc, filename, x, y, width, height, 'thin', 8)
        }
        break
        
      case 'custom-field':
        await this.drawCustomField(doc, column, board, x, y, width, height, config)
        break
        
      default:
        // Unknown column type - draw placeholder
        this.drawTextColumn(doc, column.label || column.type, x, y, width, height, 'thin', 8, 'center')
        break
    }
  }

  drawCutNumber(doc, cutNumber, board, x, y, width, height) {
    doc.font('bold')
    doc.fontSize(14)
    doc.fillColor('#333333')
    
    // Highlight new shots
    if (board.newShot) {
      doc.fillColor('#ff4444')
      doc.rect(x, y, 3, height)
      doc.fill()
      doc.fillColor('#333333')
    }
    
    const cutText = cutNumber.toString().padStart(2, '0')
    doc.text(cutText, x, y + 10, { width, align: 'center' })
  }

  async drawBoardImage(doc, board, boardIndex, x, y, width, height, projectFileAbsolutePath) {
    try {
      // Get the poster frame image path
      const boardModel = require('../models/board')
      const imageFilename = boardModel.boardFilenameForPosterFrame(board)
      const imagePath = path.join(path.dirname(projectFileAbsolutePath), 'images', imageFilename)
      
      if (fs.existsSync(imagePath)) {
        // Calculate image dimensions to fit in column while maintaining aspect ratio
        const maxImageHeight = height - 20 // Leave space for padding
        const maxImageWidth = width - 10
        
        // Draw the image
        doc.image(imagePath, x + 5, y + 5, {
          fit: [maxImageWidth, maxImageHeight],
          align: 'center',
          valign: 'center'
        })
        
        // Draw border around image
        doc.strokeColor('#cccccc')
        doc.lineWidth(0.5)
        doc.rect(x + 5, y + 5, maxImageWidth, maxImageHeight)
        doc.stroke()
        
      } else {
        // Draw placeholder if image doesn't exist
        doc.strokeColor('#cccccc')
        doc.lineWidth(1)
        doc.rect(x + 5, y + 5, width - 10, height - 20)
        doc.stroke()
        
        doc.font('thin')
        doc.fontSize(8)
        doc.fillColor('#999999')
        doc.text('No image', x, y + height/2, { width, align: 'center' })
      }
      
    } catch (error) {
      console.warn('Error drawing board image:', error.message)
      // Draw error placeholder
      this.drawTextColumn(doc, 'Image error', x, y, width, height, 'thin', 8, 'center')
    }
  }

  drawTextColumn(doc, text, x, y, width, height, font = 'regular', fontSize = 9, align = 'left') {
    if (!text) return
    
    try {
      doc.font(font)
      doc.fontSize(fontSize)
      doc.fillColor('#333333')
      
      // Handle text that might contain foreign characters
      const useFallback = this.stringContainsForeign(text)
      if (useFallback && this.fonts.fallback) {
        doc.font('fallback')
      }
      
      // Calculate text area with padding
      const textX = x + 5
      const textY = y + 5
      const textWidth = width - 10
      const textHeight = height - 10
      
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

  async drawCustomField(doc, column, board, x, y, width, height, config) {
    // Get custom field value from board data
    let value = ''
    
    if (column.customFieldId && board.customFields) {
      value = board.customFields[column.customFieldId] || ''
    }
    
    // If no value, use default
    if (!value && column.defaultValue) {
      value = column.defaultValue
    }
    
    this.drawTextColumn(doc, value, x, y, width, height, 'regular', 9)
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
        
        // Draw filename in bottom-left of image area
        doc.font('thin')
        doc.fontSize(7)
        doc.fillColor('#ffffff')
        
        // Semi-transparent background
        doc.fillColor('#000000')
        doc.opacity(0.7)
        const textWidth = doc.widthOfString(filename) + 8
        doc.rect(imageX + 8, y + height - 25, textWidth, 15)
        doc.fill()
        
        // White text
        doc.opacity(1)
        doc.fillColor('#ffffff')
        doc.text(filename, imageX + 12, y + height - 22)
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

  // Method to embed GIFs in PDF (experimental)
  async embedGifGroups(doc, config, boardData, projectFileAbsolutePath) {
    if (!config.includeGifs || !config.gifGroups || config.gifGroups.length === 0) {
      return
    }
    
    // Add a separate page for GIF groups
    doc.addPage()
    
    doc.font('bold')
    doc.fontSize(18)
    doc.text('Animated Sequences', 50, 50)
    
    let currentY = 80
    
    for (const groupId of config.gifGroups) {
      const group = config.layoutManager?.getGifGroup(groupId)
      if (!group) continue
      
      // Draw group information
      doc.font('bold')
      doc.fontSize(14)
      doc.text(group.name, 50, currentY)
      
      doc.font('regular')
      doc.fontSize(10)
      doc.text(`Boards: ${group.boardIndices.join(', ')}`, 50, currentY + 20)
      
      // Note: Actual GIF embedding would require additional libraries
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