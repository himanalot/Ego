import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { drawText } from '@/lib/textRenderer';

const execAsync = promisify(exec);

export async function POST(request) {
  try {
    const { projectName, projectData, useSelectedClip } = await request.json();
    
    if (!projectName || !projectData) {
      return NextResponse.json({ error: 'Project name and data are required' }, { status: 400 });
    }
    
    const projectPath = path.join(process.cwd(), 'video_projects', projectName);
    
    if (!fs.existsSync(projectPath)) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    
    console.log('🎬 Rendering video project:', projectName);
    
    if (useSelectedClip && projectData.selectedClip) {
      console.log('🎯 Using selected clip segment:', {
        duration: projectData.selectedClip.duration,
        startTime: projectData.selectedClip.startTime,
        endTime: projectData.selectedClip.endTime
      });
    }
    
    // Generate the MP4 video (rendered version)
    const outputVideoPath = path.join(projectPath, 'rendered_video.mp4');
    await renderProjectToVideo(projectData, projectPath, outputVideoPath, useSelectedClip);
    
    const message = useSelectedClip && projectData.selectedClip 
      ? `Video rendered successfully using selected clip (${projectData.selectedClip.duration}s)`
      : 'Video rendered successfully';
    
    return NextResponse.json({
      success: true,
      outputPath: outputVideoPath,
      message: message
    });
    
  } catch (error) {
    console.error('Error rendering video project:', error);
    return NextResponse.json({ 
      error: 'Failed to render video project',
      details: error.message 
    }, { status: 500 });
  }
}

// Function to render project to MP4
async function renderProjectToVideo(projectData, projectDir, outputPath, useSelectedClip = false) {
  try {
    console.log('🎨 Rendering project to video...');
    
    // Handle clip selection - create a trimmed video first if needed
    let videoSource = path.join(projectDir, 'source_video.mp4');
    let videoDuration = null;
    
    if (useSelectedClip && projectData.selectedClip) {
      console.log('✂️ Trimming video to selected clip segment...');
      const trimmedVideoPath = path.join(projectDir, 'trimmed_video.mp4');
      
      // Use precise trimming with re-encoding to avoid frozen frames
      const trimCommand = `ffmpeg -ss ${projectData.selectedClip.startTime} -i "${videoSource}" -t ${projectData.selectedClip.duration} -c:v libx264 -c:a aac -preset medium -crf 23 -avoid_negative_ts make_zero "${trimmedVideoPath}" -y`;
      console.log('✂️ Trim command:', trimCommand);
      await execAsync(trimCommand);
      
      // Use the trimmed video as the source
      videoSource = trimmedVideoPath;
      videoDuration = projectData.selectedClip.duration;
      console.log(`✅ Video trimmed to ${projectData.selectedClip.duration}s (${projectData.selectedClip.startTime}s - ${projectData.selectedClip.endTime}s)`);
    }
    
    // Create text overlay image using Canvas (similar to existing script)
    const { createCanvas } = await import('canvas');
    const canvas = createCanvas(projectData.canvas.width, projectData.canvas.height);
    const ctx = canvas.getContext('2d');
    
    // Create transparent canvas - no background fill so video shows through
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Render each text layer using the new structure
    for (const textLayer of projectData.textLayers) {
      ctx.save();
      
      // Render text layer using shared drawText util
      drawText(ctx, textLayer.content, {
        x: textLayer.leftMargin,
        y: textLayer.textTopMargin,
        fontSize: textLayer.fontSize,
        lineHeight: textLayer.lineHeight,
        maxWidth: textLayer.maxWidth,
        color: textLayer.color,
        fontFamily: textLayer.fontFamily,
        fontFamilyBold: textLayer.fontFamilyBold,
        fontFamilyItalic: textLayer.fontFamilyItalic,
        fontFamilyBoldItalic: textLayer.fontFamilyBoldItalic
      });
      
      ctx.restore();
    }
    
    // Save text overlay as PNG
    const overlayPath = path.join(projectDir, 'text_overlay.png');
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(overlayPath, buffer);
    
    // Use FFmpeg to combine video and text overlay with proper rounded corners and fade-in
    const videoLayer = projectData.videoLayer;
    
    // Build FFmpeg command with smooth fade-in effect for video only (text stays visible)
    let ffmpegCommand = `ffmpeg -i "${videoSource}" -i "${overlayPath}" -y -filter_complex "` +
      `color=${videoLayer.backgroundColor}:size=${videoLayer.canvasWidth}x${videoLayer.canvasHeight}[bg];` +
      `[0:v]scale=${videoLayer.targetWidth}:${videoLayer.targetHeight}[scaled_video];` +
      `[scaled_video]format=rgba[video_with_alpha];` +
      `[video_with_alpha]geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if( \\` +
        `lt(X,${videoLayer.cornerRadius})*lt(Y,${videoLayer.cornerRadius})*gt(pow(X-${videoLayer.cornerRadius},2)+pow(Y-${videoLayer.cornerRadius},2),pow(${videoLayer.cornerRadius},2)),0,if( \\` +
        `gt(X,W-${videoLayer.cornerRadius})*lt(Y,${videoLayer.cornerRadius})*gt(pow(X-(W-${videoLayer.cornerRadius}),2)+pow(Y-${videoLayer.cornerRadius},2),pow(${videoLayer.cornerRadius},2)),0,if( \\` +
        `lt(X,${videoLayer.cornerRadius})*gt(Y,H-${videoLayer.cornerRadius})*gt(pow(X-${videoLayer.cornerRadius},2)+pow(Y-(H-${videoLayer.cornerRadius}),2),pow(${videoLayer.cornerRadius},2)),0,if( \\` +
        `gt(X,W-${videoLayer.cornerRadius})*gt(Y,H-${videoLayer.cornerRadius})*gt(pow(X-(W-${videoLayer.cornerRadius}),2)+pow(Y-(H-${videoLayer.cornerRadius}),2),pow(${videoLayer.cornerRadius},2)),0,255))))'[rounded_video];` +
      `[rounded_video]fade=t=in:st=0:d=0.5:alpha=1[faded_video];` +
      `[bg][1:v]overlay=0:0[bg_with_text];` +
      `[bg_with_text][faded_video]overlay=(W-w)/2:H-h-${videoLayer.videoBottomMargin}[final]" ` +
      `-map "[final]" -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p -r 30 -an`;
    
    // Add duration constraint if we have a specific duration (from selected clip)
    if (videoDuration) {
      ffmpegCommand += ` -t ${videoDuration}`;
    }
    
    ffmpegCommand += ` "${outputPath}"`;
    
    console.log('🎬 FFmpeg command:', ffmpegCommand);
    await execAsync(ffmpegCommand);
    
    console.log('✅ Video rendered successfully');
    
  } catch (error) {
    console.error('❌ Error rendering video:', error);
    throw error;
  }
}

