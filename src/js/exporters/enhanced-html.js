// Enhanced HTML Exporter
// Supports custom layouts, embedded GIFs, custom fields, and advanced formatting

const fs = require('fs')
const path = require('path')
const util = require('../utils/index')
const moment = require('moment')

class EnhancedHTMLExporter {
  constructor() {
    this.template = null
    this.loadTemplate()
  }

  loadTemplate() {
    // Load the HTML template
    console.log('[EnhancedHTML] Loading template...')
    this.template = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{PROJECT_TITLE}} - Storyboard Export</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: #f8f9fa;
            color: #333;
            line-height: 1.5;
            margin: 0;
            padding: 20px;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        
        .header {
            text-align: left;
            margin-bottom: 0;
            padding: 30px 30px 20px 30px;
            border-bottom: 2px solid #333;
            background: white;
        }
        
        .header h1 {
            font-size: 26px;
            font-weight: 600;
            margin-bottom: 10px;
            color: #333;
            letter-spacing: -0.5px;
        }
        
        .header .subtitle {
            font-size: 15px;
            color: #666;
            margin-bottom: 15px;
            font-weight: 400;
        }
        
        .project-info {
            display: flex;
            gap: 20px;
            font-size: 12px;
            color: #666;
        }
        
        .storyboard-grid {
            display: grid;
            gap: 0;
            margin-bottom: 0;
        }
        
        .board-row {
            background: white;
            border-bottom: 1px solid #e9ecef;
            padding: 25px 30px;
            transition: box-shadow 0.2s ease, background-color 0.2s ease;
        }
        
        .board-row:hover {
            background: #f8f9fa;
            box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }
        
        .board-row:last-child {
            border-bottom: none;
        }
        
        .board-content {
            display: grid;
            grid-template-columns: 1fr 2fr 1fr;
            gap: 25px;
            align-items: start;
        }
        
        .left-column {
            display: flex;
            flex-direction: column;
        }
        
        .center-column {
            display: flex;
            flex-direction: column;
        }
        
        .right-column {
            display: flex;
            flex-direction: column;
        }
        
        .column {
            display: flex;
            flex-direction: column;
        }
        
        .column-header {
            font-weight: bold;
            font-size: 11px;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 8px;
            padding-bottom: 5px;
            border-bottom: 2px solid #e9ecef;
        }
        
        .shot-number {
            font-size: 13px;
            font-weight: 600;
            color: white;
            text-align: center;
            padding: 10px 12px;
            background: #9ca3af;
            border: 1px solid #9ca3af;
            border-radius: 4px;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        
        .shot-number.grouped {
            background: #ef4444;
            color: white;
            border-color: #ef4444;
        }
        
        .board-image {
            width: 100%;
            height: auto;
            border: 1px solid #ccc;
            cursor: pointer;
            transition: transform 0.2s ease;
        }
        
        .board-image:hover {
            transform: scale(1.01);
        }
        
        .board-image.clickable {
            border: 2px solid #0066cc;
            position: relative;
        }
        
        .board-image.clickable::after {
            content: 'GIF';
            position: absolute;
            top: 5px;
            right: 5px;
            background: #0066cc;
            color: white;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 10px;
            font-weight: bold;
        }
        
        /* Image Zoom Modal */
        .image-modal {
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.9);
            cursor: pointer;
        }
        
        .image-modal-content {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            max-width: 95%;
            max-height: 95%;
            width: 95%;
            height: 95%;
            display: flex;
            align-items: center;
            justify-content: center;
            user-select: none;
        }
        
        .image-modal img {
            max-width: 100%;
            max-height: 100%;
            width: auto;
            height: auto;
            border: 2px solid white;
            border-radius: 8px;
            object-fit: contain;
            cursor: grab;
            user-select: none;
        }
        
        .image-modal img:active {
            cursor: grabbing;
        }
        
        .image-modal-close {
            position: absolute;
            top: 20px;
            right: 35px;
            color: white;
            font-size: 40px;
            font-weight: bold;
            cursor: pointer;
        }
        
        .image-modal-close:hover {
            color: #ccc;
        }
        
        .image-modal-controls {
            position: absolute;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            gap: 10px;
        }
        
