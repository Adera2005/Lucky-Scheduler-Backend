// ============================================================
// notificationController.js
// Handles all in-app notification CRUD for the logged-in student.
// All queries filter by req.student.id so one student can never
// read or modify another student's notifications.
// ============================================================

const prisma = require('../prisma.js');

// ── GET /api/notifications ────────────────────────────────
// Returns all notifications for the current student, newest first.
exports.getNotifications = async (req, res) => {
  try {
    const notifications = await prisma.notification.findMany({
      where:   { studentId: req.student.id },
      orderBy: { createdAt: 'desc' },
      take:    50,          // cap at 50 most recent
    });

    res.status(200).json({
      status: 'success',
      data:   { notifications },
    });
  } catch (err) {
    console.error('getNotifications error:', err.message);
    res.status(500).json({ status: 'error', message: 'Failed to fetch notifications.' });
  }
};

// ── POST /api/notifications ───────────────────────────────
// Creates a new notification for the current student.
// Body: { title, body, type? }
exports.createNotification = async (req, res) => {
  try {
    const { title, body, type = 'info' } = req.body;

    if (!title || !body) {
      return res.status(400).json({ status: 'fail', message: 'title and body are required.' });
    }

    const notification = await prisma.notification.create({
      data: {
        studentId: req.student.id,
        title,
        body,
        type,
      },
    });

    res.status(201).json({
      status: 'success',
      data:   { notification },
    });
  } catch (err) {
    console.error('createNotification error:', err.message);
    res.status(500).json({ status: 'error', message: 'Failed to create notification.' });
  }
};

// ── PATCH /api/notifications/read-all ────────────────────
// Marks every unread notification as read for the current student.
exports.markAllRead = async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { studentId: req.student.id, read: false },
      data:  { read: true },
    });

    res.status(200).json({ status: 'success', message: 'All notifications marked as read.' });
  } catch (err) {
    console.error('markAllRead error:', err.message);
    res.status(500).json({ status: 'error', message: 'Failed to mark notifications as read.' });
  }
};

// ── PATCH /api/notifications/:id/read ────────────────────
// Marks a single notification as read (must belong to the student).
exports.markOneRead = async (req, res) => {
  try {
    const notif = await prisma.notification.findFirst({
      where: { id: Number(req.params.id), studentId: req.student.id },
    });

    if (!notif) {
      return res.status(404).json({ status: 'fail', message: 'Notification not found.' });
    }

    const updated = await prisma.notification.update({
      where: { id: notif.id },
      data:  { read: true },
    });

    res.status(200).json({ status: 'success', data: { notification: updated } });
  } catch (err) {
    console.error('markOneRead error:', err.message);
    res.status(500).json({ status: 'error', message: 'Failed to mark notification as read.' });
  }
};

// ── DELETE /api/notifications/:id ────────────────────────
// Deletes one notification (must belong to the student).
exports.deleteNotification = async (req, res) => {
  try {
    const notif = await prisma.notification.findFirst({
      where: { id: Number(req.params.id), studentId: req.student.id },
    });

    if (!notif) {
      return res.status(404).json({ status: 'fail', message: 'Notification not found.' });
    }

    await prisma.notification.delete({ where: { id: notif.id } });

    res.status(200).json({ status: 'success', message: 'Notification deleted.' });
  } catch (err) {
    console.error('deleteNotification error:', err.message);
    res.status(500).json({ status: 'error', message: 'Failed to delete notification.' });
  }
};

// ── DELETE /api/notifications ─────────────────────────────
// Clears ALL notifications for the current student.
exports.clearAll = async (req, res) => {
  try {
    await prisma.notification.deleteMany({
      where: { studentId: req.student.id },
    });

    res.status(200).json({ status: 'success', message: 'All notifications cleared.' });
  } catch (err) {
    console.error('clearAll error:', err.message);
    res.status(500).json({ status: 'error', message: 'Failed to clear notifications.' });
  }
};
