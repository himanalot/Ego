#!/usr/bin/env python3

import cv2
import face_recognition
import mediapipe as mp
import numpy as np
import os
import json
import sys
from collections import defaultdict, Counter
import math
import requests
from urllib.parse import urlparse
import urllib.parse
import time

class FaceAnalyzer:
    def __init__(self, founder_name=None):
        self.mp_face_mesh = mp.solutions.face_mesh
        self.mp_face_detection = mp.solutions.face_detection
        self.face_mesh = self.mp_face_mesh.FaceMesh(
            static_image_mode=False,
            max_num_faces=3,
            refine_landmarks=True,
            min_detection_confidence=0.7,
            min_tracking_confidence=0.5
        )
        self.face_detection = self.mp_face_detection.FaceDetection(
            model_selection=0, min_detection_confidence=0.7
        )
        
        # Store face encodings and tracking info
        self.founder_name = founder_name
        self.founder_encodings = []  # Reference encodings from web images
        self.known_faces = []
        self.face_labels = []
        self.main_speaker_id = None
        self.frame_analysis = []
        
    def download_founder_reference_images(self, founder_search_terms, num_images=3):
        """
        Download reference images of the founder from the web for face recognition
        Uses multiple search terms for better image variety
        """
        # Handle both single name and multiple search terms
        if isinstance(founder_search_terms, str):
            if ',' in founder_search_terms:
                # Split comma-separated search terms
                search_terms = [term.strip() for term in founder_search_terms.split(',')]
            else:
                # Single search term
                search_terms = [founder_search_terms]
        else:
            search_terms = [str(founder_search_terms)]
        
        print(f"🔍 Downloading reference images using {len(search_terms)} search terms...", file=sys.stderr)
        for i, term in enumerate(search_terms[:3]):  # Limit to first 3 terms
            print(f"   Search term {i+1}: {term}", file=sys.stderr)
        
        # Create reference images directory
        ref_dir = os.path.join("temp", "reference_images")
        os.makedirs(ref_dir, exist_ok=True)
        
        try:
            downloaded_images = []
            
            # Try each search term to get diverse images
            image_counter = 1
            for search_term in search_terms[:3]:  # Use up to 3 search terms
                print(f"   Searching for: {search_term}", file=sys.stderr)
                potential_urls = self.get_founder_image_urls(search_term)
                
                # Download images from this search term
                for url in potential_urls[:2]:  # Max 2 images per search term
                    if image_counter > num_images:
                        break
                        
                    try:
                        print(f"   Downloading image {image_counter}/{num_images}...", file=sys.stderr)
                        
                        # Download image
                        from urllib.request import urlopen, Request
                        req = Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                        response = urlopen(req, timeout=10)
                        
                        # Save image
                        image_path = os.path.join(ref_dir, f"reference_{image_counter}.jpg")
                        with open(image_path, 'wb') as f:
                            f.write(response.read())
                        
                        downloaded_images.append(image_path)
                        print(f"   ✅ Downloaded: {os.path.basename(image_path)}", file=sys.stderr)
                        image_counter += 1
                        
                    except Exception as e:
                        print(f"   ❌ Failed to download image {image_counter}: {e}", file=sys.stderr)
                        continue
                
                if image_counter > num_images:
                    break
            
            if downloaded_images:
                # Load face encodings from downloaded images
                encodings = self.load_founder_encodings_from_images(downloaded_images)
                print(f"✅ Successfully loaded {len(encodings)} reference encodings", file=sys.stderr)
                return encodings
            else:
                print("❌ No reference images downloaded", file=sys.stderr)
                return []
                
        except Exception as e:
            print(f"❌ Error downloading reference images: {e}", file=sys.stderr)
            return []
    
    def get_founder_image_urls(self, founder_name):
        """
        Get potential image URLs for the founder using Exa search
        """
        try:
            # Use Exa to search for pages about the founder
            print(f"   Using Exa search for: {founder_name}", file=sys.stderr)
            
            # Use the dedicated Node.js script for Exa search
            import subprocess
            
            # Path to the dedicated Exa search script
            script_path = os.path.join(os.path.dirname(__file__), 'exa_image_search.js')
            project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
            
            # Run the Node.js script from the project root directory
            result = subprocess.run(
                ['node', script_path, founder_name],
                capture_output=True,
                text=True,
                timeout=30,
                cwd=project_root  # Run from project root where node_modules is
            )
            
            if result.returncode == 0:
                import json
                response = json.loads(result.stdout.strip())
                
                if response.get('success'):
                    image_urls = response.get('imageUrls', [])
                    print(f"   Found {len(image_urls)} image URLs via Exa search", file=sys.stderr)
                    print(f"   Searched {response.get('foundResults', 0)} pages", file=sys.stderr)
                    return image_urls
                else:
                    print(f"   Exa search failed: {response.get('error', 'Unknown error')}", file=sys.stderr)
                    return []
            else:
                print(f"   Node.js script failed: {result.stderr}", file=sys.stderr)
                return []
                    
        except Exception as e:
            print(f"   Error in Exa search: {e}", file=sys.stderr)
            return []
    
    def get_common_founder_images(self, founder_name):
        """
        Try to find images using Exa search
        """
        return self.get_founder_image_urls(founder_name)
    
    def search_images_with_requests(self, founder_name):
        """
        Fallback method - now just calls Exa search
        """
        return self.get_founder_image_urls(founder_name)
    
    def load_founder_encodings_from_images(self, image_paths):
        """
        Load face encodings from reference images
        """
        encodings = []
        
        for image_path in image_paths:
            try:
                image = cv2.imread(image_path)
                rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
                
                face_locations = face_recognition.face_locations(rgb_image)
                face_encodings = face_recognition.face_encodings(rgb_image, face_locations)
                
                if face_encodings:
                    encodings.append(face_encodings[0])  # Take the first face
                    print(f"✅ Loaded encoding from {os.path.basename(image_path)}", file=sys.stderr)
                else:
                    print(f"❌ No face found in {os.path.basename(image_path)}", file=sys.stderr)
                    
            except Exception as e:
                print(f"❌ Error processing {image_path}: {e}", file=sys.stderr)
        
        return encodings
    
    def identify_founder_in_video(self, frames_dir):
        """
        Identify the founder in video frames using reference encodings
        """
        print("🎯 Identifying founder in video frames...", file=sys.stderr)
        
        frame_files = sorted([f for f in os.listdir(frames_dir) if f.endswith('.jpg')])
        founder_appearances = 0
        total_faces_checked = 0
        
        # If we have founder reference encodings, use them
        if self.founder_encodings:
            print(f"   Using {len(self.founder_encodings)} reference encodings for {self.founder_name}", file=sys.stderr)
            
            for i, frame_file in enumerate(frame_files[:100]):  # Check first 100 frames
                frame_path = os.path.join(frames_dir, frame_file)
                image = cv2.imread(frame_path)
                rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
                
                face_locations = face_recognition.face_locations(rgb_image)
                face_encodings = face_recognition.face_encodings(rgb_image, face_locations)
                
                for encoding in face_encodings:
                    total_faces_checked += 1
                    # Compare against founder reference encodings
                    matches = face_recognition.compare_faces(self.founder_encodings, encoding, tolerance=0.6)
                    if any(matches):
                        founder_appearances += 1
                        
                        # Store this as our target face if we haven't already
                        if not self.known_faces:
                            self.known_faces.append(encoding)
                            self.face_labels.append(f"{self.founder_name}")
                            self.main_speaker_id = 0
            
            if founder_appearances > 0:
                confidence = founder_appearances / total_faces_checked if total_faces_checked > 0 else 0
                print(f"✅ Found {self.founder_name} in {founder_appearances}/{total_faces_checked} faces (confidence: {confidence:.2%})", file=sys.stderr)
                return True
            else:
                print(f"❌ Could not find {self.founder_name} in video frames", file=sys.stderr)
                return False
        else:
            # Fallback to original method: identify most frequent speaker
            return self.identify_main_speaker_fallback(frames_dir)
    
    def identify_main_speaker_fallback(self, frames_dir):
        """
        Fallback method: identify the most prominent speaker (original logic)
        """
        print("📊 Using fallback: identifying most prominent speaker...", file=sys.stderr)
        
        frame_files = sorted([f for f in os.listdir(frames_dir) if f.endswith('.jpg')])
        face_appearances = defaultdict(int)
        
        for i, frame_file in enumerate(frame_files[:50]):  # Sample first 50 frames
            frame_path = os.path.join(frames_dir, frame_file)
            image = cv2.imread(frame_path)
            rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            
            # Detect faces and encode them
            face_locations = face_recognition.face_locations(rgb_image)
            face_encodings = face_recognition.face_encodings(rgb_image, face_locations)
            
            for encoding in face_encodings:
                # Check if this face matches any known faces
                matches = face_recognition.compare_faces(self.known_faces, encoding, tolerance=0.6)
                
                if matches and any(matches):
                    # Found a match
                    match_index = matches.index(True)
                    face_appearances[match_index] += 1
                else:
                    # New face
                    self.known_faces.append(encoding)
                    face_id = len(self.known_faces) - 1
                    self.face_labels.append(f"person_{face_id}")
                    face_appearances[face_id] += 1
        
        # Identify the main speaker (most frequent face)
        if face_appearances:
            self.main_speaker_id = max(face_appearances, key=face_appearances.get)
            speaker_name = self.face_labels[self.main_speaker_id]
            print(f"✅ Main speaker identified: {speaker_name}", file=sys.stderr)
            return True
        
        return False

    def analyze_video_frames(self, frames_dir):
        """
        Analyze all frames in the directory for face detection and speaking detection
        Returns: List of frame analyses with speaking detection
        """
        print("🔍 Analyzing faces and speech in frames...", file=sys.stderr)
        
        # First, try to identify the founder in the video
        if not self.identify_founder_in_video(frames_dir):
            print("❌ Could not identify target speaker in video", file=sys.stderr)
            return []
        
        # Now analyze all frames for speaking detection
        frame_files = sorted([f for f in os.listdir(frames_dir) if f.endswith('.jpg')])
        print("🎯 Analyzing speaking patterns...", file=sys.stderr)
        
        for i, frame_file in enumerate(frame_files):
            if i % 20 == 0:  # Progress update every 20 frames
                print(f"   Processed {i}/{len(frame_files)} frames...", file=sys.stderr)
                
            frame_path = os.path.join(frames_dir, frame_file)
            timestamp = self.extract_timestamp_from_filename(frame_file)
            
            analysis = self.analyze_single_frame(frame_path, timestamp)
            self.frame_analysis.append(analysis)
        
        print(f"✅ Analyzed {len(frame_files)} frames", file=sys.stderr)
        return self.frame_analysis
    
    def analyze_single_frame(self, frame_path, timestamp):
        """
        Analyze a single frame for:
        1. Main speaker presence and size
        2. Speaking detection (mouth movement)
        3. Overall frame quality for talking head shot
        """
        image = cv2.imread(frame_path)
        rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        h, w = image.shape[:2]
        
        analysis = {
            'timestamp': float(timestamp),
            'main_speaker_present': False,
            'main_speaker_size': 0.0,
            'is_speaking': False,
            'mouth_openness': 0.0,
            'face_centered': False,
            'quality_score': 0.0,
            'face_count': 0
        }
        
        # Detect faces
        face_locations = face_recognition.face_locations(rgb_image)
        face_encodings = face_recognition.face_encodings(rgb_image, face_locations)
        
        analysis['face_count'] = len(face_locations)
        
        main_speaker_location = None
        
        # Check if main speaker is present
        for i, encoding in enumerate(face_encodings):
            if self.main_speaker_id is not None:
                matches = face_recognition.compare_faces([self.known_faces[self.main_speaker_id]], encoding, tolerance=0.6)
                if matches[0]:
                    analysis['main_speaker_present'] = True
                    main_speaker_location = face_locations[i]
                    break
        
        if main_speaker_location:
            # Calculate face size and position
            top, right, bottom, left = main_speaker_location
            face_width = right - left
            face_height = bottom - top
            face_area = face_width * face_height
            frame_area = w * h
            
            analysis['main_speaker_size'] = float(face_area / frame_area)
            
            # Check if face is centered
            face_center_x = (left + right) / 2
            face_center_y = (top + bottom) / 2
            frame_center_x = w / 2
            frame_center_y = h / 2
            
            center_distance = math.sqrt((face_center_x - frame_center_x)**2 + (face_center_y - frame_center_y)**2)
            max_distance = math.sqrt((w/2)**2 + (h/2)**2)
            analysis['face_centered'] = bool(center_distance / max_distance < 0.3)  # Within 30% of center
            
            # Analyze mouth movement for speaking detection
            is_speaking, mouth_openness = self.detect_speaking(rgb_image, main_speaker_location)
            analysis['is_speaking'] = bool(is_speaking)
            analysis['mouth_openness'] = float(mouth_openness)
        
        # Calculate overall quality score
        analysis['quality_score'] = float(self.calculate_quality_score(analysis))
        
        return analysis
    
    def detect_speaking(self, rgb_image, face_location):
        """
        Use MediaPipe to detect mouth landmarks and determine if person is speaking
        """
        try:
            # Crop face region for better landmark detection
            top, right, bottom, left = face_location
            face_image = rgb_image[top:bottom, left:right]
            
            results = self.face_mesh.process(face_image)
            
            if results.multi_face_landmarks:
                landmarks = results.multi_face_landmarks[0]
                
                # Get mouth landmarks (MediaPipe face mesh indices)
                # Upper lip: 13, 14, 15, 16, 17, 18
                # Lower lip: 0, 17, 18, 200
                # Mouth corners: 61, 291
                
                mouth_landmarks = []
                important_mouth_indices = [13, 14, 15, 16, 17, 18, 0, 200, 61, 291]
                
                h, w = face_image.shape[:2]
                for idx in important_mouth_indices:
                    if idx < len(landmarks.landmark):
                        lm = landmarks.landmark[idx]
                        mouth_landmarks.append([lm.x * w, lm.y * h])
                
                if len(mouth_landmarks) >= 6:
                    # Calculate mouth openness
                    mouth_openness = self.calculate_mouth_openness(mouth_landmarks)
                    
                    # Speaking detection based on mouth openness
                    is_speaking = mouth_openness > 0.02  # Threshold for mouth being open
                    
                    return is_speaking, mouth_openness
                    
        except Exception as e:
            print(f"Error in speaking detection: {e}")
        
        return False, 0
    
    def calculate_mouth_openness(self, mouth_landmarks):
        """
        Calculate mouth openness ratio based on landmarks
        """
        if len(mouth_landmarks) < 6:
            return 0
        
        # Convert to numpy array for easier calculation
        points = np.array(mouth_landmarks)
        
        # Calculate vertical mouth opening (approximate)
        # This is a simplified calculation - in practice you'd use specific lip landmarks
        mouth_height = np.max(points[:, 1]) - np.min(points[:, 1])
        mouth_width = np.max(points[:, 0]) - np.min(points[:, 0])
        
        if mouth_width > 0:
            openness_ratio = mouth_height / mouth_width
            return openness_ratio
        
        return 0
    
    def calculate_quality_score(self, analysis):
        """
        Calculate overall quality score for the frame (0-10)
        """
        score = 0
        
        # Main speaker present (40% of score)
        if analysis['main_speaker_present']:
            score += 4
            
            # Face size (20% of score)
            if analysis['main_speaker_size'] > 0.1:  # Face is at least 10% of frame
                score += min(2, analysis['main_speaker_size'] * 10)
            
            # Face centered (15% of score)
            if analysis['face_centered']:
                score += 1.5
                
            # Speaking (20% of score)
            if analysis['is_speaking']:
                score += 2
                
            # Single person frame (5% of score)
            if analysis['face_count'] == 1:
                score += 0.5
        
        return min(10, score)
    
    def extract_timestamp_from_filename(self, filename):
        """
        Extract timestamp from frame filename (e.g., frame_0001.jpg -> 0 seconds)
        Assumes frames are extracted every 2 seconds
        """
        try:
            frame_num = int(filename.split('_')[1].split('.')[0])
            return (frame_num - 1) * 2  # Convert to seconds (assuming 2-second intervals)
        except:
            return 0
    
    def find_speaking_segments(self, speech_segments, min_duration=7):
        """
        Combine frame analysis with audio speech segments to find best clips
        """
        print("🎯 Finding best speaking segments...", file=sys.stderr)
        
        valid_segments = []
        
        for segment in speech_segments:
            start_time = segment['start']
            end_time = segment['end']
            duration = segment['duration']
            
            if duration < min_duration:
                continue
            
            # Find frames within this time segment
            segment_frames = [
                frame for frame in self.frame_analysis 
                if start_time <= frame['timestamp'] <= end_time
            ]
            
            if len(segment_frames) < 3:  # Need at least 3 frames to analyze
                continue
            
            # Calculate segment statistics
            main_speaker_present = sum(1 for f in segment_frames if f['main_speaker_present'])
            speaking_frames = sum(1 for f in segment_frames if f['is_speaking'])
            avg_quality = sum(f['quality_score'] for f in segment_frames) / len(segment_frames)
            avg_face_size = sum(f['main_speaker_size'] for f in segment_frames if f['main_speaker_present'])
            
            if main_speaker_present > 0:
                avg_face_size /= main_speaker_present
            
            # Calculate segment score
            presence_ratio = main_speaker_present / len(segment_frames)
            speaking_ratio = speaking_frames / len(segment_frames)
            
            segment_score = (
                presence_ratio * 0.3 +          # 30% - main speaker presence
                speaking_ratio * 0.25 +         # 25% - speaking ratio
                avg_quality / 10 * 0.25 +       # 25% - average quality
                min(avg_face_size * 5, 1) * 0.2 # 20% - face size (capped at 1)
            ) * 10
            
            if segment_score > 6:  # Quality threshold
                valid_segments.append({
                    'start': start_time,
                    'end': end_time,
                    'duration': duration,
                    'score': segment_score,
                    'main_speaker_presence': presence_ratio,
                    'speaking_ratio': speaking_ratio,
                    'avg_quality': avg_quality,
                    'avg_face_size': avg_face_size
                })
        
        # Sort by score
        valid_segments.sort(key=lambda x: x['score'], reverse=True)
        
        print(f"✅ Found {len(valid_segments)} high-quality speaking segments", file=sys.stderr)
        return valid_segments

