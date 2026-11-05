require('dotenv').config();

const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const path = require('path');

const scheduleRouter      = require('./routes/router.js');
const authRouter          = require('./routes/authRouter.js');
const notificationRouter  = require('./routes/notificationRouter.js');

const app = express();

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Serve uploaded PDF files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/', (req, res) => {
  res.json({
    status: 'success',
    message: 'Welcome to the backend API!',
  });
});

app.use('/api/schedules',     scheduleRouter);
app.use('/api/auth',          authRouter);
app.use('/api/notifications', notificationRouter);

app.listen(3000, () => {
  console.log('The server is up and running');
});