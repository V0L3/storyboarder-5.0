# Enhanced Export System for Storyboarder

This document describes the new enhanced export functionality added to Storyboarder, which provides advanced layout customization, GIF grouping, and improved PDF generation capabilities.

## Features Overview

### 1. Custom Export Layouts
- **Visual Layout Editor**: Drag-and-drop interface for creating custom column layouts
- **Preset Templates**: Pre-built layouts (Standard, Detailed, Compact) that can be customized
- **Flexible Columns**: Support for cut numbers, images, notes, dialogue, action, timing, filenames, and custom fields
- **Real-time Preview**: See your layout changes instantly

### 2. GIF Grouping System
- **Board Grouping**: Select multiple boards to create animated GIF sequences
- **Visual Indicators**: Color-coded groups in timeline with link icons
- **Keyboard Shortcuts**: Ctrl+G to create groups from selected boards
- **Group Management**: Edit, preview, and export individual GIF groups

### 3. Enhanced PDF Export
- **Custom Fields**: Add project-specific fields like focal length, camera angles, etc.
- **Filename Display**: Show imported image filenames as overlays or in separate columns
- **Embedded GIFs**: Include animated sequences directly in PDF documents
- **Advanced Settings**: Quality options, watermarks, paper sizes, and orientations

### 4. Content Customization
- **Selective Export**: Choose which fields to include in exports
- **Custom Sections**: Add user-defined fields for project-specific information
- **File Management**: Optional filename display with multiple positioning options

## File Structure

```
src/
├── js/
│   ├── models/
│   │   └── export-layout.js          # Layout and GIF group data models
│   ├── components/
│   │   ├── LayoutEditor.js           # Visual layout editor component
│   │   ├── GifGroupManager.js        # GIF grouping functionality
│   │   └── EnhancedExportDialog.js   # Main export dialog
│   ├── exporters/
│   │   └── enhanced-pdf.js           # Enhanced PDF generator
│   ├── integration/
│   │   └── export-integration.js     # Integration with existing codebase
│   └── demo/
│       └── enhanced-export-demo.js   # Demo and testing utilities
└── css/
    ├── enhanced-export-dialog.css    # Main dialog styles
    ├── gif-grouping.css              # GIF grouping UI styles
    └── layout-editor.css             # Layout editor styles
```

## Usage Instructions

### Accessing Enhanced Export

1. **From Menu**: File → Enhanced Export... (Ctrl+Shift+E)
2. **From Toolbar**: Use the existing Print PDF button (now enhanced)

### Creating Custom Layouts

1. Open the Enhanced Export dialog
2. Go to the "Layout" tab
3. Click "Customize Layout" to open the visual editor
4. Drag columns to reorder them
5. Adjust column widths with the input controls
6. Add new columns with the "+ Add Column" button
7. Save your custom layout

### Creating GIF Groups

1. **Method 1 - Selection Mode**:
   - Click the GIF group button in the toolbar
   - Select boards by clicking on them
   - Click "Create Group" when done

2. **Method 2 - Keyboard Shortcut**:
   - Select boards in the timeline
   - Press Ctrl+G
   - Enter a group name

3. **Method 3 - GIF Panel**:
   - Open the GIF Groups panel
   - Click "+ New Group"
   - Select boards from the dialog

### Customizing Export Content

1. Go to the "Content" tab in the export dialog
2. Check/uncheck fields to include
3. Configure filename display options
4. Add custom fields as needed

### Configuring GIF Settings

1. Go to the "GIFs" tab
2. Select which GIF groups to include
3. Adjust frame duration and quality settings
4. Set maximum width for GIF output

## Technical Implementation

### Data Models

**ExportLayoutManager**: Manages layout templates, custom fields, and GIF groups
- `getLayouts()`: Returns available layout templates
- `createLayout(name, baseLayout)`: Creates new custom layout
- `createGifGroup(name, boardIndices)`: Creates new GIF group
- `addCustomField(name, defaultValue)`: Adds custom field definition

