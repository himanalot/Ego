#!/usr/bin/env node

const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

// Set FFmpeg path
ffmpeg.setFfmpegPath(ffmpegStatic);

class InstagramPostCreator {
  constructor() {
    this.outputDir = './instagram_posts';
    this.ensureDirectories();
    // Register fonts using GlobalFonts
    const fontsDir = path.join(__dirname, '../assets/fonts');
    const fontFiles = [
      { file: 'NimbusSanL-Reg.otf', family: 'NimbusSans' },
      { file: 'NimbusSanL-Bol.otf', family: 'NimbusSansBold' },
      { file: 'NimbusSanL-RegIta.otf', family: 'NimbusSansItalic' },
      { file: 'NimbusSanL-BolIta.otf', family: 'NimbusSansBoldItalic' }
    ];
    for (const f of fontFiles) {
      const fontPath = path.join(fontsDir, f.file);
      if (fs.existsSync(fontPath)) {
        GlobalFonts.registerFromPath(fontPath, f.family);
      }
    }
  }

  ensureDirectories() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  async createInstagramPost(inputVideoPath, outputPath, options = {}) {
    const {
      backgroundColor = '#000000',
      videoBottomMargin = 100,
      cornerRadius = 40
    } = options;

    console.log(`🎨 Creating Instagram post from: ${path.basename(inputVideoPath)}`);

    return new Promise((resolve, reject) => {
      // Instagram canvas dimensions are 1080x1920 (9:16).
      const instagramWidth = 1080;
      const instagramHeight = 1920;

      // The source video's metadata indicates it should be displayed as 16:9 (landscape).
      // We will make it 95% of the canvas width to leave a small margin.
      const targetWidth = Math.floor(instagramWidth * 0.95);
      const targetHeight = Math.floor(targetWidth * 9 / 16); // Calculate height for a 16:9 ratio.

      console.log(`   Canvas: ${instagramWidth}x${instagramHeight}`);
      console.log(`   Scaling video to ${targetWidth}x${targetHeight} to create side margins.`);
      console.log(`   Adding rounded corners with radius: ${cornerRadius}px`);

      const command = ffmpeg(inputVideoPath)
        .complexFilter([
          // Step 1: Create the 9:16 black background canvas.
          `color=${backgroundColor}:size=${instagramWidth}x${instagramHeight}[bg]`,

          // Step 2: Force scale the video to the correct 16:9 landscape dimensions.
          `[0:v]scale=${targetWidth}:${targetHeight}[scaled_video]`,
          
          // Step 3: Add an alpha channel to the video for transparency.
          `[scaled_video]format=rgba[video_with_alpha]`,

          // Step 4: Apply a robust rounded corners filter. This uses a nested 'if'
          // structure which is more stable than the previous long boolean chain.
          // It checks each corner and makes pixels transparent if they are outside the corner radius.
          `[video_with_alpha]geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if( \
            lt(X,${cornerRadius})*lt(Y,${cornerRadius})*gt(pow(X-${cornerRadius},2)+pow(Y-${cornerRadius},2),pow(${cornerRadius},2)),0,if( \
            gt(X,W-${cornerRadius})*lt(Y,${cornerRadius})*gt(pow(X-(W-${cornerRadius}),2)+pow(Y-${cornerRadius},2),pow(${cornerRadius},2)),0,if( \
            lt(X,${cornerRadius})*gt(Y,H-${cornerRadius})*gt(pow(X-${cornerRadius},2)+pow(Y-(H-${cornerRadius}),2),pow(${cornerRadius},2)),0,if( \
            gt(X,W-${cornerRadius})*gt(Y,H-${cornerRadius})*gt(pow(X-(W-${cornerRadius}),2)+pow(Y-(H-${cornerRadius}),2),pow(${cornerRadius},2)),0,255))))'[rounded_video]`,

          // Step 5: Apply smooth fade-in effect to the video (fade in over 0.5 seconds)
          `[rounded_video]fade=t=in:st=0:d=0.5:alpha=1[faded_video]`,

          // Step 6: Overlay the faded video onto the canvas.
          `[bg][faded_video]overlay=(W-w)/2:H-h-${videoBottomMargin}[final]`
        ])
        .outputOptions([
          '-map', '[final]',
          '-map', '0:a?',
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-preset', 'medium',
          '-crf', '23',
          '-pix_fmt', 'yuv420p',
          '-r', '30',
          '-shortest'
        ])
        .output(outputPath)
        .on('start', (commandLine) => {
          console.log('   FFmpeg command:', commandLine);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            process.stdout.write(`\r   Progress: ${Math.round(progress.percent)}%`);
          }
        })
        .on('end', () => {
          console.log(`\n✅ Instagram post created: ${outputPath}`);
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('\n❌ Error creating Instagram post:', err);
          reject(err);
        });

      command.run();
    });
  }

  async createInstagramPostWithText(inputVideoPath, outputPath, storyText, options = {}) {
    const {
      backgroundColor = '#000000',
      videoBottomMargin = 100,
      cornerRadius = 40,
      textColor = '#FFFFFF',
      fontSize = 50,
      textTopMargin = 100,
      bold = false,
      italic = false
    } = options;

    // Generate a PNG with rendered text
    const textImagePath = path.join(this.outputDir, `text_overlay_${Date.now()}.png`);
    this.generateTextImage(storyText, textImagePath, {
      fontSize,
      textColor,
      textTopMargin,
      bold,
      italic
    });
    
    console.log(`🎨 Creating Instagram post with text from: ${path.basename(inputVideoPath)}`);

    return new Promise((resolve, reject) => {
      // Instagram canvas dimensions are 1080x1920 (9:16).
      const instagramWidth = 1080;
      const instagramHeight = 1920;

      // The source video's metadata indicates it should be displayed as 16:9 (landscape).
      // We will make it 95% of the canvas width to leave a small margin.
      const targetWidth = Math.floor(instagramWidth * 0.95);
      const targetHeight = Math.floor(targetWidth * 9 / 16); // Calculate height for a 16:9 ratio.

      console.log(`   Canvas: ${instagramWidth}x${instagramHeight}`);
      console.log(`   Scaling video to ${targetWidth}x${targetHeight} to create side margins.`);
      console.log(`   Adding rounded corners with radius: ${cornerRadius}px`);
      console.log(`   Adding text with markdown processing`);

      const command = ffmpeg(inputVideoPath)
        .complexFilter([
          // Step 1: Create the 9:16 black background canvas.
          `color=${backgroundColor}:size=${instagramWidth}x${instagramHeight}[bg]`,

          // Step 2: Scale the video to the correct 16:9 landscape dimensions.
          `[0:v]scale=${targetWidth}:${targetHeight}[scaled_video]`,
          
          // Step 3: Add an alpha channel for transparency.
          `[scaled_video]format=rgba[video_with_alpha]`,

          // Step 4: Apply rounded corners.
          `[video_with_alpha]geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if( \
            lt(X,${cornerRadius})*lt(Y,${cornerRadius})*gt(pow(X-${cornerRadius},2)+pow(Y-${cornerRadius},2),pow(${cornerRadius},2)),0,if( \
            gt(X,W-${cornerRadius})*lt(Y,${cornerRadius})*gt(pow(X-(W-${cornerRadius}),2)+pow(Y-${cornerRadius},2),pow(${cornerRadius},2)),0,if( \
            lt(X,${cornerRadius})*gt(Y,H-${cornerRadius})*gt(pow(X-${cornerRadius},2)+pow(Y-(H-${cornerRadius}),2),pow(${cornerRadius},2)),0,if( \
            gt(X,W-${cornerRadius})*gt(Y,H-${cornerRadius})*gt(pow(X-(W-${cornerRadius}),2)+pow(Y-(H-${cornerRadius}),2),pow(${cornerRadius},2)),0,255))))'[rounded_video]`,

          // Step 5: Apply smooth fade-in effect to the video (fade in over 0.5 seconds)
          `[rounded_video]fade=t=in:st=0:d=0.5:alpha=1[faded_video]`,

          // Step 6: First overlay the text PNG on the background (text appears immediately)
          `[bg][1:v]overlay=0:0[bg_with_text]`,

          // Step 7: Overlay the faded video onto the canvas with text
          `[bg_with_text][faded_video]overlay=(W-w)/2:H-h-${videoBottomMargin}[final]`
        ])
        .input(textImagePath)
        .outputOptions([
          '-map', '[final]',
          '-map', '0:a?',
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-preset', 'medium',
          '-crf', '23',
          '-pix_fmt', 'yuv420p',
          '-r', '30',
          '-shortest'
        ])
        .output(outputPath)
        .on('start', (commandLine) => {
          console.log('   FFmpeg command:', commandLine);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            process.stdout.write(`\r   Progress: ${Math.round(progress.percent)}%`);
          }
        })
        .on('end', () => {
          console.log(`\n✅ Instagram post with text created: ${outputPath}`);
          // Clean up temporary text image
          fs.unlinkSync(textImagePath);
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('\n❌ Error creating Instagram post:', err);
          reject(err);
        });

      command.run();
    });
  }

  processMarkdownAndWrapText(text, options = {}) {
    const { bold = false, italic = false } = options;
    
    // First, wrap the entire text into lines, then apply formatting
    const maxCharsPerLine = 85;
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';
    
    for (let word of words) {
      // Check if adding this word would exceed the character limit
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      
      if (testLine.length <= maxCharsPerLine) {
        currentLine = testLine;
      } else {
        // Push current line if it's not empty
        if (currentLine) {
          lines.push(currentLine);
        }
        // Start new line with current word
        currentLine = word;
      }
    }
    
    // Don't forget the last line
    if (currentLine) {
      lines.push(currentLine);
    }
    
    // Now process markdown formatting for each line
    const segments = [];
    
    for (let line of lines) {
      // Process markdown **bold** and *italic* for this line
      const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/);
      
      for (let part of parts) {
        if (part.startsWith('**') && part.endsWith('**')) {
          // Bold text
          segments.push({
            text: part.slice(2, -2),
            bold: true,
            italic: italic
          });
        } else if (part.startsWith('*') && part.endsWith('*')) {
          // Italic text
          segments.push({
            text: part.slice(1, -1),
            bold: bold,
            italic: true
          });
        } else if (part.trim()) {
          // Regular text
          segments.push({
            text: part,
            bold: bold,
            italic: italic
          });
        }
      }
    }
    
    return segments;
  }

  generateTextOverlays(segments, textColor, fontSize, textTopMargin, canvasWidth) {
    const overlays = [];
    let currentY = textTopMargin;
    const lineHeight = fontSize * 1.2;
    
    // Calculate maximum text area (stop before video starts)
    // Video is positioned at H-h-100, and video height is ~577px
    // So text should stop around y=1200 to leave space
    const maxTextY = 1200;
    
    let lastIndex = 0;
    for (let i = 0; i < segments.length; i++) {
      // Skip if we've reached the maximum text area
      if (currentY > maxTextY) {
        break;
      }
      
      const segment = segments[i];
      
      // Select font based on formatting
      let fontName = 'NimbusSanL-Reg';
      if (segment.bold && segment.italic) {
        fontName = 'NimbusSanL-BolIta';
      } else if (segment.bold) {
        fontName = 'NimbusSanL-Bol';
      } else if (segment.italic) {
        fontName = 'NimbusSanL-RegIta';
      }
      const fontFile = `./assets/fonts/${fontName}.otf`;
      
      // Escape text for FFmpeg
      const escapedText = segment.text.replace(/'/g, `\\\\'`).replace(/"/g, '\\"');
      
      const inputLabel = i === 0 ? '[video_on_canvas]' : `[text_${i-1}]`;
      const outputLabel = `[text_${i}]`;
      
      overlays.push(
        `${inputLabel}drawtext=fontfile='${fontFile}':text='${escapedText}':fontcolor=${textColor}:fontsize=${fontSize}:x=60:y=${currentY}${outputLabel}`
      );
      
      currentY += lineHeight;
      lastIndex = i;
    }
    
    // Ensure the final output is labeled [final]
    if (overlays.length > 0) {
      const lastOverlay = overlays[overlays.length - 1];
      overlays[overlays.length - 1] = lastOverlay.replace(`[text_${lastIndex}]`, '[final]');
    }
    
    return overlays;
  }

  async processAllClips(clipsDir = './processed_videos', storyText = null, options = {}) {
    console.log('🚀 Creating Instagram posts from all video clips...\n');

    const files = fs.readdirSync(clipsDir);
    const videoFiles = files.filter(file => file.endsWith('.mp4') && file.includes('_clip_'));

    if (videoFiles.length === 0) {
      console.log('❌ No video clips found in', clipsDir);
      return;
    }

    const results = [];

    for (let i = 0; i < videoFiles.length; i++) {
      const videoFile = videoFiles[i];
      const inputPath = path.join(clipsDir, videoFile);
      
      // Create output filename
      const baseName = path.basename(videoFile, '.mp4');
      
      let outputPath;
      
      try {
        if (storyText) {
          // Create Instagram post with text
          outputPath = path.join(this.outputDir, `${baseName}_instagram_text.mp4`);
          await this.createInstagramPostWithText(inputPath, outputPath, storyText, {
            bold: options.bold || false,
            italic: options.italic || false,
            backgroundColor: '#000000',
            videoBottomMargin: 100,
            cornerRadius: 40
          });
        } else {
          // Create Instagram post without text
          outputPath = path.join(this.outputDir, `${baseName}_instagram.mp4`);
          await this.createInstagramPost(inputPath, outputPath, {
            backgroundColor: '#000000',
            videoBottomMargin: 100,
            cornerRadius: 40
          });
        }

        results.push({
          input: inputPath,
          output: outputPath,
          success: true
        });
      } catch (error) {
        console.error(`Failed to process ${videoFile}:`, error);
        results.push({
          input: inputPath,
          output: outputPath || 'unknown',
          success: false,
          error: error.message
        });
      }
    }

    console.log('\n🎉 Instagram post creation complete!');
    console.log(`📁 Created ${results.filter(r => r.success).length}/${results.length} posts in: ${this.outputDir}`);
    
    return results;
  }

  // Helper: parse markdown into tokens with style flags
  parseMarkdownTokens(text) {
    const tokens = [];
    const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/);
    for (let part of parts) {
      if (!part) continue;
      if (part.startsWith('**') && part.endsWith('**')) {
        tokens.push({ text: part.slice(2, -2), bold: true, italic: false });
      } else if (part.startsWith('*') && part.endsWith('*')) {
        tokens.push({ text: part.slice(1, -1), bold: false, italic: true });
      } else {
        // Handle newlines by creating line break tokens
        const lines = part.split(/\n/);
        for (let i = 0; i < lines.length; i++) {
          if (lines[i]) {
            tokens.push({ text: lines[i], bold: false, italic: false });
          }
          // Add line break token except for the last line
          if (i < lines.length - 1) {
            tokens.push({ text: '\n', bold: false, italic: false, isLineBreak: true });
          }
        }
      }
    }
    return tokens;
  }

  // Helper: get canvas font string
  getFontString(fontSize, bold, italic) {
    const weight = bold ? 'bold' : 'normal';
    const style = italic ? 'italic' : 'normal';
    let family = 'NimbusSans';
    if (bold && italic) family = 'NimbusSansBoldItalic';
    else if (bold) family = 'NimbusSansBold';
    else if (italic) family = 'NimbusSansItalic';
    return `${style} ${weight} ${fontSize}px ${family}`.trim();
  }

  // Helper: render text onto transparent PNG
  generateTextImage(text, outputPath, options = {}) {
    const {
      fontSize = 50,
      textColor = '#FFFFFF',
      textTopMargin = 100,
      leftMargin = 60,
      maxWidth = 960 // 1080 - 2*60
    } = options;

    const width = 1080;
    const height = 1920;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    // Create transparent canvas - no background fill so video shows through
    ctx.clearRect(0, 0, width, height);
    ctx.textBaseline = 'top';
    ctx.fillStyle = textColor;

    const tokens = this.parseMarkdownTokens(text);

    // Simplified text rendering to match CSS behavior
    let y = textTopMargin;
    const lineHeight = fontSize * 1.25;
    
    // Process text line by line, similar to CSS pre-wrap
    const lines = text.split('\n');
    
    for (const line of lines) {
      // Parse markdown for each line
      const lineTokens = this.parseMarkdownTokens(line);
      
      // Render tokens on this line
      let x = leftMargin;
      for (const token of lineTokens) {
        if (token.isLineBreak) continue; // Skip line breaks within lines
        
        // Set font for this token
        ctx.font = this.getFontString(fontSize, token.bold, token.italic);
        
        // Split token into words and render each word
        const words = token.text.split(' ');
        for (let i = 0; i < words.length; i++) {
          const word = words[i];
          if (!word) continue;
          
          const wordWidth = ctx.measureText(word).width;
          const spaceWidth = ctx.measureText(' ').width;
        
          // Check if word fits on current line
          if (x + wordWidth > leftMargin + maxWidth && x > leftMargin) {
            // Move to next line
            y += lineHeight;
            x = leftMargin;
          }
          
          // Draw the word
          ctx.fillText(word, x, y);
          x += wordWidth;
          
          // Add space after word (except last word)
          if (i < words.length - 1) {
            x += spaceWidth;
          }
        }
      }
      
      // Move to next line after processing this input line
      y += lineHeight;
    }

    // Stop drawing if exceeds lower bound (e.g., y>1200)
    // Not strictly needed because we created large canvas; optional.

    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(outputPath, buffer);
  }
}

// Function to create a video project with clip information
async function createVideoProject(inputPath, storyText, clipInfo) {
  try {
      console.log('📁 Creating video project with selected clip info...');
  console.log('🎯 Input path:', inputPath);
  console.log('📝 Story text length:', storyText.length);
  console.log('🎬 Clip info:', clipInfo);
  
  // Generate unique timestamp for this project
  const timestamp = Date.now();
  const projectName = `clip_project_${timestamp}`;
  console.log('📂 Project name:', projectName);
    
    // Create project directory
    const projectDir = path.join(process.cwd(), 'video_projects', projectName);
    if (!fs.existsSync(path.dirname(projectDir))) {
      fs.mkdirSync(path.dirname(projectDir), { recursive: true });
    }
    fs.mkdirSync(projectDir, { recursive: true });
    
    // Copy the source video to project directory
    const projectVideoPath = path.join(projectDir, 'source_video.mp4');
    fs.copyFileSync(inputPath, projectVideoPath);
    
    // Extract founder name from story text if possible
    const founderName = extractFounderName(storyText) || 'Unknown Founder';
    
    // Create project data with clip information
    const projectData = {
      version: "1.0",
      created: new Date().toISOString(),
      name: projectName,
      founderName: founderName,
      
      // Store selected clip information
      selectedClip: {
        filename: clipInfo.filename,
        startTime: clipInfo.startTime,
        endTime: clipInfo.endTime,
        duration: clipInfo.duration,
        score: clipInfo.score
      },
      
      // Video layer settings (matches create-instagram-post.js exactly)
      videoLayer: {
        type: 'video',
        source: 'source_video.mp4',
        canvasWidth: 1080,
        canvasHeight: 1920,
        targetWidth: Math.floor(1080 * 0.95),
        targetHeight: Math.floor((1080 * 0.95) * 9 / 16),
        backgroundColor: '#000000',
        cornerRadius: 40,
        videoBottomMargin: 100
      },
      
      // Text layers (matches script exactly)
      textLayers: [
        {
          id: 'main-text',
          type: 'text',
          content: storyText,
          fontSize: 50,
          fontFamily: 'NimbusSans',
          fontFamilyBold: 'NimbusSansBold',
          fontFamilyItalic: 'NimbusSansItalic',
          fontFamilyBoldItalic: 'NimbusSansBoldItalic',
          color: '#FFFFFF',
          lineHeight: 1.25,
          textBaseline: 'top',
          leftMargin: 60,
          textTopMargin: 100,
          maxWidth: 960,
          spaceHandling: 'smart',
          wordWrap: true,
          markdown: true
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
        codec: 'h264',
        preset: 'medium',
        crf: 23,
        pixelFormat: 'yuv420p'
      }
    };
    
    // Save project file
    const projectFilePath = path.join(projectDir, 'project.json');
    fs.writeFileSync(projectFilePath, JSON.stringify(projectData, null, 2));
    
    // Create a reference in the main instagram_posts directory
    const referenceFile = path.join(process.cwd(), 'instagram_posts', `${projectName}.project`);
    fs.writeFileSync(referenceFile, JSON.stringify({
      projectPath: projectDir,
      projectFile: projectFilePath,
      renderedVideo: null, // Will be created when user renders in project editor
      created: new Date().toISOString(),
      founderName: founderName
    }));
    
    console.log('✅ Video project created with clip info:', projectName);
    console.log(`   Selected clip: ${clipInfo.filename}`);
    console.log(`   Clip duration: ${clipInfo.duration}s (${clipInfo.startTime}s - ${clipInfo.endTime}s)`);
    
  } catch (error) {
    console.error('❌ Error creating video project:', error);
  }
}

// Helper function to extract founder name from story text
function extractFounderName(storyText) {
  // Simple heuristic to extract founder name from story
  const sentences = storyText.split(/[.!?]/);
  for (const sentence of sentences) {
    // Look for patterns like "NAME founded", "NAME started", "NAME created"
    const foundedMatch = sentence.match(/([A-Z][a-z]+ [A-Z][a-z]+)\s+(?:founded|started|created|launched)/i);
    if (foundedMatch) {
      return foundedMatch[1];
    }
    
    // Look for pattern at the beginning of sentences with proper names
    const nameMatch = sentence.match(/^\s*([A-Z][a-z]+ [A-Z][a-z]+)/);
    if (nameMatch) {
      return nameMatch[1];
    }
  }
  
  return null;
}

// CLI usage
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('📱 Instagram Post Creator');
    console.log('\nUsage:');
    console.log('  node scripts/create-instagram-post.js all');
    console.log('  node scripts/create-instagram-post.js <video-file> [<text>] [--bold] [--italic]');
    console.log('  node scripts/create-instagram-post.js <video-file> --story <story-file> [--bold] [--italic]');
    console.log('  node scripts/create-instagram-post.js <video-file> <text> --save-clip-info <clip-info-json>');
    console.log('\nExample:');
    console.log('  node scripts/create-instagram-post.js processed_videos/clip_1.mp4');
    console.log('  node scripts/create-instagram-post.js processed_videos/clip_1.mp4 "Hello World" --bold --italic');
    console.log('  node scripts/create-instagram-post.js processed_videos/clip_1.mp4 --story story.txt --bold');
    return;
  }

  const creator = new InstagramPostCreator();

  if (args[0] === 'all') {
    // Parse flags and get story file path
    const flags = args.filter(arg => arg.startsWith('--'));
    const bold = flags.includes('--bold');
    const italic = flags.includes('--italic');
    const storyFileIndex = args.indexOf('--story');
    
    let storyText = null;
    if (storyFileIndex !== -1 && storyFileIndex + 1 < args.length) {
      const storyFilePath = args[storyFileIndex + 1];
      if (fs.existsSync(storyFilePath)) {
        storyText = fs.readFileSync(storyFilePath, 'utf8').trim();
        console.log(`📖 Reading story from file: ${storyFilePath}`);
      } else {
        console.error(`❌ Story file not found: ${storyFilePath}`);
        return;
      }
    }
    
    await creator.processAllClips('./processed_videos', storyText, { bold, italic });
    return;
  }

  // Parse flags and positional args
  const bold = args.includes('--bold');
  const italic = args.includes('--italic');
  const storyFileIndex = args.indexOf('--story');
  const clipInfoIndex = args.indexOf('--save-clip-info');
  
  let storyFilePath = null;
  if (storyFileIndex !== -1 && storyFileIndex + 1 < args.length) {
    storyFilePath = args[storyFileIndex + 1];
  }

  let clipInfo = null;
  if (clipInfoIndex !== -1 && clipInfoIndex + 1 < args.length) {
    try {
      // Decode base64 back to JSON
      const clipInfoBase64 = args[clipInfoIndex + 1];
      const clipInfoJson = Buffer.from(clipInfoBase64, 'base64').toString('utf8');
      clipInfo = JSON.parse(clipInfoJson);
      console.log('🎯 Received clip info:', clipInfo);
    } catch (error) {
      console.log('⚠️ Could not parse clip info JSON:', error.message);
      console.log('⚠️ Raw argument was:', args[clipInfoIndex + 1]);
    }
  }

  // Get positional args, excluding flag values
  const flagValues = [];
  if (storyFilePath) flagValues.push(storyFilePath);
  if (clipInfoIndex !== -1 && clipInfoIndex + 1 < args.length) flagValues.push(args[clipInfoIndex + 1]);
  
  const positionalArgs = args.filter(arg => !arg.startsWith('--') && !flagValues.includes(arg));
  const [inputPath, storyText] = positionalArgs;

  if (!inputPath || !fs.existsSync(inputPath)) {
    console.error('❌ Input file not found or not specified:', inputPath);
    return;
  }
    
  const baseName = path.basename(inputPath, '.mp4');

  // Determine story text source
  let finalStoryText = storyText;
  if (storyFilePath && fs.existsSync(storyFilePath)) {
    finalStoryText = fs.readFileSync(storyFilePath, 'utf8').trim();
    console.log(`📖 Reading story from file: ${storyFilePath}`);
  }

  if (finalStoryText) {
    const outputPath = path.join(creator.outputDir, `${baseName}_instagram_text.mp4`);
    await creator.createInstagramPostWithText(inputPath, outputPath, finalStoryText, {
      bold,
      italic
    });
    
    // If we have clip info, create a video project as well
    console.log('🔍 Checking for clip info. clipInfo exists:', !!clipInfo);
    if (clipInfo) {
      console.log('✅ Clip info found, creating video project...');
      await createVideoProject(inputPath, finalStoryText, clipInfo);
    } else {
      console.log('⚠️ No clip info found, skipping video project creation');
    }
  } else {
    const outputPath = path.join(creator.outputDir, `${baseName}_instagram.mp4`);
    await creator.createInstagramPost(inputPath, outputPath);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = InstagramPostCreator; 