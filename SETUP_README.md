# Ship Booking System Setup Guide

## Overview
This is a comprehensive ship booking system with the following features:
- Admin configuration for service types and routes
- Agent booking module with step-by-step flow
- Customer management and booking history
- Ticket generation and printing
- Price calculation with VAT

## Database Schema
The system includes the following tables:
- `users` - Admin and agent authentication
- `service_types` - Different service types (e.g., Franchise)
- `routes` - Routes within service types with pricing
- `customers` - Customer information
- `bookings` - Booking records with ticket generation

## Setup Instructions

### 1. Database Setup
First, make sure you have MySQL running and create a database for the project.

### 2. Backend Setup
```bash
cd backend

# Install dependencies
npm install

# Set up environment variables
# Create a .env file with your database credentials
cp .env.example .env

# Update .env with your database settings:
# DB_HOST=localhost
# DB_USER=your_username
# DB_PASSWORD=your_password
# DB_NAME=ship_booking
# JWT_SECRET=your_jwt_secret
# CORS_ORIGIN=http://localhost:3000

# Run the database schema setup (manually execute schema.sql in your MySQL client)
# Then seed the database with initial data
npm run seed

# Start the backend server
npm run dev
```

### 3. Frontend Setup
```bash
cd frontend

# Install dependencies
npm install

# Start the development server
npm start
```

### 4. Initial Data
The seed script will create:
- Admin user: `kritish.vodafone@gmail.com` / `abcd1234`
- Agent user: `kunaal.vodafone@gmail.com` / `abcd1234`
- Franchise service type with routes from Suva to various destinations
- Pricing for Adult, Student, Child, and Infant passengers

## Features

### Admin Features (Configuration Tab)
- Create and manage service types
- Create, edit, and delete routes
- Set pricing for different passenger types
- Manage VAT rates

### Agent Features (Booking Tab)
- Step-by-step booking process:
  1. Customer Information
  2. Route Selection
  3. Travel Details
  4. Confirmation
  5. Ticket Generation
- Price calculation with VAT
- Printable ticket generation
- Support for one-way and return bookings

### System Features
- Role-based access control
- Real-time price calculation
- Comprehensive booking management
- Professional ticket documents
- Responsive design with Tailwind CSS

## API Endpoints

### Authentication
- `POST /api/login` - User login
- `GET /api/me` - Get current user
- `GET /api/dashboard` - Dashboard data

### Service Types (Admin only)
- `GET /api/service-types` - List service types
- `POST /api/service-types` - Create service type
- `PUT /api/service-types/:id` - Update service type

### Routes (Admin only for CUD operations)
- `GET /api/routes` - List routes
- `POST /api/routes` - Create route
- `PUT /api/routes/:id` - Update route
- `DELETE /api/routes/:id` - Delete route

### Bookings
- `GET /api/bookings` - List all bookings
- `GET /api/bookings/:ticketId` - Get booking by ticket ID
- `POST /api/bookings` - Create new booking
- `PUT /api/bookings/:ticketId/status` - Update booking status

## Usage Flow

### For Admins:
1. Login with admin credentials
2. Go to Configuration tab
3. Manage service types and routes
4. Set pricing for different passenger categories

### For Agents:
1. Login with agent credentials
2. Use the Booking tab (default for agents)
3. Follow the step-by-step booking process:
   - Enter customer information
   - Select service type and route
   - Choose passenger type and see price breakdown
   - Select travel dates and booking type
   - Confirm booking details
   - Generate and print ticket

## Technical Stack
- **Backend**: Node.js, Express.js, MySQL, JWT authentication
- **Frontend**: React.js, Tailwind CSS
- **Database**: MySQL with foreign key relationships
- **Security**: bcrypt password hashing, JWT tokens, role-based access

## Troubleshooting
- Make sure MySQL is running and accessible
- Check that all environment variables are set correctly
- Ensure the database schema is properly created
- Verify that the seed script ran successfully
- Check browser console for any frontend errors
