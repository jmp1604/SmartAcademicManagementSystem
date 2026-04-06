<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

// Point directly to your new BAT file
$bat_file = 'C:\xampp\htdocs\INTEG SYSTEM\SmartAcademicManagementSystem\TimeInAndTimeOutMonitoring\students\START_REGISTRATION.bat';

// Execute the BAT file in the background
pclose(popen('start "" "' . $bat_file . '"', "r"));

echo json_encode(["status" => "success", "message" => "Triggered BAT file"]);
?>