<?php
// Server-Sent Events for near real-time updates to guitar tabs
// Streams an event whenever data/guitar_tabs/songs.json changes

header('Access-Control-Allow-Origin: *');
header('Content-Type: text/event-stream');
header('Cache-Control: no-cache');
header('Content-Encoding: none');
header('Connection: keep-alive');
// For some proxies/servers; harmless on Apache
header('X-Accel-Buffering: no');

// Disable output buffering/compression for immediate delivery
@ini_set('zlib.output_compression', 0);
while (@ob_end_flush());
@ob_implicit_flush(1);
ignore_user_abort(true);
set_time_limit(0);

$storageDir = realpath(__DIR__ . '/../../data/guitar_tabs');
if ($storageDir === false) {
    echo "event: error\n";
    echo 'data: ' . json_encode(['message' => 'Storage directory not found']) . "\n\n";
    flush();
    exit;
}
$songsFile = $storageDir . DIRECTORY_SEPARATOR . 'songs.json';

if (!file_exists($songsFile)) {
    file_put_contents($songsFile, json_encode(['songs' => []], JSON_PRETTY_PRINT));
}

function read_state($file)
{
    $json = @file_get_contents($file);
    if (!$json) return ['songs' => []];
    $data = json_decode($json, true);
    if (!is_array($data)) $data = ['songs' => []];
    if (!isset($data['songs']) || !is_array($data['songs'])) $data['songs'] = [];
    $names = [];
    $updatedMap = [];
    foreach ($data['songs'] as $s) {
        $n = isset($s['name']) ? $s['name'] : 'Untitled';
        $names[] = $n;
        if (isset($s['updated_at'])) $updatedMap[$n] = $s['updated_at'];
    }
    return [
        'names' => $names,
        'updatedMap' => $updatedMap,
    ];
}

$lastMTime = @filemtime($songsFile) ?: 0;

// Send an initial snapshot so clients can update immediately
$initial = read_state($songsFile);
// Initial padding helps some servers start streaming immediately
echo str_pad('', 2048) . "\n";
echo "event: update\n";
echo 'data: ' . json_encode($initial) . "\n\n";
@ob_flush(); flush();

$start = time();
while (!connection_aborted()) {
    clearstatcache(true, $songsFile);
    $mtime = @filemtime($songsFile) ?: 0;
    if ($mtime !== $lastMTime) {
        $lastMTime = $mtime;
        $state = read_state($songsFile);
        echo "event: update\n";
        echo 'data: ' . json_encode($state) . "\n\n";
        @ob_flush(); flush();
    } else {
        // keep-alive comment to prevent proxies timing out the stream
        echo ": keep-alive\n\n";
        @ob_flush(); flush();
    }
    // sleep in small chunks to be responsive but not busy-loop
    usleep(200000); // 0.2s for lower latency
}

exit;
?>