**Layout Structure**:
```javascript
{
  name: "Layout Name",
  columns: [
    {
      id: "unique-id",
      type: "column-type",
      width: 150,
      label: "Display Label"
    }
  ],
  spacing: 15,
  orientation: "landscape",
  paperSize: "A4"
}
```

### Column Types

- `cut-number`: Sequential board numbering
- `image`: Main storyboard drawings
- `notes`: Board notes and annotations
- `dialogue`: Character dialogue
- `action`: Action descriptions
- `talks`: Combined dialogue/sound notes
- `time`: Board duration/timing
- `filename`: Image filenames
- `custom-field`: User-defined fields

### GIF Group Structure

```javascript
{
  id: "group-id",
  name: "Group Name",
  boardIndices: [0, 1, 2],
  color: "#FF6B6B",
  createdAt: timestamp
}
```

## Integration Points

### Menu Integration
- Added "Enhanced Export..." menu item with Ctrl+Shift+E shortcut
- Replaced existing PDF export to use enhanced system

### IPC Communication
- `exportEnhancedPDF`: Main export command
- Event handlers in both main and renderer processes

### Data Persistence
- Layout configurations saved to user preferences
- GIF groups stored with project data
- Custom fields preserved in board data

## API Reference

### EnhancedExportDialog

```javascript
const dialog = new EnhancedExportDialog(boardData, boardFilename, options)
dialog.show()
```

**Options**:
- `onClose`: Callback when dialog closes
- `onExport`: Callback when export starts
- `layoutManager`: Custom layout manager instance

### GifGroupManager

```javascript
const manager = new GifGroupManager(layoutManager, boardData, options)
manager.createGroupFromSelection()
manager.updateTimelineDisplay()
```

### Enhanced PDF Export

```javascript
const config = layoutManager.getExportConfig(layoutId, options)
const outputPath = await generateEnhancedPDF(config, boardData, projectPath, outputPath)
```

## Keyboard Shortcuts

- **Ctrl+Shift+E**: Open Enhanced Export dialog
- **Ctrl+G**: Create GIF group from selected boards
- **Escape**: Cancel grouping mode or close dialogs

## Browser Compatibility

The enhanced export system uses modern JavaScript features and CSS:
- ES6+ modules and async/await
- CSS Grid and Flexbox
- HTML5 drag and drop API
- Canvas API for image processing

## Performance Considerations

- Layout calculations are optimized for real-time preview
- GIF generation is done asynchronously with progress indicators
- Large board counts are handled with pagination and virtualization
- Memory usage is minimized through efficient data structures

## Future Enhancements

Potential areas for expansion:
1. **Advanced GIF Controls**: Frame interpolation, easing animations
2. **Template Sharing**: Import/export layout templates
3. **Batch Processing**: Export multiple projects with same settings
4. **Integration APIs**: Third-party plugin system
5. **Cloud Sync**: Save layouts and groups to cloud storage

## Troubleshooting

### Common Issues

1. **Export Dialog Not Opening**:
   - Check browser console for JavaScript errors
   - Ensure all CSS files are loaded
   - Verify integration is properly initialized

2. **GIF Groups Not Visible**:
   - Check if boards are properly selected
   - Verify GIF group manager is initialized
   - Look for timeline update calls

3. **PDF Generation Errors**:
   - Ensure all required images exist
   - Check file permissions for output directory
   - Verify PDFKit dependencies are available

### Debug Mode

Enable debug mode by setting:
```javascript
window.ENHANCED_EXPORT_DEBUG = true
```

This will show additional logging and visual indicators for troubleshooting.

## Testing

Use the demo script for testing:

```javascript
// In browser console:
const demo = require('./src/js/demo/enhanced-export-demo')
demo.runAllTests()

// Or access via window object:
window.EnhancedExportDemo.showExportDialog()
```

## Contributing

When contributing to the enhanced export system:

1. Follow existing code style and patterns
2. Add comprehensive comments for complex logic
3. Include unit tests for new functionality
4. Update this documentation for new features
5. Test across different screen sizes and export scenarios

## License

This enhanced export system is part of Storyboarder and follows the same licensing terms as the main project.