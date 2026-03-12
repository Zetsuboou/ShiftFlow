const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Days of week mapping (for reference)
const DAYS_OF_WEEK = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday'
};

// GET /api/availability/:employeeId - Get employee's availability
router.get('/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;
    
    // Check if employee exists
    const employeeCheck = await pool.query(
      'SELECT * FROM employees WHERE id = $1',
      [employeeId]
    );
    
    if (employeeCheck.rows.length === 0) {
      return res.status(404).json({
        error: 'Employee not found'
      });
    }
    
    // Get all availability records for this employee
    const result = await pool.query(
      `SELECT * FROM availability 
       WHERE employee_id = $1
       ORDER BY day_of_week`,
      [employeeId]
    );
    
    // Add day name to each record for convenience
    const availabilityWithDayNames = result.rows.map(record => ({
      ...record,
      day_name: DAYS_OF_WEEK[record.day_of_week]
    }));
    
    res.json({
      message: 'Employee availability retrieved successfully',
      availability: availabilityWithDayNames
    });
  } catch (error) {
    console.error('Error fetching availability:', error);
    res.status(500).json({ error: 'Server error fetching availability' });
  }
});

// POST /api/availability - Set availability for a day
router.post('/', async (req, res) => {
  try {
    const { employee_id, day_of_week, start_time, end_time, is_available } = req.body;
    
    // Validate required fields
    if (employee_id === undefined || day_of_week === undefined) {
      return res.status(400).json({
        error: 'Employee ID and day of week are required'
      });
    }
    
    // Validate day_of_week is 0-6
    if (day_of_week < 0 || day_of_week > 6) {
      return res.status(400).json({
        error: 'Day of week must be between 0 (Sunday) and 6 (Saturday)'
      });
    }
    
    // Validate employee exists
    const employeeCheck = await pool.query(
      'SELECT * FROM employees WHERE id = $1',
      [employee_id]
    );
    
    if (employeeCheck.rows.length === 0) {
      return res.status(400).json({
        error: 'Employee not found'
      });
    }
    
    // Check if availability already exists for this day
    const existing = await pool.query(
      'SELECT * FROM availability WHERE employee_id = $1 AND day_of_week = $2',
      [employee_id, day_of_week]
    );
    
    if (existing.rows.length > 0) {
      return res.status(400).json({
        error: `Availability already set for ${DAYS_OF_WEEK[day_of_week]}. Use PUT to update.`
      });
    }
    
    // If is_available is true, require times
    if (is_available && (!start_time || !end_time)) {
      return res.status(400).json({
        error: 'Start time and end time are required when available'
      });
    }
    
    // Validate times (end must be after start)
    if (start_time && end_time && end_time <= start_time) {
      return res.status(400).json({
        error: 'End time must be after start time'
      });
    }
    
    // Create availability
    const result = await pool.query(
      `INSERT INTO availability (employee_id, day_of_week, start_time, end_time, is_available)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [employee_id, day_of_week, start_time, end_time, is_available !== false]
    );
    
    const record = result.rows[0];
    
    res.status(201).json({
      message: 'Availability set successfully',
      availability: {
        ...record,
        day_name: DAYS_OF_WEEK[record.day_of_week]
      }
    });
  } catch (error) {
    console.error('Error creating availability:', error);
    res.status(500).json({ error: 'Server error creating availability' });
  }
});

// PUT /api/availability/:id - Update availability
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { start_time, end_time, is_available } = req.body;
    
    // Check if availability exists
    const existing = await pool.query(
      'SELECT * FROM availability WHERE id = $1',
      [id]
    );
    
    if (existing.rows.length === 0) {
      return res.status(404).json({
        error: 'Availability record not found'
      });
    }
    
    // Validate times if both provided
    if (start_time && end_time && end_time <= start_time) {
      return res.status(400).json({
        error: 'End time must be after start time'
      });
    }
    
    // Update availability
    const result = await pool.query(
      `UPDATE availability
       SET start_time = COALESCE($1, start_time),
           end_time = COALESCE($2, end_time),
           is_available = COALESCE($3, is_available)
       WHERE id = $4
       RETURNING *`,
      [start_time, end_time, is_available, id]
    );
    
    const record = result.rows[0];
    
    res.json({
      message: 'Availability updated successfully',
      availability: {
        ...record,
        day_name: DAYS_OF_WEEK[record.day_of_week]
      }
    });
  } catch (error) {
    console.error('Error updating availability:', error);
    res.status(500).json({ error: 'Server error updating availability' });
  }
});

// DELETE /api/availability/:id - Delete availability
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if availability exists
    const existing = await pool.query(
      'SELECT * FROM availability WHERE id = $1',
      [id]
    );
    
    if (existing.rows.length === 0) {
      return res.status(404).json({
        error: 'Availability record not found'
      });
    }
    
    // Delete availability
    await pool.query(
      'DELETE FROM availability WHERE id = $1',
      [id]
    );
    
    res.json({
      message: 'Availability deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting availability:', error);
    res.status(500).json({ error: 'Server error deleting availability' });
  }
});

module.exports = router;