// Helper function to get font string (matches create-instagram-post.js)
function getFontString(fontSize, bold, italic, textLayer) {
  const weight = bold ? 'bold' : 'normal';
  const style = italic ? 'italic' : 'normal';
  let family = textLayer.fontFamily;
  if (bold && italic) family = textLayer.fontFamilyBoldItalic;
  else if (bold) family = textLayer.fontFamilyBold;
  else if (italic) family = textLayer.fontFamilyItalic;
  return `${style} ${weight} ${fontSize}px ${family}`.trim();
}

// Parse markdown tokens (matches create-instagram-post.js)
function parseMarkdownTokens(text) {
  const tokens = [];
  const lines = text.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') {
      tokens.push({ text: '', bold: false, italic: false, isLineBreak: true });
      continue;
    }
    
    // Simple markdown processing
    let remaining = line;
    while (remaining.length > 0) {
      // Check for bold
      const boldMatch = remaining.match(/^\*\*(.*?)\*\*/);
      if (boldMatch) {
        tokens.push({ text: boldMatch[1], bold: true, italic: false });
        remaining = remaining.slice(boldMatch[0].length);
        continue;
      }
      
      // Check for italic
      const italicMatch = remaining.match(/^\*(.*?)\*/);
      if (italicMatch) {
        tokens.push({ text: italicMatch[1], bold: false, italic: true });
        remaining = remaining.slice(italicMatch[0].length);
        continue;
      }
      
      // Regular text until next markdown
      const nextMarkdown = remaining.search(/\*\*/);
      const nextItalic = remaining.search(/\*/);
      let nextSpecial = Math.min(
        nextMarkdown === -1 ? Infinity : nextMarkdown,
        nextItalic === -1 ? Infinity : nextItalic
      );
      
      if (nextSpecial === Infinity) {
        tokens.push({ text: remaining, bold: false, italic: false });
        break;
      } else {
        tokens.push({ text: remaining.slice(0, nextSpecial), bold: false, italic: false });
        remaining = remaining.slice(nextSpecial);
      }
    }
    
    // Add line break token except for the last line
    if (i < lines.length - 1) {
      tokens.push({ text: '\n', bold: false, italic: false, isLineBreak: true });
    }
  }
  
  return tokens;
} 