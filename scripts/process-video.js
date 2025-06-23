#!/usr/bin/env node

const { spawn } = require('child_process');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');
// Set FFmpeg path
ffmpeg.setFfmpegPath(ffmpegStatic);

class VideoProcessor {
  constructor() {
    this.outputDir = './processed_videos';
    this.tempDir = './temp';
    this.ensureDirectories();
  }

  ensureDirectories() {
    [this.outputDir, this.tempDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  async downloadVideo(youtubeUrl) {
    console.log('📥 Downloading video...');
    
    // Generate a safe filename based on video ID
    const videoId = this.extractVideoId(youtubeUrl);
    const title = `video_${videoId}`;
    const videoPath = path.join(this.tempDir, `${title}.mp4`);

    return new Promise((resolve, reject) => {
      const ytDlpProcess = spawn('yt-dlp', [
        '--format', 'best[ext=mp4]/best[height<=720]/best',
        '--output', videoPath,
        '--no-playlist',
        '--no-check-certificate',
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        '--extractor-retries', '3',
        '--fragment-retries', '3',
        '--retry-sleep', '1',
        youtubeUrl
      ]);

      let stderr = '';
      let stdout = '';

      ytDlpProcess.stdout.on('data', (data) => {
        stdout += data.toString();
        console.log(`yt-dlp: ${data}`);
      });

      ytDlpProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        console.error(`⚠️ yt-dlp stderr: ${data}`);
      });

      ytDlpProcess.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Video downloaded successfully');
          resolve({ videoPath, title });
        } else {
          console.error(`⚠️ yt-dlp failed with code ${code}`);
          console.error(`⚠️ stderr: ${stderr}`);
          console.error(`⚠️ stdout: ${stdout}`);
          
          // Try fallback format if the main one failed
          console.log('🔄 Trying fallback download method...');
          this.downloadVideoFallback(youtubeUrl, videoPath)
            .then((result) => resolve(result))
            .catch((fallbackError) => {
              reject(new Error(`yt-dlp failed with code ${code}: ${stderr}. Fallback also failed: ${fallbackError.message}`));
            });
        }
      });

