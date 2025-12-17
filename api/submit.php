<?php
header('Content-Type: application/json');
header('Cache-Control: no-store');
require_once 'db.php';

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST') {
    $submission_title = trim($_POST['submission_title'] ?? '');
    $org_name = trim($_POST['org_name'] ?? '');
    $org_acronym = trim($_POST['org_acronym'] ?? '');
    $org_email = trim($_POST['org_email'] ?? '');
    $social_media = trim($_POST['social_media'] ?? '');
    $applicant_name = trim($_POST['applicant_name'] ?? '');
    $applicant_position = trim($_POST['applicant_position'] ?? '');
    $applicant_email = trim($_POST['applicant_email'] ?? '');
    $adviser_names = trim($_POST['adviser_names'] ?? '');
    $adviser_emails = trim($_POST['adviser_emails'] ?? '');
    $organization_school = trim($_POST['organization_school'] ?? '');
    $organization_type = trim($_POST['organization_type'] ?? '');
    $events_json = trim($_POST['events'] ?? '[]');
    
    $file_path = null;
    if (isset($_FILES['file']) && $_FILES['file']['error'] === UPLOAD_ERR_OK) {
        $max_size = 10 * 1024 * 1024; 
        
        if ($_FILES['file']['size'] > $max_size) {
            echo json_encode(['success' => false, 'message' => 'File size exceeds 10MB limit']);
            exit;
        }
        
        $upload_dir = '../uploads/';
        if (!is_dir($upload_dir)) mkdir($upload_dir, 0755, true);
        
        $file_name = $submission_title . '_' . date('Y-m-d_H-i-s') . '.' . pathinfo($_FILES['file']['name'], PATHINFO_EXTENSION);
        $target = $upload_dir . $file_name;
        
        if (move_uploaded_file($_FILES['file']['tmp_name'], $target)) {
            $file_path = $file_name;
        }
    }
    
    $stmt = $conn->prepare("INSERT INTO submissions (submission_title, org_name, org_acronym, org_email, 
        social_media, applicant_name, applicant_position, applicant_email, adviser_names, adviser_emails, 
        organization_school, organization_type, events_json, file_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    
    $stmt->bind_param('ssssssssssssss', $submission_title, $org_name, $org_acronym, $org_email, 
        $social_media, $applicant_name, $applicant_position, $applicant_email, $adviser_names, 
        $adviser_emails, $organization_school, $organization_type, $events_json, $file_path);
    
    if ($stmt->execute()) {
        echo json_encode(['success' => true, 'message' => 'Submission created successfully', 'id' => $conn->insert_id]);
    } else {
        echo json_encode(['success' => false, 'message' => 'Failed to create submission']);
    }
    $stmt->close();
    
} elseif ($method === 'DELETE') {
    $input = json_decode(file_get_contents('php://input'), true);
    $id = intval($input['id'] ?? 0);
    
    if ($id <= 0) {
        echo json_encode([
            'success' => false,
            'message' => 'Invalid ID'
        ]);
        exit;
    }
    
    $stmt = $conn->prepare("DELETE FROM submissions WHERE id = ?");
    $stmt->bind_param('i', $id);
    
    if ($stmt->execute()) {
        echo json_encode(['success' => true, 'message' => 'Submission deleted successfully']);
    } else {
        echo json_encode(['success' => false, 'message' => 'Failed to delete submission']);
    }
    $stmt->close();
    
} else {
    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed'
    ]);
}

$conn->close();
?>
