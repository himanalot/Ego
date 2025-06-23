import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectName = searchParams.get('projectName');
    
    if (!projectName) {
      return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
    }
    
    const projectPath = path.join(process.cwd(), 'video_projects', projectName);
    const projectFile = path.join(projectPath, 'project.json');
    
    if (!fs.existsSync(projectFile)) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    
    const projectData = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
    
    return NextResponse.json({
      success: true,
      projectData: projectData
    });
    
  } catch (error) {
    console.error('Error loading video project:', error);
    return NextResponse.json({ 
      error: 'Failed to load video project',
      details: error.message 
    }, { status: 500 });
  }
} 