// ==========================================================
// Stock Management Mobile: Client-Side WebP Image Scaler
// Resizes and converts camera/gallery photos to WebP before upload
// Keeps bandwidth low and Cloudflare R2 storage minimal (<350 KB)
// ==========================================================

import { IMAGE_CONFIG } from './core.js';

/**
 * Reads a File, resizes to max edge <= 1280px, and encodes to WebP format.
 * @param {File} file - Source image file (JPEG, PNG, or WebP)
 * @param {object} [options]
 * @param {number} [options.maxDimension=1280] - Maximum width or height
 * @param {number} [options.targetBytes=358400] - 350 KB target
 * @param {number} [options.initialQuality=0.75] - Initial WebP compression quality
 * @returns {Promise<{blob: Blob, dataUrl: string, originalSize: number, compressedSize: number, width: number, height: number, reductionPercent: number}>}
 */
export async function compressImageToWebP(file, options = {}) {
  const maxDimension = options.maxDimension || IMAGE_CONFIG.MAX_DIMENSION_PX;
  const targetBytes = options.targetBytes || IMAGE_CONFIG.TARGET_SIZE_BYTES;
  const initialQuality = options.initialQuality || IMAGE_CONFIG.DEFAULT_QUALITY;

  if (!file || !file.type.startsWith('image/')) {
    throw new Error('ไฟล์ที่เลือกไม่ใช่รูปภาพที่รองรับ');
  }

  // Load image into HTML Image element
  const img = await loadImageFromFile(file);

  // Compute scaled dimensions preserving aspect ratio
  let { width, height } = img;
  if (width > maxDimension || height > maxDimension) {
    if (width > height) {
      height = Math.round((height * maxDimension) / width);
      width = maxDimension;
    } else {
      width = Math.round((width * maxDimension) / height);
      height = maxDimension;
    }
  }

  // Draw to offscreen canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  // Iterative quality step-down if output exceeds targetBytes
  let quality = initialQuality;
  let blob = await canvasToBlob(canvas, 'image/webp', quality);

  while (blob.size > targetBytes && quality > IMAGE_CONFIG.MIN_QUALITY) {
    quality -= 0.08;
    blob = await canvasToBlob(canvas, 'image/webp', quality);
  }

  const dataUrl = canvas.toDataURL('image/webp', quality);
  const reductionPercent = Math.round(((file.size - blob.size) / file.size) * 100);

  return {
    blob,
    dataUrl,
    originalSize: file.size,
    compressedSize: blob.size,
    width,
    height,
    reductionPercent: Math.max(0, reductionPercent)
  };
}

/**
 * Helper to wrap FileReader & Image in a Promise
 */
function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์รูปภาพได้'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('ไม่สามารถประมวลผลข้อมูลรูปภาพได้'));
      img.onload = () => resolve(img);
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Helper to wrap canvas.toBlob in a Promise
 */
function canvasToBlob(canvas, mimeType, quality) {
  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob), mimeType, quality);
  });
}
