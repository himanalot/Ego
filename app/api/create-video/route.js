import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export async function POST(req) {
  try {
    const { story, videoUrl, founderName, imageSearchTerms } = await req.json();
    
    console.log('🚀 Starting video creation pipeline...');
    console.log('📊 Input data:', {
      founderName,
      videoUrlLength: videoUrl?.length,
      storyLength: story?.length,
      imageSearchTerms
    });

    if (!story || !videoUrl) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: story and videoUrl'
      }, { status: 400 });
    }

    // Clean up the video URL - extract from markdown if needed
    let cleanVideoUrl = videoUrl.trim();
    
    // Handle markdown format: [title](url)
    const markdownMatch = cleanVideoUrl.match(/\[.*?\]\((.*?)\)/);
    if (markdownMatch) {
      cleanVideoUrl = markdownMatch[1];
      console.log('📝 Extracted URL from markdown:', cleanVideoUrl);
    }
    
    // Extract YouTube video ID from clean URL
    const videoIdMatch = cleanVideoUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
    if (!videoIdMatch) {
      return NextResponse.json({
        success: false,
        error: `Invalid YouTube URL format: ${cleanVideoUrl}`
      }, { status: 400 });
    }

    const videoId = videoIdMatch[1];
    console.log('🎥 Extracted video ID:', videoId);

    // Step 1: Process the video to extract clips using the clean URL and founder info
    console.log('📥 Step 1: Processing video to extract clips...');
    console.log('🔗 Processing URL:', cleanVideoUrl);
    console.log('👤 Founder:', founderName);
    console.log('🔍 Search terms:', imageSearchTerms);
    
    // Use the image search terms for better facial recognition
    const processVideoResult = await runCommand('node', [
      'scripts/process-video.js', 
      cleanVideoUrl, 
      imageSearchTerms || founderName // use image search terms for better reference images
    ], {
      timeout: 300000 // 5 minutes timeout
    });
    
    if (processVideoResult.error) {
      console.error('❌ Video processing failed:', processVideoResult.error);
      return NextResponse.json({
        success: false,
        error: 'Video processing failed',
        details: processVideoResult.error
      }, { status: 500 });
    }

    console.log('✅ Video processing completed');

    // Step 2: Find the best clip from the newly processed video
    console.log('🔍 Step 2: Finding best clip from newly processed video...');
    
    const { readdirSync } = require('fs');
    
    // Look for clips with the specific video ID from this processing run
    const clipFiles = readdirSync('./processed_videos').filter(file => 
      file.includes(videoId) && file.includes('_clip_') && file.endsWith('.mp4')
    );
    
    // If no clips with specific video ID, fall back to most recent clips
    if (clipFiles.length === 0) {
      console.log('⚠️ No clips found with video ID, checking for any new clips...');
      const allClips = readdirSync('./processed_videos').filter(file => 
        file.includes('_clip_') && file.endsWith('.mp4')
      );
      
      if (allClips.length === 0) {
        return NextResponse.json({
          success: false,
          error: 'No clips were generated from the video processing'
        }, { status: 500 });
      }
      
      // Use the most recent clip (sorted by file modification time)
      const fs = require('fs');
      const clipWithStats = allClips.map(file => ({
        file,
        mtime: fs.statSync(`./processed_videos/${file}`).mtime
      })).sort((a, b) => b.mtime - a.mtime);
      
      clipFiles.push(clipWithStats[0].file);
      console.log('🔄 Using most recent clip as fallback:', clipWithStats[0].file);
    }

    // Use the best quality clip (they're usually sorted by quality)
    const bestClip = `processed_videos/${clipFiles[0]}`;
    console.log('🎯 Selected best clip:', bestClip);

    // Parse clip information from filename for saving to project
    const clipFilename = clipFiles[0];
    const clipInfo = parseClipInfo(clipFilename);
    console.log('🎯 Parsed clip info:', clipInfo);

    // Step 3: Create Instagram post with the story and save clip info
    console.log('🎨 Step 3: Creating Instagram post with story...');
    
    // Encode clipInfo as base64 to avoid command line parsing issues
    const clipInfoBase64 = Buffer.from(JSON.stringify(clipInfo)).toString('base64');
    
    const instagramResult = await runCommand('node', [
      'scripts/create-instagram-post.js',
      bestClip,
      story,
      '--save-clip-info',
      clipInfoBase64
    ], {
      timeout: 120000 // 2 minutes timeout
    });

    if (instagramResult.error) {
      console.error('❌ Instagram post creation failed:', instagramResult.error);
      return NextResponse.json({
        success: false,
        error: 'Instagram post creation failed',
        details: instagramResult.error
      }, { status: 500 });
    }

    console.log('✅ Instagram post created successfully');

    return NextResponse.json({
      success: true,
      message: 'Video created successfully!',
      details: {
        clipsGenerated: clipFiles.length,
        clipUsed: bestClip,
        founderName,
        imageSearchTerms: imageSearchTerms || 'No specific search terms provided'
      }
    });

  } catch (error) {
    console.error('❌ Error in video creation API:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      details: error.message
    }, { status: 500 });
  }
}

