import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const projectsDir = path.join(process.cwd(), 'video_projects');
    const instagramPostsDir = path.join(process.cwd(), 'instagram_posts');
    
    // Create directories if they don't exist
    if (!fs.existsSync(projectsDir)) {
      fs.mkdirSync(projectsDir, { recursive: true });
    }
    
    const projects = [];
    
    // Look for .project reference files in instagram_posts
    if (fs.existsSync(instagramPostsDir)) {
      const files = fs.readdirSync(instagramPostsDir);
      
      for (const file of files) {
        if (file.endsWith('.project')) {
          try {
            const projectRefPath = path.join(instagramPostsDir, file);
            const projectRef = JSON.parse(fs.readFileSync(projectRefPath, 'utf8'));
            
            // Check if project directory and files still exist
            if (fs.existsSync(projectRef.projectPath) && 
                fs.existsSync(projectRef.projectFile)) {
              
              const projectName = path.basename(projectRef.projectPath);
              projects.push({
                name: projectName,
                projectPath: projectRef.projectPath,
                projectFile: projectRef.projectFile,
                renderedVideo: projectRef.renderedVideo,
                created: projectRef.created
              });
            }
          } catch (error) {
            console.error(`Error reading project reference ${file}:`, error);
          }
        }
      }
    }
    
    // Also scan the video_projects directory directly
    if (fs.existsSync(projectsDir)) {
      const projectFolders = fs.readdirSync(projectsDir);
      
      for (const folder of projectFolders) {
        const projectPath = path.join(projectsDir, folder);
        const projectFile = path.join(projectPath, 'project.json');
        
        if (fs.existsSync(projectFile)) {
          try {
            const projectData = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
            
            // Check if this project is already in our list
            const existingProject = projects.find(p => p.name === folder);
            if (!existingProject) {
              projects.push({
                name: folder,
                projectPath: projectPath,
                projectFile: projectFile,
                renderedVideo: path.join(projectPath, 'rendered_video.mp4'),
                created: projectData.created || new Date().toISOString()
              });
            }
          } catch (error) {
            console.error(`Error reading project ${folder}:`, error);
          }
        }
      }
    }
    
    // Sort by creation date (newest first)
    projects.sort((a, b) => new Date(b.created) - new Date(a.created));
    
    return NextResponse.json({
      success: true,
      projects: projects
    });
    
  } catch (error) {
    console.error('Error listing video projects:', error);
    return NextResponse.json({ 
      error: 'Failed to list video projects',
      details: error.message 
    }, { status: 500 });
  }
} 