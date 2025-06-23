import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(request) {
  try {
    const { projectName, projectData } = await request.json();
    
    if (!projectName || !projectData) {
      return NextResponse.json({ error: 'Project name and data are required' }, { status: 400 });
    }
    
    const projectPath = path.join(process.cwd(), 'video_projects', projectName);
    const projectFile = path.join(projectPath, 'project.json');
    
    if (!fs.existsSync(projectPath)) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    
    // Update the modified timestamp
    const updatedProjectData = {
      ...projectData,
      modified: new Date().toISOString()
    };
    
    // Save the project file
    fs.writeFileSync(projectFile, JSON.stringify(updatedProjectData, null, 2));
    
    return NextResponse.json({
      success: true,
      message: 'Project saved successfully'
    });
    
  } catch (error) {
    console.error('Error saving video project:', error);
    return NextResponse.json({ 
      error: 'Failed to save video project',
      details: error.message 
    }, { status: 500 });
  }
} 