        .zoom-btn {
            background: rgba(255,255,255,0.8);
            border: none;
            padding: 10px 15px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
        }
        
        .zoom-btn:hover {
            background: white;
        }
        
        .text-content {
            font-size: 11px;
            line-height: 1.5;
        }
        
        .text-content h3 {
            font-size: 11px;
            font-weight: 600;
            color: #333;
            margin-bottom: 5px;
            letter-spacing: 0.3px;
        }
        
        .text-content p {
            color: #333;
            margin-bottom: 8px;
        }
        
        .timing {
            text-align: center;
            font-size: 11px;
            color: #333;
            font-weight: bold;
        }
        
        .lens-info {
            text-align: center;
            font-size: 11px;
            color: #333;
            font-weight: bold;
        }
        
        .editable-field {
            cursor: pointer;
            padding: 4px 6px;
            border: 1px solid transparent;
            border-radius: 4px;
            transition: all 0.2s ease;
            min-height: 20px;
            position: relative;
        }
        
        .editable-field:hover {
            background-color: #f0f8ff;
            border-color: #0066cc;
        }
        
        .editable-field.editing {
            background-color: #fff;
            border-color: #0066cc;
            box-shadow: 0 0 0 2px rgba(0, 102, 204, 0.2);
            outline: none;
        }
        
        .editable-field:empty::before {
            content: 'Click to edit...';
            color: #999;
            font-style: italic;
            font-size: 0.9em;
        }
        
        .editable-field::after {
            content: '✏️';
            position: absolute;
            right: 4px;
            top: 50%;
            transform: translateY(-50%);
            opacity: 0;
            font-size: 12px;
            transition: opacity 0.2s ease;
        }
        
        .editable-field:hover::after {
            opacity: 0.5;
        }
        
        .editable-field.editing::after {
            display: none;
        }
        
        .filename {
            font-size: 10px;
            color: #666;
            font-style: italic;
        }
        
        .custom-field {
            margin-bottom: 5px;
        }
        
        .custom-field-label {
            font-weight: bold;
            color: #333;
            font-size: 10px;
        }
        
        .custom-field-value {
            color: #333;
            font-size: 11px;
        }
        
        .gif-indicator {
            display: inline-block;
            background: #0066cc;
            color: white;
            padding: 1px 4px;
            border-radius: 2px;
            font-size: 9px;
            font-weight: bold;
            margin-left: 3px;
        }
        
        .watermark {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-45deg);
            font-size: 4em;
            color: rgba(0,0,0,0.1);
            font-weight: 700;
            pointer-events: none;
            z-index: -1;
        }
        
        .footer {
            text-align: center;
            margin-top: 0;
            padding: 25px 30px;
            color: #666;
            font-size: 0.9em;
            border-top: 1px solid #e9ecef;
            background: #f8f9fa;
        }
        
        @media print {
            body {
                background: white;
                padding: 0;
                margin: 0;
            }
            
            .container {
                max-width: none;
                padding: 0;
            }
            
            .board-row {
                break-inside: avoid;
                margin-bottom: 15px;
                border: 1px solid #000;
                padding: 10px;
            }
            
            .board-row:hover {
                transform: none;
                box-shadow: none;
            }
            
            .board-image:hover {
                transform: none;
            }
        }
        
        @media (max-width: 768px) {
            .board-content {
                grid-template-columns: 1fr;
                gap: 15px;
            }
            
            .project-info {
                flex-direction: column;
                gap: 10px;
            }
        }
    </style>
