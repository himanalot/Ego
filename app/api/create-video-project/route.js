import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST(request) {
  try {
    const { videoPath, storyText, founderName } = await request.json();
    
    if (!videoPath || !storyText) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    console.log('🎬 Creating video project for:', videoPath);
    
    // Generate unique timestamp for this project
    const timestamp = Date.now();
    const projectName = `project_${timestamp}`;
    
    // Create project directory
    const projectDir = path.join(process.cwd(), 'video_projects', projectName);
    if (!fs.existsSync(path.dirname(projectDir))) {
      fs.mkdirSync(path.dirname(projectDir), { recursive: true });
    }
    fs.mkdirSync(projectDir, { recursive: true });
    
    // Copy original video to project
    const originalVideoPath = path.join(process.cwd(), videoPath);
    const projectVideoPath = path.join(projectDir, 'source_video.mp4');
    fs.copyFileSync(originalVideoPath, projectVideoPath);
    
    // Create interactive project file
    const projectData = {
      version: "1.0",
      created: new Date().toISOString(),
      name: projectName,
      founderName: founderName || 'Unknown Founder',
      
      // Video layer settings (matches create-instagram-post.js exactly)
      videoLayer: {
        type: 'video',
        source: 'source_video.mp4',
        // Canvas dimensions
        canvasWidth: 1080,
        canvasHeight: 1920,
        // Video scaling (95% of canvas width for margins)
        targetWidth: Math.floor(1080 * 0.95), // 1026
        targetHeight: Math.floor((1080 * 0.95) * 9 / 16), // 577 (16:9 ratio)
        // Positioning
        x: (1080 - Math.floor(1080 * 0.95)) / 2, // Centered horizontally
        y: 1920 - Math.floor((1080 * 0.95) * 9 / 16) - 100, // Bottom margin of 100px
        // Styling
        backgroundColor: '#000000',
        cornerRadius: 40,
        videoBottomMargin: 100
      },
      
      // Text layers (editable)
      textLayers: [
        {
          id: 'main-text',
          type: 'text',
          content: storyText,
          x: 108, // 10% of 1080
          y: 288, // 15% of 1920  
          width: 864, // 80% of 1080
          height: 576, // 30% of 1920
          fontSize: 50,
          fontFamily: 'NimbusSans-Bold',
          color: '#FFFFFF',
          backgroundColor: 'rgba(0,0,0,0.7)',
          textAlign: 'left',
          verticalAlign: 'top',
          lineHeight: 1.2,
          padding: 20,
          borderRadius: 10,
          wordWrap: true,
          markdown: true // Support **bold** and *italic*
        }
      ],
      
      // Canvas settings
      canvas: {
        width: 1080,
        height: 1920,
        backgroundColor: '#000000',
        fps: 30
      },
      
      // Export settings
      export: {
        format: 'mp4',
        quality: 'high',
        codec: 'h264'
      }
    };
    
    // Save project file
    const projectFilePath = path.join(projectDir, 'project.json');
    fs.writeFileSync(projectFilePath, JSON.stringify(projectData, null, 2));
    
    // Generate the MP4 video (rendered version)
    const outputVideoPath = path.join(projectDir, 'rendered_video.mp4');
    await renderProjectToVideo(projectData, projectDir, outputVideoPath);
    
    // Create a reference in the main instagram_posts directory
    const referenceFile = path.join(process.cwd(), 'instagram_posts', `${projectName}.project`);
    fs.writeFileSync(referenceFile, JSON.stringify({
      projectPath: projectDir,
      projectFile: projectFilePath,
      renderedVideo: outputVideoPath,
      created: new Date().toISOString()
    }));
    
    return NextResponse.json({
      success: true,
      projectName,
      projectPath: projectDir,
      projectFile: projectFilePath,
      renderedVideo: outputVideoPath,
      message: 'Video project created successfully'
    });
    
  } catch (error) {
    console.error('❌ Error creating video project:', error);
    return NextResponse.json({ 
      error: 'Failed to create video project',
      details: error.message 
    }, { status: 500 });
  }
}

