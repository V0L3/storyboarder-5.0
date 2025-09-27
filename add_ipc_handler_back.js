const fs = require('fs')

const filePath = 'src/js/main.js'
let content = fs.readFileSync(filePath, 'utf8')

// Add IPC handler for board shot names
const ipcHandler = `
// Handle requests for board shot names from enhanced export window
ipcMain.on('get-board-data-for-shot-name', (event, boardIndex) => {
  try {
    console.log(\`[Main] IPC get-board-data-for-shot-name called with boardIndex: \${boardIndex}\`)
    // Get current board data (this should be the same as what getBoardShotName uses)
    if (!boardData || !boardData.boards || boardIndex < 0 || boardIndex >= boardData.boards.length) {
      console.log(\`[Main] Invalid board data or index\`)
      event.returnValue = null
      return
    }

    const board = boardData.boards[boardIndex]
    console.log(\`[Main] Board \${boardIndex} data before updateSceneTiming: shot="\${board.shot}"\`)

    // Call updateSceneTiming to ensure shot numbers are current (same as getBoardShotName)
    updateSceneTiming()

    console.log(\`[Main] Board \${boardIndex} data after updateSceneTiming: shot="\${board.shot}"\`)

    event.returnValue = {
      shot: board.shot,
      number: board.number,
      newShot: board.newShot
    }

    console.log(\`[Main] Returning board data: shot="\${board.shot}"\`)
  } catch (e) {
    console.error('[Main] Error getting board data for shot name:', e)
    event.returnValue = null
  }
})

`

// Insert before the language handlers
const insertPoint = `ipcMain.on('languageChanged', (event, lng) => {`
const newContent = content.replace(insertPoint, ipcHandler + insertPoint)
fs.writeFileSync(filePath, newContent)
console.log('Added IPC handler for board shot names back')




