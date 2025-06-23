#!/usr/bin/env python3
import face_recognition
import cv2
import numpy as np
import requests
import json
import sys
import os
import tempfile
from PIL import Image
import io
from urllib.parse import urlparse
import time

def download_image(url, timeout=10):
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

def analyze_face_quality(image, face_location):
    """Analyze the quality of a detected face"""
    top, right, bottom, left = face_location
    
    # Face size (larger is better)
    face_width = right - left
    face_height = bottom - top
    face_area = face_width * face_height
    
    # Image dimensions
    img_height, img_width = image.shape[:2]
    img_area = img_width * img_height
    
    # Face size relative to image (should be significant but not too large)
    face_ratio = face_area / img_area
    
    # Aspect ratio (closer to 1.0 is better for portraits)
    aspect_ratio = face_width / face_height if face_height > 0 else 0
    aspect_score = 1.0 - abs(aspect_ratio - 0.8)  # 0.8 is ideal face aspect ratio
    
    # Position score (centered faces are better)
    face_center_x = (left + right) / 2
    face_center_y = (top + bottom) / 2
    img_center_x = img_width / 2
    img_center_y = img_height / 2
    
    center_distance = ((face_center_x - img_center_x) ** 2 + (face_center_y - img_center_y) ** 2) ** 0.5
    max_distance = (img_width ** 2 + img_height ** 2) ** 0.5
    center_score = 1.0 - (center_distance / max_distance)
    
    # Size score (faces should be 5-40% of image)
    if face_ratio < 0.05:
        size_score = face_ratio / 0.05  # Too small
    elif face_ratio > 0.4:
        size_score = 0.8 - (face_ratio - 0.4)  # Too large
    else:
        size_score = 1.0  # Good size
    
    # Overall quality score
    quality_score = (
        size_score * 0.4 +
        aspect_score * 0.2 +
        center_score * 0.2 +
        min(face_area / 10000, 1.0) * 0.2  # Absolute size bonus
    )
    
    return {
        'quality_score': max(0, min(1.0, quality_score)),
        'face_area': face_area,
        'face_ratio': face_ratio,
        'aspect_ratio': aspect_ratio,
        'center_score': center_score,
        'size_score': size_score
    }

def process_founder_images(founder_name, image_urls):
    """Process founder images with facial recognition"""
    try:
        print(f"Processing {len(image_urls)} images for {founder_name}...", file=sys.stderr)
        
        processed_images = []
        reference_encodings = []
        
        for i, url in enumerate(image_urls):
            print(f"Processing image {i+1}/{len(image_urls)}: {url[:60]}...", file=sys.stderr)
            
            # Download image
            pil_image = download_image(url)
            if pil_image is None:
                continue
            
            # Convert to OpenCV format
            opencv_image = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)
            rgb_image = np.array(pil_image)
            
            # Find faces
            face_locations = face_recognition.face_locations(rgb_image, model="hog")
            
            if not face_locations:
                print(f"No faces found in image {i+1}", file=sys.stderr)
                continue
            
            # Get face encodings
            face_encodings = face_recognition.face_encodings(rgb_image, face_locations)
            
            for j, (face_location, face_encoding) in enumerate(zip(face_locations, face_encodings)):
                # Analyze face quality
                quality_info = analyze_face_quality(opencv_image, face_location)
                
                # Check if this face matches any reference faces we've seen
                is_same_person = True
                confidence = 1.0
                
                if reference_encodings:
                    # Compare with reference faces
                    distances = face_recognition.face_distance(reference_encodings, face_encoding)
                    min_distance = min(distances)
                    confidence = max(0, 1.0 - min_distance)
                    is_same_person = min_distance < 0.6  # Threshold for same person
                else:
                    # This is our first face, use it as reference
                    reference_encodings.append(face_encoding)
                
                if is_same_person:
                    # Add reference encoding if it's a new good quality face
                    if confidence > 0.8 and quality_info['quality_score'] > 0.6:
                        reference_encodings.append(face_encoding)
                        # Keep only best 5 reference encodings
                        if len(reference_encodings) > 5:
                            reference_encodings = reference_encodings[-5:]
                    
                    processed_images.append({
                        'url': url,
                        'face_index': j,
                        'quality_score': quality_info['quality_score'],
                        'confidence': confidence,
                        'face_area': quality_info['face_area'],
                        'face_ratio': quality_info['face_ratio'],
                        'aspect_ratio': quality_info['aspect_ratio'],
                        'center_score': quality_info['center_score'],
                        'size_score': quality_info['size_score'],
                        'face_location': face_location,
                        'is_primary_face': len(face_locations) == 1,  # Single face in image
                        'image_dimensions': [opencv_image.shape[1], opencv_image.shape[0]]
                    })
            
            # Small delay to be respectful
            time.sleep(0.1)
        
        # Sort by overall score (quality * confidence)
        processed_images.sort(key=lambda x: x['quality_score'] * x['confidence'], reverse=True)
        
        # Filter for high quality images
        high_quality_images = [
            img for img in processed_images 
            if img['quality_score'] > 0.4 and img['confidence'] > 0.7
        ]
        
        print(f"Found {len(processed_images)} faces total, {len(high_quality_images)} high quality", file=sys.stderr)
        
        result = {
            'success': True,
            'founder_name': founder_name,
            'total_images_processed': len(image_urls),
            'faces_found': len(processed_images),
            'high_quality_faces': len(high_quality_images),
            'best_images': high_quality_images[:5],  # Top 5 best images
            'all_processed': processed_images[:10]   # Top 10 for debugging
        }
        
        return result
        
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'founder_name': founder_name
        }

def main():
    if len(sys.argv) < 2:
        print(json.dumps({
            'success': False,
            'error': 'Founder name is required'
        }))
        sys.exit(1)
    
    founder_name = sys.argv[1]
    
    # Read image URLs from stdin (JSON format from image search)
    try:
        input_data = sys.stdin.read().strip()
        if not input_data:
            print(json.dumps({
                'success': False,
                'error': 'No image data provided via stdin'
            }))
            sys.exit(1)
        
        search_result = json.loads(input_data)
        
        if not search_result.get('success') or not search_result.get('imageUrls'):
            print(json.dumps({
                'success': False,
                'error': 'No valid image URLs in search result'
            }))
            sys.exit(1)
        
        image_urls = search_result['imageUrls']
        
    except json.JSONDecodeError as e:
        print(json.dumps({
            'success': False,
            'error': f'Invalid JSON input: {str(e)}'
        }))
        sys.exit(1)
    
    # Process the images
    result = process_founder_images(founder_name, image_urls)
    print(json.dumps(result))

if __name__ == "__main__":
    main() 