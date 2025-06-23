import { promises as fs } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST(req) {
  try {
    const { clipPath, storyText, bold = false, italic = false } = await req.json();
    
    if (!clipPath || !storyText) {
      return Response.json({ 
        success: false, 
        error: 'Missing clipPath or storyText' 
      }, { status: 400 });
    }

    console.log('📝 Editing video text for clip:', clipPath);
    
    // Generate timestamp for unique output filename
    const timestamp = Date.now();
    const inputPath = path.join(process.cwd(), clipPath);
    const outputFileName = `edited_${timestamp}.mp4`;
    const outputPath = path.join(process.cwd(), 'instagram_posts', outputFileName);
    
    // Check if input file exists
    try {
      await fs.access(inputPath);
    } catch (error) {
      return Response.json({ 
        success: false, 
        error: `Input clip not found: ${clipPath}` 
      }, { status: 404 });
    }

    // Create a temporary story file
    const tempStoryPath = path.join(process.cwd(), `temp_story_${timestamp}.txt`);
    await fs.writeFile(tempStoryPath, storyText);

    try {
      // Run the create-instagram-post script with the new text
      const scriptPath = path.join(process.cwd(), 'scripts', 'create-instagram-post.js');
      const command = `node "${scriptPath}" "${inputPath}" "${tempStoryPath}" "${outputPath}"`;
      
      console.log('🎬 Running video edit command:', command);
      
      const { stdout, stderr } = await execAsync(command, {
        cwd: process.cwd(),
        timeout: 60000 // 60 second timeout
      });
      
      if (stderr) {
        console.log('⚠️ Script stderr:', stderr);
      }
      
      console.log('📤 Script stdout:', stdout);
      
      // Check if output file was created
      try {
        await fs.access(outputPath);
        console.log('✅ Video successfully edited:', outputPath);
        
        // Clean up temp story file
        await fs.unlink(tempStoryPath);
        
        return Response.json({
          success: true,
          outputPath: `instagram_posts/${outputFileName}`,
          message: 'Video text updated successfully'
        });
        
      } catch (error) {
        console.error('❌ Output file not found:', outputPath);
        return Response.json({ 
          success: false, 
          error: 'Video editing failed - output file not created' 
        }, { status: 500 });
      }
      
    } catch (error) {
      console.error('❌ Script execution failed:', error);
      
      // Clean up temp file
      try {
        await fs.unlink(tempStoryPath);
      } catch (cleanupError) {
        console.error('Error cleaning up temp file:', cleanupError);
      }
      
      return Response.json({ 
        success: false, 
        error: `Script execution failed: ${error.message}` 
      }, { status: 500 });
    }

  } catch (error) {
    console.error('❌ Error in edit-video-text API:', error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
} 