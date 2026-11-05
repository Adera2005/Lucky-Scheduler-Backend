// ============================================================
// notificationRouter.js
// All routes require the protect middleware — a student can
// only access their own notifications.
// ============================================================

const express  = require('express');
const router   = express.Router();
const protect  = require('../middleware/authMiddleware');
const ctrl     = require('../controllers/notificationController');

router.get   ('/',              protect, ctrl.getNotifications);
router.post  ('/',              protect, ctrl.createNotification);
router.patch ('/read-all',      protect, ctrl.markAllRead);
router.patch ('/:id/read',      protect, ctrl.markOneRead);
router.delete('/:id',           protect, ctrl.deleteNotification);
router.delete('/',              protect, ctrl.clearAll);

module.exports = router;
