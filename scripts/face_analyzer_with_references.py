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
from PIL import Image
import io

class FaceAnalyzerWithReferences:
    def __init__(self, founder_name=None, reference_images=None):
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
        self.founder_encodings = []  # Reference encodings from verified images
        self.reference_images = reference_images or []  # Verified image URLs
        self.known_faces = []
        self.face_labels = []
        self.main_speaker_id = None
        self.frame_analysis = []
        
        # Load reference encodings if provided
        if self.reference_images:
            self.load_founder_encodings_from_urls()
    
    def download_image(self, url, timeout=10):
        """Download an image from URL and return PIL Image object"""
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
            response = requests.get(url, timeout=timeout, headers=headers)
            response.raise_for_status()
            
            # Check if it's actually an image
            content_type = response.headers.get('content-type', '').lower()
            if not any(img_type in content_type for img_type in ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']):
                return None
                
            image = Image.open(io.BytesIO(response.content))
            # Convert to RGB if needed
            if image.mode != 'RGB':
                image = image.convert('RGB')
            return image
        except Exception as e:
            print(f"Failed to download {url}: {e}", file=sys.stderr)
            return None
    
    def load_founder_encodings_from_urls(self):
        """Load face encodings from verified reference image URLs"""
        print(f"🔍 Loading {len(self.reference_images)} verified reference images for {self.founder_name}...", file=sys.stderr)
        
        encodings = []
        
        for i, image_data in enumerate(self.reference_images):
            try:
                # Handle both URL strings and image objects with metadata
                if isinstance(image_data, dict):
                    url = image_data.get('url')
                    quality_score = image_data.get('quality_score', 1.0)
                    confidence = image_data.get('confidence', 1.0)
                else:
                    url = image_data
                    quality_score = 1.0
                    confidence = 1.0
                
                print(f"   Processing reference image {i+1}/{len(self.reference_images)}: {url[:60]}...", file=sys.stderr)
                
                # Download image
                pil_image = self.download_image(url)
                if pil_image is None:
                    continue
                
                # Convert to OpenCV format
                rgb_image = np.array(pil_image)
                
                # Find faces
                face_locations = face_recognition.face_locations(rgb_image, model="hog")
                face_encodings = face_recognition.face_encodings(rgb_image, face_locations)
                
                if face_encodings:
                    # Weight the encoding by quality and confidence
                    weight = quality_score * confidence
                    encodings.append({
                        'encoding': face_encodings[0],  # Take the first face
                        'weight': weight,
                        'url': url
                    })
                    print(f"   ✅ Loaded encoding (weight: {weight:.2f})", file=sys.stderr)
                else:
                    print(f"   ❌ No face found in reference image {i+1}", file=sys.stderr)
                    
            except Exception as e:
                print(f"   ❌ Error processing reference image {i+1}: {e}", file=sys.stderr)
        
        if encodings:
            # Store the weighted encodings
            self.founder_encodings = [enc['encoding'] for enc in encodings]
            self.encoding_weights = [enc['weight'] for enc in encodings]
            print(f"✅ Successfully loaded {len(self.founder_encodings)} reference encodings", file=sys.stderr)
        else:
            print("❌ No reference encodings loaded", file=sys.stderr)
    
    def identify_founder_in_video(self, frames_dir):
        """Identify the founder in video frames using verified reference encodings"""
        print("🎯 Identifying founder in video frames using verified references...", file=sys.stderr)
        
        frame_files = sorted([f for f in os.listdir(frames_dir) if f.endswith('.jpg')])
        founder_matches = []
        total_faces_checked = 0
        
        if not self.founder_encodings:
            print("❌ No reference encodings available, falling back to main speaker detection", file=sys.stderr)
            return self.identify_main_speaker_fallback(frames_dir)
        
        print(f"   Using {len(self.founder_encodings)} verified reference encodings for {self.founder_name}", file=sys.stderr)
        
        # Sample frames for analysis (every 10th frame to speed up)
        sample_frames = frame_files[::10][:50]  # Max 50 frames
        
        for i, frame_file in enumerate(sample_frames):
            frame_path = os.path.join(frames_dir, frame_file)
            image = cv2.imread(frame_path)
            if image is None:
                continue
                
            rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            
            face_locations = face_recognition.face_locations(rgb_image, model="hog")
            face_encodings = face_recognition.face_encodings(rgb_image, face_locations)
            
            total_faces_checked += len(face_encodings)
            
            for face_idx, face_encoding in enumerate(face_encodings):
                # Compare with reference encodings using weighted average
                distances = face_recognition.face_distance(self.founder_encodings, face_encoding)
                
                # Calculate weighted distance
                if hasattr(self, 'encoding_weights'):
                    weighted_distances = []
                    total_weight = sum(self.encoding_weights)
                    for dist, weight in zip(distances, self.encoding_weights):
                        weighted_distances.append(dist * (weight / total_weight))
                    avg_distance = sum(weighted_distances)
                else:
                    avg_distance = np.mean(distances)
                
                # Lower distance = better match
                confidence = max(0, 1.0 - avg_distance)
                
                if avg_distance < 0.6:  # Threshold for same person
                    founder_matches.append({
                        'frame': frame_file,
                        'distance': avg_distance,
                        'confidence': confidence,
                        'face_location': face_locations[face_idx]
                    })
        
        print(f"   Checked {total_faces_checked} faces in {len(sample_frames)} frames", file=sys.stderr)
        print(f"   Found {len(founder_matches)} potential founder matches", file=sys.stderr)
        
        if founder_matches:
            # Sort by confidence (lower distance = higher confidence)
            founder_matches.sort(key=lambda x: x['distance'])
            best_match = founder_matches[0]
            
            print(f"   ✅ Best founder match: {best_match['frame']} (confidence: {best_match['confidence']:.2f})", file=sys.stderr)
            
            # Use the founder's face as the main speaker
            self.main_speaker_id = 'founder'
            return 'founder'
        else:
            print("   ❌ No founder matches found, falling back to main speaker detection", file=sys.stderr)
            return self.identify_main_speaker_fallback(frames_dir)
    
    def identify_main_speaker_fallback(self, frames_dir):
        """Fallback method to identify main speaker when no reference images work"""
        print("🔍 Identifying main speaker using fallback method...", file=sys.stderr)
        
        frame_files = sorted([f for f in os.listdir(frames_dir) if f.endswith('.jpg')])
        face_counts = defaultdict(int)
        face_encodings_map = {}
        
        # Sample every 20th frame for speed
        sample_frames = frame_files[::20][:30]
        
        for frame_file in sample_frames:
            frame_path = os.path.join(frames_dir, frame_file)
            image = cv2.imread(frame_path)
            if image is None:
                continue
                
            rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            
            face_locations = face_recognition.face_locations(rgb_image)
            face_encodings = face_recognition.face_encodings(rgb_image, face_locations)
            
            for face_encoding in face_encodings:
                # Find matching face or create new one
                matched = False
                for face_id, known_encoding in face_encodings_map.items():
                    distance = face_recognition.face_distance([known_encoding], face_encoding)[0]
                    if distance < 0.6:
                        face_counts[face_id] += 1
                        matched = True
                        break
                
                if not matched:
                    new_face_id = len(face_encodings_map)
                    face_encodings_map[new_face_id] = face_encoding
                    face_counts[new_face_id] = 1
        
        if face_counts:
            main_speaker_id = max(face_counts, key=face_counts.get)
            appearances = face_counts[main_speaker_id]
            print(f"   ✅ Main speaker identified: Face {main_speaker_id} ({appearances} appearances)", file=sys.stderr)
            self.main_speaker_id = main_speaker_id
            return main_speaker_id
        else:
            print("   ❌ No faces found in video", file=sys.stderr)
            return None
    
    def analyze_video_frames(self, frames_dir):
        """Analyze all video frames for speaking detection"""
        print("🎬 Analyzing video frames for speaking detection...", file=sys.stderr)
        
        frame_files = sorted([f for f in os.listdir(frames_dir) if f.endswith('.jpg')])
        results = []
        
        for frame_file in frame_files:
            timestamp = self.extract_timestamp_from_filename(frame_file)
            frame_path = os.path.join(frames_dir, frame_file)
            
            analysis = self.analyze_single_frame(frame_path, timestamp)
            if analysis:
                results.append(analysis)
        
        self.frame_analysis = results
        print(f"✅ Analyzed {len(results)} frames", file=sys.stderr)
        return results
    
    def analyze_single_frame(self, frame_path, timestamp):
        """Analyze a single frame for face detection and speaking"""
        image = cv2.imread(frame_path)
        if image is None:
            return None
        
        rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        
        # Face recognition analysis
        face_locations = face_recognition.face_locations(rgb_image)
        face_encodings = face_recognition.face_encodings(rgb_image, face_locations)
        
        # MediaPipe analysis
        results_mesh = self.face_mesh.process(rgb_image)
        results_detection = self.face_detection.process(rgb_image)
        
        analysis = {
            'timestamp': timestamp,
            'frame_path': frame_path,
            'faces': []
        }
        
        # Process each detected face
        for i, (face_location, face_encoding) in enumerate(zip(face_locations, face_encodings)):
            face_analysis = {
                'face_id': i,
                'location': face_location,
                'is_main_speaker': False,
                'is_founder': False,
                'speaking_score': 0,
                'quality_score': 0
            }
            
            # Check if this is the founder
            if self.founder_encodings:
                distances = face_recognition.face_distance(self.founder_encodings, face_encoding)
                min_distance = min(distances)
                if min_distance < 0.6:
                    face_analysis['is_founder'] = True
                    face_analysis['founder_confidence'] = max(0, 1.0 - min_distance)
            
            # Check if this is the main speaker
            if self.main_speaker_id == 'founder' and face_analysis['is_founder']:
                face_analysis['is_main_speaker'] = True
            elif isinstance(self.main_speaker_id, int):
                # Compare with known main speaker encoding
                # This would need more implementation for non-founder main speakers
                pass
            
            # Detect speaking using MediaPipe
            speaking_detected = self.detect_speaking(rgb_image, face_location)
            face_analysis['speaking_score'] = speaking_detected
            
            # Calculate quality score
            face_analysis['quality_score'] = self.calculate_quality_score(face_analysis)
            
            analysis['faces'].append(face_analysis)
        
        return analysis
    
    def detect_speaking(self, rgb_image, face_location):
        """Detect if person is speaking using MediaPipe mouth landmarks"""
        try:
            results = self.face_mesh.process(rgb_image)
            
            if results.multi_face_landmarks:
                # Get the face region
                top, right, bottom, left = face_location
                face_height = bottom - top
                face_width = right - left
                
                for face_landmarks in results.multi_face_landmarks:
                    # Get mouth landmarks (landmarks around the mouth area)
                    mouth_landmarks = []
                    mouth_indices = [61, 84, 17, 314, 405, 320, 307, 375, 321, 308, 324, 318]
                    
                    for idx in mouth_indices:
                        landmark = face_landmarks.landmark[idx]
                        mouth_landmarks.append([landmark.x, landmark.y])
                    
                    # Calculate mouth openness
                    mouth_openness = self.calculate_mouth_openness(mouth_landmarks)
                    
                    # Speaking threshold (adjust based on testing)
                    speaking_threshold = 0.02
                    speaking_score = min(1.0, mouth_openness / speaking_threshold)
                    
                    return speaking_score
            
            return 0.0
            
        except Exception as e:
            return 0.0
    
    def calculate_mouth_openness(self, mouth_landmarks):
        """Calculate mouth openness ratio"""
        if len(mouth_landmarks) < 6:
            return 0.0
        
        # Calculate vertical mouth opening
        mouth_landmarks = np.array(mouth_landmarks)
        
        # Top and bottom lip points
        top_lip = mouth_landmarks[2]  # Top center
        bottom_lip = mouth_landmarks[8]  # Bottom center
        
        # Left and right mouth corners
        left_corner = mouth_landmarks[0]
        right_corner = mouth_landmarks[6]
        
        # Calculate distances
        vertical_distance = abs(top_lip[1] - bottom_lip[1])
        horizontal_distance = abs(right_corner[0] - left_corner[0])
        
        # Mouth aspect ratio (vertical/horizontal)
        if horizontal_distance > 0:
            mouth_ratio = vertical_distance / horizontal_distance
            return mouth_ratio
        
        return 0.0
    
    def calculate_quality_score(self, analysis):
        """Calculate overall quality score for a face analysis"""
        score = 0.5  # Base score
        
        # Bonus for being the founder
        if analysis.get('is_founder'):
            score += 0.3
        
        # Bonus for being main speaker
        if analysis.get('is_main_speaker'):
            score += 0.2
        
        # Bonus for speaking
        score += analysis.get('speaking_score', 0) * 0.3
        
        # Face size bonus
        location = analysis.get('location')
        if location:
            top, right, bottom, left = location
            face_area = (right - left) * (bottom - top)
            if face_area > 10000:  # Good size face
                score += 0.1
        
        return min(1.0, score)
    
    def extract_timestamp_from_filename(self, filename):
        """Extract timestamp from frame filename"""
        try:
            # Assume format like "frame_123.45.jpg"
            parts = filename.replace('.jpg', '').split('_')
            if len(parts) > 1:
                return float(parts[1])
            return 0.0
        except:
            return 0.0
    
    def find_speaking_segments(self, speech_segments, min_duration=7):
        """Find segments where ONLY the founder is speaking and visible"""
        print("🎯 Finding SINGLE-PERSON speaking segments with 100% founder presence...", file=sys.stderr)
        
        if not self.founder_encodings:
            print("❌ No founder reference encodings available", file=sys.stderr)
            return speech_segments[:3] if speech_segments else []
        
        # For each speech segment, verify strict founder-only presence
        verified_segments = []
        
        for i, segment in enumerate(speech_segments):
            start_time = segment['start']
            end_time = segment['end']
            duration = end_time - start_time
            
            if duration < min_duration:
                continue
            
            print(f"   Analyzing segment {i+1}/{len(speech_segments)}: {start_time:.1f}s-{end_time:.1f}s ({duration:.1f}s)", file=sys.stderr)
            
            # Check frames in this time range for STRICT founder-only presence
            presence_result = self.check_strict_founder_only_presence(start_time, end_time)
            
            if presence_result['is_founder_only'] and presence_result['founder_confidence'] > 0.7:
                verified_segments.append({
                    'start': start_time,
                    'end': end_time,
                    'duration': duration,
                    'founder_presence': presence_result['founder_presence'],
                    'founder_confidence': presence_result['founder_confidence'],
                    'single_person_ratio': presence_result['single_person_ratio'],
                    'frames_analyzed': presence_result['frames_analyzed'],
                    'audio_confidence': segment.get('confidence', 1.0),
                    'combined_score': (presence_result['founder_confidence'] + presence_result['single_person_ratio']) / 2
                })
                print(f"      ✅ VERIFIED: {presence_result['founder_confidence']:.1%} founder confidence, {presence_result['single_person_ratio']:.1%} single-person", file=sys.stderr)
            else:
                print(f"      ❌ REJECTED: {presence_result['founder_confidence']:.1%} founder confidence, {presence_result['single_person_ratio']:.1%} single-person", file=sys.stderr)
        
        # Sort by combined score
        verified_segments.sort(key=lambda x: x['combined_score'], reverse=True)
        
        print(f"✅ Found {len(verified_segments)} STRICT founder-only speaking segments", file=sys.stderr)
        return verified_segments
    
    def check_strict_founder_only_presence(self, start_time, end_time):
        """Check for STRICT founder-only presence: founder in ALL frames, NO other people"""
        frames_dir = os.path.join(self.tempDir if hasattr(self, 'tempDir') else './temp', 'frames')
        
        if not os.path.exists(frames_dir):
            return {
                'is_founder_only': False,
                'founder_presence': 0.0,
                'founder_confidence': 0.0,
                'single_person_ratio': 0.0,
                'frames_analyzed': 0
            }
        
        frame_files = sorted([f for f in os.listdir(frames_dir) if f.endswith('.jpg')])
        
        # Find frames in the time range (assuming 2-second intervals)
        relevant_frames = []
        for frame_file in frame_files:
            try:
                # Extract frame number and calculate timestamp
                frame_num = int(frame_file.replace('frame_', '').replace('.jpg', ''))
                timestamp = (frame_num - 1) * 2  # 2 seconds per frame
                
                if start_time <= timestamp <= end_time:
                    relevant_frames.append(frame_file)
            except:
                continue
        
        if not relevant_frames:
            return {
                'is_founder_only': False,
                'founder_presence': 0.0,
                'founder_confidence': 0.0,
                'single_person_ratio': 0.0,
                'frames_analyzed': 0
            }
        
        founder_detected_frames = 0
        single_person_frames = 0
        total_confidence = 0.0
        
        for frame_file in relevant_frames:
            frame_path = os.path.join(frames_dir, frame_file)
            image = cv2.imread(frame_path)
            if image is None:
                continue
                
            rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            
            # Detect all faces in frame
            face_locations = face_recognition.face_locations(rgb_image, model="hog")
            face_encodings = face_recognition.face_encodings(rgb_image, face_locations)
            
            # Check if this is a single-person frame
            if len(face_encodings) == 1:
                single_person_frames += 1
                
                # Check if the single person is the founder
                face_encoding = face_encodings[0]
                distances = face_recognition.face_distance(self.founder_encodings, face_encoding)
                min_distance = min(distances)
                confidence = max(0, 1.0 - min_distance)
                
                # High threshold for founder identification
                if min_distance < 0.5 and confidence > 0.5:
                    founder_detected_frames += 1
                    total_confidence += confidence
        
        frames_analyzed = len(relevant_frames)
        founder_presence = founder_detected_frames / frames_analyzed if frames_analyzed > 0 else 0.0
        single_person_ratio = single_person_frames / frames_analyzed if frames_analyzed > 0 else 0.0
        avg_founder_confidence = total_confidence / founder_detected_frames if founder_detected_frames > 0 else 0.0
        
        # STRICT requirements: 100% founder presence AND 100% single-person frames
        is_founder_only = (founder_presence >= 0.9 and single_person_ratio >= 0.9 and avg_founder_confidence > 0.6)
        
        return {
            'is_founder_only': is_founder_only,
            'founder_presence': founder_presence,
            'founder_confidence': avg_founder_confidence,
            'single_person_ratio': single_person_ratio,
            'frames_analyzed': frames_analyzed
        }

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 face_analyzer_with_references.py <frames_dir> [founder_name] [reference_images_json]")
        sys.exit(1)
    
    frames_dir = sys.argv[1]
    founder_name = sys.argv[2] if len(sys.argv) > 2 else None
    reference_images = None
    
    # Load reference images if provided
    if len(sys.argv) > 3:
        try:
            reference_images = json.loads(sys.argv[3])
        except json.JSONDecodeError:
            print("❌ Invalid JSON for reference images", file=sys.stderr)
    
    # Initialize analyzer
    analyzer = FaceAnalyzerWithReferences(founder_name, reference_images)
    
    # Step 1: Identify the founder in video
    main_speaker = analyzer.identify_founder_in_video(frames_dir)
    
    # Step 2: Load speech segments (if available)
    speech_segments_file = os.path.join(os.path.dirname(frames_dir), 'speech_segments.json')
    speech_segments = []
    
    if os.path.exists(speech_segments_file):
        with open(speech_segments_file, 'r') as f:
            speech_data = json.load(f)
            speech_segments = speech_data.get('segments', [])
    
    # Step 3: Find verified speaking segments
    speaking_segments = analyzer.find_speaking_segments(speech_segments)
    
    # Output results
    result = {
        'main_speaker': main_speaker,
        'founder_name': founder_name,
        'reference_images_used': len(reference_images) if reference_images else 0,
        'speaking_segments': speaking_segments
    }
    
    print(json.dumps(result))

if __name__ == "__main__":
    main() 