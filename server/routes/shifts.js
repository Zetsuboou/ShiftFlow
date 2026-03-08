const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const moment = require('moment');

//Check if a shift conflicts with existing shifts
async function checkShiftConflict(employeeId, shiftDate, startTime, endTime, excludeShiftId = null) {
    try {
      let query = `
      SELECT * FROM shifts 
      WHERE employee_id = $1 
      AND shift_date = $2 
      AND status != 'cancelled'
      `;

      const params = [employeeId, shiftDate];

      //Exclude current shift when updating
      if (excludeShiftId) {
          query += ' AND id != $3';
          params.push(excludeShiftId)
      }

      const excludeShifts = await pool.query(query, params);

      //Check each existing shift fot time overlap
      for (let shift of excludeShifts.rows) {
          const existingStart = shift.start_time;
          const existingEnd = shift.end_time;
          if (startTime < existingEnd && endTime) {
              return {
                  conflict: true,
                  message: `Conflicts with existing shift: ${existingStart} - ${existingEnd}`
              };
          }
      }
        
      return { conflict: false }

    } catch (error) {
      console.error('Error checking shift conflict', error);
      throw error;
    }
};


//Check if shift conflicts with approved time-off
async function checkTimeOffConflict(employeeId, shiftDate){
  try {
    const timeOffRequests = await pool.query(
      `SELECT * FROM time_off_requests 
      WHERE employee_id = $1 
      AND status = 'approved'`,
      [employeeId]
    );

    // Check if shift date falls within any approved time-off
    for (let request of timeOffRequests.rows) {
      const startDate = request.start_date
      const endDate = request.end_date

      // Check if shift date is between start and end (inclusive)
      if (shiftDate >= startDate && shiftDate <= endDate) {
          return {
            conflict: true,
            message: `Employee has approved time-off from ${startDate} to ${endDate}`
          };
      }
    }

    return { conflict: false };
    
  } catch (error) {
    console.error('Error checking time-off conflict:', error);
    throw error;
  }
}

//Check if shift is within employee's availability
async function checkAvailability(employeeId, shiftDate, StartTime, endTime){
  try {
    //Get day of week from date (0=Sunday, 1=Monday, etc)
    const dayOfWeek = moment(shiftDate).day();

    //Get employee's availability for this day
    const availability = await pool.query(
      `SELECT * FROM availability 
      WHERE employee_id = $1 
      AND day_of_week = $2`,
      [employeeId, dayOfWeek]
    );

    if (availability.rows.length === 0) {
      return {
        available: false,
        message: 'No availability set for this day'
      };
    }
    const avail = availability.rows[0];

    // Check if employee marked as available
    if (!avail.is_available) {
      return {
        available: false,
        message: 'Employee not available on this day'
      };
    }
    // Check if shift times are within availability window
    if (avail.start_time && avail.end_time) {
      if (startTime < avail.start_time || endTime > avail.end_time) {
        return {
          available: false,
          message: `Employee only available ${avail.start_time} - ${avail.end_time}`
        };
      }
    }
    return { available: true }
  } catch (error) {
      console.error('Error checking availability:', error);
      throw error
  }
}

function calculateShiftHours(startTime, endTime) {
  // Split times into hours and minutes
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);
  
  // Convert to total minutes
  let startMinutes = (startHour * 60) + startMin;
  let endMinutes = (endHour * 60) + endMin;
  
  // Handle overnight shifts (end time is next day)
  if (endMinutes < startMinutes) {
    endMinutes += (24 * 60); // Add 24 hours in minutes
  }
  
  // Calculate difference in minutes
  const diffMinutes = endMinutes - startMinutes;
  
  // Convert to hours (decimal)
  const hours = diffMinutes / 60;
  
  return hours;
}

/**
 * Calculate labor cost for a shift
 * Returns: number (cost in dollars)
 */
function calculateLaborCost(startTime, endTime, hourlyRate) {
  const hours = calculateShiftHours(startTime, endTime);
  return hours * hourlyRate;
}

/**
 * Get week date range from a given date
 * Returns: { startOfWeek: string, endOfWeek: string }
 */
function getWeekDates(date) {
  // Start of week (Sunday)
  const startOfWeek = moment(date).startOf('week').format('YYYY-MM-DD');
  
  // End of week (Saturday)
  const endOfWeek = moment(date).endOf('week').format('YYYY-MM-DD');
  
  return { startOfWeek, endOfWeek };
}

// ==========================================
// CRUD ENDPOINTS
// ==========================================

