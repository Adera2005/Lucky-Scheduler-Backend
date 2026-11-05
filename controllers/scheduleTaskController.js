// ============================================================
// scheduleTaskController.js
// Task-level operations: completeTask, rescheduleSingleSession.
// Split from schedulerController.js for file-length management.
// ============================================================

const prisma = require('../prisma.js');

// PATCH /api/schedules/:id/complete-session/:taskId
exports.completeTask = async (req, res) => {
  try {
    const { id, taskId } = req.params;

    const task = await prisma.studyTask.findFirst({
      where: {
        id:         Number(taskId),
        scheduleId: Number(id),
        schedule:   { studentId: req.student.id },
      },
    });

    if (!task) {
      return res.status(404).json({ status: 'fail', message: 'Task not found.' });
    }

    const updated = await prisma.studyTask.update({
      where: { id: task.id },
      data:  { completed: true },
    });

    res.status(200).json({
      status:  'success',
      message: 'Session marked as complete.',
      data:    { task: updated },
    });
  } catch (error) {
    console.error('Error completing task:', error.message);
    res.status(500).json({ status: 'error', message: 'Failed to complete task.' });
  }
};

// PATCH /api/schedules/:id/reschedule-session/:taskId
exports.rescheduleSingleSession = async (req, res) => {
  try {
    const { id, taskId } = req.params;

    const task = await prisma.studyTask.findFirst({
      where: {
        id:         Number(taskId),
        scheduleId: Number(id),
        schedule:   { studentId: req.student.id },
      },
    });

    if (!task) {
      return res.status(404).json({ status: 'fail', message: 'Task not found.' });
    }

    if (task.completed) {
      return res.status(400).json({ status: 'fail', message: 'Completed tasks cannot be rescheduled.' });
    }

    const lastTask = await prisma.studyTask.findFirst({
      where:   { scheduleId: Number(id) },
      orderBy: { day: 'desc' },
    });

    const newDay = (lastTask?.day || 0) + 1;

    const updated = await prisma.studyTask.update({
      where: { id: task.id },
      data:  { day: newDay, rescheduled: true },
    });

    await prisma.schedule.update({
      where: { id: Number(id) },
      data:  { totalDays: Math.max(Number(task.day), newDay) },
    });

    res.status(200).json({
      status:  'success',
      message: 'Session rescheduled.',
      data:    { task: updated },
    });
  } catch (error) {
    console.error('Error rescheduling session:', error.message);
    res.status(500).json({ status: 'error', message: 'Failed to reschedule session.' });
  }
};