def main():
    if len(sys.argv) < 3 or len(sys.argv) > 4:
        print("Usage: python face_analyzer.py <frames_dir> <speech_segments_json> [founder_search_terms]")
        sys.exit(1)
    
    frames_dir = sys.argv[1]
    speech_segments_file = sys.argv[2]
    founder_search_terms = sys.argv[3] if len(sys.argv) == 4 else None
    
    # Load speech segments
    with open(speech_segments_file, 'r') as f:
        speech_segments = json.load(f)
    
    analyzer = FaceAnalyzer(founder_name=founder_search_terms)
    
    # If founder search terms are provided, try to get reference images
    if founder_search_terms:
        print(f"🎯 Target founder search terms: {founder_search_terms}", file=sys.stderr)
        # Try to download reference images and load encodings
        reference_encodings = analyzer.download_founder_reference_images(founder_search_terms)
        analyzer.founder_encodings = reference_encodings
        
        if not reference_encodings:
            print("⚠️  No reference images found, using fallback method", file=sys.stderr)
    
    # Analyze all frames
    frame_analysis = analyzer.analyze_video_frames(frames_dir)
    
    # Find best speaking segments
    best_segments = analyzer.find_speaking_segments(speech_segments)
    
    # Output results
    results = {
        'main_speaker_id': analyzer.main_speaker_id,
        'frame_analysis': frame_analysis,
        'best_segments': best_segments[:5]  # Top 5 segments
    }
    
    print(json.dumps(results, indent=2))

if __name__ == "__main__":
    main() 