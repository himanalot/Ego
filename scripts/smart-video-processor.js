#!/usr/bin/env node

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class SmartVideoProcessor {
    constructor() {
        this.tempDir = './temp';
        this.outputDir = './processed_videos';
        this.ensureDirectories();
    }

    ensureDirectories() {
        [this.tempDir, this.outputDir, `${this.tempDir}/frames`].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }

    async processVideo(videoUrl, founderName, maxClips = 3) {
        console.error(`🎬 Smart processing video for: ${founderName}`);
        
        // Step 1: Download video
        const videoId = this.extractVideoId(videoUrl);
        const videoPath = await this.downloadVideo(videoUrl, videoId);
        
        // Step 2: Get speech segments using reliable audio analysis
        const speechSegments = await this.extractSpeechSegments(videoPath);
        console.error(`🎤 Found ${speechSegments.length} speech segments`);
        
        // Step 3: Analyze each segment for single-person shots
        const singlePersonSegments = await this.findSinglePersonSegments(
            videoPath, speechSegments, founderName, videoId
        );
        
        // Step 4: Extract best clips
        const extractedClips = await this.extractBestClips(
            videoPath, singlePersonSegments, videoId, maxClips
        );
        
        // Step 5: Save results
        const results = {
            title: `video_${videoId}`,
            videoPath: videoPath,
            founderName: founderName,
            totalSpeechSegments: speechSegments.length,
            singlePersonSegments: singlePersonSegments.length,
            extractedClips: extractedClips.length,
            clips: extractedClips
        };
        
        const resultsPath = path.join(this.outputDir, `video_${videoId}_smart_results.json`);
        fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
        
        console.error(`✅ Smart processing complete! Found ${extractedClips.length} single-person clips`);
        return results;
    }

    extractVideoId(url) {
        const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
        return match ? match[1] : Math.random().toString(36).substring(7);
    }

    async downloadVideo(videoUrl, videoId) {
        const videoPath = path.join(this.tempDir, `video_${videoId}.mp4`);
        
        if (fs.existsSync(videoPath)) {
            console.error(`📁 Video already exists: ${videoPath}`);
            return videoPath;
        }

        console.error('📥 Downloading video...');
        
        try {
            execSync(`yt-dlp -f "best[height<=720]" -o "${videoPath}" "${videoUrl}"`, {
                stdio: ['pipe', 'pipe', 'inherit']
            });
            
            const stats = fs.statSync(videoPath);
            console.error(`✅ Downloaded: ${(stats.size / 1024 / 1024).toFixed(1)}MB`);
            return videoPath;
        } catch (error) {
            throw new Error(`Failed to download video: ${error.message}`);
        }
    }

    async extractSpeechSegments(videoPath, minDuration = 7) {
        console.error('🎤 Extracting speech segments...');
        
        // Use FFmpeg to detect speech segments
        const audioPath = path.join(this.tempDir, 'audio.wav');
        
        // Extract audio
        execSync(`ffmpeg -i "${videoPath}" -ac 1 -ar 16000 "${audioPath}" -y`, {
            stdio: ['pipe', 'pipe', 'inherit']
        });
        
        // Use silencedetect to find speech segments
        const silenceCmd = `ffmpeg -i "${audioPath}" -af silencedetect=noise=-30dB:duration=1 -f null - 2>&1`;
        const silenceOutput = execSync(silenceCmd, { encoding: 'utf8' });
        
        // Parse silence detection output to find speech segments
        const segments = this.parseSilenceDetection(silenceOutput, minDuration);
        
        // Clean up
        if (fs.existsSync(audioPath)) {
            fs.unlinkSync(audioPath);
        }
        
        return segments;
    }

    parseSilenceDetection(output, minDuration) {
        const lines = output.split('\n');
        const silenceEvents = [];
        
        // Extract silence start and end times
        for (const line of lines) {
            if (line.includes('silence_start')) {
                const match = line.match(/silence_start: ([\d.]+)/);
                if (match) silenceEvents.push({ type: 'start', time: parseFloat(match[1]) });
            } else if (line.includes('silence_end')) {
                const match = line.match(/silence_end: ([\d.]+)/);
                if (match) silenceEvents.push({ type: 'end', time: parseFloat(match[1]) });
            }
        }
        
        // Convert silence events to speech segments
        const segments = [];
        let speechStart = 0;
        
        for (const event of silenceEvents) {
            if (event.type === 'start' && speechStart < event.time) {
                const duration = event.time - speechStart;
                if (duration >= minDuration) {
                    segments.push({
                        start: speechStart,
                        end: event.time,
                        duration: duration
                    });
                }
            } else if (event.type === 'end') {
                speechStart = event.time;
            }
        }
        
        return segments;
    }

    async findSinglePersonSegments(videoPath, speechSegments, founderName, videoId) {
        console.error('👤 Analyzing segments for single-person shots...');
        
        const singlePersonSegments = [];
        
        for (let i = 0; i < speechSegments.length; i++) {
            const segment = speechSegments[i];
            console.error(`📊 Analyzing segment ${i + 1}/${speechSegments.length} (${segment.duration.toFixed(1)}s)`);
            
            // Sample 3 frames from this segment: start, middle, end
            const sampleTimes = [
                segment.start + 1,
                segment.start + (segment.duration / 2),
                segment.end - 1
            ];
            
            let isSinglePerson = true;
            let faceCount = 0;
            
            for (const sampleTime of sampleTimes) {
                const frameAnalysis = await this.analyzeFrameAtTime(videoPath, sampleTime, videoId);
                
                if (frameAnalysis.faceCount > 1) {
                    isSinglePerson = false;
                    break;
                } else if (frameAnalysis.faceCount === 1) {
                    faceCount++;
                }
            }
            
            // Require at least 2 out of 3 sample frames to have exactly 1 face
            if (isSinglePerson && faceCount >= 2) {
                singlePersonSegments.push({
                    ...segment,
                    confidence: faceCount / 3, // 0.67 or 1.0
                    analysis: 'single_person_detected'
                });
                console.error(`✅ Single-person segment found: ${segment.start.toFixed(1)}s - ${segment.end.toFixed(1)}s`);
            }
        }
        
        console.error(`🎯 Found ${singlePersonSegments.length} single-person segments`);
        return singlePersonSegments;
    }

    async analyzeFrameAtTime(videoPath, timeSeconds, videoId) {
        const framePath = path.join(this.tempDir, 'frames', `frame_${videoId}_${timeSeconds.toFixed(1)}.jpg`);
        
        // Extract frame at specific time
        execSync(`ffmpeg -ss ${timeSeconds} -i "${videoPath}" -frames:v 1 "${framePath}" -y`, {
            stdio: ['pipe', 'pipe', 'inherit']
        });
        
        try {
            // Use external Python script for face detection
            const result = execSync(`python3 scripts/simple_face_detector.py "${framePath}"`, { 
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'pipe']
            });
            const analysis = JSON.parse(result.trim());
            
            // Clean up frame
            if (fs.existsSync(framePath)) {
                fs.unlinkSync(framePath);
            }
            
            return analysis;
        } catch (error) {
            console.error(`❌ Frame analysis failed: ${error.message}`);
            // Clean up frame on error too
            if (fs.existsSync(framePath)) {
                fs.unlinkSync(framePath);
            }
            return { faceCount: 0, error: error.message };
        }
    }

    async extractBestClips(videoPath, segments, videoId, maxClips) {
        console.error(`🎬 Extracting ${maxClips} best clips...`);
        
        // Sort by confidence and duration
        const sortedSegments = segments
            .sort((a, b) => (b.confidence * b.duration) - (a.confidence * a.duration))
            .slice(0, maxClips);
        
        const extractedClips = [];
        
        for (let i = 0; i < sortedSegments.length; i++) {
            const segment = sortedSegments[i];
            const clipPath = path.join(this.outputDir, `video_${videoId}_single_person_clip_${i + 1}.mp4`);
            
            // Extract clip
            execSync(`ffmpeg -ss ${segment.start} -i "${videoPath}" -t ${segment.duration} -c copy "${clipPath}" -y`, {
                stdio: ['pipe', 'pipe', 'inherit']
            });
            
            extractedClips.push({
                path: clipPath,
                start: segment.start,
                end: segment.end,
                duration: segment.duration,
                confidence: segment.confidence,
                analysis: segment.analysis
            });
            
            console.error(`✅ Extracted clip ${i + 1}: ${segment.duration.toFixed(1)}s (confidence: ${segment.confidence.toFixed(2)})`);
        }
        
        return extractedClips;
    }
}

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.error('Usage: node smart-video-processor.js <youtube-url> <founder-name>');
        process.exit(1);
    }
    
    const [videoUrl, founderName] = args;
    const processor = new SmartVideoProcessor();
    
    processor.processVideo(videoUrl, founderName)
        .then(results => {
            console.log(JSON.stringify(results, null, 2));
        })
        .catch(error => {
            console.error('❌ Processing failed:', error.message);
            process.exit(1);
        });
}

module.exports = SmartVideoProcessor; 