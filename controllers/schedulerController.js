
const prisma = require('../prisma.js');

// Helper function that generates daily tasks
function generateDailyTasks(totalPages, totalDays, studySessions) {
  // studySessions is an array of { startTime, endTime }
  // Example: [{ startTime: "06:00", endTime: "08:00" }, { startTime: "22:00", endTime: "23:30" }]

  // If no sessions provided use a default morning slot
  if (!studySessions || studySessions.length === 0) {
    studySessions = [{ startTime: '08:00', endTime: '10:00' }];
  }

  const pagesPerDay  = Math.ceil(totalPages / totalDays);
  const pagesPerSlot = Math.ceil(pagesPerDay / studySessions.length);

  const tasks  = [];
  let pageStart = 1;

  for (let day = 1; day <= totalDays; day++) {
    studySessions.forEach((session, index) => {
      const slotPageStart = pageStart + index * pagesPerSlot;
      const slotPageEnd   = Math.min(slotPageStart + pagesPerSlot - 1, totalPages);

      // Only add task if there are still pages left
      if (slotPageStart <= totalPages) {
        tasks.push({
          day,
          startTime:   session.startTime,   // e.g. "06:00"
          endTime:     session.endTime,      // e.g. "08:00"
          pages:       `${slotPageStart}–${slotPageEnd}`,
          completed:   false,
          rescheduled: false,
        });
      }
    });

    pageStart += pagesPerDay;
    if (pageStart > totalPages) break;
  }

  return tasks;
}

// CREATE SCHEDULE
// POST /api/schedules/generate
exports.createSchedule = async (req, res) => {
  try {
    const { course, totalPages, totalDays, studySessions } = req.body;

    if (!course || !totalPages || !totalDays) {
      return res.status(400).json({
        status: 'fail',
        message: "Please provide 'course', 'totalPages', and 'totalDays'.",
      });
    }

    const fileUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const dailyTasks = generateDailyTasks(
      Number(totalPages),
      Number(totalDays),
      studySessions
    );

    const pagesPerDay = Math.ceil(Number(totalPages) / Number(totalDays));

    const newSchedule = await prisma.schedule.create({
      data: {
        course,
        totalPages:    Number(totalPages),
        totalDays:     Number(totalDays),
        pagesPerDay,
        preferredTime: studySessions ? JSON.stringify(studySessions) : 'morning',
        fileUrl,
        dailyTasks,
      },
    });

    res.status(201).json({
      status: 'success',
      data: {
        schedule: newSchedule,
        summary: `To cover ${course} in ${totalDays} days, read ${pagesPerDay} pages per day.`,
      },
    });
  } catch (error) {
    console.error('Error saving schedule to database:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Failed to save schedule to database.',
    });
  }
};

// GET ALL SCHEDULES
// GET /api/schedules
exports.getAllSchedules = async (req, res) => {
  try {
    const schedules = await prisma.schedule.findMany({
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({
      status: 'success',
      results: schedules.length,
      data: { schedules },
    });
  } catch (error) {
    console.error('Error fetching schedules:', error.message);
    res.status(500).json({ status: 'error', message: 'Failed to fetch schedules.' });
  }
};

// GET ONE SCHEDULE
// GET /api/schedules/:id
exports.getSchedule = async (req, res) => {
  try {
    const schedule = await prisma.schedule.findUnique({
      where: { id: Number(req.params.id) },
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

// MARK A TASK COMPLETE
// PATCH /api/schedules/:id/complete/:day
exports.completeTask = async (req, res) => {
  try {
    const { id, day } = req.params;

    const schedule = await prisma.schedule.findUnique({
      where: { id: Number(id) },
    });

    if (!schedule) {
      return res.status(404).json({ status: 'fail', message: 'Schedule not found.' });
    }

    const updatedTasks = schedule.dailyTasks.map((task) =>
      task.day === Number(day) ? { ...task, completed: true } : task
    );

    const updated = await prisma.schedule.update({
      where: { id: Number(id) },
      data: { dailyTasks: updatedTasks },
    });

    res.status(200).json({
      status: 'success',
      message: `Day ${day} marked as complete.`,
      data: { schedule: updated },
    });
  } catch (error) {
    console.error('Error completing task:', error.message);
    res.status(500).json({ status: 'error', message: 'Failed to complete task.' });
  }
};

// RESCHEDULE MISSED TASKS
// PATCH /api/schedules/:id/reschedule
exports.reschedule = async (req, res) => {
  try {
    const { id } = req.params;
    const { extraDays } = req.body;

    if (!extraDays || extraDays < 1) {
      return res.status(400).json({
        status: 'fail',
        message: "Please provide 'extraDays' (minimum 1).",
      });
    }

    const schedule = await prisma.schedule.findUnique({
      where: { id: Number(id) },
    });

    if (!schedule) {
      return res.status(404).json({ status: 'fail', message: 'Schedule not found.' });
    }

    const incompleteTasks = schedule.dailyTasks.filter((t) => !t.completed);

    if (incompleteTasks.length === 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'All tasks are already completed — nothing to reschedule.',
      });
    }

    const lastDay = Math.max(...schedule.dailyTasks.map((t) => t.day));

    const newTasks = incompleteTasks.map((task, index) => ({
      ...task,
      day: lastDay + index + 1,
      rescheduled: true,
    }));

    const completedTasks = schedule.dailyTasks.filter((t) => t.completed);
    const updatedTasks = [...completedTasks, ...newTasks];

    const updated = await prisma.schedule.update({
      where: { id: Number(id) },
      data: {
        totalDays: lastDay + incompleteTasks.length,
        dailyTasks: updatedTasks,
      },
    });

    res.status(200).json({
      status: 'success',
      message: `${incompleteTasks.length} missed tasks rescheduled successfully.`,
      data: { schedule: updated },
    });
  } catch (error) {
    console.error('Error rescheduling:', error.message);
    res.status(500).json({ status: 'error', message: 'Failed to reschedule.' });
  }
};