const fs = require('fs')
const path = require('path')
const moment = require('moment')

const {
  boardFileImageSize,
  boardFilenameForExport,
  boardOrderedLayerFilenames
} = require('../models/board')

const util = require('../utils')

const DEFAULT_REFERENCE_LAYER_OPACITY = 0.75

const msecsToFrames = (fps, value) =>
  (fps/1000) * value

const getImage = async url => {
  return new Promise((resolve, reject) => {
    let img = new Image()
    img.onload = () => {
      resolve(img)
    }
    img.onerror = () => {
      reject(new Error(`Could not load image ${url}`))
    }
    img.src = url
  })
}

/**
 * Reads layer files and exports flattened image to a file
 * Can be used to generate thumbnails if `size` is smaller than actual size
 * @param {object} board the board object
 * @param {string} filenameForExport filename without path
 * @param {array} size [width:int, height:int]
 * @param {string} projectFileAbsolutePath full path to .storyboarder project
 * @param {string} outputPath full path of folder where file will be exported
 * @returns {Promise} resolves with the absolute path to the exported file
 */
const exportFlattenedBoard = (board, filenameForExport, size, projectFileAbsolutePath, outputPath, jpegQuality=null) => {
  return new Promise((resolve, reject) => {

    let canvas = createWhiteContext(size).canvas

    flattenBoardToCanvas(board, canvas, size, projectFileAbsolutePath)
      .then(() => {
        let imageData
        if (jpegQuality) {
          imageData = canvas.toDataURL('image/jpeg', jpegQuality).replace(/^data:image\/\w+;base64,/, '')
        } else {
          imageData = canvas.toDataURL().replace(/^data:image\/\w+;base64,/, '')
        }
        let pathToExport = path.join(outputPath, filenameForExport)
        fs.writeFileSync(pathToExport, imageData, 'base64')
        resolve(pathToExport)
      }).catch(err => {
        reject(err)
      })
  })
}

const createWhiteContext = size => {
  let canvas = document.createElement('canvas')
  let context = canvas.getContext('2d')
  
  // Get device pixel ratio for high-DPI rendering
  const dpr = window.devicePixelRatio || 1
  
  // Set the actual canvas size in memory (scaled up for high-DPI)
  canvas.width = size[0] * dpr
  canvas.height = size[1] * dpr
  
  // Scale the canvas back down using CSS
  canvas.style.width = size[0] + 'px'
  canvas.style.height = size[1] + 'px'
  
  // Scale the drawing context so everything draws at the correct size
  context.scale(dpr, dpr)
  
  // Set high-quality image smoothing
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  
  context.fillStyle = 'white'
  context.fillRect(0, 0, size[0], size[1])
  
  // Debug canvas creation
  console.log(`[createWhiteContext] Created high-DPI canvas: ${canvas.width}x${canvas.height} (CSS: ${size[0]}x${size[1]}, DPR: ${dpr})`)
  
  return context
}

// convert board data to canvasImageSourcesData
const getCanvasImageSourcesDataForBoard = (board, projectFileAbsolutePath) => {
  // shot-generator = 0
  // reference = 1
  const REFERENCE_LAYER_INDEX = 1

  return new Promise((resolve, reject) => {
    let { indices, filenames } = boardOrderedLayerFilenames(board)
    
    // Log to file in the same folder as GIFs and PDF exports
    const gifsDir = path.join(path.dirname(projectFileAbsolutePath), 'gifs')
    const logFile = path.join(gifsDir, 'gif_export_debug.log')
    
    const logToFile = (message) => {
      const timestamp = new Date().toISOString()
      const logMessage = `[${timestamp}] ${message}\n`
      console.log(message)
      try {
        fs.appendFileSync(logFile, logMessage)
      } catch (e) {
        // Ignore file write errors
      }
    }
    
    logToFile(`[getCanvasImageSourcesDataForBoard] DEBUG - Board layer analysis: ${JSON.stringify({
      indices,
      filenames,
      boardLayers: board.layers ? Object.keys(board.layers) : 'none',
      projectFile: projectFileAbsolutePath
    })}`)

    let getImageFilePath = (filename) => path.join(path.dirname(projectFileAbsolutePath), 'images', filename)

    let loaders = filenames.map(filename => {
      const filePath = getImageFilePath(filename + '?' + Math.random())
      logToFile(`[getCanvasImageSourcesDataForBoard] Loading image: ${filePath}`)
      return getImage(filePath)
    })

    Promise.all(loaders).then(images => {
      let canvasImageSourcesData = []
      images.forEach((canvasImageSource, n) => {
        let layerIndex = indices[n]
        const filename = filenames[n]
        
        logToFile(`[getCanvasImageSourcesDataForBoard] Image ${n} (${filename}): ${canvasImageSource ? 'loaded' : 'FAILED TO LOAD'}`)
        
        if (canvasImageSource) {
          logToFile(`[getCanvasImageSourcesDataForBoard] Image ${n} dimensions: ${canvasImageSource.width}x${canvasImageSource.height}`)

          // default opacity for all layers is 1
          let opacity = 1

          // special case for reference layer
          if (layerIndex === REFERENCE_LAYER_INDEX) {
            if (board.layers &&
                board.layers.reference &&
                !util.isUndefined(board.layers.reference.opacity))
            {
              // ... if defined, use that opacity value
              opacity = board.layers.reference.opacity
            } else {
              // ... otherwise, use default for reference layer
              opacity = DEFAULT_REFERENCE_LAYER_OPACITY
            }
          }

          canvasImageSourcesData.push({
            image: canvasImageSource,
            layerIndex: layerIndex,
            opacity: opacity
          })
        } else {
          logToFile(`[getCanvasImageSourcesDataForBoard] ERROR: Failed to load image ${filename}`)
        }
      })
      
      logToFile(`[getCanvasImageSourcesDataForBoard] Final canvas sources: ${canvasImageSourcesData.length} loaded`)
      resolve(canvasImageSourcesData)
    }).catch(err => {
      logToFile(`[getCanvasImageSourcesDataForBoard] ERROR in Promise.all: ${err.message}`)
      reject(new Error(err))
    })
  })
}

