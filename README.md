# SLU Student Organization Portal - 9487_Team_Unbelibables 

<b>Team members:</b> <br>
ABADECIO, ROBE ROENZ SALVADOR <br>
AQUINO, DUSTIN PIOU <br>
POLICARPIO, JULIAN EYMARD MALLARI <br>
UMALI, JERVIGN ADRIANNE PRADO <br>
SARMIENTO, ALFREDO JULIENNE SESE <br>
WACDAGAN, BENEDICT


## Quick Setup

1. **Install WAMP Server** and start it
2. **Import the database in PhpMyAdmin**:
   - Go to `http://localhost/phpmyadmin`
   - Import `sql/312team-unbelibables.sql`
3. **Open the app**: `http://localhost/`

To start the Admin server:

1. Navigate to the admin folder
2. Run 'node server.js' in the terminal
3. Navigate to http://localhost:3001

## Virtual Machine Setup
Virtual Machine Credentials: <br>
Username: user <br>
Password: 1

1. Navigate to home directory 'cd /'
2. Navigate to /var/www/html/admin/
3. Run 'pm2 start server.js'
4. Open the virtual machine's IP adress in the browser
5. Add ':3001' for admin login

### Database Setup (If no database setup yet)
1. Run 'mysql -u user -p'
2. Create a new database 'create database slu_org_portal'
3. Use database 'use slu_org_portal'
4. Run 'source /var/www/html/sql/312team-unbelibables.sql'
4. Run 'GRANT ALL PRIVILEGES ON slu_org_portal.* TO 'user'@'localhost';'
5. Run 'flush privileges'

Database user credentials:
Username: user
Password: user

---

## How to Login

Use these test accounts to explore different roles:

| Role                   | Email            | Password |
| ---------------------- | ---------------- | -------- |
| **Organization** | icon@slu.edu.ph  | icon123  |
| **OSA Staff**    | osa@slu.edu.ph   | osa123   |
| **Admin**        | admin@slu.edu.ph | admin123 |

---

## How It Works

### For Organizations

1. Login with organization account
2. Fill out the submission form with your event details
3. Upload a PDF document
4. Submit and track your proposal

### For OSA Staff

1. Login with OSA account
2. View all submitted proposals
3. Review documents and track organization activities

### For Admins

1. Login with admin account
2. See all online users

---

## Project Structure

```
SLU-Student-Org-Portal/
├── index.html                      # Main landing/login page
├── README.md                       # This file
├── Documentation.md                # Additional documentation
├── TODO.md                         # Project task list
│
├── admin/                          # Admin portal (Node.js)
│   ├── admin-login.html           # Admin login page
│   ├── admin-login.js             # Admin login logic
│   ├── admin-portal.html          # Admin dashboard
│   ├── admin-portal.js            # Admin dashboard logic
│   ├── package.json               # Node dependencies
│   └── server.js                  # Express server
│
├── api/                           # Backend API (PHP)
│   ├── db.php                     # Database connection
│   ├── login.php                  # Login endpoint
│   ├── logout.php                 # Logout endpoint
│   ├── check-session.php          # Session validation
│   ├── read.php                   # Read submissions
│   └── submit.php                 # Create submission
│
├── pages/                         # Portal pages
│   ├── org-portal.html            # Organization dashboard
│   └── osa-portal.html            # OSA dashboard
│
├── scripts/                       # JavaScript files
│   ├── login.js                   # Login page logic
│   ├── org-portal.js              # Org portal logic
│   ├── osa-portal.js              # OSA portal logic
│   └── pdf-utils.js               # PDF handling utilities
│
├── styles/                        # CSS stylesheets
│   ├── login-style.css            # Login page styles
│   ├── org-portal.css             # Org portal styles
│   ├── osa-portal.css             # OSA portal styles
│   ├── admin-dashboard.css        # Admin dashboard styles
│   └── fonts.css                  # Font definitions
│
├── resources/                     # Static assets
│   ├── fonts/                     # Custom fonts
│   ├── icons/                     # Icon files
│   └── images/                    # Images
│
├── sql/                           # Database scripts
│   └── 312team-unbelibables.sql   # Database schema & sample data
│
└── uploads/                       # Uploaded PDF files
    ├── annual_event_proposal_sc.pdf
    ├── workshop_registration_tc.pdf
    ├── exhibition_request_as.pdf
    ├── community_outreach_vc.pdf
    └── sports_tournament_aa.pdf
```