// Helper function to parse clip information from filename
function parseClipInfo(clipFilename) {
  // Example filename: video_FIFkHyLr8QQ_clip_1_8.0s_instagram_text.mp4
  // or: video_FIFkHyLr8QQ_clip_1_175.6-183.6_8.0s.mp4
  
  const clipInfo = {
    filename: clipFilename,
    startTime: 0,
    endTime: 8,
    duration: 8,
    score: null
  };
  
  try {
    // Look for pattern like 175.6-183.6 (start-end times)
    const timeRangeMatch = clipFilename.match(/(\d+\.?\d*)-(\d+\.?\d*)/);
    if (timeRangeMatch) {
      clipInfo.startTime = parseFloat(timeRangeMatch[1]);
      clipInfo.endTime = parseFloat(timeRangeMatch[2]);
      clipInfo.duration = clipInfo.endTime - clipInfo.startTime;
    } else {
      // Look for duration pattern like 8.0s
      const durationMatch = clipFilename.match(/(\d+\.?\d*)s/);
      if (durationMatch) {
        clipInfo.duration = parseFloat(durationMatch[1]);
        clipInfo.endTime = clipInfo.startTime + clipInfo.duration;
      }
    }
    
    // Look for clip number/score pattern
    const clipNumberMatch = clipFilename.match(/clip_(\d+)/);
    if (clipNumberMatch) {
      clipInfo.score = parseInt(clipNumberMatch[1]); // Higher clip numbers usually mean better quality
    }
    
  } catch (error) {
    console.log('⚠️ Could not parse clip info from filename:', clipFilename);
  }
  
  return clipInfo;
}

// Helper function to run terminal commands
function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    console.log(`🔧 Running: ${command} ${args.join(' ')}`);
    
    const process = spawn(command, args, {
      cwd: path.resolve('.'),
      stdio: 'pipe'
    });

    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      console.log('📤', output.trim());
    });

    process.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      console.log('⚠️', output.trim());
    });

    // Set timeout if specified
    let timeoutId;
    if (options.timeout) {
      timeoutId = setTimeout(() => {
        console.log('⏰ Command timeout, killing process...');
        process.kill('SIGTERM');
      }, options.timeout);
    }

    process.on('close', (code) => {
      if (timeoutId) clearTimeout(timeoutId);
      
      console.log(`✅ Command finished with code: ${code}`);
      
      resolve({
        code,
        stdout,
        stderr,
        error: code !== 0 ? `Command failed with exit code ${code}` : null
      });
    });

    process.on('error', (error) => {
      if (timeoutId) clearTimeout(timeoutId);
      console.log('❌ Command error:', error);
      resolve({
        code: -1,
        stdout,
        stderr,
        error: error.message
      });
    });
  });
} 