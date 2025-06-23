#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class SingleClipFinder {
    constructor() {
        this.tempDir = './temp';
        this.outputDir = './processed_videos';
        this.targetDuration = 7; // seconds
        this.frameInterval = 0.25; // analyze every 0.5 seconds (much more strict)
    }

    async findPerfectClip(videoUrl, founderName) {
        console.error(`🎯 Finding ONE perfect 7-second clip of ${founderName}...`);
        
        // Download video
        const videoId = this.extractVideoId(videoUrl);
        const videoPath = await this.downloadVideo(videoUrl, videoId);
        
        // Get speech segments
        const speechSegments = await this.getBasicSpeechSegments(videoPath);
        console.error(`🎤 Found ${speechSegments.length} speech segments`);
        
        // Find the perfect 7-second clip
        const perfectClip = await this.findPerfectSinglePersonClip(videoPath, speechSegments, videoId);
        
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

    async getBasicSpeechSegments(videoPath) {
        // Ultra-strict approach: check many more time ranges
        // We'll scan the entire video in smaller chunks
        
        console.error('📍 Scanning entire video for single-person segments...');
        const segments = [];
        
        // Check every 2 minutes of the video for 1-minute windows
        for (let start = 30; start < 2400; start += 120) { // up to 40 minutes
            segments.push({ start: start, end: start + 60 });
        }
        
        return segments;
    }

    async findPerfectSinglePersonClip(videoPath, segments, videoId) {
        console.error(`🔍 Analyzing segments for perfect single-person clip...`);
        
        for (const segment of segments) {
            console.error(`📊 Checking ${segment.start}s - ${segment.end}s...`);
            
            // Try different 7-second windows within this segment (every 1 second)
            for (let start = segment.start; start <= segment.end - this.targetDuration; start += 1) {
                const end = start + this.targetDuration;
                
                // Analyze every second of this 7-second window
                const isCleanClip = await this.analyzeClipForSinglePerson(videoPath, start, end, videoId);
                
                if (isCleanClip) {
                    // Extract the perfect clip
                    const clipPath = path.join(this.outputDir, `perfect_${videoId}_clip.mp4`);
                    execSync(`ffmpeg -ss ${start} -i "${videoPath}" -t ${this.targetDuration} -c copy "${clipPath}" -y`, {
                        stdio: ['pipe', 'pipe', 'inherit']
                    });
                    
                    return {
                        path: clipPath,
                        start: start,
                        end: end,
                        duration: this.targetDuration,
                        confidence: 1.0
                    };
                }
            }
        }
        
        return null;
    }

    async analyzeClipForSinglePerson(videoPath, startTime, endTime, videoId) {
        console.error(`  🔎 Analyzing ${startTime}s-${endTime}s (${endTime - startTime}s)...`);
        
        // Check every 0.5 seconds in this clip for maximum strictness
        const checkPoints = [];
        for (let t = startTime; t < endTime; t += this.frameInterval) {
            checkPoints.push(t);
        }
        
        console.error(`    📊 Checking ${checkPoints.length} frames for consistency...`);
        
        for (const t of checkPoints) {
            const faceCount = await this.getFaceCountAtTime(videoPath, t, videoId);
            
            if (faceCount !== 1) {
                console.error(`    ❌ ${t.toFixed(1)}s: ${faceCount} faces detected`);
                return false; // Not a single-person clip
            } else {
                console.error(`    ✓ ${t.toFixed(1)}s: 1 face ✓`);
            }
        }
        
        console.error(`    ✅ ULTRA-STRICT: Perfect single-person clip found!`);
        return true;
    }

    async getFaceCountAtTime(videoPath, timeSeconds, videoId) {
        const framePath = path.join(this.tempDir, 'frames', `check_${videoId}_${timeSeconds}.jpg`);
        
        try {
            // Extract frame
            execSync(`ffmpeg -ss ${timeSeconds} -i "${videoPath}" -frames:v 1 "${framePath}" -y`, {
                stdio: ['pipe', 'pipe', 'pipe']
            });
            
            // Analyze faces
            const result = execSync(`python3 scripts/simple_face_detector.py "${framePath}"`, { 
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'pipe']
            });
            
            const analysis = JSON.parse(result.trim());
            
            // Clean up
            if (fs.existsSync(framePath)) {
                fs.unlinkSync(framePath);
            }
            
            return analysis.faceCount;
        } catch (error) {
            console.error(`    ⚠️  Error analyzing frame at ${timeSeconds}s: ${error.message}`);
            return 0;
        }
    }
}

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.error('Usage: node find-single-clip.js <youtube-url> <founder-name>');
        process.exit(1);
    }
    
    const [videoUrl, founderName] = args;
    const finder = new SingleClipFinder();
    
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

module.exports = SingleClipFinder; 