// GET /api/shifts - Get all shifts (with optional filters)
router.get('/', async (req, res) => {
  try {
    const { employee_id, start_date, end_date, status } = req.query;
    
    let query = `
      SELECT s.*, e.first_name, e.last_name, e.hourly_rate
      FROM shifts s
      JOIN employees e ON s.employee_id = e.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;
    
    // Add filters if provided
    if (employee_id) {
      query += ` AND s.employee_id = $${paramIndex}`;
      params.push(employee_id);
      paramIndex++;
    }
    
    if (start_date) {
      query += ` AND s.shift_date >= $${paramIndex}`;
      params.push(start_date);
      paramIndex++;
    }
    
    if (end_date) {
      query += ` AND s.shift_date <= $${paramIndex}`;
      params.push(end_date);
      paramIndex++;
    }
    
    if (status) {
      query += ` AND s.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    query += ' ORDER BY s.shift_date DESC, s.start_time';
    
    const result = await pool.query(query, params);
    
    res.json({
      message: 'Shifts retrieved successfully',
      shifts: result.rows
    });
  } catch (error) {
    console.error('Error fetching shifts:', error);
    res.status(500).json({ error: 'Server error fetching shifts' });
  }
});

// GET /api/shifts/:id - Get one shift
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `SELECT s.*, 
              e.first_name, e.last_name, e.hourly_rate
       FROM shifts s
       JOIN employees e ON s.employee_id = e.id
       WHERE s.id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Shift not found'
      });
    }
    
    res.json({
      message: 'Shift retrieved successfully',
      shift: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching shift:', error);
    res.status(500).json({ error: 'Server error fetching shift' });
  }
});

// POST /api/shifts - Create new shift
router.post('/', async (req, res) => {
  try {
    const { employee_id, shift_date, start_time, end_time, position, notes } = req.body;
    
    // Validate required fields
    if (!employee_id || !shift_date || !start_time || !end_time || !position) {
      return res.status(400).json({
        error: 'Employee ID, shift date, start time, end time, and position are required'
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
    
    // Validate time (end must be after start)
    if (end_time <= start_time) {
      // Allow overnight shifts (end time next day)
      // This is valid: start=22:00, end=06:00 (overnight)
      // But reject: start=09:00, end=09:00 (same time)
      if (end_time === start_time) {
        return res.status(400).json({
          error: 'End time must be after start time'
        });
      }
    }
    
    // VALIDATION #1: Check shift conflicts
    const shiftConflict = await checkShiftConflict(employee_id, shift_date, start_time, end_time);
    if (shiftConflict.conflict) {
      return res.status(400).json({ error: shiftConflict.message });
    }
    
    // VALIDATION #2: Check time-off conflicts
    const timeOffConflict = await checkTimeOffConflict(employee_id, shift_date);
    if (timeOffConflict.conflict) {
      return res.status(400).json({ error: timeOffConflict.message });
    }
    
    // VALIDATION #3: Check availability (WARNING, not blocking)
    const availabilityCheck = await checkAvailability(employee_id, shift_date, start_time, end_time);
    // We'll allow scheduling outside availability but warn about it
    // In production, you might want to block this
    
    // All checks passed - create the shift
    const result = await pool.query(
      `INSERT INTO shifts (employee_id, shift_date, start_time, end_time, position, status, notes)
       VALUES ($1, $2, $3, $4, $5, 'scheduled', $6) 
       RETURNING *`,
      [employee_id, shift_date, start_time, end_time, position, notes]
    );
    
    const shift = result.rows[0];
    
    // Calculate hours and cost for response
    const hours = calculateShiftHours(start_time, end_time);
    const laborCost = calculateLaborCost(start_time, end_time, employeeCheck.rows[0].hourly_rate);
    
    res.status(201).json({
      message: 'Shift created successfully',
      shift: shift,
      hours: hours.toFixed(2),
      laborCost: laborCost.toFixed(2),
      availabilityWarning: !availabilityCheck.available ? availabilityCheck.message : null
    });
    
  } catch (error) {
    console.error('Error creating shift:', error);
    res.status(500).json({ error: 'Server error creating shift' });
  }
});

// PUT /api/shifts/:id - Update shift
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { employee_id, shift_date, start_time, end_time, position, status, notes } = req.body;
    
    // Check if shift exists
    const existing = await pool.query(
      'SELECT * FROM shifts WHERE id = $1',
      [id]
    );
    
    if (existing.rows.length === 0) {
      return res.status(404).json({
        error: 'Shift not found'
      });
    }
    
    const currentShift = existing.rows[0];
    
    // Use current values if not provided
    const updatedEmployeeId = employee_id || currentShift.employee_id;
    const updatedDate = shift_date || currentShift.shift_date;
    const updatedStart = start_time || currentShift.start_time;
    const updatedEnd = end_time || currentShift.end_time;
    
    // If changing employee, date, or time - check conflicts
    if (employee_id || shift_date || start_time || end_time) {
      // Check shift conflicts (exclude current shift)
      const shiftConflict = await checkShiftConflict(
        updatedEmployeeId, 
        updatedDate, 
        updatedStart, 
        updatedEnd,
        id // Exclude this shift from conflict check
      );
      
      if (shiftConflict.conflict) {
        return res.status(400).json({ error: shiftConflict.message });
      }
      
      // Check time-off conflicts
      const timeOffConflict = await checkTimeOffConflict(updatedEmployeeId, updatedDate);
      if (timeOffConflict.conflict) {
        return res.status(400).json({ error: timeOffConflict.message });
      }
    }
    
    // Update shift
    const result = await pool.query(
      `UPDATE shifts 
       SET employee_id = COALESCE($1, employee_id),
           shift_date = COALESCE($2, shift_date),
           start_time = COALESCE($3, start_time),
           end_time = COALESCE($4, end_time),
           position = COALESCE($5, position),
           status = COALESCE($6, status),
           notes = COALESCE($7, notes),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8
       RETURNING *`,
      [employee_id, shift_date, start_time, end_time, position, status, notes, id]
    );
    
    res.json({
      message: 'Shift updated successfully',
      shift: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating shift:', error);
    res.status(500).json({ error: 'Server error updating shift' });
  }
});

// DELETE /api/shifts/:id - Delete shift
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if shift exists
    const existing = await pool.query(
      'SELECT * FROM shifts WHERE id = $1',
      [id]
    );
    
    if (existing.rows.length === 0) {
      return res.status(404).json({
        error: 'Shift not found'
      });
    }
    
    // Delete shift
    await pool.query(
      'DELETE FROM shifts WHERE id = $1',
      [id]
    );
    
    res.json({
      message: 'Shift deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting shift:', error);
    res.status(500).json({ error: 'Server error deleting shift' });
  }
});

// ==========================================
// SPECIAL ENDPOINTS
// ==========================================

// GET /api/shifts/week/:date - Get week schedule
router.get('/week/:date', async (req, res) => {
  try {
    const { date } = req.params;
    
    // Get week boundaries
    const { startOfWeek, endOfWeek } = getWeekDates(date);
    
    // Get all shifts for this week
    const result = await pool.query(
      `SELECT s.*, 
              e.first_name, e.last_name, e.hourly_rate
       FROM shifts s
       JOIN employees e ON s.employee_id = e.id
       WHERE s.shift_date >= $1 
       AND s.shift_date <= $2
       ORDER BY s.shift_date, s.start_time`,
      [startOfWeek, endOfWeek]
    );
    
    // Group shifts by day
    const shiftsByDay = {};
    result.rows.forEach(shift => {
      const date = shift.shift_date;
      if (!shiftsByDay[date]) {
        shiftsByDay[date] = [];
      }
      shiftsByDay[date].push(shift);
    });
    
    res.json({
      message: 'Week schedule retrieved successfully',
      weekStart: startOfWeek,
      weekEnd: endOfWeek,
      shiftsByDay: shiftsByDay,
      totalShifts: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching week schedule:', error);
    res.status(500).json({ error: 'Server error fetching week schedule' });
  }
});

// POST /api/shifts/check-conflict - Check for conflicts without creating
router.post('/check-conflict', async (req, res) => {
  try {
    const { employee_id, shift_date, start_time, end_time } = req.body;
    
    if (!employee_id || !shift_date || !start_time || !end_time) {
      return res.status(400).json({
        error: 'Employee ID, shift date, start time, and end time are required'
      });
    }
    
    // Run all checks
    const shiftConflict = await checkShiftConflict(employee_id, shift_date, start_time, end_time);
    const timeOffConflict = await checkTimeOffConflict(employee_id, shift_date);
    const availabilityCheck = await checkAvailability(employee_id, shift_date, start_time, end_time);
    
    const hasConflict = shiftConflict.conflict || timeOffConflict.conflict;
    
    res.json({
      hasConflict: hasConflict,
      shiftConflict: shiftConflict,
      timeOffConflict: timeOffConflict,
      availabilityCheck: availabilityCheck
    });
  } catch (error) {
    console.error('Error checking conflicts:', error);
    res.status(500).json({ error: 'Server error checking conflicts' });
  }
});

// GET /api/shifts/stats - Get labor cost and hours statistics
router.get('/stats/summary', async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    
    if (!start_date || !end_date) {
      return res.status(400).json({
        error: 'Start date and end date are required'
      });
    }
    
    // Get all shifts in date range with employee info
    const result = await pool.query(
      `SELECT s.*, e.hourly_rate
       FROM shifts s
       JOIN employees e ON s.employee_id = e.id
       WHERE s.shift_date >= $1 
       AND s.shift_date <= $2
       AND s.status != 'cancelled'`,
      [start_date, end_date]
    );
    
    // Calculate total hours and labor cost
    let totalHours = 0;
    let totalLaborCost = 0;
    
    result.rows.forEach(shift => {
      const hours = calculateShiftHours(shift.start_time, shift.end_time);
      const cost = calculateLaborCost(shift.start_time, shift.end_time, shift.hourly_rate);
      
      totalHours += hours;
      totalLaborCost += cost;
    });
    
    res.json({
      message: 'Statistics retrieved successfully',
      dateRange: {
        start: start_date,
        end: end_date
      },
      totalShifts: result.rows.length,
      totalHours: totalHours.toFixed(2),
      totalLaborCost: totalLaborCost.toFixed(2),
      averageCostPerShift: result.rows.length > 0 ? (totalLaborCost / result.rows.length).toFixed(2) : 0
    });
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({ error: 'Server error fetching statistics' });
  }
});

module.exports = router;