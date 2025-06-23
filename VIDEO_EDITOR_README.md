# Video Text Editor

The Video Text Editor allows you to edit text overlays on existing video clips in real-time without regenerating the entire video pipeline.

## How to Use

1. **Access the Editor**: Go to `/video-editor` or click the "✏️ Edit Video Text" button on the main page.

2. **Select a Video Clip**: 
   - Choose from available clips in the dropdown
   - Click "Refresh Clips" to update the list

3. **Edit Text**:
   - Enter your story text in the textarea
   - Aim for 600-630 characters for optimal video formatting
   - Real-time character/word count is displayed
   - Text auto-saves 1 second after you stop typing

4. **Style Options**:
   - Toggle bold/italic formatting as needed
   - Use markdown formatting in text (**bold**, *italic*)

5. **Preview & Download**:
   - Video preview updates automatically
   - Download button appears when video is ready
   - Videos are saved with timestamps to avoid conflicts

## Features

- **Real-time editing**: Changes apply automatically with 1-second debounce
- **Character validation**: Visual feedback for optimal length (700-730 chars)
- **Auto-save**: No need to manually trigger updates
- **Instant preview**: See your changes immediately
- **Download ready**: Get Instagram-format videos instantly

## Technical Details

- Uses the existing `create-instagram-post.js` script
- Outputs videos to the `instagram_posts/` directory with `edited_` prefix
- Supports all video formats (.mp4, .mov, .avi, .mkv, .webm)
- Instagram format: 1080x1920 (9:16 aspect ratio)

## File Structure

```
instagram_posts/
├── video_XnbCSboujF4_clip_1_instagram_text.mp4    # Original generated videos
├── video_2Nd33eVmDhM_clip_1_instagram_text.mp4    # From main pipeline
├── edited_1234567890.mp4                          # Edited versions (timestamped)
└── ...
```

The editor creates new files for each edit to preserve originals and avoid conflicts. 