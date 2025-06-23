import { promises as fs } from 'fs';
import path from 'path';

export async function POST(req) {
  try {
    const { videoPath, textContent, founderName, originalStory } = await req.json();
    
    if (!videoPath || !textContent) {
      return Response.json({ 
        success: false, 
        error: 'Missing videoPath or textContent' 
      }, { status: 400 });
    }

    // Create metadata object
    const metadata = {
      videoPath,
      textContent,
      founderName: founderName || 'Unknown',
      originalStory: originalStory || textContent,
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      version: 1
    };

    // Create metadata filename based on video filename
    const videoFileName = path.basename(videoPath, path.extname(videoPath));
    const metadataPath = path.join(process.cwd(), 'instagram_posts', `${videoFileName}.metadata.json`);
    
    console.log('💾 Saving metadata to:', metadataPath);
    
    // Save metadata file
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    
    return Response.json({
      success: true,
      metadataPath: `instagram_posts/${videoFileName}.metadata.json`,
      metadata
    });

  } catch (error) {
    console.error('❌ Error saving video metadata:', error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const videoPath = searchParams.get('videoPath');
    
    if (!videoPath) {
      return Response.json({ 
        success: false, 
        error: 'Missing videoPath parameter' 
      }, { status: 400 });
    }

    // Create metadata filename based on video filename
    const videoFileName = path.basename(videoPath, path.extname(videoPath));
    const metadataPath = path.join(process.cwd(), 'instagram_posts', `${videoFileName}.metadata.json`);
    
    try {
      const metadataContent = await fs.readFile(metadataPath, 'utf8');
      const metadata = JSON.parse(metadataContent);
      
      return Response.json({
        success: true,
        metadata
      });
    } catch (error) {
      // Metadata file doesn't exist
      return Response.json({
        success: false,
        error: 'Metadata not found'
      }, { status: 404 });
    }

  } catch (error) {
    console.error('❌ Error reading video metadata:', error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
} 