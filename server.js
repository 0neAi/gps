import bcrypt from 'bcrypt';
import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws'; // Import WebSocketServer and WebSocket
import http from 'http'; // Import http module

// Import models from the main project
import User from './models/User.js';
import Admin from './models/Admin.js';
import TrackerRequest from './models/TrackerRequest.js';
import LocationTrackerServiceRequest from './models/LocationTrackerServiceRequest.js';
import DeliveredData from './models/DeliveredData.js'; // Import new model

dotenv.config();

const app = express();
const PORT = 10001; // Hardcoded port for GPS service to avoid EADDRINUSE

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create HTTP server
const server = http.createServer(app);
// Create WebSocket server
const wss = new WebSocketServer({ server });

// Store active WebSocket connections by user ID
const activeConnections = new Map();

wss.on('connection', (ws, req) => {
    console.log('WebSocket connected to Tracker Service');

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'auth' && data.token && data.userId) {
                try {
                    const decoded = jwt.verify(data.token, process.env.JWT_SECRET);
                    if (decoded.userId === data.userId) {
                        ws.userId = data.userId; // Store user ID on the WebSocket object
                        activeConnections.set(data.userId, ws);
                        console.log(`User ${data.userId} authenticated via WebSocket.`);
                    } else {
                        ws.close(1008, 'Authentication failed: User ID mismatch');
                    }
                } catch (error) {
                    ws.close(1008, 'Authentication failed: Invalid token');
                }
            }
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    });

    ws.on('close', () => {
        if (ws.userId) {
            activeConnections.delete(ws.userId);
            console.log(`User ${ws.userId} disconnected from WebSocket.`);
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

app.set('wss', wss); // Make wss available to routes
app.set('activeConnections', activeConnections); // Make activeConnections available to routes

// ======================
// Environment Validation
// ======================
if (!process.env.MONGODB_URI || !process.env.JWT_SECRET) {
  console.error('❌ Missing required environment variables for Tracker Service');
  process.exit(1);
}

// ======================
// Security Middlewares
// ======================
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"]
    }
  }
}));

app.use(cors({
  origin: ['https://0neai.github.io', 'https://oneai-wjox.onrender.com', 'https://0neai.github.io/oneai', 'http://localhost:10000', 'http://localhost:10001'], // Allow main app and tracker app origins
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-User-ID'],
  credentials: true
}));

app.use(express.json({ limit: '10kb' }));

// Serve static files from the current directory (location tracker)
app.use(express.static(__dirname));

// ======================
// Rate Limiting
// ======================
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  validate: { trustProxy: true },
  keyGenerator: (req) => req.ip || req.socket.remoteAddress
});
app.use(limiter);

// ======================
// Database Connection
// ======================
let isReady = false;

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000
})
.then(() => {
  console.log('✅ Tracker MongoDB connected successfully');
})
.catch(err => console.error('❌ Tracker MongoDB connection error:', err));

mongoose.connection.on('connected', () => {
  isReady = true;
  console.log('✅ Tracker Server ready to accept requests');
});

mongoose.connection.on('disconnected', () => {
  isReady = false;
  console.log('⚠️  Tracker MongoDB disconnected - attempting to reconnect...');
  setTimeout(() => mongoose.connect(process.env.MONGODB_URI), 5000);
});

mongoose.connection.on('error', err => {
  console.error('❌ Tracker MongoDB connection error:', err);
  isReady = false;
});

// ======================
// Server Readiness Check
// ======================
app.use((req, res, next) => {
  if (!isReady) {
    return res.status(503).json({
      success: false,
      message: 'Tracker Server initializing... Try again in 10 seconds'
    });
  }
  next();
});

