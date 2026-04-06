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

// ── Check if Flask is already running before launching a new instance ──
$alreadyRunning = false;
$ch = curl_init('http://127.0.0.1:5000/status');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 1);
curl_setopt($ch, CURLOPT_TIMEOUT, 1);
$result = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($httpCode === 200) {
    $alreadyRunning = true;
}

if (!$alreadyRunning) {
    $pythonExe  = "C:\\Users\\PLPASIG\\pythonnn\\python.exe";
    $scriptPath = "C:\\xampp\\htdocs\\INTEG SYSTEM\\SmartAcademicManagementSystem\\TimeInAndTimeOutMonitoring\\students\\face_capture.py";
    $logFile    = "C:\\xampp\\htdocs\\python_error.log";

    $cmd = 'start /B "" "' . $pythonExe . '" "' . $scriptPath . '" > "' . $logFile . '" 2>&1';
    pclose(popen($cmd, "r"));
}

echo json_encode(['success' => true, 'already_running' => $alreadyRunning]);
?>