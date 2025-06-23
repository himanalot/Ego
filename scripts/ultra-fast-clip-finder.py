#!/usr/bin/env python3
import cv2
import numpy as np
import torch
import time
import sys
import json
import os
import subprocess
from pathlib import Path
import face_recognition

class UltraFastClipFinder:
    def __init__(self):
        self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
        self.target_duration = 8
        self.temp_dir = './temp'
        self.output_dir = './processed_videos'
        self.main_speaker_encoding = None
        
        # Ensure directories exist
        os.makedirs(self.temp_dir, exist_ok=True)
        os.makedirs(self.output_dir, exist_ok=True)
        
        print(f"🚀 Ultra-fast mode initialized on {self.device}", file=sys.stderr)
        
        # Initialize face detector
        self.init_face_detector()
        
    def init_face_detector(self):
        """Initialize the fastest available face detector"""
        try:
            # Try MTCNN first (most accurate)
            from facenet_pytorch import MTCNN
            self.mtcnn = MTCNN(
                device=self.device, 
                post_process=False,
                select_largest=False,
                min_face_size=40
            )
            self.detector_type = 'mtcnn'
            print(f"✅ MTCNN loaded on {self.device}", file=sys.stderr)
        except ImportError:
            # Fallback to OpenCV DNN
            self.init_opencv_detector()
            
    def init_opencv_detector(self):
        """Fallback to OpenCV DNN face detector"""
        try:
            # Download models if they don't exist
            model_dir = os.path.join(self.temp_dir, 'opencv_models')
            os.makedirs(model_dir, exist_ok=True)
            
            pb_file = os.path.join(model_dir, 'opencv_face_detector_uint8.pb')
            pbtxt_file = os.path.join(model_dir, 'opencv_face_detector.pbtxt')
            
            if not os.path.exists(pb_file):
                print("📥 Downloading OpenCV face detection model...", file=sys.stderr)
                subprocess.run([
                    'wget', '-O', pb_file,
                    'https://github.com/opencv/opencv_3rdparty/raw/dnn_samples_face_detector_20170830/opencv_face_detector_uint8.pb'
                ], check=True)
                
            if not os.path.exists(pbtxt_file):
                # Create the pbtxt file
                pbtxt_content = """name: "OpenCVFaceDetector"
input: "data"
input_dim: 1
input_dim: 3
input_dim: 300
input_dim: 300

layer {
  name: "detection_out"
  type: "DetectionOutput"
  bottom: "mbox_conf_reshape"
  bottom: "mbox_loc"
  bottom: "mbox_priorbox"
  top: "detection_out"
  detection_output_param {
    num_classes: 2
    share_location: true
    background_label_id: 0
    nms_param {
      nms_threshold: 0.45
      top_k: 400
    }
    code_type: CENTER_SIZE
    keep_top_k: 200
    confidence_threshold: 0.5
  }
}"""
                with open(pbtxt_file, 'w') as f:
                    f.write(pbtxt_content)
            
            self.net = cv2.dnn.readNetFromTensorflow(pb_file, pbtxt_file)
            
            # Try to use GPU if available
            if cv2.cuda.getCudaEnabledDeviceCount() > 0:
                self.net.setPreferableBackend(cv2.dnn.DNN_BACKEND_CUDA)
                self.net.setPreferableTarget(cv2.dnn.DNN_TARGET_CUDA)
                print("✅ OpenCV DNN loaded with CUDA", file=sys.stderr)
            else:
                self.net.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
                self.net.setPreferableTarget(cv2.dnn.DNN_TARGET_CPU)
                print("✅ OpenCV DNN loaded with CPU", file=sys.stderr)
                
            self.detector_type = 'opencv'
            
        except Exception as e:
            print(f"❌ Failed to initialize face detector: {e}", file=sys.stderr)
            sys.exit(1)
    
    def extract_video_id(self, url):
        """Extract video ID from YouTube URL"""
        import re
        match = re.search(r'(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)', url)
        return match.group(1) if match else f"video_{int(time.time())}"
    
    def download_video(self, video_url):
        """Download video using yt-dlp"""
        video_id = self.extract_video_id(video_url)
        video_path = os.path.join(self.temp_dir, f"ultra_video_{video_id}.mp4")
        
        if os.path.exists(video_path):
            print(f"📁 Video already exists: {video_path}", file=sys.stderr)
            return video_path, video_id
        
        print("📥 Downloading video...", file=sys.stderr)
        try:
            subprocess.run([
                'yt-dlp', 
                '-f', 'best[height<=720]',
                '-o', video_path,
                video_url
            ], check=True, stderr=subprocess.DEVNULL)
            
            print(f"✅ Downloaded: {video_path}", file=sys.stderr)
            return video_path, video_id
            
        except subprocess.CalledProcessError as e:
            print(f"❌ Download failed: {e}", file=sys.stderr)
            sys.exit(1)
    
    def detect_faces_with_encodings(self, frames):
        """Extract face encodings from frames"""
        results = []
        
        for frame in frames:
            try:
                # Resize for faster processing
                h, w = frame.shape[:2]
                if w > 640:
                    scale = 640 / w
                    new_w, new_h = int(w * scale), int(h * scale)
                    frame = cv2.resize(frame, (new_w, new_h))
                
                # Find face locations and encodings
                face_locations = face_recognition.face_locations(frame, model="hog")
                
                if len(face_locations) == 1:
                    # Single face - get encoding
                    face_encodings = face_recognition.face_encodings(frame, face_locations)
                    if len(face_encodings) > 0:
                        results.append(face_encodings[0])  # Store the 128-dim vector
                    else:
                        results.append(None)
                else:
                    # No faces or multiple faces
                    results.append(None)
                        
            except Exception as e:
                print(f"⚠️ Face recognition error: {e}", file=sys.stderr)
                results.append(None)
        
        return results
    
    def detect_faces_opencv(self, frames):
        """Detect faces using OpenCV DNN (batch processing)"""
        try:
            face_counts = []
            
            for frame in frames:
                # Resize for faster processing
                h, w = frame.shape[:2]
                if w > 640:
                    scale = 640 / w
                    new_w, new_h = int(w * scale), int(h * scale)
                    frame = cv2.resize(frame, (new_w, new_h))
                
                # Create blob
                blob = cv2.dnn.blobFromImage(frame, 1.0, (300, 300), [104, 117, 123])
                self.net.setInput(blob)
                detections = self.net.forward()
                
                # Count faces with confidence > 0.5
                face_count = 0
                for i in range(detections.shape[2]):
                    confidence = detections[0, 0, i, 2]
                    if confidence > 0.5:
                        face_count += 1
                
                face_counts.append(face_count)
            
            return face_counts
            
        except Exception as e:
            print(f"⚠️ OpenCV detection error: {e}", file=sys.stderr)
            return [0] * len(frames)
    
    def process_batch(self, frames):
        """Process a batch of frames for face encoding extraction"""
        return self.detect_faces_with_encodings(frames)
    
    def check_for_perfect_clip(self, results):
        """Check if we can find a perfect clip using face encoding similarity"""
        if len(results) < 80:  # Need at least 8 seconds worth at 10fps
            return None
            
        times = np.array([r[0] for r in results])
        encodings = [r[1] for r in results]  # List of face encodings (or None)
        
        # Vectorized sliding window search (check every 0.1 seconds for maximum precision)
        for start_time in np.arange(30, times[-1] - self.target_duration + 0.1, 0.1):
            end_time = start_time + self.target_duration
            mask = (times >= start_time) & (times <= end_time)
            
            # Get encodings in this window
            window_times = times[mask]
            window_encodings = [encodings[i] for i in range(len(encodings)) if mask[i]]
            
            # Filter out None values (frames with no single face)
            valid_encodings = [enc for enc in window_encodings if enc is not None]
            
            # Need at least 60 valid frames (6 seconds worth)
            if len(valid_encodings) >= 60:
                # Check if all encodings are similar (same person)
                if self.are_encodings_same_person(valid_encodings):
                    return {
                        'start': float(start_time),
                        'end': float(end_time),
                        'duration': self.target_duration,
                        'frames_analyzed': len(valid_encodings),
                        'confidence': 1.0
                    }
        
        return None
    
    def are_encodings_same_person(self, encodings, tolerance=0.6):
        """Check if all face encodings belong to the same person using vector similarity"""
        if len(encodings) < 2:
            return len(encodings) == 1
        
        # Use the first encoding as reference
        reference_encoding = encodings[0]
        
        # Check if all other encodings match the reference
        for encoding in encodings[1:]:
            distance = np.linalg.norm(reference_encoding - encoding)
            if distance > tolerance:
                return False
        
        return True
    
    def extract_clip(self, video_path, video_id, clip_info):
        """Extract the perfect clip from video"""
        clip_path = os.path.join(self.output_dir, f"ultra_perfect_{video_id}_clip.mp4")
        
        try:
            subprocess.run([
                'ffmpeg', 
                '-ss', str(clip_info['start']),
                '-i', video_path,
                '-t', str(clip_info['duration']),
                '-c', 'copy',
                clip_path,
                '-y'
            ], check=True, stderr=subprocess.DEVNULL)
            
            clip_info['path'] = clip_path
            return clip_info
            
        except subprocess.CalledProcessError as e:
            print(f"❌ Clip extraction failed: {e}", file=sys.stderr)
            return None
    
    def find_perfect_clip(self, video_url, founder_name):
        """Main function to find perfect clip"""
        print(f"🎯 Finding perfect 8-second clip of {founder_name} (ULTRA-FAST MODE)...", file=sys.stderr)
        
        start_time = time.time()
        
        # Download video
        video_path, video_id = self.download_video(video_url)
        
        # Open video
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            print(f"❌ Could not open video: {video_path}", file=sys.stderr)
            return None
        
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_interval = max(1, int(fps / 10))  # Sample at 10 FPS (every 0.1 seconds)
        
        print(f"📹 Video FPS: {fps}, sampling every {frame_interval} frames (10 FPS)", file=sys.stderr)
        
        results = []
        frame_count = 0
        batch_frames = []
        batch_timestamps = []
        batch_size = 40  # Process 40 frames at once (4 seconds worth at 10fps)
        
        print("🔍 Processing video in ultra-fast batches...", file=sys.stderr)
        
        while True:
            ret, frame = cap.read()
            if not ret:
                break
                
            timestamp = frame_count / fps
            
            # Stop after 30 minutes
            if timestamp > 1800:
                print("⏰ Reached 30-minute limit", file=sys.stderr)
                break
                
            if frame_count % frame_interval == 0:
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                batch_frames.append(rgb_frame)
                batch_timestamps.append(timestamp)
                
                # Process when batch is full
                if len(batch_frames) == batch_size:
                    face_counts = self.process_batch(batch_frames)
                    
                    # Add results (timestamp, face_encoding)
                    for i, encoding in enumerate(face_counts):
                        results.append((batch_timestamps[i], encoding))
                    
                    # Check for perfect clip
                    perfect_clip = self.check_for_perfect_clip(results)
                    if perfect_clip:
                        cap.release()
                        elapsed = time.time() - start_time
                        print(f"⚡ Perfect clip found in {elapsed:.1f}s!", file=sys.stderr)
                        
                        # Extract the clip
                        final_clip = self.extract_clip(video_path, video_id, perfect_clip)
                        if final_clip:
                            print(f"✅ Clip extracted: {final_clip['path']}", file=sys.stderr)
                            return final_clip
                        else:
                            return None
                    
                    # Clear batch
                    batch_frames = []
                    batch_timestamps = []
                    
                    # Progress update
                    if len(results) % 100 == 0:
                        print(f"  📊 Analyzed {len(results)} frames ({timestamp/60:.1f} min)", file=sys.stderr)
            
            frame_count += 1
        
        # Process remaining frames
        if batch_frames:
            face_encodings = self.process_batch(batch_frames)
            for i, encoding in enumerate(face_encodings):
                results.append((batch_timestamps[i], encoding))
            
            perfect_clip = self.check_for_perfect_clip(results)
            if perfect_clip:
                cap.release()
                final_clip = self.extract_clip(video_path, video_id, perfect_clip)
                if final_clip:
                    elapsed = time.time() - start_time
                    print(f"✅ Perfect clip found and extracted in {elapsed:.1f}s!", file=sys.stderr)
                    return final_clip
        
        cap.release()
        elapsed = time.time() - start_time
        print(f"❌ No perfect clip found after {elapsed:.1f}s", file=sys.stderr)
        return None

def main():
    if len(sys.argv) < 3:
        print("Usage: python3 ultra-fast-clip-finder.py <youtube-url> <founder-name>", file=sys.stderr)
        sys.exit(1)
    
    video_url = sys.argv[1]
    founder_name = sys.argv[2]
    
    finder = UltraFastClipFinder()
    
    try:
        clip = finder.find_perfect_clip(video_url, founder_name)
        if clip:
            print(json.dumps(clip, indent=2))
        else:
            print("null")
            sys.exit(1)
    except KeyboardInterrupt:
        print("\n⏹️ Interrupted by user", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main() 