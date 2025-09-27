const fs = require('fs-extra')
const path = require('path')
const GIFEncoder = require('gifencoder')
const moment = require('moment')
const app = require("electron").remote.app
const { dialog } = require('electron').remote

const {
  boardFileImageSize,
  boardFilenameForExport,
  boardFilenameForPosterFrame
} = require('../models/board')
const {
  getImage,
  exportFlattenedBoard,
  ensureExportsPathExists,
  flattenBoardToCanvas
} = require('../exporters/common')

const exporterFcpX = require('../exporters/final-cut-pro-x')
const exporterFcp = require('../exporters/final-cut-pro')
const exporterPDF = require('../exporters/pdf')
const exporterCleanup = require('../exporters/cleanup')
const exporterFfmpeg = require('../exporters/ffmpeg')
const util = require('../utils/index')

class Exporter {
  exportCleanup (boardData, projectFileAbsolutePath) {
    return new Promise((resolve, reject) => {
      dialog.showMessageBox(
        null,
        {
          type: 'warning',
          title: 'Are You Sure?',
          message: `Clean Up deletes unused image files, reducing file size. It cannot be undone. Are you sure you want to do this?`,
          buttons: ['Yes', 'No'],
      }).then(({ response }) => {
        if (response == 1) {
          reject()
        } else {
          exporterCleanup.cleanupScene(projectFileAbsolutePath).then(newBoardData => {
            resolve(newBoardData)
          }).catch(err => {
            reject(err)
          })
        }
      }).catch(err => console.error(err))
    })
  }

