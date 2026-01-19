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
            position: relative;
        }
        
        .board-row:hover {
            background: #f8f9fa;
            box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }
        
        /* Done state styling */
        .board-row.done {
            opacity: 0.55;
        }
        .board-row.done .board-image {
            filter: grayscale(1) contrast(0.9);
        }
        
        /* Done toggle UI */
        .row-controls {
            position: absolute;
            top: 8px;
            right: 10px;
            display: flex;
            align-items: center;
            gap: 8px;
            z-index: 5;
        }
        .done-toggle {
            display: inline-flex;
            align-items: center;
            cursor: pointer;
            user-select: none;
        }
        .done-toggle input {
            display: none;
        }
        .done-toggle .checkmark {
            width: 18px;
            height: 18px;
            border-radius: 4px;
            border: 2px solid #9ca3af;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            background: white;
            font-size: 12px;
            line-height: 1;
            color: #10b981;
            transition: all 0.15s ease;
        }
        .done-toggle:hover .checkmark {
            border-color: #6b7280;
        }
        .done-toggle input:checked ~ .checkmark {
            background: #10b9811a;
            border-color: #10b981;
        }
        .done-toggle input:checked ~ .checkmark::after {
            content: '✓';
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
            gap: 15px;
            align-items: center;
        }
        
        .gif-modal-controls, .zoom-controls-group {
            display: flex;
            gap: 8px;
            align-items: center;
            background: rgba(0, 0, 0, 0.6);
            padding: 8px 12px;
            border-radius: 8px;
        }
        
        .zoom-btn {
            background: rgba(255,255,255,0.9);
            border: none;
            padding: 10px 15px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
            transition: all 0.15s ease;
        }
        
        .zoom-btn:hover {
            background: white;
            transform: scale(1.05);
        }
        
        .zoom-btn:active {
            transform: scale(0.98);
        }
        
        .gif-ctrl-btn {
            min-width: 45px;
            text-align: center;
        }
        
        .gif-frame-counter {
            color: white;
            font-size: 13px;
            font-weight: 600;
            font-family: monospace;
            min-width: 60px;
            text-align: center;
            padding: 0 8px;
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
        
        /* GIF Playback Controls */
        .gif-container {
            position: relative;
            display: inline-block;
            width: 100%;
        }
        
        .gif-container canvas {
            width: 100%;
            height: auto;
            border: 1px solid #ccc;
            cursor: pointer;
            transition: transform 0.2s ease;
            display: block;
        }
        
        .gif-container canvas:hover {
            transform: scale(1.01);
        }
        
        .gif-container.has-controls canvas {
            border: 2px solid #0066cc;
        }
        
        .gif-controls {
            position: absolute;
            bottom: 8px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            align-items: center;
            gap: 4px;
            background: rgba(0, 0, 0, 0.75);
            padding: 6px 10px;
            border-radius: 20px;
            opacity: 0;
            transition: opacity 0.2s ease;
            z-index: 10;
        }
        
        .gif-container:hover .gif-controls {
            opacity: 1;
        }
        
        .gif-controls button {
            background: transparent;
            border: none;
            color: white;
            cursor: pointer;
            padding: 4px 8px;
            font-size: 14px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            min-width: 28px;
            transition: background 0.15s ease;
        }
        
        .gif-controls button:hover {
            background: rgba(255, 255, 255, 0.2);
        }
        
        .gif-controls button:active {
            background: rgba(255, 255, 255, 0.3);
        }
        
        .gif-controls .frame-info {
            color: white;
            font-size: 11px;
            font-weight: 500;
            min-width: 50px;
            text-align: center;
            font-family: monospace;
        }
        
        .gif-controls .speed-info {
            color: rgba(255, 255, 255, 0.7);
            font-size: 10px;
            margin-left: 4px;
        }
        
        .gif-badge {
            position: absolute;
            top: 5px;
            right: 5px;
            background: #0066cc;
            color: white;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 10px;
            font-weight: bold;
            z-index: 5;
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
            <div class="gif-modal-controls" id="gifModalControls" style="display: none;">
                <button class="zoom-btn gif-ctrl-btn" onclick="gifPrevFrame()" title="Previous Frame">&lt;&lt;</button>
                <button class="zoom-btn gif-ctrl-btn" id="gifPlayPauseBtn" onclick="gifTogglePlay()" title="Play/Pause">Pause</button>
                <button class="zoom-btn gif-ctrl-btn" onclick="gifNextFrame()" title="Next Frame">&gt;&gt;</button>
                <span class="gif-frame-counter" id="gifFrameCounter">1 / 1</span>
            </div>
            <div class="zoom-controls-group">
                <button class="zoom-btn" onclick="zoomIn()">Zoom In</button>
                <button class="zoom-btn" onclick="zoomOut()">Zoom Out</button>
                <button class="zoom-btn" onclick="resetZoom()">Reset</button>
            </div>
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
        
    // ========== Modal GIF Controller ==========
    let modalGifController = null;
    
    function gifPrevFrame() {
        if (modalGifController) {
            modalGifController.prevFrame();
        }
    }
    
    function gifNextFrame() {
        if (modalGifController) {
            modalGifController.nextFrame();
        }
    }
    
    function gifTogglePlay() {
        if (modalGifController) {
            modalGifController.togglePlay();
        }
    }
    
    function initializeImageModal() {
          const modal = document.getElementById('imageModal');
          const modalImg = document.getElementById('modalImage');
          const modalContent = document.querySelector('.image-modal-content');
          const closeBtn = document.querySelector('.image-modal-close');
          const gifControls = document.getElementById('gifModalControls');
          const gifPlayPauseBtn = document.getElementById('gifPlayPauseBtn');
          const gifFrameCounter = document.getElementById('gifFrameCounter');
          let currentZoom = 1;
          let minZoom = 0.1;
          const maxZoom = 5;
          let panX = 0;
          let panY = 0;
          let isPanning = false;
          let lastX = 0;
          let lastY = 0;
          let naturalW = 0;
          let naturalH = 0;

          // Ensure container is suitable for absolute-positioned image we pan/zoom
          if (modalContent) {
            modalContent.style.position = 'relative';
            modalContent.style.overflow = 'hidden';
          }

          // Ensure image is absolutely positioned from top-left
          if (modalImg) {
            modalImg.style.position = 'absolute';
            modalImg.style.left = '0';
            modalImg.style.top = '0';
            modalImg.style.willChange = 'transform';
            modalImg.style.maxWidth = 'none';
            modalImg.style.maxHeight = 'none';
            modalImg.style.objectFit = 'unset';
          }

          // Ensure close button remains clickable/visible
          if (closeBtn) {
            closeBtn.style.zIndex = '1001';
            closeBtn.style.pointerEvents = 'auto';
          }
            
            // Open modal when clicking on images
            document.addEventListener('click', function(e) {
                if (e.target.classList.contains('board-image') && e.target.tagName === 'IMG') {
                    modal.style.display = 'block';
                    modalImg.src = e.target.src;
                    modalImg.alt = e.target.alt;
                    
                    // Check if this is a GIF and set up GIF controls
                    const isGif = e.target.src.toLowerCase().endsWith('.gif');
                    console.log('[Modal] Image clicked:', e.target.src);
                    console.log('[Modal] Is GIF:', isGif);
                    console.log('[Modal] GIF controls element:', gifControls);
                    
                    if (isGif && gifControls) {
                        console.log('[Modal] Showing GIF controls');
                        gifControls.style.display = 'flex';
                        // Initialize modal GIF controller
                        initModalGifController(e.target.src);
                    } else if (gifControls) {
                        console.log('[Modal] Hiding GIF controls (not a GIF)');
                        gifControls.style.display = 'none';
                        // Clean up any existing modal GIF controller
                        if (modalGifController) {
                            modalGifController.destroy();
                            modalGifController = null;
                        }
                    } else {
                        console.log('[Modal] WARNING: gifControls element not found!');
                    }
                    
                    // Wait for image to load to compute fit scale
                    const init = () => {
                      naturalW = modalImg.naturalWidth || modalImg.width || 1;
                      naturalH = modalImg.naturalHeight || modalImg.height || 1;
                      // Lock element dimensions to intrinsic size so transforms are predictable
                      modalImg.style.width = naturalW + 'px';
                      modalImg.style.height = naturalH + 'px';
                      fitToContain();
                      // Force a layout read to get accurate clientWidth/Height
                      void (modalContent || modal).clientWidth;
                      updateImageZoom();
                    };
                    if (modalImg.complete) {
                      init();
                    } else {
                      modalImg.onload = init;
                    }
                }
            });
            
            // Close modal
            function closeModal() {
                modal.style.display = 'none';
                // Clean up GIF controller
                if (modalGifController) {
                    modalGifController.destroy();
                    modalGifController = null;
                }
                if (gifControls) {
                    gifControls.style.display = 'none';
                }
            }
            
            closeBtn.addEventListener('click', closeModal);
            
            modal.addEventListener('click', function(e) {
                if (e.target === modal) {
                    closeModal();
                }
            });
            
            // Zoom functions
            window.zoomIn = function() {
                currentZoom = Math.min(currentZoom * 1.2, maxZoom);
                updateImageZoom();
            };
            
            window.zoomOut = function() {
                currentZoom = Math.max(currentZoom / 1.2, minZoom);
                updateImageZoom();
            };
            
            window.resetZoom = function() {
                fitToContain();
                updateImageZoom();
            };
            
            function updateImageZoom() {
                clampPan();
                modalImg.style.transformOrigin = '0 0';
                modalImg.style.transform = 'translate(' + panX + 'px,' + panY + 'px) scale(' + currentZoom + ')';
            }

            // Wheel zoom with cursor focus
            modalImg.addEventListener('wheel', function(e) {
                e.preventDefault();
                const container = modalContent || modal;
                const rect = container.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;

                const delta = e.deltaY < 0 ? 1 : -1;
                const zoomStep = 0.1;
                const newZoom = Math.min(maxZoom, Math.max(minZoom, currentZoom + delta * zoomStep));

                if (newZoom === currentZoom) return;

                // Convert mouse to image content coords (before zoom change)
                // Compute content coords in image space using locked element size
                const contentX = (mouseX - panX) / currentZoom;
                const contentY = (mouseY - panY) / currentZoom;

                // Update zoom
                currentZoom = newZoom;

                // Recompute pan so the point under cursor stays fixed
                panX = Math.round(mouseX - contentX * currentZoom);
                panY = Math.round(mouseY - contentY * currentZoom);

                updateImageZoom();
            }, { passive: false });

            // Mouse drag panning
            modalImg.addEventListener('mousedown', function(e) {
                e.preventDefault();
                isPanning = true;
                lastX = e.clientX;
                lastY = e.clientY;
                modalImg.style.cursor = 'grabbing';
            });

            window.addEventListener('mousemove', function(e) {
                if (!isPanning) return;
                const dx = e.clientX - lastX;
                const dy = e.clientY - lastY;
                lastX = e.clientX;
                lastY = e.clientY;
                panX += dx;
                panY += dy;
                updateImageZoom();
            });

            window.addEventListener('mouseup', function() {
                if (!isPanning) return;
                isPanning = false;
                modalImg.style.cursor = 'grab';
            });

            // Fit image to container and center
            function fitToContain() {
                const container = modalContent || modal;
                const cw = container.clientWidth || window.innerWidth;
                const ch = container.clientHeight || window.innerHeight;
                if (!naturalW || !naturalH) {
                    naturalW = modalImg.naturalWidth || modalImg.width || 1;
                    naturalH = modalImg.naturalHeight || modalImg.height || 1;
                }
                const scaleToFit = Math.min(cw / naturalW, ch / naturalH);
                minZoom = Math.max(scaleToFit, 0.1);
                currentZoom = minZoom;
                const cs = getComputedStyle(modalImg);
                const bw = (parseFloat(cs.borderLeftWidth)||0) + (parseFloat(cs.borderRightWidth)||0);
                const bh = (parseFloat(cs.borderTopWidth)||0) + (parseFloat(cs.borderBottomWidth)||0);
                const scaledW = naturalW * currentZoom + bw;
                const scaledH = naturalH * currentZoom + bh;
                panX = Math.round((cw - scaledW) * 0.5);
                panY = Math.round((ch - scaledH) * 0.5);
            }

            // Clamp pan so content stays within container (center if smaller)
            function clampPan() {
                const container = modalContent || modal;
                const cw = container.clientWidth || window.innerWidth;
                const ch = container.clientHeight || window.innerHeight;
                const cs = getComputedStyle(modalImg);
                const bw = (parseFloat(cs.borderLeftWidth)||0) + (parseFloat(cs.borderRightWidth)||0);
                const bh = (parseFloat(cs.borderTopWidth)||0) + (parseFloat(cs.borderBottomWidth)||0);
                const scaledW = naturalW * currentZoom + bw;
                const scaledH = naturalH * currentZoom + bh;
                if (scaledW <= cw) {
                    panX = Math.round((cw - scaledW) * 0.5);
                } else {
                    const minX = cw - scaledW;
                    const maxX = 0;
                    panX = Math.min(maxX, Math.max(minX, panX));
                }
                if (scaledH <= ch) {
                    panY = Math.round((ch - scaledH) * 0.5);
                } else {
                    const minY = ch - scaledH;
                    const maxY = 0;
                    panY = Math.min(maxY, Math.max(minY, panY));
                }
            }

            // Keyboard controls
            window.addEventListener('keydown', function(e) {
                if (modal.style.display !== 'block') return;
                
                if (e.key === 'Escape') {
                    closeModal();
                } else if (e.key === ' ' || e.key === 'Spacebar') {
                    // Space to toggle GIF play/pause
                    if (modalGifController) {
                        e.preventDefault();
                        gifTogglePlay();
                    }
                } else if (e.key === 'ArrowLeft') {
                    // Left arrow for previous frame
                    if (modalGifController) {
                        e.preventDefault();
                        gifPrevFrame();
                    }
                } else if (e.key === 'ArrowRight') {
                    // Right arrow for next frame
                    if (modalGifController) {
                        e.preventDefault();
                        gifNextFrame();
                    }
                }
            });

            // Refit on resize
            window.addEventListener('resize', function() {
                if (modal.style.display === 'block') {
                    fitToContain();
                    updateImageZoom();
                }
            });
        }
        
        // ========== Modal GIF Controller ==========
        // Handles GIF frame-by-frame navigation in the modal
        
        function initModalGifController(gifSrc) {
            // Clean up any existing controller
            if (modalGifController) {
                modalGifController.destroy();
            }
            
            modalGifController = new ModalGifController(gifSrc);
        }
        
        class ModalGifController {
            constructor(src) {
                this.src = src;
                this.frames = [];
                this.delays = [];
                this.currentFrame = 0;
                this.isPlaying = true;
                this.animationTimer = null;
                this.modalImg = document.getElementById('modalImage');
                this.playPauseBtn = document.getElementById('gifPlayPauseBtn');
                this.frameCounter = document.getElementById('gifFrameCounter');
                this.canvas = null;
                this.ctx = null;
                
                this.init();
            }
            
            async init() {
                try {
                    const response = await fetch(this.src);
                    const buffer = await response.arrayBuffer();
                    await this.parseGifFrames(buffer);
                    
                    if (this.frames.length > 1) {
                        this.setupCanvas();
                        this.updateFrameCounter();
                        this.play();
                    } else {
                        // Hide controls if not animated
                        document.getElementById('gifModalControls').style.display = 'none';
                    }
                } catch (error) {
                    console.warn('Could not parse GIF for modal controls:', error);
                    document.getElementById('gifModalControls').style.display = 'none';
                }
            }
            
            async parseGifFrames(buffer) {
                const bytes = new Uint8Array(buffer);
                
                // Check GIF signature
                const signature = String.fromCharCode(...bytes.slice(0, 6));
                if (!signature.startsWith('GIF')) {
                    throw new Error('Not a valid GIF file');
                }
                
                const width = bytes[6] | (bytes[7] << 8);
                const height = bytes[8] | (bytes[9] << 8);
                
                this.width = width;
                this.height = height;
                this.frames = [];
                this.delays = [];
                
                // Create rendering canvas
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                
                let previousImageData = null;
                let pos = 10;
                const flags = bytes[pos];
                const hasGlobalColorTable = (flags & 0x80) !== 0;
                const globalColorTableSize = hasGlobalColorTable ? Math.pow(2, (flags & 0x07) + 1) : 0;
                pos = 13;
                
                let globalColorTable = [];
                if (hasGlobalColorTable) {
                    for (let i = 0; i < globalColorTableSize; i++) {
                        globalColorTable.push([bytes[pos++], bytes[pos++], bytes[pos++]]);
                    }
                }
                
                let delay = 100;
                let disposalMethod = 0;
                let transparentIndex = -1;
                
                while (pos < bytes.length) {
                    const blockType = bytes[pos++];
                    
                    if (blockType === 0x21) {
                        const extType = bytes[pos++];
                        
                        if (extType === 0xF9) {
                            const blockSize = bytes[pos++];
                            const packedByte = bytes[pos];
                            disposalMethod = (packedByte >> 2) & 0x07;
                            const hasTransparency = (packedByte & 0x01) !== 0;
                            delay = (bytes[pos + 1] | (bytes[pos + 2] << 8)) * 10;
                            if (delay === 0) delay = 100;
                            transparentIndex = hasTransparency ? bytes[pos + 3] : -1;
                            pos += blockSize + 1;
                        } else {
                            while (bytes[pos] !== 0) {
                                pos += bytes[pos] + 1;
                            }
                            pos++;
                        }
                    } else if (blockType === 0x2C) {
                        const left = bytes[pos] | (bytes[pos + 1] << 8);
                        const top = bytes[pos + 2] | (bytes[pos + 3] << 8);
                        const imgWidth = bytes[pos + 4] | (bytes[pos + 5] << 8);
                        const imgHeight = bytes[pos + 6] | (bytes[pos + 7] << 8);
                        const imgFlags = bytes[pos + 8];
                        pos += 9;
                        
                        const hasLocalColorTable = (imgFlags & 0x80) !== 0;
                        const interlaced = (imgFlags & 0x40) !== 0;
                        const localColorTableSize = hasLocalColorTable ? Math.pow(2, (imgFlags & 0x07) + 1) : 0;
                        
                        let colorTable = globalColorTable;
                        if (hasLocalColorTable) {
                            colorTable = [];
                            for (let i = 0; i < localColorTableSize; i++) {
                                colorTable.push([bytes[pos++], bytes[pos++], bytes[pos++]]);
                            }
                        }
                        
                        if (disposalMethod === 2) {
                            ctx.clearRect(0, 0, width, height);
                        } else if (disposalMethod === 3 && previousImageData) {
                            ctx.putImageData(previousImageData, 0, 0);
                        }
                        
                        if (disposalMethod === 3) {
                            previousImageData = ctx.getImageData(0, 0, width, height);
                        }
                        
                        const minCodeSize = bytes[pos++];
                        let imageData = [];
                        while (bytes[pos] !== 0) {
                            const subBlockSize = bytes[pos++];
                            for (let i = 0; i < subBlockSize; i++) {
                                imageData.push(bytes[pos++]);
                            }
                        }
                        pos++;
                        
                        const pixels = this.lzwDecode(minCodeSize, imageData);
                        const frameImageData = ctx.getImageData(0, 0, width, height);
                        const data = frameImageData.data;
                        
                        let pixelIndex = 0;
                        const deinterlace = interlaced ? this.getDeinterlaceIterator(imgHeight) : null;
                        
                        for (let y = 0; y < imgHeight; y++) {
                            const actualY = interlaced ? deinterlace[y] : y;
                            for (let x = 0; x < imgWidth; x++) {
                                const colorIndex = pixels[pixelIndex++];
                                if (colorIndex !== transparentIndex && colorIndex < colorTable.length) {
                                    const color = colorTable[colorIndex];
                                    const offset = ((top + actualY) * width + (left + x)) * 4;
                                    data[offset] = color[0];
                                    data[offset + 1] = color[1];
                                    data[offset + 2] = color[2];
                                    data[offset + 3] = 255;
                                }
                            }
                        }
                        
                        ctx.putImageData(frameImageData, 0, 0);
                        this.frames.push(ctx.getImageData(0, 0, width, height));
                        this.delays.push(delay);
                        
                        transparentIndex = -1;
                        delay = 100;
                        
                    } else if (blockType === 0x3B) {
                        break;
                    } else if (blockType === 0x00) {
                        continue;
                    } else {
                        break;
                    }
                }
            }
            
            getDeinterlaceIterator(height) {
                const rows = [];
                for (let y = 0; y < height; y += 8) rows.push(y);
                for (let y = 4; y < height; y += 8) rows.push(y);
                for (let y = 2; y < height; y += 4) rows.push(y);
                for (let y = 1; y < height; y += 2) rows.push(y);
                const lookup = new Array(height);
                for (let i = 0; i < rows.length; i++) {
                    lookup[i] = rows[i];
                }
                return lookup;
            }
            
            lzwDecode(minCodeSize, data) {
                const clearCode = 1 << minCodeSize;
                const eoiCode = clearCode + 1;
                let codeSize = minCodeSize + 1;
                let nextCode = eoiCode + 1;
                let maxCode = 1 << codeSize;
                
                let dictionary = [];
                for (let i = 0; i < clearCode; i++) {
                    dictionary[i] = [i];
                }
                dictionary[clearCode] = [];
                dictionary[eoiCode] = null;
                
                const output = [];
                let bitBuffer = 0;
                let bitCount = 0;
                let dataIndex = 0;
                
                function readCode() {
                    while (bitCount < codeSize && dataIndex < data.length) {
                        bitBuffer |= data[dataIndex++] << bitCount;
                        bitCount += 8;
                    }
                    const code = bitBuffer & ((1 << codeSize) - 1);
                    bitBuffer >>= codeSize;
                    bitCount -= codeSize;
                    return code;
                }
                
                let prevCode = null;
                
                while (dataIndex < data.length || bitCount >= codeSize) {
                    const code = readCode();
                    
                    if (code === clearCode) {
                        codeSize = minCodeSize + 1;
                        maxCode = 1 << codeSize;
                        nextCode = eoiCode + 1;
                        dictionary = [];
                        for (let i = 0; i < clearCode; i++) {
                            dictionary[i] = [i];
                        }
                        dictionary[clearCode] = [];
                        dictionary[eoiCode] = null;
                        prevCode = null;
                        continue;
                    }
                    
                    if (code === eoiCode) break;
                    
                    let entry;
                    if (code < nextCode) {
                        entry = dictionary[code];
                    } else if (code === nextCode && prevCode !== null) {
                        entry = dictionary[prevCode].concat(dictionary[prevCode][0]);
                    } else {
                        break;
                    }
                    
                    if (entry) {
                        output.push(...entry);
                        
                        if (prevCode !== null && nextCode < 4096) {
                            dictionary[nextCode++] = dictionary[prevCode].concat(entry[0]);
                            if (nextCode >= maxCode && codeSize < 12) {
                                codeSize++;
                                maxCode = 1 << codeSize;
                            }
                        }
                    }
                    
                    prevCode = code;
                }
                
                return output;
            }
            
            setupCanvas() {
                // Create a hidden canvas to render frames
                this.canvas = document.createElement('canvas');
                this.canvas.width = this.width;
                this.canvas.height = this.height;
                this.ctx = this.canvas.getContext('2d');
            }
            
            play() {
                if (this.animationTimer) return;
                this.isPlaying = true;
                this.updatePlayButton();
                this.animate();
            }
            
            pause() {
                if (this.animationTimer) {
                    clearTimeout(this.animationTimer);
                    this.animationTimer = null;
                }
                this.isPlaying = false;
                this.updatePlayButton();
            }
            
            togglePlay() {
                if (this.isPlaying) {
                    this.pause();
                } else {
                    this.play();
                }
            }
            
            animate() {
                if (!this.isPlaying || this.frames.length === 0) return;
                
                this.renderFrame(this.currentFrame);
                this.updateFrameCounter();
                
                const delay = this.delays[this.currentFrame] || 100;
                this.animationTimer = setTimeout(() => {
                    this.currentFrame = (this.currentFrame + 1) % this.frames.length;
                    this.animate();
                }, delay);
            }
            
            renderFrame(index) {
                if (!this.ctx || !this.frames[index]) return;
                this.ctx.putImageData(this.frames[index], 0, 0);
                this.modalImg.src = this.canvas.toDataURL('image/png');
            }
            
            nextFrame() {
                this.pause();
                this.currentFrame = (this.currentFrame + 1) % this.frames.length;
                this.renderFrame(this.currentFrame);
                this.updateFrameCounter();
            }
            
            prevFrame() {
                this.pause();
                this.currentFrame = (this.currentFrame - 1 + this.frames.length) % this.frames.length;
                this.renderFrame(this.currentFrame);
                this.updateFrameCounter();
            }
            
            updateFrameCounter() {
                if (this.frameCounter) {
                    this.frameCounter.textContent = (this.currentFrame + 1) + ' / ' + this.frames.length;
                }
            }
            
            updatePlayButton() {
                if (this.playPauseBtn) {
                    this.playPauseBtn.textContent = this.isPlaying ? 'Pause' : 'Play';
                    this.playPauseBtn.title = this.isPlaying ? 'Pause (Space)' : 'Play (Space)';
                }
            }
            
            destroy() {
                this.pause();
                this.frames = [];
                this.delays = [];
                this.canvas = null;
                this.ctx = null;
            }
        }

        // Note: Inline GIF controls removed - use modal controls instead
        // Click on any GIF image to open the modal with playback controls
    </script>
</body>
</html>`
    // ORPHAN_MARKER_START - need to remove orphaned code below
    const __ORPHAN__ = `
                        if (hasLocalColorTable) {
                            colorTable = [];
                            for (let i = 0; i < localColorTableSize; i++) {
                                colorTable.push([bytes[pos++], bytes[pos++], bytes[pos++]]);
                            }
                        }
                        
                        // Handle disposal method
                        if (disposalMethod === 2) {
                            // Restore to background
                            ctx.clearRect(0, 0, width, height);
                        } else if (disposalMethod === 3 && previousImageData) {
                            // Restore to previous
                            ctx.putImageData(previousImageData, 0, 0);
                        }
                        
                        // Save current state if needed for next frame
                        if (disposalMethod === 3) {
                            previousImageData = ctx.getImageData(0, 0, width, height);
                        }
                        
                        // Decode LZW compressed image data
                        const minCodeSize = bytes[pos++];
                        let imageData = [];
                        while (bytes[pos] !== 0) {
                            const subBlockSize = bytes[pos++];
                            for (let i = 0; i < subBlockSize; i++) {
                                imageData.push(bytes[pos++]);
                            }
                        }
                        pos++; // Block terminator
                        
                        // LZW decode
                        const pixels = this.lzwDecode(minCodeSize, imageData);
                        
                        // Draw pixels to canvas
                        const frameImageData = ctx.getImageData(0, 0, width, height);
                        const data = frameImageData.data;
                        
                        let pixelIndex = 0;
                        const deinterlace = interlaced ? this.getDeinterlaceIterator(imgHeight) : null;
                        
                        for (let y = 0; y < imgHeight; y++) {
                            const actualY = interlaced ? deinterlace[y] : y;
                            for (let x = 0; x < imgWidth; x++) {
                                const colorIndex = pixels[pixelIndex++];
                                if (colorIndex !== transparentIndex && colorIndex < colorTable.length) {
                                    const color = colorTable[colorIndex];
                                    const offset = ((top + actualY) * width + (left + x)) * 4;
                                    data[offset] = color[0];
                                    data[offset + 1] = color[1];
                                    data[offset + 2] = color[2];
                                    data[offset + 3] = 255;
                                }
                            }
                        }
                        
                        ctx.putImageData(frameImageData, 0, 0);
                        
                        // Store the frame
                        this.frames.push(ctx.getImageData(0, 0, width, height));
                        this.delays.push(delay);
                        
                        // Reset for next frame
                        transparentIndex = -1;
                        delay = 100;
                        
                    } else if (blockType === 0x3B) {
                        // Trailer - end of GIF
                        break;
                    } else if (blockType === 0x00) {
                        // Skip null bytes
                        continue;
                    } else {
                        // Unknown block, try to skip
                        break;
                    }
                }
            }
            
            getDeinterlaceIterator(height) {
                const rows = [];
                // Pass 1: rows 0, 8, 16, ...
                for (let y = 0; y < height; y += 8) rows.push(y);
                // Pass 2: rows 4, 12, 20, ...
                for (let y = 4; y < height; y += 8) rows.push(y);
                // Pass 3: rows 2, 6, 10, ...
                for (let y = 2; y < height; y += 4) rows.push(y);
                // Pass 4: rows 1, 3, 5, ...
                for (let y = 1; y < height; y += 2) rows.push(y);
                
                // Create reverse lookup
                const lookup = new Array(height);
                for (let i = 0; i < rows.length; i++) {
                    lookup[i] = rows[i];
                }
                return lookup;
            }
            
            lzwDecode(minCodeSize, data) {
                const clearCode = 1 << minCodeSize;
                const eoiCode = clearCode + 1;
                let codeSize = minCodeSize + 1;
                let nextCode = eoiCode + 1;
                let maxCode = 1 << codeSize;
                
                // Initialize dictionary
                let dictionary = [];
                for (let i = 0; i < clearCode; i++) {
                    dictionary[i] = [i];
                }
                dictionary[clearCode] = [];
                dictionary[eoiCode] = null;
                
                const output = [];
                let bitBuffer = 0;
                let bitCount = 0;
                let dataIndex = 0;
                
                function readCode() {
                    while (bitCount < codeSize && dataIndex < data.length) {
                        bitBuffer |= data[dataIndex++] << bitCount;
                        bitCount += 8;
                    }
                    const code = bitBuffer & ((1 << codeSize) - 1);
                    bitBuffer >>= codeSize;
                    bitCount -= codeSize;
                    return code;
                }
                
                let prevCode = null;
                
                while (dataIndex < data.length || bitCount >= codeSize) {
                    const code = readCode();
                    
                    if (code === clearCode) {
                        // Reset
                        codeSize = minCodeSize + 1;
                        maxCode = 1 << codeSize;
                        nextCode = eoiCode + 1;
                        dictionary = [];
                        for (let i = 0; i < clearCode; i++) {
                            dictionary[i] = [i];
                        }
                        dictionary[clearCode] = [];
                        dictionary[eoiCode] = null;
                        prevCode = null;
                        continue;
                    }
                    
                    if (code === eoiCode) {
                        break;
                    }
                    
                    let entry;
                    if (code < nextCode) {
                        entry = dictionary[code];
                    } else if (code === nextCode && prevCode !== null) {
                        entry = dictionary[prevCode].concat(dictionary[prevCode][0]);
                    } else {
                        console.warn('Invalid LZW code');
                        break;
                    }
                    
                    if (entry) {
                        output.push(...entry);
                        
                        if (prevCode !== null && nextCode < 4096) {
                            dictionary[nextCode++] = dictionary[prevCode].concat(entry[0]);
                            if (nextCode >= maxCode && codeSize < 12) {
                                codeSize++;
                                maxCode = 1 << codeSize;
                            }
                        }
                    }
                    
                    prevCode = code;
                }
                
                return output;
            }
            
            createUI() {
                // Create container
                this.container = document.createElement('div');
                this.container.className = 'gif-container has-controls';
                
                // Create canvas
                this.canvas = document.createElement('canvas');
                if (this.frames.length > 0) {
                    this.canvas.width = this.frames[0].width;
                    this.canvas.height = this.frames[0].height;
                }
                this.ctx = this.canvas.getContext('2d');
                
                // Create GIF badge
                const badge = document.createElement('span');
                badge.className = 'gif-badge';
                badge.textContent = 'GIF';
                
                // Create controls
                this.controls = document.createElement('div');
                this.controls.className = 'gif-controls';
                this.controls.innerHTML = \`
                    <button class="gif-prev" title="Previous frame (←)">◀◀</button>
                    <button class="gif-playpause" title="Play/Pause (Space)">⏸</button>
                    <button class="gif-next" title="Next frame (→)">▶▶</button>
                    <span class="frame-info">1 / \${this.frames.length}</span>
                \`;
                
                // Prevent click events on controls from propagating to canvas
                this.controls.addEventListener('click', (e) => e.stopPropagation());
                
                // Add event listeners
                this.controls.querySelector('.gif-prev').addEventListener('click', () => this.prevFrame());
                this.controls.querySelector('.gif-playpause').addEventListener('click', () => this.togglePlay());
                this.controls.querySelector('.gif-next').addEventListener('click', () => this.nextFrame());
                
`; // End orphan string
    
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

    // Shot "done" toggles
    function setupDoneToggles() {
      try {
        const titleEl = document.querySelector('.header h1')
        const projectName = titleEl ? titleEl.textContent.trim() : (document.title || 'project')
        const storageKey = 'storyboarder-html-done:' + projectName
        let doneMap = {}
        try {
          const raw = localStorage.getItem(storageKey)
          if (raw) doneMap = JSON.parse(raw) || {}
        } catch (e) { /* ignore */ }

        const rows = document.querySelectorAll('.board-row')
        rows.forEach(row => {
          const idx = row.getAttribute('data-board-index')
          const checkbox = row.querySelector('.done-checkbox')
          if (!checkbox) return
          const isDone = doneMap[idx] === true
          checkbox.checked = isDone
          row.classList.toggle('done', isDone)
          checkbox.addEventListener('change', () => {
            const checked = checkbox.checked
            row.classList.toggle('done', checked)
            doneMap[idx] = checked
            try { localStorage.setItem(storageKey, JSON.stringify(doneMap)) } catch (e) {}
          })
        })
      } catch (err) {
        console.warn('setupDoneToggles error:', err)
      }
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
    
    let html = '<div class="board-row" data-board-index="' + boardIndex + '">\n'
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
    // Row controls (Done toggle)
    html += '    <div class="row-controls">\n'
    html += '      <label class="done-toggle" title="Mark shot as done">\n'
    html += '        <input type="checkbox" class="done-checkbox">\n'
    html += '        <span class="checkmark"></span>\n'
    html += '      </label>\n'
    html += '    </div>\n'
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
