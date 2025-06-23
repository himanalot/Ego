#!/usr/bin/env node

const { spawn } = require('child_process');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');
// Set FFmpeg path
ffmpeg.setFfmpegPath(ffmpegStatic);

class VideoProcessorWithReferences {
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
        '--format', 'bestvideo+bestaudio/best',
        '--merge-output-format', 'mp4',
        '--output', videoPath,
        '--no-playlist',
        youtubeUrl
      ]);

      let stderr = '';

      ytDlpProcess.stdout.on('data', (data) => {
        console.log(`yt-dlp: ${data}`);
      });

      ytDlpProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        console.error(`yt-dlp stderr: ${data}`);
      });

      ytDlpProcess.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Video downloaded successfully');
          resolve({ videoPath, title });
        } else {
          reject(new Error(`yt-dlp failed with code ${code}: ${stderr}`));
        }
      });

      ytDlpProcess.on('error', (error) => {
        reject(new Error(`Failed to start yt-dlp: ${error.message}`));
      });
    });
  }

  extractVideoId(url) {
    const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/;
    const match = url.match(regex);
    return match ? match[1] : 'unknown';
  }

  async extractFrames(videoPath, interval = 2) {
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

  async findBestClipsWithReferences(videoPath, frames, speechSegments, referenceData) {
    console.log('🔍 Finding best clips using verified facial recognition...');
    
    // Save speech segments to temporary JSON file
    const speechSegmentsData = {
      segments: speechSegments
    };
    const speechSegmentsPath = path.join(this.tempDir, 'speech_segments.json');
    fs.writeFileSync(speechSegmentsPath, JSON.stringify(speechSegmentsData, null, 2));
    
    // Run Python face analyzer with references
    const framesDir = path.join(this.tempDir, 'frames');
    const analysisResult = await this.runFaceAnalyzerWithReferences(framesDir, referenceData);
    
    // Convert Python results to our format
    const validClips = analysisResult.speaking_segments.map(segment => ({
      start: segment.start,
      end: segment.end,
      duration: segment.duration,
      score: segment.combined_score,
      analysis: {
        founder_presence: segment.founder_presence,
        audio_confidence: segment.audio_confidence,
        verified_founder: true
      }
    }));
    
    console.log(`✅ Found ${validClips.length} verified clips with founder presence`);
    return validClips;
  }

  async runFaceAnalyzerWithReferences(framesDir, referenceData) {
    console.log('🤖 Running face analyzer with verified references...');
    
    return new Promise((resolve, reject) => {
      const scriptPath = path.join(__dirname, 'face_analyzer_with_references.py');
      const args = [
        scriptPath,
        framesDir,
        referenceData.founder_name,
        JSON.stringify(referenceData.verified_images)
      ];
      
      const pythonProcess = spawn('python3', args);
      
      let output = '';
      let error = '';
      
      pythonProcess.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
      });
      
      pythonProcess.stderr.on('data', (data) => {
        const text = data.toString();
        error += text;
        
        // Print progress messages from Python script
        const lines = text.split('\n');
        lines.forEach(line => {
          if (line.includes('🔍') || line.includes('📊') || line.includes('🎯') || line.includes('✅')) {
            console.log(line);
          }
        });
      });
      
      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          console.error('Face analyzer error:', error);
          reject(new Error(`Face analyzer failed with code ${code}: ${error}`));
          return;
        }
        
        try {
          // Find the last JSON object in the output
          const lines = output.trim().split('\n');
          let jsonStr = '';
          let braceCount = 0;
          let foundStart = false;
          
          for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i];
            if (line.includes('}') && !foundStart) {
              foundStart = true;
              jsonStr = line + '\n' + jsonStr;
              braceCount += (line.match(/}/g) || []).length - (line.match(/{/g) || []).length;
            } else if (foundStart) {
              jsonStr = line + '\n' + jsonStr;
              braceCount += (line.match(/}/g) || []).length - (line.match(/{/g) || []).length;
              if (braceCount === 0) break;
            }
          }
          
          if (!jsonStr.trim()) {
            throw new Error('No JSON found in output');
          }
          
          const result = JSON.parse(jsonStr.trim());
          resolve(result);
        } catch (parseError) {
          console.error('Failed to parse face analyzer output:', output.substring(0, 500) + '...');
          reject(new Error(`Failed to parse face analyzer output: ${parseError.message}`));
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

  async processVideo(youtubeUrl, founderName, referenceImagesPath, maxClips = 3) {
    try {
      console.log('🚀 Starting enhanced video processing pipeline...');
      
      // Load reference images data
      const referenceData = JSON.parse(fs.readFileSync(referenceImagesPath, 'utf8'));
      console.log(`🎯 Using ${referenceData.verified_images.length} verified reference images for ${founderName}`);
      
      // Step 1: Download video
      console.log('\n📥 Step 1: Downloading video...');
      const { videoPath, title } = await this.downloadVideo(youtubeUrl);
      console.log(`✅ Video saved: ${videoPath}`);
      
      // Step 2: Extract frames for visual analysis
      console.log('\n🎬 Step 2: Extracting frames...');
      const frames = await this.extractFrames(videoPath, 2); // Every 2 seconds
      const framesInfoPath = path.join(this.tempDir, 'frames_info.json');
      fs.writeFileSync(framesInfoPath, JSON.stringify(frames, null, 2));
      console.log(`✅ Frames info saved: ${framesInfoPath}`);
      
      // Step 3: Extract audio and detect speech
      console.log('\n🎵 Step 3: Processing audio...');
      const audioPath = await this.extractAudio(videoPath);
      console.log(`✅ Audio saved: ${audioPath}`);
      
      console.log('\n🗣️ Step 4: Detecting speech segments...');
      const speechSegments = await this.detectSpeechSegments(audioPath);
      const speechSegmentsPath = path.join(this.tempDir, 'speech_segments.json');
      fs.writeFileSync(speechSegmentsPath, JSON.stringify(speechSegments, null, 2));
      console.log(`✅ Speech segments saved: ${speechSegmentsPath}`);
      
      // Step 4: Find best clips with verified facial recognition
      console.log('\n🔍 Step 5: Analyzing video with verified facial recognition...');
      const bestClips = await this.findBestClipsWithReferences(videoPath, frames, speechSegments, referenceData);
      const bestClipsPath = path.join(this.tempDir, 'best_clips.json');
      fs.writeFileSync(bestClipsPath, JSON.stringify(bestClips, null, 2));
      console.log(`✅ Best clips analysis saved: ${bestClipsPath}`);
      
      if (bestClips.length === 0) {
        console.log('⚠️ No verified clips found with founder presence');
        return [];
      }
      
      // Step 5: Extract top clips
      console.log('\n✂️ Step 6: Extracting verified video clips...');
      const extractedClips = [];
      for (let i = 0; i < Math.min(maxClips, bestClips.length); i++) {
        const clip = bestClips[i];
        const clipPath = path.join(this.outputDir, `${title}_clip_${i + 1}.mp4`);
        
        console.log(`Extracting verified clip ${i + 1}/${Math.min(maxClips, bestClips.length)}: ${Math.round(clip.start)}s-${Math.round(clip.end)}s (score: ${clip.score.toFixed(1)})`);
        await this.extractClip(videoPath, clip.start, clip.end, clipPath);
        extractedClips.push({
          path: clipPath,
          ...clip
        });
      }
      
      const finalResultsPath = path.join(this.outputDir, `${title}_results.json`);
      fs.writeFileSync(finalResultsPath, JSON.stringify({
        title,
        videoPath,
        founderName,
        referenceImagesUsed: referenceData.verified_images.length,
        totalFrames: frames.length,
        speechSegments: speechSegments.length,
        verifiedClips: bestClips.length,
        extractedClips: extractedClips.length,
        clips: extractedClips
      }, null, 2));
      
      console.log('\n🎉 Enhanced processing complete!');
      console.log(`📁 Extracted ${extractedClips.length} verified clips to: ${this.outputDir}`);
      console.log(`🎯 All clips feature verified ${founderName} presence`);
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
  const founderName = process.argv[3];
  const referenceImagesPath = process.argv[4];
  
  if (!youtubeUrl || !founderName || !referenceImagesPath) {
    console.log('Usage: node process-video-with-references.js <youtube-url> <founder-name> <reference-images-json-path>');
    console.log('Example: node process-video-with-references.js https://www.youtube.com/watch?v=dQw4w9WgXcQ "Sam Altman" ./temp_reference_images.json');
    process.exit(1);
  }
  
  const processor = new VideoProcessorWithReferences();
  await processor.processVideo(youtubeUrl, founderName, referenceImagesPath, 3);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = VideoProcessorWithReferences; 