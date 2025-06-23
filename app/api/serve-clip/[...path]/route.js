import { promises as fs } from 'fs';
import path from 'path';

export async function GET(request, { params }) {
  try {
    const { path: filePath } = params;
    const fullPath = path.join(process.cwd(), 'instagram_posts', ...filePath);
    
    // Security check - ensure the path is within the instagram_posts directory
    const clipsDir = path.join(process.cwd(), 'instagram_posts');
    const resolvedPath = path.resolve(fullPath);
    const resolvedClipsDir = path.resolve(clipsDir);
    
    if (!resolvedPath.startsWith(resolvedClipsDir)) {
      return new Response('Forbidden', { status: 403 });
    }
    
    // Check if file exists
    try {
      await fs.access(resolvedPath);
    } catch (error) {
      return new Response('File not found', { status: 404 });
    }
    
    // Read the file
    const fileBuffer = await fs.readFile(resolvedPath);
    const ext = path.extname(resolvedPath).toLowerCase();
    
    // Determine content type
    let contentType = 'application/octet-stream';
    if (ext === '.mp4') contentType = 'video/mp4';
    else if (ext === '.mov') contentType = 'video/quicktime';
    else if (ext === '.avi') contentType = 'video/x-msvideo';
    else if (ext === '.mkv') contentType = 'video/x-matroska';
    else if (ext === '.webm') contentType = 'video/webm';
    
    return new Response(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
        'Content-Length': fileBuffer.length.toString(),
      },
    });
    
  } catch (error) {
    console.error('Error serving clip:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
} 