<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// CONFIGURATION - Updated to flask_attendance.py
$pythonExe  = "C:\\Users\\PLPASIG\\pythonnn\\python.exe";
$scriptPath = "C:\\xampp\\htdocs\\INTEG SYSTEM\\SmartAcademicManagementSystem\\TimeInAndTimeOutMonitoring\\students\\flask_attendance.py";
$logFile    = "C:\\xampp\\htdocs\\attendance_engine_error.log";

// Windows command to start the engine in the background
$cmd = 'start /B "" "' . $pythonExe . '" "' . $scriptPath . '" > "' . $logFile . '" 2>&1';

pclose(popen($cmd, "r"));

echo json_encode(['success' => true, 'message' => 'Attendance engine ignition started']);
?>