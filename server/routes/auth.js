const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, first_name, last_name, phone, role, hourly_rate, hire_date } = req.body;

    // Validate required fields
    if (!email || !password || !first_name || !last_name || !hourly_rate || !hire_date) {
      return res.status(400).json({
        error: 'Email, password, first name, last name, hourly rate, and hire date are required'
      });
    }

    // Check if employee already exists
    const existingEmployee = await pool.query(
      'SELECT * FROM employees WHERE email = $1',
      [email]
    );

    if (existingEmployee.rows.length > 0) {
      return res.status(400).json({
        error: 'Employee with this email already exists'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert employee
    const result = await pool.query(
      `INSERT INTO employees (email, password, first_name, last_name, phone, role, hourly_rate, hire_date) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, email, first_name, last_name, phone, role, hourly_rate, hire_date, status, created_at`,
      [email, hashedPassword, first_name, last_name, phone, role || 'employee', hourly_rate, hire_date]
    );

    const employee = result.rows[0];

    // Create JWT token
    const token = jwt.sign(
      { userId: employee.id, email: employee.email, role: employee.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({ employee, token });

  } catch (error) {
    console.error('Error registering employee:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required'
      });
    }

    // Find employee
    const result = await pool.query(
      'SELECT * FROM employees WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: 'Invalid email or password'
      });
    }

    const employee = result.rows[0];

    // Compare passwords
    const validPassword = await bcrypt.compare(password, employee.password);

    if (!validPassword) {
      return res.status(401).json({
        error: 'Invalid email or password'
      });
    }

    // Delete password from response
    delete employee.password;

    // Create JWT token
    const token = jwt.sign(
      { userId: employee.id, email: employee.email, role: employee.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ employee, token });

  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

module.exports = router;