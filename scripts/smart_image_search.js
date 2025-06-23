const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execAsync = promisify(exec);

function runPythonWithInput(command, args, input) {
    return new Promise((resolve, reject) => {
        const process = spawn(command, args);
        
        let stdout = '';
        let stderr = '';
        
        process.stdout.on('data', (data) => {
            stdout += data.toString();
        });
        
        process.stderr.on('data', (data) => {
            stderr += data.toString();
        });
        
        process.on('close', (code) => {
            if (code === 0) {
                resolve({ stdout, stderr });
            } else {
                reject(new Error(`Process exited with code ${code}: ${stderr}`));
            }
        });
        
        process.on('error', (error) => {
            reject(error);
        });
        
        // Send input to stdin
        process.stdin.write(input);
        process.stdin.end();
    });
}

async function smartImageSearch(founderName) {
    try {
        console.error(`🔍 Starting smart image search for ${founderName}...`);
        
        // Step 1: Search for images using DuckDuckGo
        console.error('📸 Step 1: Searching for images...');
        
        const { stdout: searchOutput } = await execAsync(`node scripts/duckduckgo_image_search.js "${founderName}"`, {
            cwd: process.cwd(),
            timeout: 60000
        });
        
        const searchResult = JSON.parse(searchOutput);
        
        if (!searchResult.success || !searchResult.imageUrls.length) {
            console.log(JSON.stringify({
                success: false,
                error: 'No images found in search',
                searchResult: searchResult
            }));
            return;
        }
        
        console.error(`✅ Found ${searchResult.imageUrls.length} images from search`);
        
        // Step 2: Apply facial recognition to verify and rank images
        console.error('🧠 Step 2: Applying facial recognition...');
        
        const { stdout: faceOutput, stderr: faceErrors } = await runPythonWithInput(
            'python3', 
            ['scripts/face_recognition_search.py', founderName], 
            JSON.stringify(searchResult)
        );
        
        // Log any errors from the Python script
        if (faceErrors) {
            console.error('Python script errors:', faceErrors);
        }
        
        const faceResult = JSON.parse(faceOutput);
        
        if (!faceResult.success) {
            console.log(JSON.stringify({
                success: false,
                error: 'Facial recognition failed',
                details: faceResult.error,
                searchResult: searchResult
            }));
            return;
        }
        
        console.error(`🎯 Found ${faceResult.faces_found} faces, ${faceResult.high_quality_faces} high quality`);
        
        // Step 3: Return combined results
        const result = {
            success: true,
            founder_name: founderName,
            search_stats: {
                total_images_found: searchResult.totalFound,
                unique_images: searchResult.uniqueFound,
                processed_images: faceResult.total_images_processed
            },
            face_stats: {
                faces_found: faceResult.faces_found,
                high_quality_faces: faceResult.high_quality_faces
            },
            best_images: faceResult.best_images.map(img => ({
                url: img.url,
                quality_score: Math.round(img.quality_score * 100) / 100,
                confidence: Math.round(img.confidence * 100) / 100,
                overall_score: Math.round(img.quality_score * img.confidence * 100) / 100,
                face_area: img.face_area,
                is_primary_face: img.is_primary_face,
                image_dimensions: img.image_dimensions
            })),
            verified_image_urls: faceResult.best_images.map(img => img.url)
        };
        
        console.log(JSON.stringify(result));
        
    } catch (error) {
        console.log(JSON.stringify({
            success: false,
            error: error.message,
            founder_name: founderName
        }));
    }
}

// Get founder name from command line arguments
const founderName = process.argv[2];
if (!founderName) {
    console.log(JSON.stringify({
        success: false,
        error: "Founder name is required"
    }));
    process.exit(1);
}

smartImageSearch(founderName); 