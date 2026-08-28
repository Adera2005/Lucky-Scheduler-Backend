const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const protect = require('../middleware/authMiddleware');
const geminiController = require('../controllers/geminiController');
const scheduleController = require('../controllers/schedulerController');
const youtubeController = require('../controllers/youtubeController');
// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename:    (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const fileFilter = (req, file, cb) => {
  file.mimetype === 'application/pdf' ? cb(null, true) : cb(new Error('PDFs only'), false);
};

const upload = multer({ storage, fileFilter });

// Routes
router.post('/generate',           protect, upload.single('file'), scheduleController.createSchedule);
router.get('/',                    protect, scheduleController.getAllSchedules);
router.get('/:id',                 protect, scheduleController.getSchedule);
router.patch('/:id/complete/:day', protect, scheduleController.completeTask);
router.patch('/:id/reschedule',    protect, scheduleController.reschedule);
router.post('/assistant/ask', protect, geminiController.askGemini);
router.get('/youtube/search', protect, youtubeController.searchVideos);
module.exports = router;