# gamma-ortho
# Gamma Ortho Instruments - Full Stack E-commerce & Admin System

## Project Overview

This project is a full-stack application for Gamma Ortho Instruments, designed to provide a customer-facing e-commerce website and an admin panel for managing products and orders. The system allows customers to browse products, place order inquiries, and submit general inquiries. Administrators can manage product listings (including images and detailed dimensions) and will eventually handle order processing.

The backend is built with Node.js and Express, using MongoDB for data storage and Google Cloud Storage for image uploads. Email notifications are handled via Nodemailer. The backend is designed to be deployed as a containerized application on Google Cloud Run.

The frontend consists of two main parts:
1.  A customer-facing website (single HTML file) for product Browse and order inquiries.
2.  An admin panel (single HTML file) for product management.

## Directory Structure (Conceptual)

Based on the files provided, the project can be conceptualized with the following structure:


gamma-ortho-project/
├── admin-frontend/
│   └── index.html             # Admin panel
├── backend/                   # Backend application
│   ├── models/
│   │   ├── Product.js         # Product schema
│   │   └── Order.js           # Order schema
│   ├── routes/
│   │   ├── adminProductRoutes.js # Admin product APIs
│   │   ├── publicProductRoutes.js# Public product APIs
│   │   ├── orderRoutes.js       # Order APIs
│   │   └── inquiryRoutes.js     # Inquiry APIs
│   ├── services/
│   │   ├── emailService.js      # Email handling
│   │   └── imageUploadService.js# Image upload
│   ├── server.js                # Express server
│   ├── package.json             # Dependencies
│   ├── Dockerfile               # Docker instructions
│   └── .dockerignore            # Docker ignore file
└── customer-frontend/           # Customer website
└── index.html             # Main customer HTML
# (Canvas ID: gamma_ortho_website_final_v2)


## File Descriptions

### Customer Frontend (`customer-frontend/index.html` or Canvas `gamma_ortho_website_final_v2`)

* **Purpose:** The main interface for customers.
* **Features:** Product listings, search/filter, order summary, order inquiry submission, contact form, floating cart button.
* **Key Interactions:** Fetches products (`/api/products`), submits orders (`/api/orders/place-order`), submits inquiries (`/api/inquiry/submit`).

### Admin Frontend (`admin-frontend/index.html`)

* **Purpose:** Interface for administrators to manage products.
* **Features:** Product listing (card view), search/filter, add/edit/delete products (with image uploads), FAB for adding products.
* **Key Interactions:** Uses `/api/admin/products` for CRUD operations.

### Backend (`backend/`)

#### `server.js`

* **Purpose:** Main Express server setup.
* **Responsibilities:** Initializes Express, connects to MongoDB, configures middleware (CORS, body parsers), mounts API routes, starts the server.

#### `package.json`

* **Purpose:** Defines backend dependencies (`express`, `mongoose`, `cors`, `nodemailer`, `multer`, `@google-cloud/storage`) and scripts (`start`).

#### `Dockerfile`

* **Purpose:** Instructions to build a Docker container image for the backend. Includes Node.js base image, dependency installation, code copying, port exposure, and startup command.

#### `.dockerignore`

* **Purpose:** Specifies files to exclude from the Docker build (e.g., `node_modules`, `.env`).

#### `models/Product.js`

* **Purpose:** Mongoose schema for products (name, description, type, images, dimensions, GST, active status).

#### `models/Order.js`

* **Purpose:** Mongoose schema for orders (customer info, shipping address, items, total, status, payment details).

#### `routes/adminProductRoutes.js`

* **Purpose:** API endpoints for admin product CRUD operations (`/api/admin/products`). Handles image uploads using `multer` and `imageUploadService.js`.

#### `routes/publicProductRoutes.js`

* **Purpose:** API endpoints for public product listings (`/api/products`). Fetches active products with selected fields.

#### `routes/orderRoutes.js`

* **Purpose:** API endpoint for customer order submissions (`/api/orders/place-order`). Currently triggers email notifications. (TODO: Save order to DB).

#### `routes/inquiryRoutes.js`

* **Purpose:** API endpoint for contact form submissions (`/api/inquiry/submit`). Handles file attachments and sends email notifications.

#### `services/emailService.js`

* **Purpose:** Sends emails for order confirmations and inquiries using `nodemailer`.

#### `services/imageUploadService.js`

* **Purpose:** Manages image uploads to and deletions from Google Cloud Storage.

## Overall Code Flow

1.  **Customer Frontend:** Fetches products, allows cart management, and submits order/inquiry forms to the backend.
2.  **Admin Frontend:** Fetches product list, allows CRUD operations on products, interacting with admin-specific backend APIs.
3.  **Backend API (`server.js` & Routes):** Handles requests, interacts with models for database operations, and uses services for tasks like email sending and image uploads.
4.  **Services:** `emailService.js` for notifications, `imageUploadService.js` for GCS interactions.
5.  **Data Storage:** MongoDB for product/order data, GCS for images.

## Deployment (to Google Cloud Run)

* Backend is containerized using `Dockerfile`.
* Cloud Build trigger builds and pushes the image to Artifact Registry.
* Cloud Run service deploys the image from Artifact Registry.
* Environment variables (DB URI, API keys, etc.) are configured in Cloud Run.

## Key Environment Variables (for Backend)

* `PORT`
* `MONGODB_URI`
* `FRONTEND_URL`
* `ADMIN_FRONTEND_URL`
* `SENDER_EMAIL_USER`
* `SENDER_EMAIL_PASS` (from Secret Manager)
* `OWNER_EMAIL`
* `GCS_BUCKET_NAME`
* `GOOGLE_APPLICATION_CREDENTIALS_JSON` (from Secret Manager)

---
