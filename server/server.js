require('dotenv').config()
const express = require ('express');
const cors = require('cors')
const app = express();
const pool = require('./config/database');
const PORT = process.env.PORT || 5000;

//import routes
const authRoutes = require('./routes/auth');
const employeesRoutes = require('./routes/employees');
const shiftsRoutes = require('./routes/shifts');
const timeOffRoutes = require('./routes/timeOff');
const availabilityRoutes = require('./routes/availability');

//middleware
app.use(express.json());
app.use(cors());

//Routes endpoints
app.get('/', async (req, res) => {
    res.json({
        message: 'ShiftFlow API is running',
        version: '1.0.0',
        endpoints: {
            auth: '/api/auth',
            employees: '/api/employees',
            shifts: '/api/shifts',
            timeOff: '/api/time-off',
            availability: '/api/availability'
        }
    });
});


// Add this RIGHT AFTER app.use(express.json()) and app.use(cors())
// BEFORE any other routes

app.post('/debug-body', (req, res) => {
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  res.json({
    headers: req.headers,
    body: req.body,
    bodyIsUndefined: req.body === undefined
  });
});

//Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeesRoutes);
app.use('/api/shifts', shiftsRoutes);
app.use('/api/time-off', timeOffRoutes);
app.use('/api/availability', availabilityRoutes);

//404 Route not found
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    requestedUrl: req.originalUrl
  });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
});