  async exportFcp (boardData, projectFileAbsolutePath) {
    let exportsPath = ensureExportsPathExists(projectFileAbsolutePath)

    let basename = path.basename(projectFileAbsolutePath)
    let outputPath = path.join(
      exportsPath,
      util.dashed(basename + ' Exported ' + moment().format('YYYY-MM-DD hh.mm.ss'))
    )
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath)
    }

    let data = await exporterFcp.generateFinalCutProData(boardData, { projectFileAbsolutePath, outputPath })
    let xml = exporterFcp.generateFinalCutProXml(data)
    fs.writeFileSync(path.join(outputPath, util.dashed(basename + '.xml')), xml)

    let fcpxData = await exporterFcpX.generateFinalCutProXData(boardData, { projectFileAbsolutePath, outputPath })
    let fcpxml = exporterFcpX.generateFinalCutProXXml(fcpxData)
    fs.writeFileSync(path.join(outputPath, util.dashed(basename + '.fcpxml')), fcpxml)

    // export ALL layers of each one of the boards
    let basenameWithoutExt = path.basename(projectFileAbsolutePath, path.extname(projectFileAbsolutePath))
    let writers = boardData.boards.map(async (board, index) => {
      let filenameForExport = util.dashed(boardFilenameForExport(board, index, basenameWithoutExt))

      await exportFlattenedBoard(
        board,
        filenameForExport,
        boardFileImageSize(boardData),
        projectFileAbsolutePath,
        outputPath
      )
    })
    await Promise.all(writers)

    // export ALL audio
    boardData.boards.forEach((board, index) => {
      if (board.audio && board.audio.filename && board.audio.filename.length) {
        fs.copySync(
          path.join(path.dirname(projectFileAbsolutePath), 'images', board.audio.filename),
          path.join(outputPath, board.audio.filename)
        )
      }
    })

    return outputPath
  }
 
  exportPDF (boardData, projectFileAbsolutePath, _paperSize, _paperOrientation, _rows, _cols, _spacing, _filepath, shouldWatermark = false, watermarkImagePath = undefined, watermarkDimensions = []) {
    return new Promise((resolve, reject) => {
      let outputPath = app.getPath('temp')

      let basenameWithoutExt = path.basename(projectFileAbsolutePath, path.extname(projectFileAbsolutePath))

      boardData.boards.forEach((board, index) => {
        let from = path.join(path.dirname(projectFileAbsolutePath), 'images', boardFilenameForPosterFrame(board))
        let to = path.join(outputPath, `board-` + index + '.jpg')
        try {
          if (!fs.existsSync(from)) throw new Error('Missing posterframe ' + from)

          fs.copySync(from, to)
        } catch (err) {
          reject(err)
        }
      })

      try {
        let exportsPath = ensureExportsPathExists(projectFileAbsolutePath)
        let filepath = _filepath ? _filepath : path.join(exportsPath, basenameWithoutExt + ' ' + moment().format('YYYY-MM-DD hh.mm.ss') + '.pdf')
        let paperSize = _paperSize ? _paperSize : 'LTR'
        let paperOrientation = _paperOrientation ? _paperOrientation : "landscape"
        let rows = _rows ? _rows : 3
        let cols = _cols ? _cols : 3
        let spacing = _spacing ? _spacing : 10
        exporterPDF.generatePDF(
          paperSize,
          paperOrientation,
          rows,
          cols,
          spacing,
          boardData,
          basenameWithoutExt,
          filepath,
          shouldWatermark,
          watermarkImagePath,
          watermarkDimensions
        )
        resolve(filepath)
      } catch(err) {
        reject(err)
      }
    })
  }

  exportImages (boardData, projectFileAbsolutePath, outputPath = null) {
    return new Promise((resolve, reject) => {
      let exportsPath = ensureExportsPathExists(projectFileAbsolutePath)
      let basename = path.basename(projectFileAbsolutePath)
      if (!outputPath) {
        outputPath = path.join(
          exportsPath,
          basename + ' Images ' + moment().format('YYYY-MM-DD hh.mm.ss')
        )
      }

      if (!fs.existsSync(outputPath)) {
        fs.mkdirSync(outputPath)
      }

      // export ALL layers of each one of the boards
      let writers = []
      let basenameWithoutExt = path.basename(projectFileAbsolutePath, path.extname(projectFileAbsolutePath))
      boardData.boards.forEach((board, index) => {
        writers.push(
          new Promise((resolve, reject) => {
            let filenameForExport = boardFilenameForExport(board, index, basenameWithoutExt)
            exportFlattenedBoard(
              board,
              filenameForExport,
              boardFileImageSize(boardData),
              projectFileAbsolutePath,
              outputPath
            )
            .then(() => resolve())
            .catch(err => reject(err))
          })
        )
      })

      Promise.all(writers).then(() => {
        resolve(outputPath)
      }).catch(err => {
        reject(err)
      })
    })
  }

  async exportAnimatedGif (boards, boardSize, destWidth, projectFileAbsolutePath, mark, boardData, watermarkSrc = './img/watermark.png', customFilename = null) {
    console.log(`[Exporter.exportAnimatedGif] Board size:`, boardSize)
    console.log(`[Exporter.exportAnimatedGif] Dest width:`, destWidth)
    
    // Validate board size
    if (!boardSize || !boardSize.width || !boardSize.height || boardSize.height === 0) {
      console.error(`[Exporter.exportAnimatedGif] Invalid board size:`, boardSize)
      // Use default size if board size is invalid
      boardSize = { width: 1920, height: 1080 }
      console.log(`[Exporter.exportAnimatedGif] Using default board size:`, boardSize)
    }
    
    let aspect = boardSize.height / boardSize.width
    let destSize = {
      width: destWidth,
      height: Math.floor(destWidth * aspect)
    }
    
    console.log(`[Exporter.exportAnimatedGif] Aspect ratio:`, aspect)
    console.log(`[Exporter.exportAnimatedGif] Dest size:`, destSize)
    
    // Validate dest size
    if (destSize.height <= 0) {
      console.error(`[Exporter.exportAnimatedGif] Invalid dest height: ${destSize.height}`)
      destSize.height = Math.floor(destWidth * 0.5625) // 16:9 aspect ratio fallback
      console.log(`[Exporter.exportAnimatedGif] Using fallback height: ${destSize.height}`)
    }
    const fragmentText = (ctx, text, maxWidth) => {
      let words = text.split(' ')
      let lines = []
      let line = ''
      if (ctx.measureText(text).width < maxWidth) {
        return [text]
      }
      while (words.length > 0) {
        while (ctx.measureText(words[0]).width >= maxWidth) {
          var tmp = words[0]
          words[0] = tmp.slice(0, -1)
          if (words.length > 1) {
            words[1] = tmp.slice(-1) + words[1]
          } else {
            words.push(tmp.slice(-1))
          }
        }
        if (ctx.measureText(line + words[0]).width < maxWidth) {
          line += words.shift() + ' '
        } else {
          lines.push(line)
          line = ''
        }
        if (words.length === 0) {
          lines.push(line)
        }
      }
      return lines
    }

    const watermarkImage = await getImage(watermarkSrc)

    // Use high-DPI canvas rendering for crisp quality
    console.log(`[Exporter.exportAnimatedGif] Rendering with high-DPI canvas: ${destSize.width}x${destSize.height}`)
    
    const canvases = await Promise.all(
      boards.map(async (board) =>
        // returns a Promise
        flattenBoardToCanvas(
          board,
          null,
          [destSize.width, destSize.height],
          projectFileAbsolutePath
        )
      )
    )

    let encoder = new GIFEncoder(destSize.width, destSize.height)

    // save in the gifs directory
    let projectDir = path.dirname(projectFileAbsolutePath)
    let gifsPath = path.join(projectDir, 'gifs')
    
    // Create gifs directory if it doesn't exist
    if (!fs.existsSync(gifsPath)) {
      fs.mkdirSync(gifsPath, { recursive: true })
    }
    
    let filepath
    if (customFilename) {
      // Use custom filename (just the group name)
      filepath = path.join(gifsPath, customFilename + '.gif')
    } else {
      // Fallback to original naming for backward compatibility
      let basename = path.basename(projectFileAbsolutePath, path.extname(projectFileAbsolutePath))
      filepath = path.join(
        gifsPath,
        basename + ' ' + moment().format('YYYY-MM-DD HH.mm.ss') + '.gif'
      )
    }

    console.log(`[Exporter.exportAnimatedGif] Exporting GIF to: ${filepath}`)
    console.log(`[Exporter.exportAnimatedGif] Gifs path exists: ${fs.existsSync(gifsPath)}`)
    console.log(`[Exporter.exportAnimatedGif] Project file: ${projectFileAbsolutePath}`)

    try {
      const writeStream = fs.createWriteStream(filepath)
      encoder.createReadStream().pipe(writeStream)
      
      // Handle write stream errors
      writeStream.on('error', (error) => {
        console.error(`[Exporter.exportAnimatedGif] Write stream error:`, error)
        throw error
      })
      
      encoder.start()
      encoder.setRepeat(0) // 0 for repeat, -1 for no-repeat
      encoder.setDelay(boardData.defaultBoardTiming) // frame delay in ms
      encoder.setQuality(10) // image quality. 10 is default.
      
      for (var i = 0; i < boards.length; i++) {
      let canvas = canvases[i]
      let context = canvas.getContext('2d')
      if (mark) {
        let dst = { width: Math.floor(destSize.width / 4), height: Math.floor(destSize.height / 4) }
        let src = { width: watermarkImage.width, height: watermarkImage.height }
        let [x, y, w, h] = util.fitToDst(dst, src)
        if (
          src.width <= dst.width &&
          src.height <= dst.height
        ) {
          context.drawImage(
            watermarkImage,
            destSize.width - watermarkImage.width,
            destSize.height - watermarkImage.height
          )
        } else {
          context.drawImage(
            watermarkImage,
            destSize.width - w,
            destSize.height - h,
            w,
            h
          )
        }
      }
      if (boards[i].dialogue) {
        let text = boards[i].dialogue
        let fontSize = 22
        context.font = '300 ' + fontSize + 'px thicccboi, sans-serif'
        context.textAlign = 'center'
        context.fillStyle = 'white'
        context.miterLimit = 1
        context.lineJoin = 'round'
        context.lineWidth = 4
        let lines = fragmentText(context, text, 450)

        let outlinecanvas = document.createElement('canvas')
        let outlinecontext = outlinecanvas.getContext('2d')
        outlinecanvas.width = destSize.width
        outlinecanvas.height = destSize.height

        lines.forEach((line, i) => {
          let xOffset = (i + 1) * (fontSize + 6) + (destSize.height - ((lines.length + 1) * (fontSize + 6))) - 20
          let textWidth = context.measureText(line).width / 2
          outlinecontext.lineWidth = 15
          outlinecontext.lineCap = 'square'
          outlinecontext.lineJoin = 'round'
          outlinecontext.strokeStyle = 'rgba(0,0,0,1)'
          let padding = 35
          outlinecontext.fillRect((destSize.width / 2) - textWidth - (padding / 2), xOffset - (6) - (padding / 2), textWidth * 2 + padding, padding)
          outlinecontext.strokeRect((destSize.width / 2) - textWidth - (padding / 2), xOffset - (6) - (padding / 2), textWidth * 2 + padding, padding)

          // outlinecontext.beginPath()
          // outlinecontext.moveTo((destWidth/2)-textWidth, xOffset-(6))
          // outlinecontext.lineTo((destWidth/2)+textWidth, xOffset-(6))
          // outlinecontext.stroke()
        })

        context.globalAlpha = 0.5
        context.drawImage(outlinecanvas, 0, 0)
        context.globalAlpha = 1

        lines.forEach((line, i) => {
          let xOffset = (i + 1) * (fontSize + 6) + (destSize.height - ((lines.length + 1) * (fontSize + 6))) - 20
          context.lineWidth = 4
          context.strokeStyle = 'rgba(0,0,0,0.8)'
          context.strokeText(line.trim(), destSize.width / 2, xOffset)
          context.strokeStyle = 'rgba(0,0,0,0.2)'
          context.strokeText(line.trim(), destSize.width / 2, xOffset + 2)
          context.fillText(line.trim(), destSize.width / 2, xOffset)
        })
      }
      let duration
      if (boards[i].duration) {
        duration = boards[i].duration
      } else {
        duration = boardData.defaultBoardTiming
      }
      encoder.setDelay(duration)
      encoder.addFrame(context)
    }
    encoder.finish()
    
    console.log(`[Exporter.exportAnimatedGif] Successfully created GIF: ${filepath}`)
    return filepath
    
    } catch (error) {
      console.error(`[Exporter.exportAnimatedGif] Error creating GIF:`, error)
      throw error
    }
  }

  async exportVideo (scene, sceneFilePath, opts) {
    let outputPath = ensureExportsPathExists(sceneFilePath)

    return await exporterFfmpeg.convertToVideo(
      {
        outputPath,
        sceneFilePath,
        scene,
        progressCallback: opts.progressCallback,
        shouldWatermark: opts.shouldWatermark,
        watermarkImagePath: opts.watermarkImagePath
      }
    )
  }
}

module.exports = new Exporter()
