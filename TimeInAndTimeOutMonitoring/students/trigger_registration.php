<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$input = file_get_contents('php://input');
$data  = json_decode($input, true);

if (!$data) {
    echo json_encode(['success' => false, 'message' => 'No data received']);
    exit;
}

$id    = escapeshellarg($data['id_number']);
$first = escapeshellarg($data['firstName']);
$last  = escapeshellarg($data['lastName']);

$pythonExe  = "C:\\Users\\PLPASIG\\pythonnn\\python.exe";
$scriptPath = "C:\\xampp\\htdocs\\INTEG SYSTEM\\SmartAcademicManagementSystem\\TimeInAndTimeOutMonitoring\\students\\face_capture.py";

$logFile = "C:\\xampp\\htdocs\\python_error.log";

// The outer quotes around the empty title are critical for start /B with spaced paths
$cmd = 'start /B "" "' . $pythonExe . '" "' . $scriptPath . '" ' . $id . ' ' . $first . ' ' . $last . ' > "' . $logFile . '" 2>&1';

pclose(popen($cmd, "r"));

echo json_encode(['success' => true]);
?>