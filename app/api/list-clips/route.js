import { promises as fs } from 'fs';
import path from 'path';

export async function GET() {
  try {
    const clipsDir = path.join(process.cwd(), 'instagram_posts');
    
    // Check if clips directory exists
    try {
      await fs.access(clipsDir);
    } catch (error) {
      console.log('Clips directory does not exist, creating it...');
      await fs.mkdir(clipsDir, { recursive: true });
              return Response.json({ clips: [] });
    }

    // Read all files in the clips directory
    const files = await fs.readdir(clipsDir);
    
    // Filter for video files and get metadata
    const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
    const clips = [];
    
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (videoExtensions.includes(ext)) {
        const filePath = path.join(clipsDir, file);
        const stats = await fs.stat(filePath);
        
        // Check if metadata file exists
        const videoFileName = path.basename(file, ext);
        const metadataPath = path.join(clipsDir, `${videoFileName}.metadata.json`);
        let hasMetadata = false;
        
        try {
          await fs.access(metadataPath);
          hasMetadata = true;
        } catch (error) {
          // Metadata file doesn't exist
          hasMetadata = false;
        }
        
        clips.push({
          path: `instagram_posts/${file}`,
          name: file,
          size: stats.size,
          modified: stats.mtime.toISOString(),
          hasMetadata
        });
      }
    }

    // Sort by modification date (newest first)
    clips.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());

    return Response.json({ 
      success: true,
      clips: clips 
    });

  } catch (error) {
    console.error('Error listing clips:', error);
    return Response.json({ 
      success: false,
      error: error.message 
    }, { status: 500 });
  }
} 