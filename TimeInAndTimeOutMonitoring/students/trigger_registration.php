<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200); exit;
}

// Check if Flask is already running
$alreadyRunning = false;
$ch = curl_init('http://127.0.0.1:5000/status');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 1);
curl_setopt($ch, CURLOPT_TIMEOUT, 1);
curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($httpCode === 200) {
    // Already running — no need to start again
    echo json_encode(['success' => true, 'already_running' => true]);
    exit;
}

// Not running — launch via batch file (works even in Apache service context)
$batPath = "C:\\xampp\\htdocs\\INTEG SYSTEM\\SmartAcademicManagementSystem\\TimeInAndTimeOutMonitoring\\students\\START_SILENT.bat";
$logFile = "C:\\xampp\\htdocs\\python_error.log";

$cmd = 'cmd /c "' . $batPath . '" > "' . $logFile . '" 2>&1';
pclose(popen($cmd, "r"));

echo json_encode(['success' => true, 'already_running' => false]);
?>