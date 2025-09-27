const fs = require('fs')

const filePath = 'src/js/components/VideoGroupManager.js'
let content = fs.readFileSync(filePath, 'utf8')

// Replace the getShotNumberForBoard function with IPC version
const oldFunction = `  getShotNumberForBoard(boardIndex) {
    console.log(\`[VideoGroupManager.getShotNumberForBoard] Called with boardIndex: \${boardIndex}\`)
    
    // Use the canonical helper from main window to ensure parity with export/UI
    if (typeof window !== 'undefined' && typeof window.getBoardShotName === 'function') {
      console.log(\`[VideoGroupManager.getShotNumberForBoard] Calling window.getBoardShotName(\${boardIndex})\`)
      const shot = window.getBoardShotName(boardIndex)
      console.log(\`[VideoGroupManager.getShotNumberForBoard] window.getBoardShotName returned: "\${shot}"\`)
      if (shot) return shot
    } else {
      console.log(\`[VideoGroupManager.getShotNumberForBoard] window.getBoardShotName not available\`)
    }

    // Fallback: use export-equivalent logic
    if (typeof window !== 'undefined' && window.boardData && window.boardData.boards) {
      console.log(\`[VideoGroupManager.getShotNumberForBoard] Using fallback logic\`)
      const boards = window.boardData.boards
      if (boardIndex >= 0 && boardIndex < boards.length) {
        const board = boards[boardIndex]
        const shotNumber = (boardIndex + 1).toString().padStart(2, '0')
        const result = board && board.shot ? board.shot : shotNumber
        console.log(\`[VideoGroupManager.getShotNumberForBoard] Fallback result: "\${result}"\`)
        return result
      }
    }

    // Final fallback: try UI
    const thumbnail = document.querySelector(\`[data-thumbnail="\${boardIndex}"]\`)
    if (thumbnail) {
      const shotText = thumbnail.querySelector('.shot-number, .board-number')
      if (shotText && shotText.textContent) {
        const result = shotText.textContent.trim()
        console.log(\`[VideoGroupManager.getShotNumberForBoard] UI fallback result: "\${result}"\`)
        return result
      }
    }
    
    const finalResult = \`Board \${boardIndex + 1}\`
    console.log(\`[VideoGroupManager.getShotNumberForBoard] Final fallback result: "\${finalResult}"\`)
    return finalResult
  }`

const newFunction = `  getShotNumberForBoard(boardIndex) {
    console.log(\`[VideoGroupManager.getShotNumberForBoard] Called with boardIndex: \${boardIndex}\`)

    // Request board data from main process via IPC
    try {
      const { ipcRenderer } = require('electron')
      console.log(\`[VideoGroupManager.getShotNumberForBoard] Making IPC call to main process...\`)
      const boardData = ipcRenderer.sendSync('get-board-data-for-shot-name', boardIndex)
      console.log(\`[VideoGroupManager.getShotNumberForBoard] IPC returned:\`, boardData)

      if (boardData && boardData.shot) {
        console.log(\`[VideoGroupManager.getShotNumberForBoard] IPC returned shot: "\${boardData.shot}"\`)
        return boardData.shot
      } else {
        console.log(\`[VideoGroupManager.getShotNumberForBoard] IPC returned null/empty shot\`)
      }
    } catch (e) {
      console.error(\`[VideoGroupManager.getShotNumberForBoard] IPC failed:\`, e)
    }

    // Fallback: try UI elements
    const thumbnail = document.querySelector(\`[data-thumbnail="\${boardIndex}"]\`)
    if (thumbnail) {
      const shotText = thumbnail.querySelector('.shot-number, .board-number, .shot')
      if (shotText && shotText.textContent) {
        const result = shotText.textContent.trim()
        console.log(\`[VideoGroupManager.getShotNumberForBoard] UI fallback result: "\${result}"`)
        return result
      }
    }

    // Absolute fallback
    const finalResult = \`Board \${boardIndex + 1}\`
    console.log(\`[VideoGroupManager.getShotNumberForBoard] Final fallback result: "\${finalResult}"\`)
    return finalResult
  }`

const newContent = content.replace(oldFunction, newFunction)
fs.writeFileSync(filePath, newContent)
console.log('Updated VideoGroupManager to use IPC for shot names')




