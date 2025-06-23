#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class FastStrictClipFinder {
    constructor() {
        this.tempDir = './temp';
        this.outputDir = './processed_videos';
        this.targetDuration = 8; // seconds
        this.frameRate = 2; // extract 2 frames per second for analysis
    }

    async findPerfectClip(videoUrl, founderName) {
        console.error(`🎯 Finding ONE perfect 8-second clip of ${founderName} (FAST MODE)...`);
        
        // Download video
        const videoId = this.extractVideoId(videoUrl);
        const videoPath = await this.downloadVideo(videoUrl, videoId);
        
        // Extract ALL frames at once (much faster)
        console.error(`🎬 Extracting frames from entire video...`);
        await this.extractAllFrames(videoPath, videoId);
        
        // Process frames in chunks and check for perfect clips as we go
        console.error(`🔍 Analyzing frames in batches (stopping when perfect clip found)...`);
        const perfectClip = await this.findPerfectClipEarly(videoPath, videoId);
        
        if (perfectClip) {
            console.error(`✅ Found perfect clip: ${perfectClip.start}s - ${perfectClip.end}s`);
            return perfectClip;
        } else {
            console.error(`❌ No perfect single-person clip found`);
            return null;
        }
    }

    extractVideoId(url) {
        const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
        return match ? match[1] : Math.random().toString(36).substring(7);
    }

    async downloadVideo(videoUrl, videoId) {
        const videoPath = path.join(this.tempDir, `video_${videoId}.mp4`);
        
        if (fs.existsSync(videoPath)) {
            console.error(`📁 Video already exists`);
            return videoPath;
        }

        console.error('📥 Downloading video...');
        execSync(`yt-dlp -f "best[height<=720]" -o "${videoPath}" "${videoUrl}"`, {
            stdio: ['pipe', 'pipe', 'inherit']
        });
        
        return videoPath;
    }

    async extractAllFrames(videoPath, videoId) {
        const framesDir = path.join(this.tempDir, `frames_${videoId}`);
        
        // Clean up old frames
        if (fs.existsSync(framesDir)) {
            execSync(`rm -rf "${framesDir}"`);
        }
        fs.mkdirSync(framesDir, { recursive: true });
        
        // Extract frames at 2 FPS (every 0.5 seconds) for first 30 minutes
        console.error(`📸 Extracting frames at ${this.frameRate} FPS...`);
        
        const framePattern = path.join(framesDir, 'frame_%04d.jpg');
        execSync(`ffmpeg -i "${videoPath}" -vf fps=${this.frameRate} -t 1800 "${framePattern}" -y`, {
            stdio: ['pipe', 'pipe', 'inherit']
        });
        
        const frameCount = fs.readdirSync(framesDir).length;
        console.error(`✅ Extracted ${frameCount} frames`);
        
        return framesDir;
    }

    async batchAnalyzeFrames(videoId) {
        const framesDir = path.join(this.tempDir, `frames_${videoId}`);
        const frameFiles = fs.readdirSync(framesDir).sort();
        
        console.error(`🔍 Analyzing ${frameFiles.length} frames in batches...`);
        
        const analysis = {};
        const batchSize = 20; // Process 20 frames at a time
        
        for (let i = 0; i < frameFiles.length; i += batchSize) {
            const batch = frameFiles.slice(i, i + batchSize);
            console.error(`  📊 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(frameFiles.length/batchSize)}...`);
            
            // Process batch in parallel
            const promises = batch.map(async (frameFile) => {
                const framePath = path.join(framesDir, frameFile);
                const frameNumber = parseInt(frameFile.match(/frame_(\d+)\.jpg/)[1]);
                const timeSeconds = (frameNumber - 1) / this.frameRate; // Convert frame number to time
                
                try {
                    const result = execSync(`python3 scripts/simple_face_detector.py "${framePath}"`, { 
                        encoding: 'utf8',
                        stdio: ['pipe', 'pipe', 'pipe']
                    });
                    
                    const faceAnalysis = JSON.parse(result.trim());
                    return { time: timeSeconds, faceCount: faceAnalysis.faceCount };
                } catch (error) {
                    return { time: timeSeconds, faceCount: 0 };
                }
            });
            
            const batchResults = await Promise.all(promises);
            
            // Store results
            batchResults.forEach(result => {
                analysis[result.time] = result.faceCount;
            });
        }
        
        console.error(`✅ Analyzed ${Object.keys(analysis).length} frames`);
        return analysis;
    }

    async findPerfectClipFromAnalysis(videoPath, frameAnalysis, videoId) {
        console.error(`🎯 Finding perfect 8-second clip from analysis...`);
        
        const times = Object.keys(frameAnalysis).map(t => parseFloat(t)).sort((a, b) => a - b);
        
        // Look for 8-second windows where ALL frames have exactly 1 face
        // Stop as soon as we find the FIRST perfect clip
        for (let startTime = 30; startTime < 1800 - this.targetDuration; startTime += 0.5) {
            const endTime = startTime + this.targetDuration;
            
            // Get all frame times in this window
            const windowFrames = times.filter(t => t >= startTime && t <= endTime);
            
            if (windowFrames.length === 0) continue;
            
            // Check if ALL frames in this window have exactly 1 face
            const allSinglePerson = windowFrames.every(t => frameAnalysis[t] === 1);
            
            if (allSinglePerson && windowFrames.length >= 12) { // At least 12 frames (6 seconds worth at 2fps)
                console.error(`  🎯 FIRST perfect window found: ${startTime}s-${endTime}s (${windowFrames.length} frames)`);
                console.error(`  🚀 Stopping search and extracting clip immediately!`);
                
                // Extract the perfect clip
                const clipPath = path.join(this.outputDir, `ultra_perfect_${videoId}_clip.mp4`);
                execSync(`ffmpeg -ss ${startTime} -i "${videoPath}" -t ${this.targetDuration} -c copy "${clipPath}" -y`, {
                    stdio: ['pipe', 'pipe', 'inherit']
                });
                
                return {
                    path: clipPath,
                    start: startTime,
                    end: endTime,
                    duration: this.targetDuration,
                    confidence: 1.0,
                    framesAnalyzed: windowFrames.length
                };
            }
        }
        
        console.error(`❌ No perfect 8-second clip found with consistent single-person shots`);
        return null;
    }

    async findPerfectClipEarly(videoPath, videoId) {
        const framesDir = path.join(this.tempDir, `frames_${videoId}`);
        const frameFiles = fs.readdirSync(framesDir).sort();
        
        console.error(`🔍 Processing ${frameFiles.length} frames and checking for perfect clips...`);
        
        const analysis = {};
        const batchSize = 30; // Process 30 frames at a time (15 seconds worth)
        
        for (let i = 0; i < frameFiles.length; i += batchSize) {
            const batch = frameFiles.slice(i, i + batchSize);
            console.error(`  📊 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(frameFiles.length/batchSize)}...`);
            
            // Process batch in parallel
            const promises = batch.map(async (frameFile) => {
                const framePath = path.join(framesDir, frameFile);
                const frameNumber = parseInt(frameFile.match(/frame_(\d+)\.jpg/)[1]);
                const timeSeconds = (frameNumber - 1) / this.frameRate;
                
                try {
                    const result = execSync(`python3 scripts/simple_face_detector.py "${framePath}"`, { 
                        encoding: 'utf8',
                        stdio: ['pipe', 'pipe', 'pipe']
                    });
                    
                    const faceAnalysis = JSON.parse(result.trim());
                    return { time: timeSeconds, faceCount: faceAnalysis.faceCount };
                } catch (error) {
                    return { time: timeSeconds, faceCount: 0 };
                }
            });
            
            const batchResults = await Promise.all(promises);
            
            // Store results
            batchResults.forEach(result => {
                analysis[result.time] = result.faceCount;
            });
            
            // Check if we can find a perfect clip with current analysis
            const perfectClip = await this.checkForPerfectClip(videoPath, analysis, videoId);
            if (perfectClip) {
                console.error(`🎯 Found perfect clip early! Stopping analysis.`);
                return perfectClip;
            }
        }
        
        console.error(`❌ No perfect clip found after analyzing all frames`);
        return null;
    }

    async checkForPerfectClip(videoPath, frameAnalysis, videoId) {
        const times = Object.keys(frameAnalysis).map(t => parseFloat(t)).sort((a, b) => a - b);
        
        // Only check if we have enough frames to potentially find a 7-second clip
        if (times.length < 14) return null; // Need at least 14 frames (7 seconds at 2fps)
        
        // Look for 7-second windows where ALL frames have exactly 1 face
        for (let startTime = 30; startTime < Math.max(...times) - this.targetDuration + 1; startTime += 0.5) {
            const endTime = startTime + this.targetDuration;
            
            // Get all frame times in this window
            const windowFrames = times.filter(t => t >= startTime && t <= endTime);
            
            if (windowFrames.length < 12) continue; // Need at least 12 frames
            
            // Check if ALL frames in this window have exactly 1 face
            const allSinglePerson = windowFrames.every(t => frameAnalysis[t] === 1);
            
            if (allSinglePerson) {
                console.error(`  🎯 PERFECT CLIP FOUND: ${startTime}s-${endTime}s (${windowFrames.length} frames)`);
                
                // Extract the perfect clip
                const clipPath = path.join(this.outputDir, `ultra_perfect_${videoId}_clip.mp4`);
                execSync(`ffmpeg -ss ${startTime} -i "${videoPath}" -t ${this.targetDuration} -c copy "${clipPath}" -y`, {
                    stdio: ['pipe', 'pipe', 'inherit']
                });
                
                return {
                    path: clipPath,
                    start: startTime,
                    end: endTime,
                    duration: this.targetDuration,
                    confidence: 1.0,
                    framesAnalyzed: windowFrames.length
                };
            }
        }
        
        return null;
    }
}

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.error('Usage: node fast-strict-clip-finder.js <youtube-url> <founder-name>');
        process.exit(1);
    }
    
    const [videoUrl, founderName] = args;
    const finder = new FastStrictClipFinder();
    
    finder.findPerfectClip(videoUrl, founderName)
        .then(clip => {
            if (clip) {
                console.log(JSON.stringify(clip, null, 2));
            } else {
                console.log('null');
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('❌ Error:', error.message);
            process.exit(1);
        });
}

module.exports = FastStrictClipFinder; 