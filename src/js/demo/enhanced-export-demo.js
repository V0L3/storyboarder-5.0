// Demo script for Enhanced Export functionality
// This can be used for testing the enhanced export features

const EnhancedExportDialog = require('../components/EnhancedExportDialog')
const GifGroupManager = require('../components/GifGroupManager')
const { ExportLayoutManager } = require('../models/export-layout')

// Mock board data for testing
const mockBoardData = {
  aspectRatio: 16/9,
  fps: 24,
  defaultBoardTiming: 2000,
  boards: [
    {
      uid: 'board1',
      url: 'board-1-abc123.png',
      newShot: true,
      shot: '1A',
      time: 0,
      duration: 2000,
      dialogue: 'Hello, this is the first line of dialogue.',
      action: 'Character enters the scene.',
      notes: 'Important establishing shot'
    },
    {
      uid: 'board2',
      url: 'board-2-def456.png',
      newShot: false,
      shot: '1B',
      time: 2000,
      duration: 1500,
      dialogue: 'And this is the second line.',
      action: 'Camera pans to follow character.',
      notes: 'Medium shot'
    },
    {
      uid: 'board3',
      url: 'board-3-ghi789.png',
      newShot: true,
      shot: '2A',
      time: 3500,
      duration: 3000,
      dialogue: 'This is a longer line of dialogue that should wrap nicely.',
      action: 'Character sits down and looks thoughtful.',
      notes: 'Close-up for emotional impact'
    },
    {
      uid: 'board4',
      url: 'board-4-jkl012.png',
      newShot: false,
      shot: '2B',
      time: 6500,
      duration: 2500,
      dialogue: '',
      action: 'Wide shot of the entire room.',
      notes: 'Establishing the space'
    },
    {
      uid: 'board5',
      url: 'board-5-mno345.png',
      newShot: true,
      shot: '3A',
      time: 9000,
      duration: 1800,
      dialogue: 'Final line of dialogue.',
      action: 'Character exits.',
      notes: 'End of scene'
    }
  ]
}

// Demo functions
const demoFunctions = {
  // Initialize the layout manager with demo data
  initLayoutManager() {
    const layoutManager = new ExportLayoutManager()
    
    // Add some custom fields
    layoutManager.addCustomField('Focal Length', '50mm', 'text')
    layoutManager.addCustomField('Camera Angle', 'Eye Level', 'select')
    layoutManager.addCustomField('Lighting', 'Natural', 'text')
    
    // Create some GIF groups
    layoutManager.createGifGroup('Opening Sequence', [0, 1])
    layoutManager.createGifGroup('Character Introduction', [2, 3, 4])
    
    return layoutManager
  },

  // Show the enhanced export dialog
  showExportDialog() {
    const dialog = EnhancedExportDialog.show(
      mockBoardData, 
      '/demo/storyboard.storyboarder',
      {
        onClose: () => {
          console.log('Export dialog closed')
        }
      }
    )
    
    return dialog
  },

  // Initialize GIF group manager
  initGifGroupManager() {
    const layoutManager = this.initLayoutManager()
    
    const gifManager = new GifGroupManager(layoutManager, mockBoardData, {
      onGroupCreated: (group) => {
        console.log('Demo: GIF group created:', group)
      },
      onGroupDeleted: (groupId) => {
        console.log('Demo: GIF group deleted:', groupId)
      }
    })
    
    return gifManager
  },

  // Test layout creation and modification
  testLayoutOperations() {
    const layoutManager = this.initLayoutManager()
    
    console.log('Default layouts:', Object.keys(layoutManager.getLayouts()))
    
    // Create a custom layout
    const customLayout = layoutManager.createLayout('Demo Layout', 'detailed')
    console.log('Created custom layout:', customLayout)
    
    // Add a custom column
    layoutManager.addColumnToLayout(customLayout.id, {
      type: 'custom-field',
      label: 'Shot Type',
      width: 100
    })
    
    console.log('Updated layout:', layoutManager.getLayout(customLayout.id))
    
    // Test column reordering
    layoutManager.reorderColumns(customLayout.id, 0, 2)
    console.log('After reordering:', layoutManager.getLayout(customLayout.id))
    
    return layoutManager
  },

  // Test export configuration generation
  testExportConfig() {
    const layoutManager = this.initLayoutManager()
    
    const config = layoutManager.getExportConfig('detailed', {
      showFilenames: true,
      filenameLocation: 'overlay',
      includeGifs: true,
      watermark: true
    })
    
    console.log('Export configuration:', config)
    return config
  },

  // Test the enhanced PDF generation (mock)
  async testPDFGeneration() {
    const layoutManager = this.initLayoutManager()
    const config = this.testExportConfig()
    
    try {
      // This would normally call the actual PDF generator
      console.log('Mock PDF generation with config:', config)
      console.log('Board data:', mockBoardData)
      
      // Simulate async PDF generation
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      console.log('Mock PDF generated successfully')
      return '/demo/output/storyboard-export.pdf'
      
    } catch (error) {
      console.error('Mock PDF generation failed:', error)
      throw error
    }
  },

  // Run all demo tests
  async runAllTests() {
    console.log('=== Enhanced Export Demo Tests ===')
    
    try {
      console.log('\n1. Testing Layout Manager...')
      const layoutManager = this.testLayoutOperations()
      
      console.log('\n2. Testing Export Configuration...')
      const config = this.testExportConfig()
      
      console.log('\n3. Testing PDF Generation...')
      const outputPath = await this.testPDFGeneration()
      
      console.log('\n4. Testing GIF Group Manager...')
      const gifManager = this.initGifGroupManager()
      
      console.log('\n=== All tests completed successfully ===')
      
      return {
        layoutManager,
        config,
        outputPath,
        gifManager
      }
      
    } catch (error) {
      console.error('Demo test failed:', error)
      throw error
    }
  }
}

// Export for use in browser console or testing
if (typeof window !== 'undefined') {
  window.EnhancedExportDemo = demoFunctions
}

module.exports = demoFunctions