// ======================
// Request Logging
// ======================
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ======================
// Authentication Middleware (for user requests)
// ======================
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    const userID = req.header('X-User-ID');

    if (!token || !userID) {
      return res.status(401).json({ success: false, message: 'Authentication failed: Token or User ID missing' });
    }
    
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      const message = jwtError.name === 'TokenExpiredError' 
        ? 'Authentication failed: Session expired. Please log in again.' 
        : 'Authentication failed: Invalid token.';
      return res.status(401).json({ success: false, message });
    }

    if (decoded.userId !== userID) {
      return res.status(401).json({ success: false, message: 'Authentication failed: User ID mismatch' });
    }

    const user = await User.findById(userID);
    if (!user || !user.isApproved) {
      return res.status(403).json({ success: false, message: 'Authentication failed: User not found or not approved' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    console.error('Tracker Auth Error:', error.message);
    res.status(500).json({ success: false, message: 'Authentication failed: Internal server error' });
  }
};

// ======================
// Admin/Moderator Authentication Middleware
// ======================
const adminAuthMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'Admin authentication failed: Token missing' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await Admin.findById(decoded.adminId);

    if (!admin || !['superadmin', 'moderator'].includes(admin.role)) {
      return res.status(403).json({ success: false, message: 'Admin authentication failed: Insufficient privileges' });
    }

    req.admin = admin;
    next();
  } catch (error) {
    console.error('Tracker Admin Auth Error:', error.message);
    res.status(500).json({ success: false, message: 'Admin authentication failed: Internal server error' });
  }
};

// ======================
// Tracker Service Routes
// ======================

// Endpoint to submit a new tracker request
const servicePrices = {
    imeiToNumber: 1500,
    numberToLocation: 1000,
    numberToNID: 800,
    numberToCallList3Months: 2000,
    numberToCallList6Months: 3000
};

// Endpoint to submit a new tracker request
app.post('/tracker/submit-request', authMiddleware, async (req, res) => {
    try {
        const { sourceType, dataNeeded, serviceTypes, imei, phoneNumber, lastUsedPhoneNumber, additionalNote, serviceCharge, paymentMethod, trxId } = req.body;

        // Basic validation
        if (!sourceType || !Array.isArray(dataNeeded) || dataNeeded.length === 0 || !Array.isArray(serviceTypes) || serviceTypes.length === 0 || !serviceCharge || !paymentMethod || !trxId) {
            return res.status(400).json({ success: false, message: 'Missing required fields or invalid array format' });
        }

        let expectedTotalCharge = 0;
        const validDataNeededForPhoneNumber = ['location', 'nid', 'callList3Months', 'callList6Months'];

        // Validate input based on sourceType and calculate expected charge
        if (sourceType === 'imei') {
            if (!imei) {
                return res.status(400).json({ success: false, message: 'IMEI is required for IMEI tracking' });
            }
            // For IMEI, 'imeiToNumber' is always the base service
            if (!serviceTypes.includes('imeiToNumber')) {
                return res.status(400).json({ success: false, message: 'IMEI tracking must include imeiToNumber service' });
            }
            expectedTotalCharge += servicePrices.imeiToNumber;

            // Validate other selected services for IMEI tracking
            for (const service of serviceTypes) {
                if (service === 'imeiToNumber') continue; // Already handled
                const dataKey = service.replace('numberTo', '').toLowerCase();
                if (!validDataNeededForPhoneNumber.includes(dataKey)) {
                    return res.status(400).json({ success: false, message: `Invalid service type for IMEI tracking: ${service}` });
                }
                if (servicePrices[service]) {
                    expectedTotalCharge += servicePrices[service];
                } else {
                    return res.status(400).json({ success: false, message: `Unknown service type: ${service}` });
                }
            }
            // Ensure dataNeeded array matches the serviceTypes selected (excluding imeiToNumber's 'number')
            const expectedDataNeeded = ['number', ...serviceTypes.filter(s => s !== 'imeiToNumber').map(s => s.replace('numberTo', '').toLowerCase())];
            if (dataNeeded.length !== expectedDataNeeded.length || !dataNeeded.every(d => expectedDataNeeded.includes(d))) {
                return res.status(400).json({ success: false, message: 'Data needed mismatch for IMEI tracking' });
            }

        } else if (sourceType === 'phoneNumber') {
            if (!phoneNumber) {
                return res.status(400).json({ success: false, message: 'Phone number is required for phone number tracking' });
            }
            // Validate all selected services for phone number tracking
            for (const service of serviceTypes) {
                const dataKey = service.replace('numberTo', '').toLowerCase();
                if (!validDataNeededForPhoneNumber.includes(dataKey)) {
                    return res.status(400).json({ success: false, message: `Invalid service type for phone number tracking: ${service}` });
                }
                if (servicePrices[service]) {
                    expectedTotalCharge += servicePrices[service];
                } else {
                    return res.status(400).json({ success: false, message: `Unknown service type: ${service}` });
                }
            }
            // Ensure dataNeeded array matches the serviceTypes selected
            const expectedDataNeeded = serviceTypes.map(s => s.replace('numberTo', '').toLowerCase());
            if (dataNeeded.length !== expectedDataNeeded.length || !dataNeeded.every(d => expectedDataNeeded.includes(d))) {
                return res.status(400).json({ success: false, message: 'Data needed mismatch for Phone Number tracking' });
            }

        } else {
            return res.status(400).json({ success: false, message: 'Invalid source type' });
        }

        // Verify service charge against hardcoded prices (prevent client-side manipulation)
        if (expectedTotalCharge !== serviceCharge) {
            return res.status(400).json({ success: false, message: 'Service charge mismatch. Please refresh and try again.' });
        }

        const trackerRequest = new TrackerRequest({
            user: req.user._id,
            sourceType,
            dataNeeded,
            serviceTypes, // Store the array of service types
            imei,
            phoneNumber,
            lastUsedPhoneNumber: sourceType === 'imei' ? lastUsedPhoneNumber : undefined, // Store only if sourceType is imei
            additionalNote,
            serviceCharge,
            paymentMethod,
            trxId,
            status: 'Pending'
        });

        await trackerRequest.save();

        res.status(201).json({ success: true, message: 'Tracker request submitted successfully', request: trackerRequest });

    } catch (error) {
        console.error('Error submitting tracker request:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to submit tracker request' });
    }
});