</head>
<body>
    {{WATERMARK}}
    
    <div class="container">
        <div class="header">
            <h1>{{PROJECT_TITLE}}</h1>
            <div class="subtitle">Storyboard Export</div>
            <div class="project-info">
                <span>Boards: {{TOTAL_BOARDS}}</span>
                <span>Duration: {{TOTAL_DURATION}}</span>
                <span>Generated: {{GENERATION_DATE}}</span>
            </div>
        </div>
        
        <div class="storyboard-grid">
            {{BOARD_ROWS}}
        </div>
        
        <div class="footer">
            <p>© {{AUTHOR_NAME}} - Generated by Storyboarder</p>
        </div>
    </div>
    
    <!-- Image Zoom Modal -->
    <div id="imageModal" class="image-modal">
        <span class="image-modal-close">&times;</span>
        <div class="image-modal-content">
            <img id="modalImage" src="" alt="">
        </div>
        <div class="image-modal-controls">
            <button class="zoom-btn" onclick="zoomIn()">Zoom In</button>
            <button class="zoom-btn" onclick="zoomOut()">Zoom Out</button>
            <button class="zoom-btn" onclick="resetZoom()">Reset</button>
        </div>
    </div>
    
    <script>
        // HTML export functionality with editable fields
        document.addEventListener('DOMContentLoaded', function() {
            console.log('HTML Export loaded successfully');
            
            // Make editable fields functional
            initializeEditableFields();
            
            // Initialize image modal functionality
            initializeImageModal();
        });
        
        function initializeEditableFields() {
            const editableFields = document.querySelectorAll('.editable-field');
            
            editableFields.forEach(field => {
                field.addEventListener('click', function() {
                    if (this.classList.contains('editing')) return;
                    
                    this.classList.add('editing');
                    const originalContent = this.textContent;
                    
                    // Create input element
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.value = originalContent;
                    input.style.cssText = 'width: 100%; border: none; background: transparent; font-size: inherit; font-family: inherit; color: inherit; text-align: inherit;';
                    
                    // Replace content with input
                    this.innerHTML = '';
                    this.appendChild(input);
                    input.focus();
                    input.select();
                    
                    // Handle save on blur or enter
                    const saveChanges = () => {
                        const newValue = input.value.trim();
                        this.textContent = newValue || originalContent;
                        this.classList.remove('editing');
                        
                        // Store the change (you could send this back to the main app if needed)
                        console.log('Field updated:', {
                            field: this.dataset.field,
                            board: this.dataset.board,
                            value: newValue
                        });
                    };
                    
                    const cancelChanges = () => {
                        this.textContent = originalContent;
                        this.classList.remove('editing');
                    };
                    
                    input.addEventListener('blur', saveChanges);
                    input.addEventListener('keydown', function(e) {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            saveChanges();
                        } else if (e.key === 'Escape') {
                            e.preventDefault();
                            cancelChanges();
                        }
                    });
                });
            });
        }
        
        function initializeImageModal() {
            const modal = document.getElementById('imageModal');
            const modalImg = document.getElementById('modalImage');
            const closeBtn = document.querySelector('.image-modal-close');
            let currentZoom = 1;
            
            // Open modal when clicking on images
            document.addEventListener('click', function(e) {
                if (e.target.classList.contains('board-image') && e.target.tagName === 'IMG') {
                    modal.style.display = 'block';
                    modalImg.src = e.target.src;
                    modalImg.alt = e.target.alt;
                    currentZoom = 1;
                    updateImageZoom();
                }
            });
            
            // Close modal
            closeBtn.addEventListener('click', function() {
                modal.style.display = 'none';
            });
            
            modal.addEventListener('click', function(e) {
                if (e.target === modal) {
                    modal.style.display = 'none';
                }
            });
            
            // Zoom functions
            window.zoomIn = function() {
                currentZoom = Math.min(currentZoom * 1.2, 5);
                updateImageZoom();
            };
            
            window.zoomOut = function() {
                currentZoom = Math.max(currentZoom / 1.2, 0.1);
                updateImageZoom();
            };
            
            window.resetZoom = function() {
                currentZoom = 1;
                updateImageZoom();
            };
            
            function updateImageZoom() {
                modalImg.style.transform = 'scale(' + currentZoom + ')';
            }
        }
    </script>
