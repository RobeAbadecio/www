<?php
session_start();
header('Content-Type: application/json');
header('Cache-Control: no-store');
require_once 'db.php';

if (isset($_SESSION['logged_in']) && $_SESSION['logged_in'] === true && isset($_SESSION['user_id'])) {
    $stmt = $conn->prepare("SELECT is_online, session_token FROM users WHERE id = ?");
    $stmt->bind_param("i", $_SESSION['user_id']);
    $stmt->execute();
    $result = $stmt->get_result();
    
    if ($row = $result->fetch_assoc()) {
        if ($row['is_online'] == 0 || $row['session_token'] !== $_SESSION['session_token']) {
            session_unset();
            session_destroy();
            echo json_encode(['logged_in' => false, 'force_logout' => true]);
            exit;
        }
    }
}

echo json_encode(['logged_in' => true]);
?>
