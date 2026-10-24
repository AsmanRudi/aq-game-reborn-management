🎮 AQ Game Reborn Management
A modern, scalable game console rental management system designed for PS3/PS4 rental operations. Built with a clean monorepo architecture, this system handles bookings, sessions, payments, invoices, and customer management with enterprise-grade security and audit trails.

🚀 Quick Start
# Clone and setup
git clone <repo-url>
cd aq-game-reborn-management
cp .env.example .env

# Edit .env with your database credentials
# PostgreSQL database URL, session secret (min 32 chars)

# Install dependencies
npm install

# Setup database
npm run db:generate
npm run db:migrate

# Start development
npm run dev
Frontend: http://localhost:5173 (Vite)
Backend API: http://localhost:3000 (Express)
📋 Table of Contents
Overview
Architecture
Tech Stack
Features
API Endpoints
Database Schema
Security Features
Testing
Deployment
Project Structure
Contributing
🎯 Overview
AQ Game Reborn Management is a comprehensive rental management platform that handles the complete lifecycle of game console rentals:

Booking Management: Create, confirm, check-in, and cancel bookings
Rental Sessions: Track active sessions, billing, and session adjustments
Payment Processing: Manual QRIS payments, cash transactions, and payment adjustments
Invoice Management: Generate invoices, track payments, and manage billing cycles
Customer Management: Customer profiles, member tracking, and loyalty rewards
Staff Management: Role-based access control (Admin/Cashier)
Audit Logging: Complete audit trail for all financial transactions
Reporting Dashboard: Real-time operational insights and analytics
🏗️ Architecture
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Web Frontend  │────▶│   API Gateway    │────▶│   PostgreSQL    │
│   (React/Vite)  │     │   (Express.js)   │     │   (Prisma ORM)  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                              │
                              ▼
                      ┌──────────────────┐
                      │  Prisma Client   │
                      │  (Type-Safe DB)  │
                      └──────────────────┘
