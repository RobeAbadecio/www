<?php
// Guitar Tabs Song Repository API
// Stores songs in a JSON file so all clients share the same repository.

// Allow cross-origin requests (for iPad/other devices on same network)
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');
header('Cache-Control: no-store');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$storageDir = realpath(__DIR__ . '/../../data/guitar_tabs');
if ($storageDir === false) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Storage directory not found']);
    exit;
}
$songsFile = $storageDir . DIRECTORY_SEPARATOR . 'songs.json';

// Ensure file exists
if (!file_exists($songsFile)) {
    file_put_contents($songsFile, json_encode(['songs' => []], JSON_PRETTY_PRINT));
}

function load_songs($file)
{
    $fp = fopen($file, 'c+');
    if (!$fp) {
        throw new Exception('Failed to open songs storage');
    }
    // shared lock for reading
    flock($fp, LOCK_SH);
    $size = filesize($file);
    $json = $size > 0 ? fread($fp, $size) : '';
    flock($fp, LOCK_UN);
    fclose($fp);
    if (!$json) return ['songs' => []];
    $data = json_decode($json, true);
    if (!is_array($data)) $data = ['songs' => []];
    if (!isset($data['songs']) || !is_array($data['songs'])) $data['songs'] = [];
    return $data;
}

function save_songs($file, $data)
{
    $fp = fopen($file, 'c+');
    if (!$fp) {
        throw new Exception('Failed to open songs storage for writing');
    }
    // exclusive lock for writing
    flock($fp, LOCK_EX);
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
}

function sanitize_name($name) {
    $name = (string)$name;
    $name = trim($name);
    // prevent directory traversal and control/unsafe characters
    $bad = ["\r", "\n", "\t", "\\", "/", ":", "*", "?", '"', "<", ">", "|"];
    $name = str_replace($bad, ' ', $name);
    // collapse spaces
    $name = preg_replace('/\s+/', ' ', $name);
    return substr($name, 0, 120);
}

$method = $_SERVER['REQUEST_METHOD'];

try {
    if ($method === 'GET') {
        $data = load_songs($songsFile);
        if (isset($_GET['name']) && $_GET['name'] !== '') {
            $name = sanitize_name($_GET['name']);
            foreach ($data['songs'] as $song) {
                if (isset($song['name']) && $song['name'] === $name) {
                    echo json_encode(['success' => true, 'song' => $song]);
                    exit;
                }
            }
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Song not found']);
            exit;
        }
        // list songs (metadata only)
        $list = array_map(function ($s) {
            return [
                'name' => $s['name'] ?? 'Untitled',
                'updated_at' => $s['updated_at'] ?? null,
                'created_at' => $s['created_at'] ?? null,
            ];
        }, $data['songs']);
        echo json_encode(['success' => true, 'songs' => $list]);
        exit;
    }

    // Read JSON payload for POST/PUT
    $payload = json_decode(file_get_contents('php://input'), true) ?? [];
    $action = $payload['action'] ?? 'upsert';

    if ($method === 'POST') {
        $data = load_songs($songsFile);

        if ($action === 'delete') {
            $name = sanitize_name($payload['name'] ?? '');
            if ($name === '') throw new Exception('Name required');
            $before = count($data['songs']);
            $data['songs'] = array_values(array_filter($data['songs'], function ($s) use ($name) {
                return ($s['name'] ?? '') !== $name;
            }));
            if (count($data['songs']) === $before) {
                http_response_code(404);
                echo json_encode(['success' => false, 'message' => 'Song not found']);
                exit;
            }
            save_songs($songsFile, $data);
            echo json_encode(['success' => true]);
            exit;
        }

        if ($action === 'rename') {
            $old = sanitize_name($payload['oldName'] ?? '');
            $new = sanitize_name($payload['newName'] ?? '');
            if ($old === '' || $new === '') throw new Exception('Both old and new names are required');
            foreach ($data['songs'] as &$song) {
                if (($song['name'] ?? '') === $old) {
                    $song['name'] = $new;
                    $song['updated_at'] = date('c');
                    save_songs($songsFile, $data);
                    echo json_encode(['success' => true]);
                    exit;
                }
            }
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Song not found']);
            exit;
        }

        // default: upsert (create/update)
        $name = sanitize_name($payload['name'] ?? '');
        $songData = $payload['data'] ?? null; // expect { sections: [...] }
        if ($name === '' || !is_array($songData)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Invalid payload: name and data required']);
            exit;
        }
        // validate minimal schema
        if (!isset($songData['sections']) || !is_array($songData['sections'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Invalid song format']);
            exit;
        }

        $found = false;
        foreach ($data['songs'] as &$existing) {
            if (($existing['name'] ?? '') === $name) {
                $existing['data'] = $songData;
                $existing['updated_at'] = date('c');
                $found = true;
                break;
            }
        }
        if (!$found) {
            $data['songs'][] = [
                'name' => $name,
                'data' => $songData,
                'created_at' => date('c'),
                'updated_at' => date('c'),
            ];
        }
        save_songs($songsFile, $data);
        echo json_encode(['success' => true]);
        exit;
    }

    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Server error', 'error' => $e->getMessage()]);
    exit;
}