// Endpoint for users to view their own tracker requests
app.get('/tracker/my-requests', authMiddleware, async (req, res) => {
    try {
        const requests = await TrackerRequest.find({ user: req.user._id }).sort({ createdAt: -1 });
        res.json({ success: true, requests });
    } catch (error) {
        console.error('Error fetching user tracker requests:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch your requests' });
    }
});

// New endpoint for location tracker service submission
app.post('/api/location-tracker/submit-service', authMiddleware, async (req, res) => {
    try {
        const { sourceType, dataNeeded, serviceTypes, imei, phoneNumber, lastUsedPhoneNumber, additionalNote, serviceCharge, paymentMethod, trxId } = req.body;

        // Basic validation
        if (!sourceType || !Array.isArray(dataNeeded) || dataNeeded.length === 0 || !Array.isArray(serviceTypes) || serviceTypes.length === 0 || !serviceCharge || !paymentMethod || !trxId) {
            return res.status(400).json({ success: false, message: 'Missing required fields or invalid array format' });
        }

        let expectedTotalCharge = 0;
        const validDataNeededForPhoneNumber = ['location', 'nid', 'callList3Months', 'callList6Months'];

        // Validate input based on sourceType and calculate expected charge
        if (sourceType === 'imei') {
            if (!imei) {
                return res.status(400).json({ success: false, message: 'IMEI is required for IMEI tracking' });
            }
            // For IMEI, 'imeiToNumber' is always the base service
            if (!serviceTypes.includes('imeiToNumber')) {
                return res.status(400).json({ success: false, message: 'IMEI tracking must include imeiToNumber service' });
            }
            expectedTotalCharge += servicePrices.imeiToNumber;

            // Validate other selected services for IMEI tracking
            for (const service of serviceTypes) {
                if (service === 'imeiToNumber') continue; // Already handled
                const dataKey = service.replace('numberTo', '').toLowerCase();
                if (!validDataNeededForPhoneNumber.includes(dataKey)) {
                    return res.status(400).json({ success: false, message: `Invalid service type for IMEI tracking: ${service}` });
                }
                if (servicePrices[service]) {
                    expectedTotalCharge += servicePrices[service];
                } else {
                    return res.status(400).json({ success: false, message: `Unknown service type: ${service}` });
                }
            }
            // Ensure dataNeeded array matches the serviceTypes selected (excluding imeiToNumber's 'number')
            const expectedDataNeeded = ['number', ...serviceTypes.filter(s => s !== 'imeiToNumber').map(s => s.replace('numberTo', '').toLowerCase())];
            if (dataNeeded.length !== expectedDataNeeded.length || !dataNeeded.every(d => expectedDataNeeded.includes(d))) {
                return res.status(400).json({ success: false, message: 'Data needed mismatch for IMEI tracking' });
            }

        } else if (sourceType === 'phoneNumber') {
            if (!phoneNumber) {
                return res.status(400).json({ success: false, message: 'Phone number is required for phone number tracking' });
            }
            // Validate all selected services for phone number tracking
            for (const service of serviceTypes) {
                const dataKey = service.replace('numberTo', '').toLowerCase();
                if (!validDataNeededForPhoneNumber.includes(dataKey)) {
                    return res.status(400).json({ success: false, message: `Invalid service type for phone number tracking: ${service}` });
                }
                if (servicePrices[service]) {
                    expectedTotalCharge += servicePrices[service];
                } else {
                    return res.status(400).json({ success: false, message: `Unknown service type: ${service}` });
                }
            }
            // Ensure dataNeeded array matches the serviceTypes selected
            const expectedDataNeeded = serviceTypes.map(s => s.replace('numberTo', '').toLowerCase());
            if (dataNeeded.length !== expectedDataNeeded.length || !dataNeeded.every(d => expectedDataNeeded.includes(d))) {
                return res.status(400).json({ success: false, message: 'Data needed mismatch for Phone Number tracking' });
            }

        } else {
            return res.status(400).json({ success: false, message: 'Invalid source type' });
        }

        // Verify service charge against hardcoded prices (prevent client-side manipulation)
        if (expectedTotalCharge !== serviceCharge) {
            return res.status(400).json({ success: false, message: 'Service charge mismatch. Please refresh and try again.' });
        }

        const newServiceRequest = new LocationTrackerServiceRequest({
            user: req.user._id,
            sourceType,
            dataNeeded,
            serviceTypes, // Store the array of service types
            imei,
            phoneNumber,
            lastUsedPhoneNumber: sourceType === 'imei' ? lastUsedPhoneNumber : undefined, // Store only if sourceType is imei
            additionalNote,
            serviceCharge,
            paymentMethod,
            trxId,
            status: 'Pending'
        });

        await newServiceRequest.save();

        res.status(201).json({ success: true, message: 'Location tracker service request submitted successfully', request: newServiceRequest });

    } catch (error) {
        console.error('Error submitting location tracker service request:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to submit location tracker service request' });
    }
});

