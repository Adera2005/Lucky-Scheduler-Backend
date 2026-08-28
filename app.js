 require('dotenv').config();
const express = require('express');
const morgan  = require('morgan');
const cors    = require('cors');

const scheduleRouter = require('./routes/router.js');
const authRouter     = require('./routes/authRouter.js');

const app = express();

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    status: 'success',
    message: 'Welcome to the backend API!',
  });
});

app.use('/api/schedules', scheduleRouter);
app.use('/api/auth', authRouter);

app.listen(3000, () => {
  console.log('The server is up and running');
});