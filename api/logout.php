<?php
session_start();
header('Content-Type: application/json');
header('Cache-Control: no-store');
require_once 'db.php';

$conn->query("UPDATE users SET is_online = 0 WHERE last_activity < DATE_SUB(NOW(), INTERVAL 5 MINUTE)");

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (isset($_SESSION['user_email'])) {
        $stmt = $conn->prepare("UPDATE users SET is_online = 0 WHERE email = ?");
        $stmt->bind_param("s", $_SESSION['user_email']);
        $stmt->execute();
    }
    session_unset();
    session_destroy();
    echo json_encode(['success' => true]);
    exit;
}

if (isset($_GET['accounts']) && isset($_SESSION['user_type']) && $_SESSION['user_type'] === 'admin') {
    $result = $conn->query("SELECT email, user_type, name, last_activity, is_online FROM users ORDER BY is_online DESC, created_at DESC");
    $accounts = [];
    while ($row = $result->fetch_assoc()) {
        $accounts[] = [
            'email' => $row['email'],
            'user_type' => $row['user_type'],
            'name' => $row['name'],
            'last_activity' => $row['last_activity'],
            'status' => $row['is_online'] ? 'online' : 'offline'
        ];
    }
    echo json_encode(['success' => true, 'accounts' => $accounts]);
    exit;
}

if (isset($_SESSION['logged_in']) && $_SESSION['logged_in'] === true) {
    $stmt = $conn->prepare("UPDATE users SET last_activity = NOW() WHERE email = ?");
    $stmt->bind_param("s", $_SESSION['user_email']);
    $stmt->execute();
}

if (isset($_SESSION['logged_in']) && $_SESSION['logged_in'] === true) {
    echo json_encode([
        'success' => true,
        'logged_in' => true,
        'user' => [
            'email' => $_SESSION['user_email'] ?? '',
            'type' => $_SESSION['user_type'] ?? '',
            'name' => $_SESSION['user_name'] ?? ''
        ]
    ]);
} else {
    echo json_encode(['success' => true, 'logged_in' => false]);
}
?>