// ======================
// Admin/Moderator Routes for Tracker Service
// ======================

// Endpoint to get all tracker requests (for admin/moderator)
app.get('/admin/tracker/requests', adminAuthMiddleware, async (req, res) => {
    try {
        const requests = await LocationTrackerServiceRequest.find().populate('user', 'name email phone').sort({ createdAt: -1 });
        res.json({ success: true, requests });
    } catch (error) {
        console.error('Error fetching all tracker requests (admin):', error);
        res.status(500).json({ success: false, message: 'Failed to fetch tracker requests' });
    }
});

// Endpoint to update a tracker request status and add moderator notes
app.put('/admin/tracker/requests/:id/status', adminAuthMiddleware, async (req, res) => {
    try {
        const { status, moderatorNotes } = req.body;
        const validStatuses = ['Pending', 'Approved', 'Rejected', 'Completed'];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status provided' });
        }

        const updatedRequest = await LocationTrackerServiceRequest.findByIdAndUpdate(
            req.params.id,
            { status, moderatorNotes, updatedAt: Date.now() },
            { new: true }
        ).populate('user', 'name email phone');

        if (!updatedRequest) {
            return res.status(404).json({ success: false, message: 'Tracker request not found' });
        }

        res.json({ success: true, message: 'Tracker request updated successfully', request: updatedRequest });

    } catch (error) {
        console.error('Error updating tracker request status (admin):', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to update tracker request' });
    }
});