Key Architectural Decisions
Monorepo with npm workspaces: Shared dependencies, isolated builds
Type-Safe API Layer: Zod validation + TypeScript for runtime safety
Server-Side Authorization: Role checks enforced on every protected operation
Database Transactions: Financial operations wrapped in ACID transactions
Audit-First Design: Every mutation records an audit event before applying changes
💻 Tech Stack
Backend
Runtime: Node.js 22+
Framework: Express.js 5.x
Language: TypeScript 5.x (strict mode)
ORM: Prisma 6.x with PostgreSQL
Validation: Zod 4.x
Testing: Vitest 3.x
Build: TypeScript Compiler (tsc)
Frontend
Build Tool: Vite
Styling: Tailwind CSS
State Management: (React Context or Zustand)
DevOps
Package Manager: npm workspaces
Database: PostgreSQL 15+
Deployment: Vercel (serverless functions)
Environment: dotenv with strict validation
✨ Features
🎫 Booking System
Create bookings with station, customer, and rate selection
Automatic booking number generation (BK-YYYYMM-XXXX)
Station availability checking with overlap prevention
Rate validation against station console/device type
Status transitions: CONFIRMED → CHECKED_IN → COMPLETED
Cancellation with reason tracking
No-show marking for missed bookings
⏱️ Rental Sessions
Start sessions from confirmed bookings
Automatic billing calculation based on rate type (HOURLY/PACKAGE)
Session adjustments (add/remove minutes)
Planned end time tracking
Session completion and final billing
Station occupancy enforcement (one active session per station)
💰 Payment & Invoices
Manual QRIS payment recording
Cash payment processing
Idempotency keys to prevent duplicate payments
Automatic invoice status updates (UNPAID → PARTIAL → PAID)
Payment adjustments with admin approval
Excess payment validation
Partial payment tracking
👥 Customer Management
Customer profile creation and lookup
Member number assignment
Member status tracking (active/inactive)
Contact information management
Customer notes and history
🔐 Staff & Authentication
Bcrypt password hashing
Session-based authentication with SHA-256 token hashing
12-hour session lifetime with refresh capability
Role-based access control (ADMIN, CASHIER)
Login attempt rate limiting (10 attempts per 15 minutes per IP)
Session revocation on logout
📊 Audit & Compliance
Complete audit trail for all mutations
Before/after state snapshots
Actor tracking (who performed the action)
Entity-level change tracking
Request ID correlation for debugging
📈 Reporting & Analytics
Real-time dashboard with operational metrics
Revenue summaries by period
Station utilization reports
Customer spending analytics
Top customers by rental value
🏷️ Loyalty & Vouchers
Reward points accumulation (paid minutes → reward minutes)
Voucher issuance and redemption
Reward ledger tracking
Member benefits management
📡 API Endpoints
Authentication
Method	Endpoint	Description	Auth Required
POST	/api/v1/auth/login	Staff login	No
POST	/api/v1/auth/logout	Logout current session	Yes
GET	/api/v1/auth/me	Get current user profile	Yes
POST	/api/v1/auth/bootstrap-admin	Create first admin (dev only)	No
Bookings
Method	Endpoint	Description	Auth Required
GET	/api/v1/bookings	List bookings with filters	Yes
POST	/api/v1/bookings	Create new booking	Yes (ADMIN only)
GET	/api/v1/bookings/:id	Get booking by ID	Yes
PATCH	/api/v1/bookings/:id/status	Update booking status	Yes
POST	/api/v1/bookings/:id/check-in	Check-in booking	Yes
POST	/api/v1/bookings/:id/cancel	Cancel booking	Yes
Rental Sessions
Method	Endpoint	Description	Auth Required
GET	/api/v1/sessions	List sessions with filters	Yes
POST	/api/v1/sessions	Start rental session	Yes
PATCH	/api/v1/sessions/:id/stop	Stop rental session	Yes
Payments
Method	Endpoint	Description	Auth Required
POST	/api/v1/payments	Record payment	Yes
GET	/api/v1/payments	List payments	Yes
GET	/api/v1/payments/:id	Get payment by ID	Yes
POST	/api/v1/payments/:id/adjustment	Record adjustment	Yes (ADMIN only)
Invoices
Method	Endpoint	Description	Auth Required
GET	/api/v1/invoices	List invoices	Yes
POST	/api/v1/invoices	Create invoice	Yes
GET	/api/v1/invoices/:id	Get invoice by ID	Yes
PATCH	/api/v1/invoices/:id/status	Update invoice status	Yes
Stations & Rates
Method	Endpoint	Description	Auth Required
GET	/api/v1/stations	List stations	Yes
POST	/api/v1/stations	Create station	Yes (ADMIN only)
GET	/api/v1/rates	List rates	Yes
POST	/api/v1/rates	Create rate	Yes (ADMIN only)
Customers
Method	Endpoint	Description	Auth Required
GET	/api/v1/customers	List customers	Yes
POST	/api/v1/customers	Create customer	Yes
Vouchers
Method	Endpoint	Description	Auth Required
GET	/api/v1/vouchers	List vouchers	Yes
POST	/api/v1/vouchers	Create voucher	Yes (ADMIN only)
Dashboard
Method	Endpoint	Description	Auth Required
GET	/api/v1/dashboard/summary	Get dashboard summary	Yes
🗄️ Database Schema
The system uses PostgreSQL with Prisma ORM. Key models:

┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  StaffUser  │────▶│ AuthSession  │────▶│   AuditLog   │
└─────────────┘     └──────────────┘     └──────────────┘
         │
         ├──────────┬──────────────┬──────────────┐
         ▼          ▼              ▼              ▼
┌─────────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│   Station   │ │   Rate   │ │ Customer │ │  Voucher │
└─────────────┘ └──────────┘ └──────────┘ └──────────┘
         │          │              │
         ▼          ▼              ▼
┌─────────────┐ ┌──────────┐ ┌──────────┐
│   Booking   │ │RentalSess│ │  Invoice │
└─────────────┘ └──────────┘ └──────────┘
                       │
                       ▼
                 ┌──────────┐
                 │ Payment  │
                 └──────────┘
