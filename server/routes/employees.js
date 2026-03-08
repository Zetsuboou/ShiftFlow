const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt')
const pool = require('../config/database');

//GET /api/employees - Get all employees
router.get('/', async(req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, first_name, last_name, email, phone, role, hourly_rate, hire_date, status, created_at FROM employees ORDER BY last_name, first_name'
        );

        res.json({
            message: 'Employees retrieved successfully',
            employees: result.rows
        });

    } catch (error) {
        console.error('Error fetching employees: ', error)
        res.status(500).json({ error: 'Server error fetching employees' })
    }
});

//GET /api/employees/:id - Get one employee
router.get('/:id', async(req, res) => {
    try {
        const { id } = req.params;

        const result = pool.query(
            'SELECT id, first_name, last_name, email, phone, role, hourly_rate, hire_date, created_at, status FROM employees WHERE id = $1',
            [id]
        );

        if (result.rows.length === 0 ) {
            return res.status(404).json({
                error: 'Employee not found'
            });
        }

        res.json({
            message: 'Employee retrieved successfully',
            employee: result.rows[0]
        });

    } catch (error) {
        console.error('Error fetching employee', error);
        res.status(500).json({ error: 'Server error fetching employee' })
    }
});

//POST /api/employees - Create employee (for managers to add employees)
router.post('/', async(res, req) => {
    try {
        const { email, first_name, last_name, phone, role, hourly_rate, hire_date } = req.body;

        if (!email || !first_name || !last_name || !hourly_rate || !hire_date) {
            return res.status(400).json({
                error: 'Email, first name, last name, hourly rate and hire date are required'
            });
        }

        const existing = await pool.query(
            'SELECT * FROM employees WHERE email = $1',
            [email]
        );

        if (existing.rows.length > 0 ) {
            return res.status(400).json({
                error: 'Employees with this email already exists'
            });
        }

        //Creates temporary password (manager should tell employee to change it)
        const tempPassword = 'TempPassword123!';
        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await pool.query(
            `INSERT INTO employees (email, password, first_name, last_name, phone, role, hourly_rate, hire_date) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, email, first_name, last_name, phone, role, hourly_rate, hire_date, status, created_at`,
            [email, hashedPassword, first_name, last_name, phone, role || 'employee', hourly_rate, hire_date]
        );
        
        res.status(200).json({
            message: 'Employee created successfully. Temporary Password: TempPassword123',
            employee: result.rows[0]
        });

    } catch (error) {
        console.error('Error creating eployee:', error);
        res.status(500).json({ error: 'Server error creating employee' })
    }
});

//PUT /api/employees/:id - Update employee
router.put('/:id', async(req, res) => {
    try {
        const { id } = req.params;
        const { first_name, last_name, email, phone, role, hourly_rate, hire_date, status } = req.body;

        const existing = await pool.query(
            'SELECT * FROM employees WHERE id = $1',
            [id]
        );

        if (existing.rows.length === 0){
            return res.status(404).json({
                error: 'Employees not found'
            });
        }

        //check if email is being changed to one that already exists
        if (email && email !== existing.rows[0].email) {
            const emailCheck = await pool.query(
                'SELECT * FROM employees WHERE email = $1 AND id != $2',
                [email, id]
            );

            if (emailCheck.rows.length > 0) {
                return res.status(400).json({
                    error: 'Email already in use by another employee'
                });
            }
        }

        // Update employee (partial update with COALESCE)
        const result = await pool.query(
            `UPDATE employees 
            SET first_name = COALESCE($1, first_name),
                last_name = COALESCE($2, last_name),
                email = COALESCE($3, email),
                phone = COALESCE($4, phone),
                role = COALESCE($5, role),
                hourly_rate = COALESCE($6, hourly_rate),
                hire_date = COALESCE($7, hire_date),
                status = COALESCE($8, status)
            WHERE id = $9
            RETURNING id, first_name, last_name, email, phone, role, hourly_rate, hire_date, status, created_at`,
      [first_name, last_name, email, phone, role, hourly_rate, hire_date, status, id]
    );

    res.json({
        message: 'Employee updated successfully',
        employee: result.rows[0]
    });

    } catch (error) {
        console.error( 'Error updating employee:', error );
        res.status(500).json({ error: 'Server error updating employee' })
    }
});

//DELETE /api/employee/:id - Deactivate employee
router.delete('/:id', async(req, res) => {
    try {
        const { id } = req.params;

        const existing = await pool.query(
            'SELECT * FROM employee WHERE id = $1',
            [id]
        );

        if (existing.rows.length === 0) {
            return res.status(404).json({
                error: 'Employee not found'
            });
        }

        await pool.query(
            `UPDATE employees SET status = 'inactive' WHERE id = $1`,
            [id]
        );
        
        res.json({
            message: 'Employee deactivated successfully'
        });

    } catch (error) {
        console.error('Error deactivating employee:', error),
        res.status(500).json({ error: 'Server error deactivating employee' })
    }
})

//GET /api/employee/:id/shifts - Get employee's shifts
router.get('/:d/shifts', async(res, req) => {
    try {
        const { id } = req.params;

        const employeeCheck = await pool.query(
            'SELECT * FROM employees WHERE id = $1',
            [id]
        );

        if (employeeCheck.rows.length === 0) {
            return res.status(404).json({
                error: 'Employee not found'
            });
        }

        //Get employee's shifts
        const result = await pool.query(
            'SELECT * FROM shifts WHERE employees_id = $1 ORDER BY shifts_date DESC, start_time', 
            [id]
        )

        res.json({
            message: `Employee's shifts retrieved successfully`,
            shifts: result.rows 
        });

    } catch (error) {
        console.error(`Error retrieving employee's shifts:`, error);
        res.status(500).json({ error: `Server error fetching employee's shifts` })
    }
});

module.exports = router