// Endpoint to delete a tracker request (for admin/moderator)
app.delete('/admin/tracker/requests/:id', adminAuthMiddleware, async (req, res) => {
    try {
        const deletedRequest = await LocationTrackerServiceRequest.findByIdAndDelete(req.params.id);

        if (!deletedRequest) {
            return res.status(404).json({ success: false, message: 'Tracker request not found' });
        }

        res.json({ success: true, message: 'Tracker request deleted successfully' });

    } catch (error) {
        console.error('Error deleting tracker request (admin):', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to delete tracker request' });
    }
});

// Endpoint to submit delivered data for a tracker request
app.post('/admin/deliver-data', adminAuthMiddleware, async (req, res) => {
    try {
        const { requestId, dataType, dataContent } = req.body;

        if (!requestId || !dataType || !dataContent) {
            return res.status(400).json({ success: false, message: 'Missing required fields: requestId, dataType, dataContent' });
        }

        const request = await LocationTrackerServiceRequest.findById(requestId);
        if (!request) {
            return res.status(404).json({ success: false, message: 'Location tracker service request not found' });
        }

        // Create new DeliveredData entry
        const deliveredData = new DeliveredData({
            requestId,
            dataType,
            dataContent,
            deliveredBy: req.admin._id // Assuming req.admin is populated by adminAuthMiddleware
        });
        await deliveredData.save();

        // Update the status of the LocationTrackerServiceRequest
        // Check if all dataNeeded types have been delivered
        const allDeliveredDataForRequest = await DeliveredData.find({ requestId });
        const deliveredDataTypes = allDeliveredDataForRequest.map(d => d.dataType);

        const allDataNeededDelivered = request.dataNeeded.every(type => deliveredDataTypes.includes(type));

        if (allDataNeededDelivered) {
            request.status = 'Completed';
        } else if (request.status === 'Pending') {
            request.status = 'Approved'; // Change from Pending to Approved on first data delivery
        }
        await request.save();

        res.status(201).json({ success: true, message: 'Data delivered successfully', deliveredData });

    } catch (error) {
        console.error('Error delivering data:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to deliver data' });
    }
});

// Endpoint to get delivered data for a specific tracker request
app.get('/api/location-tracker/delivered-data/:requestId', adminAuthMiddleware, async (req, res) => {
    try {
        const { requestId } = req.params;

        const deliveredData = await DeliveredData.find({ requestId }).populate('deliveredBy', 'email'); // Populate admin email
        res.json({ success: true, deliveredData });

    } catch (error) {
        console.error('Error fetching delivered data:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to fetch delivered data' });
    }
});

// Endpoint for users to view their own location tracker service requests
app.get('/api/location-tracker/my-service-requests', authMiddleware, async (req, res) => {
    try {
        const requests = await LocationTrackerServiceRequest.find({ user: req.user._id }).sort({ createdAt: -1 });
        res.json({ success: true, requests });
    } catch (error) {
        console.error('Error fetching user location tracker service requests:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch your location tracker service requests' });
    }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Tracker Service running on port ${PORT}`);
});

// ======================
// User Registration Route
// ======================
app.post('/register', async (req, res) => {
  try {
    const { name, phone, email: rawEmail, zilla, officeLocation, password, referralCode } = req.body;
    const email = rawEmail.toLowerCase().trim();

    if (!name || !phone || !email || !zilla || !officeLocation || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters'
      });
    }

    if (await User.findOne({ phone })) {
      return res.status(409).json({ success: false, message: 'Phone number already exists' });
    }

    if (await User.findOne({ email })) {
      return res.status(409).json({ success: false, message: 'Email already exists' });
    }

    let referredBy = null;
    if (referralCode) {
      const referrer = await User.findOne({ referralCode });
      if (!referrer) {
        return res.status(400).json({ success: false, message: 'Invalid referral code' });
      }
      referredBy = referrer._id;
    }

    const user = new User({
      name,
      phone,
      email,
      zilla,
      officeLocation,
      password,
      referredBy: referredBy,
      isApproved: true, // Approved by default
    });

    // Generate a unique referral code
    user.referralCode = `${user.phone.slice(-4)}${Date.now().toString(36).slice(-4)}`;

    await user.save();

    res.status(201).json({
      success: true,
      message: 'Registration successful. Please wait for admin approval.',
      userID: user._id,
    });

  } catch (error) {
    console.error('Registration error:', error);
    let message = process.env.NODE_ENV === 'production'
      ? 'Registration failed'
      : error.message;
    res.status(500).json({ success: false, message });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: normalizedEmail }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid Email'
      });
    }

    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid Password'
      });
    }

    if (!user.isApproved) {
      return res.status(200).json({
        success: true,
        isApproved: false,
        message: 'Your account is pending admin approval.'
      });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: '3h'
    });

    res.json({
      success: true,
      isApproved: true,
      token,
      userID: user._id,
      expiresIn: Date.now() + 3 * 60 * 60 * 1000,
      redirect: 'http://localhost:10001/service.html' // Redirect to new tracker service page
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
});

// Serve the service.html as the root for this tracker server
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'service.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`Tracker Service running on port ${PORT}`);
});