// Function to render project to MP4
async function renderProjectToVideo(projectData, projectDir, outputPath) {
  try {
    console.log('🎨 Rendering project to video...');
    
    // Create text overlay image using Canvas (similar to existing script)
    const { createCanvas } = await import('canvas');
    const canvas = createCanvas(projectData.canvas.width, projectData.canvas.height);
    const ctx = canvas.getContext('2d');
    
    // Clear canvas with background color
    ctx.fillStyle = projectData.canvas.backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Render each text layer
    for (const textLayer of projectData.textLayers) {
      ctx.save();
      
      // Set text properties
      ctx.font = `${textLayer.fontSize}px ${textLayer.fontFamily}`;
      ctx.fillStyle = textLayer.color;
      ctx.textAlign = textLayer.textAlign || 'left';
      
      // Draw background if specified
      if (textLayer.backgroundColor && textLayer.backgroundColor !== 'transparent') {
        ctx.fillStyle = textLayer.backgroundColor;
        ctx.fillRect(textLayer.x, textLayer.y, textLayer.width, textLayer.height);
      }
      
      // Process markdown and draw text
      ctx.fillStyle = textLayer.color;
      const lines = processMarkdownText(textLayer.content, textLayer.fontSize);
      let currentY = textLayer.y + textLayer.padding + textLayer.fontSize;
      
      for (const line of lines) {
        ctx.font = `${line.bold ? 'bold' : 'normal'} ${line.italic ? 'italic' : 'normal'} ${textLayer.fontSize}px ${textLayer.fontFamily}`;
        ctx.fillText(line.text, textLayer.x + textLayer.padding, currentY);
        currentY += textLayer.fontSize * textLayer.lineHeight;
      }
      
      ctx.restore();
    }
    
    // Save text overlay as PNG
    const overlayPath = path.join(projectDir, 'text_overlay.png');
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(overlayPath, buffer);
    
    // Use FFmpeg to combine video and text overlay with proper rounded corners
    const videoSource = path.join(projectDir, 'source_video.mp4');
    const videoLayer = projectData.videoLayer;
    
    const ffmpegCommand = `ffmpeg -i "${videoSource}" -i "${overlayPath}" -y -filter_complex "` +
      `color=${videoLayer.backgroundColor}:size=${videoLayer.canvasWidth}x${videoLayer.canvasHeight}[bg];` +
      `[0:v]scale=${videoLayer.targetWidth}:${videoLayer.targetHeight}[scaled_video];` +
      `[scaled_video]format=rgba[video_with_alpha];` +
      `[video_with_alpha]geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if( \\` +
        `lt(X,${videoLayer.cornerRadius})*lt(Y,${videoLayer.cornerRadius})*gt(pow(X-${videoLayer.cornerRadius},2)+pow(Y-${videoLayer.cornerRadius},2),pow(${videoLayer.cornerRadius},2)),0,if( \\` +
        `gt(X,W-${videoLayer.cornerRadius})*lt(Y,${videoLayer.cornerRadius})*gt(pow(X-(W-${videoLayer.cornerRadius}),2)+pow(Y-${videoLayer.cornerRadius},2),pow(${videoLayer.cornerRadius},2)),0,if( \\` +
        `lt(X,${videoLayer.cornerRadius})*gt(Y,H-${videoLayer.cornerRadius})*gt(pow(X-${videoLayer.cornerRadius},2)+pow(Y-(H-${videoLayer.cornerRadius}),2),pow(${videoLayer.cornerRadius},2)),0,if( \\` +
        `gt(X,W-${videoLayer.cornerRadius})*gt(Y,H-${videoLayer.cornerRadius})*gt(pow(X-(W-${videoLayer.cornerRadius}),2)+pow(Y-(H-${videoLayer.cornerRadius}),2),pow(${videoLayer.cornerRadius},2)),0,255))))'[rounded_video];` +
      `[bg][rounded_video]overlay=(W-w)/2:H-h-${videoLayer.videoBottomMargin}[video_on_canvas];` +
      `[video_on_canvas][1:v]overlay=0:0[final]" ` +
      `-map "[final]" -map 0:a? -c:v libx264 -c:a aac -preset medium -crf 23 -pix_fmt yuv420p -r 30 -shortest "${outputPath}"`;
    
    console.log('🎬 FFmpeg command:', ffmpegCommand);
    await execAsync(ffmpegCommand);
    
    console.log('✅ Video rendered successfully');
    
  } catch (error) {
    console.error('❌ Error rendering video:', error);
    throw error;
  }
}

// Helper function to process markdown text
function processMarkdownText(text, fontSize) {
  const lines = [];
  const textLines = text.split('\n');
  
  for (const line of textLines) {
    if (line.trim() === '') {
      lines.push({ text: '', bold: false, italic: false });
      continue;
    }
    
    // Simple markdown processing
    let processedLine = line;
    let bold = false;
    let italic = false;
    
    // Check for bold
    if (processedLine.includes('**')) {
      bold = true;
      processedLine = processedLine.replace(/\*\*(.*?)\*\*/g, '$1');
    }
    
    // Check for italic
    if (processedLine.includes('*')) {
      italic = true;
      processedLine = processedLine.replace(/\*(.*?)\*/g, '$1');
    }
    
    lines.push({ text: processedLine, bold, italic });
  }
  
  return lines;
} 