</body>
</html>`
    
    console.log('[EnhancedHTML] Template loaded, length:', this.template.length)
    console.log('[EnhancedHTML] Template contains {{PROJECT_TITLE}}:', this.template.includes('{{PROJECT_TITLE}}'))
  }

  async generateEnhancedHTML(config, boardData, projectFileAbsolutePath, outputPath) {
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
      layoutPreset,
      authorName
    } = config

    // Get groups and create lookup for grouped boards
    const groupedBoardIds = new Set()
    const boardToGroupMap = new Map()

    // Get groups from multiple sources
    let groupsToProcess = []
    
    // Try to get groups from VideoGroupManager first
    if (typeof window !== 'undefined' && window.exportIntegration && window.exportIntegration.gifGroupManager) {
      groupsToProcess = window.exportIntegration.gifGroupManager.videoGroupManager.getAllGroups()
      console.log('[EnhancedHTML] Using groups from VideoGroupManager:', groupsToProcess.length)
    }
    
    // Fallback: try to get groups from boardData
    if (groupsToProcess.length === 0 && boardData.videoGroups) {
      console.log('[EnhancedHTML] Using groups from boardData.videoGroups')
      if (boardData.videoGroups instanceof Map) {
        groupsToProcess = Array.from(boardData.videoGroups.values())
      } else if (Array.isArray(boardData.videoGroups)) {
        groupsToProcess = boardData.videoGroups
      } else if (typeof boardData.videoGroups === 'object') {
        groupsToProcess = Object.values(boardData.videoGroups)
      }
    }
    
    // Fallback: try to get groups from config
    if (groupsToProcess.length === 0 && config.videoGroups) {
      console.log('[EnhancedHTML] Using groups from config.videoGroups')
      if (config.videoGroups instanceof Map) {
        groupsToProcess = Array.from(config.videoGroups.values())
      } else if (Array.isArray(config.videoGroups)) {
        groupsToProcess = config.videoGroups
      } else if (typeof config.videoGroups === 'object') {
        groupsToProcess = Object.values(config.videoGroups)
      }
    }
    
    // Additional fallback: check if groups are passed in config.groupData
    if (groupsToProcess.length === 0 && config.groupData && Array.isArray(config.groupData)) {
      console.log('[EnhancedHTML] Using groups from config.groupData')
      groupsToProcess = config.groupData
    }
    
    // Debug: log what we found
    console.log('[EnhancedHTML] Groups to process:', groupsToProcess.length)
    if (groupsToProcess.length > 0) {
      console.log('[EnhancedHTML] First group sample:', groupsToProcess[0])
    }
    
    if (groupsToProcess.length > 0) {
      console.log('[EnhancedHTML] Processing groups:', groupsToProcess.length)
      groupsToProcess.forEach((group, index) => {
        console.log('[EnhancedHTML] Group ' + index + ':', {
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
    } else {
      console.log('[EnhancedHTML] No groups found for GIF embedding')
    }

    // Pass the group data to config for use in board rendering
    config.boardToGroupMap = boardToGroupMap
    config.groupedBoardIds = groupedBoardIds

    // Calculate grid columns based on layout
    const gridColumns = this.calculateGridColumns(layout)
    
    // Generate board rows
    const boardRows = await this.generateBoardRows(config, boardData, projectFileAbsolutePath)
    
    // Calculate total duration
    const totalDuration = this.calculateTotalDuration(boardData)
    
    // Get project title from multiple sources
    let projectTitle = boardData.title || boardData.name || boardData.projectTitle || boardData.projectName
    
    // If still no title, try to get it from the project file path
    if (!projectTitle && projectFileAbsolutePath) {
      projectTitle = path.basename(projectFileAbsolutePath, path.extname(projectFileAbsolutePath))
      console.log('[EnhancedHTML] Using project file path for title:', projectTitle)
    }
    
    // If still no title, try boardData.filename
    if (!projectTitle && boardData.filename) {
      projectTitle = path.basename(boardData.filename, path.extname(boardData.filename))
      console.log('[EnhancedHTML] Using boardData.filename for title:', projectTitle)
    }
    
    // Final fallback
    if (!projectTitle) {
      projectTitle = 'Storyboard Project'
      console.log('[EnhancedHTML] Using fallback title:', projectTitle)
    }
    
    console.log('[EnhancedHTML] Project title:', projectTitle)
    console.log('[EnhancedHTML] boardData.title:', boardData.title)
    console.log('[EnhancedHTML] boardData.name:', boardData.name)
    console.log('[EnhancedHTML] boardData.filename:', boardData.filename)
    console.log('[EnhancedHTML] projectFileAbsolutePath:', projectFileAbsolutePath)
    console.log('[EnhancedHTML] boardData keys:', Object.keys(boardData))
    console.log('[EnhancedHTML] Escaped project title:', this.escapeHtml(projectTitle))
    
    // Generate the HTML content
    const watermarkHtml = includeWatermark 
      ? '<div class="watermark" style="opacity: ' + (watermarkOpacity / 100) + '">' + (watermarkText || 'DRAFT') + '</div>'
      : ''
    
    // Debug: Check template before replacement
    console.log('[EnhancedHTML] Template contains {{PROJECT_TITLE}}:', this.template.includes('{{PROJECT_TITLE}}'))
    console.log('[EnhancedHTML] Template length:', this.template.length)
    console.log('[EnhancedHTML] Project title to replace with:', projectTitle)
    console.log('[EnhancedHTML] Escaped project title:', this.escapeHtml(projectTitle))
    
    // Try the replacement step by step
    let html = this.template
    console.log('[EnhancedHTML] Before PROJECT_TITLE replacement:', html.includes('{{PROJECT_TITLE}}'))
    
    // Try multiple replacement methods
    const originalHtml = html
    html = html.replace('{{PROJECT_TITLE}}', this.escapeHtml(projectTitle))
    console.log('[EnhancedHTML] After PROJECT_TITLE replacement:', html.includes('{{PROJECT_TITLE}}'))
    
    // If still not replaced, try global replacement
    if (html.includes('{{PROJECT_TITLE}}')) {
      console.log('[EnhancedHTML] Trying global replacement...')
      html = html.replace(/\{\{PROJECT_TITLE\}\}/g, this.escapeHtml(projectTitle))
      console.log('[EnhancedHTML] After global replacement:', html.includes('{{PROJECT_TITLE}}'))
    }
    
    // If still not replaced, try without escaping
    if (html.includes('{{PROJECT_TITLE}}')) {
      console.log('[EnhancedHTML] Trying without escaping...')
      html = html.replace('{{PROJECT_TITLE}}', projectTitle)
      console.log('[EnhancedHTML] After unescaped replacement:', html.includes('{{PROJECT_TITLE}}'))
    }
    
    html = html.replace('{{TOTAL_BOARDS}}', boardData.boards.length)
    html = html.replace('{{TOTAL_DURATION}}', util.msToTime(totalDuration))
    html = html.replace('{{GENERATION_DATE}}', moment().format('MMMM Do YYYY, h:mm a'))
    html = html.replace('{{AUTHOR_NAME}}', this.escapeHtml(authorName || 'Unknown Author'))
    html = html.replace('{{GRID_COLUMNS}}', gridColumns)
    html = html.replace('{{BOARD_ROWS}}', boardRows)
    html = html.replace('{{WATERMARK}}', watermarkHtml)
    
    // Debug: Check if replacement worked
    if (html.includes('{{PROJECT_TITLE}}')) {
      console.log('[EnhancedHTML] ERROR: {{PROJECT_TITLE}} not replaced!')
      console.log('[EnhancedHTML] Template contains PROJECT_TITLE:', html.includes('{{PROJECT_TITLE}}'))
    } else {
      console.log('[EnhancedHTML] SUCCESS: {{PROJECT_TITLE}} replaced successfully')
    }

    // Write the HTML file
    await fs.promises.writeFile(outputPath, html, 'utf8')
    
    console.log('[EnhancedHTML] Generated HTML export: ' + outputPath)
    return outputPath
  }

  calculateGridColumns(layout) {
    const columns = layout.columns.map(col => {
      const width = Math.round((col.width / layout.totalWidth) * 100)
      return width + '%'
    }).join(' ')
    
    return columns || '1fr 2fr 1fr 1fr'
  }

  async generateBoardRows(config, boardData, projectFileAbsolutePath) {
    const { layout, respectGroupsInPdf = true } = config
    const boards = boardData.boards
    const groupedBoardIds = config.groupedBoardIds || new Set()
    const boardToGroupMap = config.boardToGroupMap || new Map()

    let html = []
    const renderedBoards = []
    const skippedBoards = []

    for (let boardIndex = 0; boardIndex < boards.length; boardIndex++) {
      // If respecting groups and board is in a group, only render if it's the first one
      if (respectGroupsInPdf && groupedBoardIds.has(boardIndex)) {
        const group = boardToGroupMap.get(boardIndex)
        if (group && group.boardIds[0] !== boardIndex) {
          skippedBoards.push(boardIndex)
          console.log('[EnhancedHTML] Skipping board ' + boardIndex + ' (not first in group ' + group.name + ')')
          continue // Skip - not first in group
        }
      }
      
      renderedBoards.push(boardIndex)
      const board = boards[boardIndex]
      
      html.push(await this.generateBoardRow(board, boardIndex, config, projectFileAbsolutePath))
    }

    console.log('[EnhancedHTML] Rendered ' + renderedBoards.length + ' boards, skipped ' + skippedBoards.length + ' boards')
    return html.join('\n')
  }

  async generateBoardRow(board, boardIndex, config, projectFileAbsolutePath) {
    const { layout, showFilenames, filenameLocation, dialogueBelowImage = false } = config
    
    // Check if board is in a group
    const isInGroup = config.groupedBoardIds && config.groupedBoardIds.has(boardIndex)
    const group = isInGroup ? config.boardToGroupMap.get(boardIndex) : null
    
    let html = '<div class="board-row">\n'
    html += '  <div class="board-content">\n'
    
    // Left column: Shot number, timing, and lens info
    html += '    <div class="left-column">\n'
    html += '      <div class="column-header">Shot</div>\n'
    html += this.generateShotNumber(board, boardIndex, config, group)
    html += '      <div class="column-header">Timing</div>\n'
    const duration = board.duration || config.boardData?.defaultBoardTiming || 2000
    html += '      <div class="timing editable-field" data-field="timing" data-board="' + boardIndex + '">' + util.msToTime(duration) + '</div>\n'
    
    // Add lens info
    html += '      <div class="column-header">Lens</div>\n'
    const lensInfo = board.focalLength ? board.focalLength + 'mm' : (board.lens || '')
    html += '      <div class="lens-info editable-field" data-field="lens" data-board="' + boardIndex + '">' + this.escapeHtml(lensInfo) + '</div>\n'
    html += '    </div>\n'
    
    // Center column: Image and dialogue below if enabled
    html += '    <div class="center-column">\n'
    html += '      <div class="column-header">Image</div>\n'
    html += await this.generateBoardImage(board, boardIndex, config, projectFileAbsolutePath, group)
    
    // Add dialogue below image if enabled
    if (dialogueBelowImage) {
      const dialogueText = board.dialogue || board.action || ''
      if (dialogueText.trim()) {
        html += '      <div class="column-header">Dialogue</div>\n'
        html += this.generateTextContent('', dialogueText, 'dialogue', boardIndex)
      }
    }
    html += '    </div>\n'
    
    // Right column: Notes, action, and other fields
    html += '    <div class="right-column">\n'
    
    // Notes - always display
    html += '      <div class="column-header">Notes</div>\n'
    html += this.generateTextContent('', board.notes || '', 'notes', boardIndex)
    
    // Action (if not below image)
    if (!dialogueBelowImage && board.action) {
      html += '      <div class="column-header">Action</div>\n'
      html += this.generateTextContent('', board.action, 'action', boardIndex)
    }
    
    // Dialogue (if not below image)
    if (!dialogueBelowImage && board.dialogue) {
      html += '      <div class="column-header">Dialogue</div>\n'
      html += this.generateTextContent('', board.dialogue, 'dialogue', boardIndex)
    }
    
    // Filename if enabled
    if (showFilenames) {
      const filename = this.getBoardFilename(board, boardIndex)
      html += '      <div class="column-header">Filename</div>\n'
      html += '      <div class="filename">' + this.escapeHtml(filename) + '</div>\n'
    }
    
    html += '    </div>\n'
    html += '  </div>\n'
    html += '</div>\n'
    
    return html
  }

  async generateColumn(column, board, boardIndex, config, projectFileAbsolutePath, group) {
    let html = '    <div class="column">\n'
    html += '      <div class="column-header">' + this.escapeHtml(column.label) + '</div>\n'
    
    switch (column.type) {
      case 'shot-number':
        html += this.generateShotNumber(board, boardIndex, config, group)
        break
        
      case 'image':
        html += await this.generateBoardImage(board, boardIndex, config, projectFileAbsolutePath, group)
        break
        
      case 'notes':
        html += this.generateTextContent('Notes', board.notes || '')
        break
        
      case 'dialogue':
        html += this.generateTextContent('Dialogue', board.dialogue || '')
        break
        
      case 'action':
        html += this.generateTextContent('Action', board.action || '')
        break
        
      case 'talks':
        const talksText = [board.dialogue, board.action].filter(Boolean).join('\n\n')
        html += this.generateTextContent('Dialogue & Action', talksText)
        break
        
      case 'time':
        const duration = board.duration || config.boardData?.defaultBoardTiming || 2000
        html += '      <div class="timing">' + util.msToTime(duration) + '</div>\n'
        break
        
      case 'filename':
        if (config.showFilenames) {
          const filename = this.getBoardFilename(board, boardIndex)
          html += '      <div class="filename">' + this.escapeHtml(filename) + '</div>\n'
        }
        break
        
      case 'custom-field':
        html += this.generateCustomField(column, board)
        break
        
      default:
        html += '      <div class="text-content">' + this.escapeHtml(column.label || column.type) + '</div>\n'
        break
    }
    
    html += '    </div>\n'
    return html
  }

  generateShotNumber(board, boardIndex, config, group) {
    let shotText = board.shot || (boardIndex + 1).toString().padStart(2, '0')
    let isGrouped = false
    
    if (group) {
      // Get shot names for all boards in the group
      const groupShotNames = group.boardIds.map(boardId => {
        const board = config.allBoards[boardId]
        return board ? (board.shot || (boardId + 1).toString().padStart(2, '0')) : (boardId + 1).toString().padStart(2, '0')
      })
      
      const firstShot = groupShotNames[0]
      const lastShot = groupShotNames[groupShotNames.length - 1]
      
      if (firstShot !== lastShot) {
        shotText = firstShot + ' - ' + lastShot
      } else {
        shotText = firstShot
      }
      
      isGrouped = true
    }
    
    const className = isGrouped ? 'shot-number grouped' : 'shot-number'
    return '      <div class="' + className + '">' + this.escapeHtml(shotText) + '</div>\n'
  }

  async generateBoardImage(board, boardIndex, config, projectFileAbsolutePath, group) {
    try {
      // Get the poster frame image path
      const boardModel = require('../models/board')
      const imageFilename = boardModel.boardFilenameForPosterFrame(board)
      const imagePath = path.join(path.dirname(projectFileAbsolutePath), 'images', imageFilename)
      
      let html = ''
      
      if (fs.existsSync(imagePath)) {
        // Convert to relative path for web
        const relativeImagePath = path.relative(path.dirname(config.outputPath || ''), imagePath).replace(/\\/g, '/')
        
        let imageClass = 'board-image'
        let clickableAttributes = ''
        
        // Check if this board is part of a group and has a GIF
        let imageSrc = relativeImagePath
        let imageAlt = 'Board ' + (boardIndex + 1)
        
        if (group && group.name) {
          const gifFilename = group.name + '.gif'
          const exportsDir = path.join(path.dirname(projectFileAbsolutePath), 'exports')
          const gifPath = path.join(exportsDir, gifFilename)
          
          console.log('[EnhancedHTML] Checking for GIF: ' + gifPath)
          console.log('[EnhancedHTML] Group name: ' + group.name)
          console.log('[EnhancedHTML] Group boardIds: ' + group.boardIds)
          
          // Try multiple possible locations for the GIF
          const possiblePaths = [
            gifPath,
            path.join(path.dirname(projectFileAbsolutePath), 'gifs', gifFilename),
            path.join(path.dirname(projectFileAbsolutePath), gifFilename),
            path.join(path.dirname(projectFileAbsolutePath), '..', 'exports', gifFilename),
            path.join(path.dirname(projectFileAbsolutePath), '..', 'gifs', gifFilename)
          ]
          
          let foundGif = false
          for (const testPath of possiblePaths) {
            console.log('[EnhancedHTML] Testing path: ' + testPath)
            if (fs.existsSync(testPath)) {
              // Use the GIF as the main image
              const relativeGifPath = path.relative(path.dirname(config.outputPath || ''), testPath).replace(/\\/g, '/')
              imageSrc = relativeGifPath
              imageAlt = 'GIF Animation - ' + group.name
              imageClass += ' clickable'
              console.log('[EnhancedHTML] Found GIF at: ' + testPath)
              console.log('[EnhancedHTML] Using GIF as main image: ' + relativeGifPath)
              foundGif = true
              break
            }
          }
          
          if (!foundGif) {
            console.log('[EnhancedHTML] GIF not found for group ' + group.name + ' in any expected location')
            console.log('[EnhancedHTML] Tried paths:', possiblePaths)
          }
        } else if (group) {
          console.log('[EnhancedHTML] Group found but no name:', group)
        }
        
        html += '      <img src="' + imageSrc + '" class="' + imageClass + '" alt="' + imageAlt + '" onerror="this.style.display=\'none\'; this.nextElementSibling.style.display=\'flex\';">\n'
        html += '      <div class="board-image" style="background: #f8f9fa; border: 2px dashed #dee2e6; display: none; align-items: center; justify-content: center; color: #6c757d;">Image Error</div>\n'
      } else {
        html += '      <div class="board-image" style="background: #f8f9fa; border: 2px dashed #dee2e6; display: flex; align-items: center; justify-content: center; color: #6c757d;">No Image</div>\n'
      }
      
      return html
    } catch (error) {
      console.warn('Error generating board image:', error.message)
      return '      <div class="board-image" style="background: #f8f9fa; border: 2px dashed #dee2e6; display: flex; align-items: center; justify-content: center; color: #6c757d;">Image Error</div>\n'
    }
  }

  generateTextContent(title, content, fieldType = '', boardIndex = 0) {
    // If no content and no fieldType, return empty
    if (!content && !fieldType) return ''
    
    const editableClass = fieldType ? ' editable-field' : ''
    const dataAttributes = fieldType ? ' data-field="' + fieldType + '" data-board="' + boardIndex + '"' : ''
    const displayContent = content || ''
    
    return '      <div class="text-content">\n' +
           '        <h3>' + this.escapeHtml(title) + '</h3>\n' +
           '        <div class="editable-text' + editableClass + '"' + dataAttributes + '>' + this.escapeHtml(displayContent).replace(/\n/g, '<br>') + '</div>\n' +
           '      </div>\n'
  }

  generateCustomField(column, board) {
    let value = ''
    
    if (column.id === 'focal-length' && board.focalLength) {
      value = board.focalLength + 'mm'
    } else if (column.customFieldId && board.customFields) {
      value = board.customFields[column.customFieldId] || ''
    }
    
    if (!value && column.defaultValue) {
      value = column.defaultValue
    }
    
    return '      <div class="custom-field">\n' +
           '        <div class="custom-field-label">' + this.escapeHtml(column.label) + '</div>\n' +
           '        <div class="custom-field-value">' + this.escapeHtml(value) + '</div>\n' +
           '      </div>\n'
  }

  getBoardFilename(board, boardIndex) {
    if (board.originalFilename) {
      return board.originalFilename
    }
    
    if (board.url) {
      return path.basename(board.url, path.extname(board.url))
    }
    
    return 'board-' + (boardIndex + 1).toString().padStart(3, '0')
  }

  calculateTotalDuration(boardData) {
    // Calculate total duration by summing all individual board durations
    let totalDuration = 0
    for (const board of boardData.boards) {
      const duration = board.duration || 2000 // Default 2 seconds if no duration
      totalDuration += duration
    }
    return totalDuration
  }

  escapeHtml(text) {
    if (!text) return ''
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }
}

// Export function that matches the existing API
const generateEnhancedHTML = async (config, boardData, projectFileAbsolutePath, outputPath) => {
  const exporter = new EnhancedHTMLExporter()
  return await exporter.generateEnhancedHTML(config, boardData, projectFileAbsolutePath, outputPath)
}

module.exports = {
  EnhancedHTMLExporter,
  generateEnhancedHTML
}