/**
 * Given an given an array of layer description objects (CanvasImageSourcesData),
 *  draws a flattened image to the context
 * @param {CanvasRenderingContext2D} context reference to the destination context
 * @param {array} canvasImageSourcesData array of layer description objects: { canvasImageSource:CanvasImageSource, opacity:int }:CanvasImageSourcesData
 * @param {array} size [width:int, height:int]
 */
const flattenCanvasImageSourcesDataToContext = (context, canvasImageSourcesData, size) => {
  console.log(`[flattenCanvasImageSourcesDataToContext] Drawing ${canvasImageSourcesData.length} sources to canvas ${context.canvas.width}x${context.canvas.height}`)
  console.log(`[flattenCanvasImageSourcesDataToContext] Target size: ${size[0]}x${size[1]}`)
  
  context.save()
  
  // Ensure high-quality image smoothing for crisp rendering
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  
  for (let i = 0; i < canvasImageSourcesData.length; i++) {
    let source = canvasImageSourcesData[i]
    console.log(`[flattenCanvasImageSourcesDataToContext] Drawing source ${i}: ${source.image.width}x${source.image.height} with opacity ${source.opacity}`)
    context.globalAlpha = source.opacity
    
    // Draw image at full resolution - the high-DPI canvas will handle the scaling
    context.drawImage(source.image, 0, 0, size[0], size[1])
  }
  context.restore()
  
  console.log(`[flattenCanvasImageSourcesDataToContext] Finished drawing. Canvas is now ${context.canvas.width}x${context.canvas.height}`)
}

/**
 * Reads layer files and draws flattened image to a canvas
 * Can be used to generate thumbnails if `size` is smaller than actual size
 * @param {object} board the board object
 * @param {HTMLCanvasElement} canvas destination canvas
 * @param {array} size [width:int, height:int]
 * @param {string} projectFileAbsolutePath full path to .storyboarder project
 * @returns {Promise}
 */
const flattenBoardToCanvas = (board, canvas, size, projectFileAbsolutePath) => {
  return new Promise((resolve, reject) => {
    // Log to file in the same folder as GIFs and PDF exports
    const gifsDir = path.join(path.dirname(projectFileAbsolutePath), 'gifs')
    const logFile = path.join(gifsDir, 'gif_export_debug.log')
    
    const logToFile = (message) => {
      const timestamp = new Date().toISOString()
      const logMessage = `[${timestamp}] ${message}\n`
      console.log(message)
      try {
        fs.appendFileSync(logFile, logMessage)
      } catch (e) {
        // Ignore file write errors
      }
    }
    
    logToFile(`[flattenBoardToCanvas] DEBUG - Board structure: ${JSON.stringify({
      hasLayers: !!board.layers,
      layersKeys: board.layers ? Object.keys(board.layers) : 'none',
      hasImage: !!board.image,
      hasUrl: !!board.url,
      projectFile: projectFileAbsolutePath
    })}`)
    
    if (!canvas) { canvas = createWhiteContext(size).canvas }
    getCanvasImageSourcesDataForBoard(board, projectFileAbsolutePath)
      .then(canvasImageSourcesData => {
        logToFile(`[flattenBoardToCanvas] DEBUG - Canvas image sources data: ${JSON.stringify({
          sourcesCount: canvasImageSourcesData.length,
          sources: canvasImageSourcesData.map(s => ({
            hasImage: !!s.image,
            layerIndex: s.layerIndex,
            opacity: s.opacity
          }))
        })}`)
        
        // Debug canvas before drawing
        logToFile(`[flattenBoardToCanvas] DEBUG - Canvas before drawing: ${canvas.width}x${canvas.height}`)
        logToFile(`[flattenBoardToCanvas] DEBUG - Target size: ${size[0]}x${size[1]}`)
        
        flattenCanvasImageSourcesDataToContext(canvas.getContext('2d'), canvasImageSourcesData, size)
        
        // Debug canvas after drawing
        logToFile(`[flattenBoardToCanvas] DEBUG - Canvas after drawing: ${canvas.width}x${canvas.height}`)
        
        resolve(canvas)
      }).catch(err => {
        logToFile(`[flattenBoardToCanvas] ERROR: ${err.message}`)
        logToFile(`[flattenBoardToCanvas] ERROR: Stack trace: ${err.stack}`)
        reject(err)
      })
  })
}

const ensureExportsPathExists = (projectFileAbsolutePath) => {
  let dirname = path.dirname(projectFileAbsolutePath)

  let exportsPath = path.join(dirname, 'exports')

  if (!fs.existsSync(exportsPath)) {
    fs.mkdirSync(exportsPath)
  }
  
  return exportsPath
}

module.exports = {
  DEFAULT_REFERENCE_LAYER_OPACITY,

  msecsToFrames,
  getImage,
  exportFlattenedBoard,
  flattenCanvasImageSourcesDataToContext,
  flattenBoardToCanvas,
  ensureExportsPathExists
}
