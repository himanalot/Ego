import { NextRequest } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export async function POST(req: NextRequest) {
  try {
    const { youtubeUrl } = await req.json();

    if (!youtubeUrl) {
      return new Response('YouTube URL is required', { status: 400 });
    }

    // Create a streaming response
    const stream = new ReadableStream({
      start(controller) {
        const scriptPath = path.join(process.cwd(), 'scripts', 'process-video.js');
        const child = spawn('node', [scriptPath, youtubeUrl], {
          env: { ...process.env, OPENAI_API_KEY: process.env.OPENAI_API_KEY }
        });

        const sendProgress = (message: string) => {
          const data = JSON.stringify({ type: 'progress', message }) + '\n';
          controller.enqueue(new TextEncoder().encode(data));
        };

        const sendError = (message: string) => {
          const data = JSON.stringify({ type: 'error', message }) + '\n';
          controller.enqueue(new TextEncoder().encode(data));
        };

        const sendClips = (clips: any[]) => {
          const data = JSON.stringify({ type: 'clips', clips }) + '\n';
          controller.enqueue(new TextEncoder().encode(data));
        };

        child.stdout?.on('data', (data) => {
          const output = data.toString();
          console.log('stdout:', output);
          
          // Parse different types of output
          if (output.includes('📥 Downloading')) {
            sendProgress('Downloading video from YouTube...');
          } else if (output.includes('🎬 Extracting frames')) {
            sendProgress('Extracting frames for analysis...');
          } else if (output.includes('🎵 Extracting audio')) {
            sendProgress('Extracting audio track...');
          } else if (output.includes('🗣️ Detecting speech')) {
            sendProgress('Detecting speech segments...');
          } else if (output.includes('🔍 Finding best clips')) {
            sendProgress('Analyzing frames with AI...');
          } else if (output.includes('✂️ Extracting clip')) {
            sendProgress('Extracting video clips...');
          } else if (output.includes('🎉 Processing complete')) {
            sendProgress('Processing complete! Preparing results...');
          }
        });

        child.stderr?.on('data', (data) => {
          console.error('stderr:', data.toString());
        });

        child.on('close', (code) => {
          if (code === 0) {
            // Success - try to read the results
            try {
              const fs = require('fs');
              const processedDir = path.join(process.cwd(), 'processed_videos');
              
              if (fs.existsSync(processedDir)) {
                const files = fs.readdirSync(processedDir);
                const clips = files
                  .filter((file: string) => file.endsWith('.mp4'))
                  .map((file: string, index: number) => ({
                    path: path.join('processed_videos', file),
                    start: 0, // These would come from actual processing
                    end: 30,
                    duration: 30,
                    score: 8.5 - (index * 0.5) // Mock scoring for demo
                  }));
                
                sendClips(clips);
              } else {
                sendError('No clips were generated');
              }
            } catch (error) {
              sendError('Error reading results');
            }
          } else {
            sendError(`Process failed with code ${code}`);
          }
          
          controller.close();
        });

        child.on('error', (error) => {
          console.error('Process error:', error);
          sendError(`Process error: ${error.message}`);
          controller.close();
        });
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('API Error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
} 