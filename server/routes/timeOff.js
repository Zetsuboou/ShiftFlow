const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// GET /api/time-off - Get all time-off requests (with optional filters)
router.get('/', async (req, res) => {
  try {
    const { employee_id, status } = req.query;
    
    let query = `
      SELECT tor.*, 
             e.first_name AS employee_first_name, 
             e.last_name AS employee_last_name,
             r.first_name AS reviewer_first_name, 
             r.last_name AS reviewer_last_name
      FROM time_off_requests tor
      JOIN employees e ON tor.employee_id = e.id
      LEFT JOIN employees r ON tor.reviewed_by = r.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;
    
    // Add filters if provided
    if (employee_id) {
      query += ` AND tor.employee_id = $${paramIndex}`;
      params.push(employee_id);
      paramIndex++;
    }
    
    if (status) {
      query += ` AND tor.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    query += ' ORDER BY tor.requested_at DESC';
    
    const result = await pool.query(query, params);
    
    res.json({
      message: 'Time-off requests retrieved successfully',
      requests: result.rows
    });
  } catch (error) {
    console.error('Error fetching time-off requests:', error);
    res.status(500).json({ error: 'Server error fetching time-off requests' });
  }
});

// GET /api/time-off/:id - Get one time-off request
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `SELECT tor.*, 
              e.first_name AS employee_first_name, 
              e.last_name AS employee_last_name,
              r.first_name AS reviewer_first_name, 
              r.last_name AS reviewer_last_name
       FROM time_off_requests tor
       JOIN employees e ON tor.employee_id = e.id
       LEFT JOIN employees r ON tor.reviewed_by = r.id
       WHERE tor.id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Time-off request not found'
      });
    }
    
    res.json({
      message: 'Time-off request retrieved successfully',
      request: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching time-off request:', error);
    res.status(500).json({ error: 'Server error fetching time-off request' });
  }
});

// GET /api/time-off/employee/:employeeId - Get employee's time-off requests
router.get('/employee/:employeeId', async (req, res) => {
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
    
    const result = await pool.query(
      `SELECT tor.*,
              r.first_name AS reviewer_first_name, 
              r.last_name AS reviewer_last_name
       FROM time_off_requests tor
       LEFT JOIN employees r ON tor.reviewed_by = r.id
       WHERE tor.employee_id = $1
       ORDER BY tor.requested_at DESC`,
      [employeeId]
    );
    
    res.json({
      message: 'Employee time-off requests retrieved successfully',
      requests: result.rows
    });
  } catch (error) {
    console.error('Error fetching employee time-off requests:', error);
    res.status(500).json({ error: 'Server error fetching employee time-off requests' });
  }
});

// POST /api/time-off - Create time-off request
router.post('/', async (req, res) => {
  try {
    const { employee_id, start_date, end_date, reason, notes } = req.body;
    
    // Validate required fields
    if (!employee_id || !start_date || !end_date || !reason) {
      return res.status(400).json({
        error: 'Employee ID, start date, end date, and reason are required'
      });
    }
    
    // Validate employee exists and is active
    const employeeCheck = await pool.query(
      'SELECT * FROM employees WHERE id = $1 AND status = $2',
      [employee_id, 'active']
    );
    
    if (employeeCheck.rows.length === 0) {
      return res.status(400).json({
        error: 'Employee not found or inactive'
      });
    }
    
    // Validate dates (end must be >= start)
    if (end_date < start_date) {
      return res.status(400).json({
        error: 'End date must be after or equal to start date'
      });
    }
    
    // Check for overlapping time-off requests
    const overlapping = await pool.query(
      `SELECT * FROM time_off_requests
       WHERE employee_id = $1
       AND status IN ('pending', 'approved')
       AND (
         (start_date <= $2 AND end_date >= $2) OR
         (start_date <= $3 AND end_date >= $3) OR
         (start_date >= $2 AND end_date <= $3)
       )`,
      [employee_id, start_date, end_date]
    );
    
    if (overlapping.rows.length > 0) {
      return res.status(400).json({
        error: 'Time-off request overlaps with existing request',
        existingRequest: overlapping.rows[0]
      });
    }
    
    // Create time-off request
    const result = await pool.query(
      `INSERT INTO time_off_requests (employee_id, start_date, end_date, reason, notes, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING *`,
      [employee_id, start_date, end_date, reason, notes]
    );
    
    res.status(201).json({
      message: 'Time-off request created successfully',
      request: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating time-off request:', error);
    res.status(500).json({ error: 'Server error creating time-off request' });
  }
});

// PUT /api/time-off/:id/approve - Approve time-off request
router.put('/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const { reviewed_by } = req.body;
    
    // Validate reviewer ID is provided
    if (!reviewed_by) {
      return res.status(400).json({
        error: 'Reviewer ID is required'
      });
    }
    
    // Check if reviewer is a manager
    const reviewerCheck = await pool.query(
      'SELECT * FROM employees WHERE id = $1 AND role = $2',
      [reviewed_by, 'manager']
    );
    
    if (reviewerCheck.rows.length === 0) {
      return res.status(403).json({
        error: 'Only managers can approve time-off requests'
      });
    }
    
    // Check if time-off request exists
    const requestCheck = await pool.query(
      'SELECT * FROM time_off_requests WHERE id = $1',
      [id]
    );
    
    if (requestCheck.rows.length === 0) {
      return res.status(404).json({
        error: 'Time-off request not found'
      });
    }
    
    const request = requestCheck.rows[0];
    
    // Check if already reviewed
    if (request.status !== 'pending') {
      return res.status(400).json({
        error: `Time-off request already ${request.status}`
      });
    }
    
    // Check if there are any scheduled shifts during this time-off period
    const conflictingShifts = await pool.query(
      `SELECT * FROM shifts
       WHERE employee_id = $1
       AND shift_date >= $2
       AND shift_date <= $3
       AND status = 'scheduled'`,
      [request.employee_id, request.start_date, request.end_date]
    );
    
    // Approve time-off
    const result = await pool.query(
      `UPDATE time_off_requests
       SET status = 'approved',
           reviewed_at = CURRENT_TIMESTAMP,
           reviewed_by = $1
       WHERE id = $2
       RETURNING *`,
      [reviewed_by, id]
    );
    
    // Warn if there are conflicting shifts (manager should cancel them)
    let warning = null;
    if (conflictingShifts.rows.length > 0) {
      warning = `Warning: ${conflictingShifts.rows.length} scheduled shift(s) conflict with this time-off. You should cancel them.`;
    }
    
    res.json({
      message: 'Time-off request approved successfully',
      request: result.rows[0],
      conflictingShifts: conflictingShifts.rows,
      warning: warning
    });
  } catch (error) {
    console.error('Error approving time-off request:', error);
    res.status(500).json({ error: 'Server error approving time-off request' });
  }
});

// PUT /api/time-off/:id/deny - Deny time-off request
router.put('/:id/deny', async (req, res) => {
  try {
    const { id } = req.params;
    const { reviewed_by, notes } = req.body;
    
    // Validate reviewer ID is provided
    if (!reviewed_by) {
      return res.status(400).json({
        error: 'Reviewer ID is required'
      });
    }
    
    // Check if reviewer is a manager
    const reviewerCheck = await pool.query(
      'SELECT * FROM employees WHERE id = $1 AND role = $2',
      [reviewed_by, 'manager']
    );
    
    if (reviewerCheck.rows.length === 0) {
      return res.status(403).json({
        error: 'Only managers can deny time-off requests'
      });
    }
    
    // Check if time-off request exists
    const requestCheck = await pool.query(
      'SELECT * FROM time_off_requests WHERE id = $1',
      [id]
    );
    
    if (requestCheck.rows.length === 0) {
      return res.status(404).json({
        error: 'Time-off request not found'
      });
    }
    
    const request = requestCheck.rows[0];
    
    // Check if already reviewed
    if (request.status !== 'pending') {
      return res.status(400).json({
        error: `Time-off request already ${request.status}`
      });
    }
    
    // Deny time-off
    const result = await pool.query(
      `UPDATE time_off_requests
       SET status = 'denied',
           reviewed_at = CURRENT_TIMESTAMP,
           reviewed_by = $1,
           notes = COALESCE($2, notes)
       WHERE id = $3
       RETURNING *`,
      [reviewed_by, notes, id]
    );
    
    res.json({
      message: 'Time-off request denied successfully',
      request: result.rows[0]
    });
  } catch (error) {
    console.error('Error denying time-off request:', error);
    res.status(500).json({ error: 'Server error denying time-off request' });
  }
});

// DELETE /api/time-off/:id - Delete time-off request
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if time-off request exists
    const existing = await pool.query(
      'SELECT * FROM time_off_requests WHERE id = $1',
      [id]
    );
    
    if (existing.rows.length === 0) {
      return res.status(404).json({
        error: 'Time-off request not found'
      });
    }
    
    // Only allow deletion if still pending
    if (existing.rows[0].status !== 'pending') {
      return res.status(400).json({
        error: 'Can only delete pending requests'
      });
    }
    
    // Delete time-off request
    await pool.query(
      'DELETE FROM time_off_requests WHERE id = $1',
      [id]
    );
    
    res.json({
      message: 'Time-off request deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting time-off request:', error);
    res.status(500).json({ error: 'Server error deleting time-off request' });
  }
});

module.exports = router;