Key Design Patterns
Snapshot Pattern: Rate and pricing data snapshotted at booking/session creation to preserve historical accuracy
Event Sourcing Light: Audit logs capture before/after state for all mutations
Soft Deletes: No hard deletes - financial records preserved with void/refund/adjustment records
Idempotency Keys: Payment operations support idempotency to prevent duplicates
🔒 Security Features
Authentication
Bcrypt password hashing with salt
SHA-256 token hashing for sessions
12-hour session expiration
Session revocation on logout
Login attempt rate limiting (10 attempts per 15 min per IP)
Authorization
Role-based access control (ADMIN, CASHIER)
Cashiers cannot manage staff, tariffs, audit records, or database backup/restore
Server-side authorization checks on every protected operation
Client-side validation is convenience-only
Data Protection
Passwords never exposed to browser
Secrets stored in environment variables (not committed)
Database credentials encrypted in transit (SSL)
Input validation with Zod on all external data
Financial Integrity
All financial operations wrapped in database transactions
No hard deletes - corrections use void/refund/adjustment records
Audit events recorded before applying changes
Payment adjustments require admin approval
🧪 Testing
Test Strategy
Unit Tests: Service layer functions in isolation
Integration Tests: Full API endpoint testing with real database
Test Database: Dedicated _test database required for integration tests
Running Tests
# Set up test database
export AQ_TEST_DATABASE_URL="postgresql://user:pass@localhost:5432/aq_game_reborn_test"

# Run all tests
npm test

# Run specific test file
npx vitest run test/bookings.test.ts
Test Coverage
Booking creation, status updates, and cancellation
Session start/stop and billing calculation
Payment recording and invoice status updates
Authentication and authorization flows
Audit event recording
🚀 Deployment
Prerequisites
Node.js 22+
PostgreSQL 15+
Vercel account
Environment Variables
Variable	Required	Description
NODE_ENV	Yes	production for deployment
DATABASE_URL	Yes	PostgreSQL connection string
SESSION_SECRET	Yes	Random 32+ character secret
API_PORT	No	API port (default: 3000)
WEB_ORIGIN	No	Frontend origin for CORS
Deploy to Vercel
# Install Vercel CLI
npm i -g vercel

# Deploy to Vercel
vercel --prod

# Or import existing repository in Vercel dashboard
Database Migration in Production
# Apply migrations
npx prisma migrate deploy

# Generate Prisma client
npx prisma generate
📁 Project Structure
aq-game-reborn-management/
├── apps/
│   ├── api/                    # Backend API
│   │   ├── src/
│   │   │   ├── middleware/     # Auth middleware
│   │   │   ├── routes/         # API route handlers
│   │   │   ├── services/       # Business logic
│   │   │   ├── schemas/        # Zod validation schemas
│   │   │   ├── config.ts       # Environment config
│   │   │   ├── db.ts           # Prisma client
│   │   │   ├── app.ts          # Express app setup
│   │   │   └── server.ts       # Server entry point
│   │   ├── test/               # Test files
│   │   ├── prisma/             # Prisma schema & migrations
│   │   └── package.json
│   └── web/                    # Frontend application
│       ├── src/
│       └── package.json
├── docs/                       # Technical documentation
├── prisma/
│   └── schema.prisma           # Database schema
├── .env.example                # Environment variables template
├── vercel.json                 # Vercel deployment config
├── package.json                # Root package (workspaces)
└── README.md
🛠️ Development Commands
Command	Description
npm run dev	Start both API and web in development
npm run build	Build both API and web for production
npm run lint	Run TypeScript type checking
npm run test	Run all test suites
npm run db:generate	Generate Prisma client
npm run db:migrate	Create and apply database migrations
npm run db:seed	Seed database with initial data
npm run db:studio	Open Prisma Studio (database GUI)
📊 API Health Check
# Check API status
curl http://localhost:3000/api/v1/health

# Expected response
{
  "status": "ok",
  "service": "aq-game-api",
  "timestamp": "2026-01-15T10:30:00.000Z"
}
🤝 Contributing
Fork the repository
Create a feature branch (git checkout -b feature/amazing-feature)
Commit your changes (git commit -m 'Add some amazing feature')
Push to the branch (git push origin feature/amazing-feature)
Open a Pull Request
Code Style
TypeScript strict mode
camelCase for variables and functions
PascalCase for classes and interfaces
UpperSnakeCase for constants
Indonesian for user-facing messages
UTC timestamps for all datetime values
Integer Rupiah for all monetary values
📞 Support
For questions, bug reports, or feature requests, please open an issue on GitHub.

🙏 Acknowledgments
Built with ❤️ for the gaming rental community.

⭐ If you like this project, please give it a star on GitHub!
