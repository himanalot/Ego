import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request, { params }) {
  try {
    const filePath = params.path.join('/');
    const fullPath = path.join(process.cwd(), 'video_projects', filePath);
    
    // Security check - ensure the path is within the video_projects directory
    const normalizedPath = path.normalize(fullPath);
    const projectsDir = path.join(process.cwd(), 'video_projects');
    
    if (!normalizedPath.startsWith(projectsDir)) {
      return new NextResponse('Forbidden', { status: 403 });
    }
    
    if (!fs.existsSync(normalizedPath)) {
      return new NextResponse('File not found', { status: 404 });
    }
    
    const stat = fs.statSync(normalizedPath);
    if (!stat.isFile()) {
      return new NextResponse('Not a file', { status: 400 });
    }
    
    // Determine content type based on file extension
    const ext = path.extname(normalizedPath).toLowerCase();
    let contentType = 'application/octet-stream';
    
    switch (ext) {
      case '.mp4':
        contentType = 'video/mp4';
        break;
      case '.png':
        contentType = 'image/png';
        break;
      case '.jpg':
      case '.jpeg':
        contentType = 'image/jpeg';
        break;
      case '.json':
        contentType = 'application/json';
        break;
      case '.txt':
        contentType = 'text/plain';
        break;
    }
    
    // Read and serve the file
    const fileBuffer = fs.readFileSync(normalizedPath);
    
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': stat.size.toString(),
        'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
      },
    });
    
  } catch (error) {
    console.error('Error serving project file:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 