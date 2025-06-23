#!/usr/bin/env python3

import cv2
import sys
import json
import os

def detect_faces(image_path):
    """Detect faces in an image and return count and coordinates"""
    
    # Load face detection cascade
    face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
    
    # Check if image exists
    if not os.path.exists(image_path):
        return {"faceCount": 0, "error": "Image file not found"}
    
    # Read image
    img = cv2.imread(image_path)
    if img is None:
        return {"faceCount": 0, "error": "Could not read image"}
    
    # Convert to grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # Detect faces
    faces = face_cascade.detectMultiScale(gray, 1.1, 4)
    
    # Return result
    result = {
        "faceCount": len(faces),
        "faces": [{"x": int(x), "y": int(y), "w": int(w), "h": int(h)} for x, y, w, h in faces],
        "imageSize": {"width": img.shape[1], "height": img.shape[0]}
    }
    
    return result

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({"faceCount": 0, "error": "Usage: python3 simple_face_detector.py <image_path>"}))
        sys.exit(1)
    
    image_path = sys.argv[1]
    result = detect_faces(image_path)
    print(json.dumps(result)) 