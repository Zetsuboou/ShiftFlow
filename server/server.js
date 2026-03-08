require('dotenv').config()
const express = require ('express');
const cors = require('cors')
const app = express();
const pool = require('./config/database');
const PORT = process.env.PORT || 5000;

//import routes
const authRoutes = require('./routes/auth')

//middleware
app.use(express.json())

app.get('/', async (req, res) => {
    res.json({message: 'shifts Manager App API running successfully'})
});


//Mount routes
app.use('/api/auth', authRoutes);



app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
});

