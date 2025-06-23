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
    const fileName = path.basename(fullPath);

    // Create a readable stream
    const stream = createReadStream(fullPath);

    return new Response(stream as any, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': stat.size.toString(),
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });

  } catch (error) {
    console.error('Download error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
} 