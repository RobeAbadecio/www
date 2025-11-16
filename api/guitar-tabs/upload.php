<?php
// Audio upload endpoint for guitar tabs backing track
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method not allowed']);
        exit;
    }

    if (!isset($_FILES['file'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'No file uploaded']);
        exit;
    }

    $file = $_FILES['file'];
    if ($file['error'] !== UPLOAD_ERR_OK) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Upload error: ' . $file['error']]);
        exit;
    }

    // Validate MIME and extension (basic)
    $allowed = [
        'audio/mpeg' => 'mp3',
        'audio/mp3' => 'mp3',
        'audio/wav' => 'wav',
        'audio/x-wav' => 'wav',
        'audio/ogg' => 'ogg',
        'audio/webm' => 'webm',
        'audio/aac' => 'aac',
        'audio/flac' => 'flac',
        'application/octet-stream' => 'bin' // fallback; still check extension below
    ];

    $finfo = function_exists('finfo_open') ? finfo_open(FILEINFO_MIME_TYPE) : false;
    $mime = $finfo ? finfo_file($finfo, $file['tmp_name']) : ($file['type'] ?? '');
    if ($finfo) finfo_close($finfo);

    $ext = pathinfo($file['name'], PATHINFO_EXTENSION);
    $ext = strtolower($ext);

    $okByMime = isset($allowed[$mime]);
    $okByExt = in_array($ext, ['mp3','wav','ogg','webm','aac','flac']);
    if (!$okByMime && !$okByExt) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Unsupported audio format']);
        exit;
    }

    // Destination directory
    $storageDir = realpath(__DIR__ . '/../../data/guitar_tabs');
    if ($storageDir === false) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Storage directory not found']);
        exit;
    }
    $audioDir = $storageDir . DIRECTORY_SEPARATOR . 'audio';
    if (!is_dir($audioDir)) {
        if (!mkdir($audioDir, 0777, true)) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Failed to create audio directory']);
            exit;
        }
    }

    // Generate unique filename
    $safeBase = preg_replace('/[^a-zA-Z0-9_-]+/', '_', pathinfo($file['name'], PATHINFO_FILENAME));
    if ($safeBase === '') $safeBase = 'track';
    $unique = $safeBase . '_' . date('Ymd_His') . '_' . bin2hex(random_bytes(3));
    $finalExt = $okByExt ? $ext : ($allowed[$mime] ?? 'dat');
    $finalName = $unique . '.' . $finalExt;

    $destPath = $audioDir . DIRECTORY_SEPARATOR . $finalName;
    if (!move_uploaded_file($file['tmp_name'], $destPath)) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to move uploaded file']);
        exit;
    }

    // Build public URL
    $publicUrl = '/data/guitar_tabs/audio/' . $finalName;

    echo json_encode(['success' => true, 'url' => $publicUrl, 'filename' => $finalName]);
    exit;
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Server error', 'error' => $e->getMessage()]);
    exit;
}
