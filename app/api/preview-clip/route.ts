import { NextRequest } from 'next/server';
import { createReadStream, existsSync, statSync } from 'fs';
import path from 'path';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const clipPath = searchParams.get('path');

    if (!clipPath) {
      return new Response('Clip path is required', { status: 400 });
    }

    // Security: ensure the path is within our processed videos directory
    const fullPath = path.resolve(process.cwd(), clipPath);
    const processedDir = path.resolve(process.cwd(), 'processed_videos');
    
    if (!fullPath.startsWith(processedDir)) {
      return new Response('Invalid path', { status: 403 });
    }

    if (!existsSync(fullPath)) {
      return new Response('File not found', { status: 404 });
    }

    const stat = statSync(fullPath);
    const range = req.headers.get('range');

    if (range) {
      // Handle range requests for video streaming
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunksize = (end - start) + 1;
      
      const stream = createReadStream(fullPath, { start, end });
      
      return new Response(stream as any, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize.toString(),
          'Content-Type': 'video/mp4',
        },
      });
    } else {
      // Return the entire file
      const stream = createReadStream(fullPath);
      
      return new Response(stream as any, {
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Length': stat.size.toString(),
          'Accept-Ranges': 'bytes',
        },
      });
    }

  } catch (error) {
    console.error('Preview error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
} 