      ytDlpProcess.on('error', (error) => {
        reject(new Error(`Failed to start yt-dlp: ${error.message}`));
      });
    });
  }

  async downloadVideoFallback(youtubeUrl, videoPath) {
    console.log('🔄 Attempting fallback download...');
    
    return new Promise((resolve, reject) => {
      const ytDlpProcess = spawn('yt-dlp', [
        '--format', 'worst[ext=mp4]/worst',
        '--output', videoPath,
        '--no-playlist',
        '--no-check-certificate',
        youtubeUrl
      ]);

      let stderr = '';

      ytDlpProcess.stdout.on('data', (data) => {
        console.log(`yt-dlp fallback: ${data}`);
      });

      ytDlpProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        console.error(`yt-dlp fallback stderr: ${data}`);
      });

      ytDlpProcess.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Fallback video download successful');
          const videoId = this.extractVideoId(youtubeUrl);
          const title = `video_${videoId}`;
          resolve({ videoPath, title });
        } else {
          reject(new Error(`Fallback yt-dlp failed with code ${code}: ${stderr}`));
        }
      });

      ytDlpProcess.on('error', (error) => {
        reject(new Error(`Failed to start fallback yt-dlp: ${error.message}`));
      });
    });
  }

  extractVideoId(url) {
    const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/;
    const match = url.match(regex);
    return match ? match[1] : 'unknown';
  }

  async extractFrames(videoPath, interval = 1) {
    console.log('🎬 Extracting frames for analysis...');
    
    const framesDir = path.join(this.tempDir, 'frames');
    if (!fs.existsSync(framesDir)) {
      fs.mkdirSync(framesDir, { recursive: true });
    }

    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .outputOptions([
          `-vf fps=1/${interval}`, // Extract 1 frame per interval seconds
          '-q:v 2' // High quality frames
        ])
        .output(path.join(framesDir, 'frame_%04d.jpg'))
        .on('end', () => {
          const frames = fs.readdirSync(framesDir)
            .filter(file => file.endsWith('.jpg'))
            .sort()
            .map(file => ({
              path: path.join(framesDir, file),
              timestamp: (parseInt(file.match(/\d+/)[0]) - 1) * interval
            }));
          console.log(`✅ Extracted ${frames.length} frames`);
          resolve(frames);
        })
        .on('error', reject)
        .run();
    });
  }



  async extractAudio(videoPath) {
    console.log('🎵 Extracting audio for speech analysis...');
    
    const audioPath = path.join(this.tempDir, 'audio.wav');
    
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .output(audioPath)
        .audioChannels(1)
        .audioFrequency(16000)
        .format('wav')
        .on('end', () => {
          console.log('✅ Audio extracted');
          resolve(audioPath);
        })
        .on('error', reject)
        .run();
    });
  }

  async detectSpeechSegments(audioPath) {
    console.log('🗣️ Detecting speech segments...');
    
    // Simple speech detection using ffmpeg silence detection
    return new Promise((resolve, reject) => {
      let output = '';
      
      ffmpeg(audioPath)
        .audioFilters('silencedetect=noise=-30dB:duration=0.5')
        .format('null')
        .output('-')
        .on('stderr', (stderrLine) => {
          output += stderrLine + '\n';
        })
        .on('end', () => {
          const segments = this.parseSilenceDetection(output);
          console.log(`✅ Found ${segments.length} speech segments`);
          resolve(segments);
        })
        .on('error', reject)
        .run();
    });
  }

  parseSilenceDetection(output) {
    const lines = output.split('\n');
    const silenceStarts = [];
    const silenceEnds = [];
    
    lines.forEach(line => {
      const startMatch = line.match(/silence_start: ([\d.]+)/);
      const endMatch = line.match(/silence_end: ([\d.]+)/);
      
      if (startMatch) silenceStarts.push(parseFloat(startMatch[1]));
      if (endMatch) silenceEnds.push(parseFloat(endMatch[1]));
    });

    // Convert silence periods to speech segments
    const speechSegments = [];
    let lastEnd = 0;
    
    for (let i = 0; i < silenceStarts.length; i++) {
      if (silenceStarts[i] > lastEnd) {
        speechSegments.push({
          start: lastEnd,
          end: silenceStarts[i],
          duration: silenceStarts[i] - lastEnd
        });
      }
      lastEnd = silenceEnds[i] || silenceStarts[i];
    }
    
    return speechSegments.filter(segment => segment.duration >= 7); // At least 7 seconds
  }

  async findBestClips(videoPath, frames, speechSegments, founderSearchTerms = null) {
    console.log('🔍 Finding best clips using genius-clip-finder...');
    
    let personName = null;
    let searchTerms = null;
    
    if (founderSearchTerms) {
      if (founderSearchTerms.includes(',')) {
        // Multiple search terms - extract person name and pass full search terms
        const firstTerm = founderSearchTerms.split(',')[0].trim();
        personName = firstTerm.replace(/\b(Y Combinator|Initialized Capital|CEO|founder|venture capitalist)\b/gi, '').trim();
        searchTerms = founderSearchTerms; // Pass the full search terms
      } else {
        // Single term
        personName = founderSearchTerms;
      }
    }
    
    console.log(`🎯 Searching for clips featuring: ${personName}`);
    if (searchTerms) {
      console.log(`🔍 Using search terms: ${searchTerms}`);
    }
    
    // Run genius clip finder with both person name and search terms
    const analysisResult = await this.runGeniusClipFinder(videoPath, personName, searchTerms);
    
    if (!analysisResult) {
      console.log('⚠️ No clips found by genius clip finder');
      return [];
    }
    
    // Convert to our expected format
    const validClips = [{
      start: analysisResult.start,
      end: analysisResult.end,
      duration: analysisResult.duration,
      score: 10, // Genius clip finder only returns high-quality clips
      analysis: {
        frames_analyzed: analysisResult.frames_analyzed,
        elapsed: analysisResult.elapsed,
        path: analysisResult.path
      }
    }];
    
    console.log(`✅ Genius clip finder found ${validClips.length} high-quality clips`);
    return validClips;
  }

  async runGeniusClipFinder(videoPath, personName = null, searchTerms = null) {
    console.log('🤖 Running genius-clip-finder...');
    
    return new Promise((resolve, reject) => {
      const scriptPath = path.join(__dirname, 'genius-clip-finder.py');
      const spawnArgs = [scriptPath, videoPath];
      
      if (personName) {
        spawnArgs.push('--person', personName);
      }
      
      if (searchTerms) {
        spawnArgs.push('--search-terms', searchTerms);
      }
      
      console.log(`🔧 Running: python3 ${spawnArgs.join(' ')}`);
      
      const pythonProcess = spawn('python3', spawnArgs);
      
      let output = '';
      let error = '';
      
      pythonProcess.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        
        // Also check stdout for progress messages
        const lines = text.split('\n');
        lines.forEach(line => {
          if (line.includes('🔍') || line.includes('📊') || line.includes('🎯') || line.includes('✅') || line.includes('📥') || line.includes('🎬')) {
            console.log(line);
          }
        });
      });
      
      pythonProcess.stderr.on('data', (data) => {
        const text = data.toString();
        error += text;
        
        // Print progress messages from Python script (they go to stderr)
        const lines = text.split('\n');
        lines.forEach(line => {
          if (line.includes('🔍') || line.includes('📊') || line.includes('🎯') || line.includes('✅') || line.includes('📥') || line.includes('🎬')) {
            console.log(line);
          }
        });
      });
      
      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          console.error('Genius clip finder error:', error);
          console.log('Genius clip finder output:', output);
          resolve(null); // Return null instead of rejecting so we can fallback
          return;
        }
        
        try {
          // Parse the final JSON output from stdout
          let jsonStr = '';
          
          // Try to find JSON in the output
          const allOutput = output.trim();
          const lines = allOutput.split('\n');
          
          // Look for the last valid JSON object in the output
          for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();
            if (line.startsWith('{') && line.endsWith('}')) {
              try {
                // Test if it's valid JSON
                JSON.parse(line);
                jsonStr = line;
                break;
              } catch (e) {
                // Not valid JSON, continue searching
                continue;
              }
            }
          }
          
          // If no JSON found in lines, try to extract from the entire output
          if (!jsonStr) {
            const jsonMatch = allOutput.match(/\{[^}]*"path"[^}]*\}/);
            if (jsonMatch) {
              jsonStr = jsonMatch[0];
            }
          }
          
          if (!jsonStr) {
            console.log('No JSON output found from genius clip finder');
            console.log('Full output:', allOutput);
            console.log('stderr:', error);
            resolve(null);
            return;
          }
          
          const result = JSON.parse(jsonStr);
          console.log(`✅ Found clip: ${result.start}s-${result.end}s (${result.duration}s)`);
          resolve(result);
        } catch (parseError) {
          console.error('Failed to parse genius clip finder output:', parseError.message);
          console.log('Raw output:', output.substring(0, 500) + '...');
          console.log('Raw error:', error.substring(0, 500) + '...');
          resolve(null);
        }
      });
    });
  }

  async extractClip(videoPath, startTime, endTime, outputPath) {
    console.log(`✂️ Extracting clip: ${startTime}s - ${endTime}s`);
    
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .seekInput(startTime)
        .duration(endTime - startTime)
        .output(outputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .size('1080x1920') // Vertical format for social media
        .aspect('9:16')
        .on('end', () => {
          console.log(`✅ Clip saved: ${outputPath}`);
          resolve(outputPath);
        })
        .on('error', reject)
        .run();
    });
  }

  async processVideo(youtubeUrl, maxClips = 3, founderName = null) {
    try {
      console.log('🚀 Starting video processing pipeline...');
      
      // Step 1: Download video
      console.log('\n📥 Step 1: Downloading video...');
      const { videoPath, title } = await this.downloadVideo(youtubeUrl);
      console.log(`✅ Video saved: ${videoPath}`);
      
      // Step 2: Find best clips using genius-clip-finder
      console.log('\n🔍 Step 2: Finding best clips with genius-clip-finder...');
      const bestClips = await this.findBestClips(videoPath, null, null, founderName);
      const bestClipsPath = path.join(this.tempDir, 'best_clips.json');
      fs.writeFileSync(bestClipsPath, JSON.stringify(bestClips, null, 2));
      console.log(`✅ Best clips analysis saved: ${bestClipsPath}`);
      
      // Step 3: Extract clips (genius-clip-finder already created them, just copy to our naming convention)
      console.log('\n✂️ Step 3: Processing found clips...');
      const extractedClips = [];
      
      for (let i = 0; i < Math.min(maxClips, bestClips.length); i++) {
        const clip = bestClips[i];
        
        if (clip.analysis && clip.analysis.path) {
          // Genius clip finder already created the clip, just rename it
          const sourcePath = clip.analysis.path;
          const clipPath = path.join(this.outputDir, `${title}_clip_${i + 1}.mp4`);
          
          console.log(`Processing clip ${i + 1}/${Math.min(maxClips, bestClips.length)}: ${Math.round(clip.start)}s-${Math.round(clip.end)}s (score: ${clip.score.toFixed(1)})`);
          
          // Copy the clip to our naming convention
          if (fs.existsSync(sourcePath)) {
            fs.copyFileSync(sourcePath, clipPath);
            console.log(`✅ Clip saved: ${clipPath}`);
            
            extractedClips.push({
              path: clipPath,
              ...clip
            });
          } else {
            console.log(`⚠️ Source clip not found: ${sourcePath}`);
          }
        } else {
          // Fallback: extract the clip manually
          const clipPath = path.join(this.outputDir, `${title}_clip_${i + 1}.mp4`);
          console.log(`Extracting clip ${i + 1}/${Math.min(maxClips, bestClips.length)}: ${Math.round(clip.start)}s-${Math.round(clip.end)}s (score: ${clip.score.toFixed(1)})`);
          await this.extractClip(videoPath, clip.start, clip.end, clipPath);
          extractedClips.push({
            path: clipPath,
            ...clip
          });
        }
      }
      
      const finalResultsPath = path.join(this.outputDir, `${title}_results.json`);
      fs.writeFileSync(finalResultsPath, JSON.stringify({
        title,
        videoPath,
        bestClips: bestClips.length,
        extractedClips: extractedClips.length,
        clips: extractedClips
      }, null, 2));
      
      console.log('\n🎉 Processing complete!');
      console.log(`📁 Extracted ${extractedClips.length} clips to: ${this.outputDir}`);
      console.log(`📊 Full results saved: ${finalResultsPath}`);
      console.log(`🔧 Debug files in: ${this.tempDir}`);
      
      return extractedClips;
      
    } catch (error) {
      console.error('❌ Error processing video:', error);
      console.log(`🔧 Debug files available in: ${this.tempDir}`);
      // Don't cleanup on error so we can debug
      throw error;
    }
  }

  cleanup() {
    console.log('🧹 Cleaning up temporary files...');
    if (fs.existsSync(this.tempDir)) {
      fs.rmSync(this.tempDir, { recursive: true, force: true });
    }
  }
}

// CLI usage
async function main() {
  const youtubeUrl = process.argv[2];
  const founderName = process.argv[3]; // Optional founder name
  
  if (!youtubeUrl) {
    console.log('Usage: npm run process-video <youtube-url> [founder-name]');
    console.log('Example: npm run process-video https://www.youtube.com/watch?v=dQw4w9WgXcQ "Sam Altman"');
    process.exit(1);
  }
  
  const processor = new VideoProcessor();
  await processor.processVideo(youtubeUrl, 3, founderName);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = VideoProcessor; 