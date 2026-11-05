// ============================================================
// scheduleReadController.js
// Read-only schedule operations: getAll, getOne.
// Split from schedulerController.js for file-length management.
// ============================================================

const prisma = require('../prisma.js');

// GET /api/schedules — all schedules for the current student
exports.getAllSchedules = async (req, res) => {
  try {
    const schedules = await prisma.schedule.findMany({
      where:   { studentId: req.student.id },
      include: { sessions: true },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({
      status:  'success',
      results: schedules.length,
      data:    { schedules },
    });
  } catch (error) {
    console.error('Error fetching schedules:', error.message);
    res.status(500).json({ status: 'error', message: 'Failed to fetch schedules.' });
  }
};

// GET /api/schedules/:id — one schedule for the current student
exports.getSchedule = async (req, res) => {
  try {
    const schedule = await prisma.schedule.findFirst({
      where:   { id: Number(req.params.id), studentId: req.student.id },
      include: {
        sessions: true,
        tasks:    { orderBy: [{ day: 'asc' }, { startTime: 'asc' }] },
      },
    });

    if (!schedule) {
      return res.status(404).json({ status: 'fail', message: 'Schedule not found.' });
    }

    res.status(200).json({ status: 'success', data: { schedule } });
  } catch (error) {
    console.error('Error fetching schedule:', error.message);
    res.status(500).json({ status: 'error', message: 'Failed to fetch schedule.' });
  }
};
