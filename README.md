# SmartAcademicManagementSystem
An integrated system for the Pamantasan ng Lungsod ng Pasig

## Overview
The Smart Academic Management System is a comprehensive platform that integrates multiple modules for managing various academic and administrative functions at PLP College of Computer Studies.

## System Architecture

### Entry Points
- **Root Index** (`index.html`) - Redirects to login page
- **Login** (`auth/login.html`) - User authentication portal
- **Main Portal** (`portal/portal.html`) - Module selection dashboard

### Navigation Flow
```
index.html → auth/login.html → portal/portal.html → [5 Modules]
```

### 1. Faculty Requirement Submission System
**Status:** Active  
**Path:** `/FacultyRequirementSubmissionSystem/pages/dashboard.html`  
**Features:**
- Dashboard with system statistics
- Files management and submission tracking
- Supabase integration with connection indicator

### 2. System Administration
**Status:** Active  
**Path:** `/admin/usermanagement.html`  
**Access:** Admin and Super Admin only
**Features:**
- User management with role-based permissions
- Super Admin: Manage all users (Faculty, Deans, Admins)
- Admin: Manage Faculty and Deans only
- User approval and deletion controls
- Real-time user statistics

### 3. Thesis & Capstone Archiving
**Status:** In Development  
**Path:** `/ThesisAndCapstoneArchiving/placeholder.html`  
**Purpose:** Browse, submit, and manage student thesis and capstone project records

### 4. Student Violation Management System
**Status:** In Development  
**Path:** `/StudentViolationManagementSystem/placeholder.html`  
**Purpose:** Record, monitor, and resolve student disciplinary cases

### 5. Time In & Time Out Monitoring
**Status:** In Development  
**Path:** `/TimeInAndTimeOutMonitoring/placeholder.html`  
**Purpose:** Track faculty and staff attendance logs and work hours

## Configuration

### Supabase Connection
The system is connected to Supabase for backend services:
- **Configuration:** `/config/config.js` (loads from `.env.js`)
- **Credentials:** Stored securely in `/config/.env.js` (gitignored)
- **Setup Guide:** See `/config/SETUP.md` for detailed instructions
- **Status Indicator:** Green/red light in header (Faculty Requirement System)

**First-time Setup:**
1. Copy `config/.env.example.js` to `config/.env.js`
2. Add your Supabase credentials to `.env.js`
3. The `.env.js` file is protected by `.gitignore` and won't be committed

### Session Management
- User sessions are stored in `sessionStorage`
- Automatic redirect to login if session expires
- Session cleared on logout

## Getting Started

1. **Configure Supabase (First Time Only):**
   - Follow instructions in `/config/SETUP.md`
   - Ensure `.env.js` exists with your credentials

2. **Access the System:**
   - Open `index.html` in your browser
   - You'll be redirected to the login page

2. **Login:**
   - Enter your username and password
   - Select your role (Faculty/Admin/Dean)
   - Click "Sign In"

3. **Select Module:**
   - Choose from 5 available modules in the portal
   - Faculty Requirement System and System Administration are fully functional
   - Admin panel only visible to Admin users

## Design System
- **Primary Color:** PLP Green (#145a2e)
- **Fonts:** 
  - Headings: Merriweather
  - Body: Source Sans 3
- **Framework:** Bootstrap 5.3.2

## Folder Structure
```
SmartAcademicManagementSystem/
├── index.html                          # Root entry point
├── auth/                               # Authentication module
│   ├── login.html
│   ├── login.css
│   └── assets/                         # Logos
├── config/                             # Configuration files
│   └── config.js                       # Supabase config
├── portal/                             # Main portal/dashboard
│   ├── portal.html
│   ├── portal.css
│   └── portal.js
├── admin/                              # System administration (Admin only)
│   ├── usermanagement.html             # User management interface
│   ├── usermanagement.css
│   ├── usermanagement.js               # Role-based access logic
│   ├── common.css
│   └── common.js
├── FacultyRequirementSubmissionSystem/ # Module 1
│   ├── pages/                          # HTML pages
│   ├── resc/                           # Resources (CSS/JS)
│   ├── includes/                       # Reusable components
│   └── controllers/                    # Backend logic
├── ThesisAndCapstoneArchiving/         # Module 2
├── StudentViolationManagementSystem/   # Module 3
└── TimeInAndTimeOutMonitoring/         # Module 4
```

## Security Features
- Session-based authentication
- Automatic session validation on page load
- Secure logout with session cleanup
- Protected routes (requires login)

## Browser Support
- Chrome (Recommended)
- FiDean:** Department-level oversight and approvals
- **Admin:** Can manage Faculty and Deans; access to user management
- **Super Admin:** Full system access including managing all users and admins

### Admin Access Levels:
| Feature | Super Admin | Admin | Faculty/Dean |
|---------|-------------|-------|--------------|
| View Faculty/Deans | ✅ | ✅ | ❌ |
| Add/Delete Faculty/Deans | ✅ | ✅ | ❌ |
| View Admins | ✅ | ❌ | ❌ |
| Add/Delete Admins | ✅ | ❌ | ❌ |
| Change Admin Roles | ✅ | ❌ | ❌ |
| System Settings | ✅ | Limited | ❌ |
- Safari

## User Roles
- **Faculty:** Access to submission and monitoring features
- **Admin:** Full system access including user management
- **Dean:** Department-level oversight and approvals

## Notes
- Currently, only the Faculty Requirement Submission System is fully implemented
- Other modules are in development and show placeholder pages
- All modules will share the same authentication and Supabase backend

---
**Developed for:** Pamantasan ng Lungsod ng Pasig — College of Computer Studies  
**Year:** 2025
